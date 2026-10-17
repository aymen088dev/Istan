import { inflateRawSync } from "node:zlib";

/**
 * Lecteur ZIP minimal, sans dépendance.
 *
 * Il ne sert qu'à une chose : reprendre l'archive `data.zip` de l'ancien site
 * (profils, avatars, catégories, webhooks) sans exiger `unzip` sur l'hébergeur.
 * Il gère les deux méthodes réellement produites par les outils courants :
 * `0` (stocké) et `8` (deflate). Le ZIP64 est refusé explicitement plutôt que
 * de produire des fichiers tronqués.
 */

export type ZipEntry = { name: string; data: Buffer };

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE = 0x02014b50;
const LOCAL_FILE = 0x04034b50;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** Les noms sans indicateur UTF-8 sont historiquement en CP437 ≈ latin-1. */
function decodeName(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  return utf8.includes("\uFFFD") ? buffer.toString("latin1") : utf8;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const stop = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= stop; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  return -1;
}

export function parseZip(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 22) throw new Error("Archive vide ou incomplète.");
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd === -1) {
    throw new Error("Ce fichier n'est pas une archive ZIP valide (fin de répertoire introuvable).");
  }

  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files: ZipEntry[] = [];
  let total = 0;

  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_FILE) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = decodeName(buffer.subarray(offset + 46, offset + 46 + nameLength));

    offset += 46 + nameLength + extraLength + commentLength;

    // Dossier, ou taille en ZIP64 (0xFFFFFFFF) : rien d'utile ici.
    if (!name || name.endsWith("/")) continue;
    if (size === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("Archive ZIP64 non prise en charge : réexporte-la en ZIP classique.");
    }
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_FILE) continue;

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);

    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      try {
        data = inflateRawSync(raw);
      } catch (error) {
        throw new Error(`Entrée « ${name} » illisible (${(error as Error).message}).`);
      }
    } else {
      throw new Error(`Compression ZIP non prise en charge (${method}) pour « ${name} ».`);
    }

    total += data.length;
    if (total > MAX_TOTAL_BYTES) {
      throw new Error("Archive trop volumineuse une fois décompressée (200 Mo maximum).");
    }
    files.push({ name, data });
  }

  if (!files.length) throw new Error("Archive vide : aucun fichier à importer.");
  return files;
}
