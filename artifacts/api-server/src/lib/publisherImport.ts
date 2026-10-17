import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { publisherDataDir } from "./publisher";
import { parseZip } from "./zip";

/**
 * Reprise d'une installation existante (`data.zip` ou dossier `data/` de
 * l'ancien site) vers `data/publisher/`.
 *
 * L'import est volontairement tolérant : il retrouve les dossiers `profils`,
 * `webhooks`, `categories` et `messages` même s'ils sont imbriqués dans une
 * archive (`data/publisher/profils/...`), ignore les fichiers parasites des
 * archives macOS / Windows, et n'écrase jamais une entrée déjà présente sauf
 * demande explicite.
 */

export type PublisherImportReport = {
  files: number;
  written: string[];
  skipped: { path: string; reason: string }[];
  counts: { profiles: number; categories: number; webhooks: number; messages: number; avatars: number };
};

const ROOTS = new Set(["profils", "profiles", "webhooks", "categories", "messages"]);
const ALLOWED_EXTENSIONS = new Set(["json", "png", "jpg", "jpeg", "webp", "gif"]);

function isNoise(parts: string[]): boolean {
  return parts.some(
    part =>
      !part ||
      part === "__MACOSX" ||
      part === ".DS_Store" ||
      part === "Thumbs.db" ||
      part === "desktop.ini" ||
      part.startsWith("._"),
  );
}

/**
 * Ramène un chemin d'archive à une destination relative à `data/publisher/`.
 * `data/publisher/profils/x/profil.json` → `profils/x/profil.json`.
 */
export function normalizeImportPath(name: string): string | null {
  const parts = name.replace(/\\/g, "/").replace(/^[a-zA-Z]:/, "").split("/").filter(part => part && part !== ".");
  if (!parts.length || isNoise(parts) || parts.some(part => part === "..")) return null;

  const index = parts.findIndex(part => ROOTS.has(part.toLowerCase()));
  if (index === -1) return null;

  const relative = parts.slice(index);
  const root = relative[0].toLowerCase();
  relative[0] = root === "profiles" ? "profils" : root;

  const extension = path.extname(relative[relative.length - 1]).slice(1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) return null;
  if (relative[relative.length - 1].endsWith(".bak")) return null;

  return relative.join("/");
}

function countFile(report: PublisherImportReport, relative: string) {
  const [root] = relative.split("/");
  const extension = path.extname(relative).slice(1).toLowerCase();
  if (root === "profils" && ["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
    report.counts.avatars += 1;
  } else if (root === "profils") {
    report.counts.profiles += 1;
  } else if (root === "categories") {
    report.counts.categories += 1;
  } else if (root === "webhooks") {
    report.counts.webhooks += 1;
  } else if (root === "messages") {
    report.counts.messages += 1;
  }
}

async function writeEntry(
  report: PublisherImportReport,
  relative: string,
  data: Buffer,
  overwrite: boolean,
) {
  const target = path.join(publisherDataDir(), relative);
  const resolved = path.resolve(target);
  const root = path.resolve(publisherDataDir());
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    report.skipped.push({ path: relative, reason: "chemin hors du dossier de données" });
    return;
  }

  if (!overwrite) {
    try {
      await access(resolved);
      report.skipped.push({ path: relative, reason: "déjà présent (conservé)" });
      return;
    } catch {
      // Fichier absent : on l'écrit.
    }
  }

  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, data);
  report.files += 1;
  report.written.push(relative);
  countFile(report, relative);
}

export async function importPublisherArchive(
  archive: Buffer,
  options: { overwrite?: boolean } = {},
): Promise<PublisherImportReport> {
  const report: PublisherImportReport = {
    files: 0,
    written: [],
    skipped: [],
    counts: { profiles: 0, categories: 0, webhooks: 0, messages: 0, avatars: 0 },
  };

  for (const entry of parseZip(archive)) {
    const relative = normalizeImportPath(entry.name);
    if (!relative) {
      report.skipped.push({ path: entry.name, reason: "fichier non reconnu (hors profils/catégories/webhooks/messages)" });
      continue;
    }
    await writeEntry(report, relative, entry.data, options.overwrite === true);
  }

  // Rien d'exploitable : mieux vaut le dire que de rendre un rapport vide.
  if (!report.written.length && !report.skipped.some(item => item.reason.startsWith("déjà présent"))) {
    throw new Error(
      "Aucune donnée exploitable dans cette archive. Attendu : profils/<dossier>/profil.json, categories/, webhooks/.",
    );
  }

  return report;
}
