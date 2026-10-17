import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Stockage du Discord Publisher — même format de fichiers que l'ancien site.
 *
 * Un dossier par entrée, exactement comme dans `data.zip` :
 *
 *   data/publisher/profils/<dossier>/profil.json      (+ avatar.jpg à côté)
 *   data/publisher/webhooks/<dossier>/webhook.json
 *   data/publisher/categories/<dossier>/categorie.json
 *   data/publisher/messages/messages.json
 *
 * Les données d'une installation existante se copient donc telles quelles dans
 * `data/publisher/` (et inversement). `PUBLISHER_DATA_DIR` déplace le dossier.
 *
 * IMPORT TOLÉRANT — c'est le point qui faisait disparaître des profils :
 * un dossier importé n'est plus ignoré parce que son fichier s'appelle
 * `profile.json` au lieu de `profil.json`, parce qu'il a un BOM UTF-8, parce
 * qu'il est posé à plat (`profils/nom.json`), parce que le nom du champ est
 * `pseudo` au lieu de `name`, ou parce que seule la photo a été copiée. Tout ce
 * qui est exploitable est chargé, et tout ce qui ne l'est pas est *expliqué*
 * (`scanProfiles().skipped`) au lieu de disparaître en silence.
 */

export type PublisherRole = "membre" | "modo" | "SM" | "Admin";

export type PublisherProfile = {
  id: string;
  folder: string;
  name: string;
  category: string;
  role: PublisherRole;
  verified: boolean;
  avatar: string | null;
  /** Version de l'image (mtime) : sert à ne pas servir une ancienne photo. */
  avatarUpdatedAt: string | null;
  createdAt: string;
};

export type PublisherWebhook = {
  id: string;
  folder: string;
  name: string;
  url: string;
  createdAt: string;
};

export type PublisherCategory = {
  id: string;
  folder: string;
  name: string;
  createdAt: string;
};

export type PublisherAttachment = {
  id: string;
  name: string;
  url: string;
  proxyUrl: string | null;
  contentType: string | null;
  size: number;
};

export type PublisherMessage = {
  id: string;
  channelId: string | null;
  channelName: string | null;
  guildId: string | null;
  guildName: string | null;
  authorId: string | null;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  attachments: PublisherAttachment[];
  timestamp: string;
  /** "discord" pour un message du bot, "publisher" pour une publication du studio. */
  source: "discord" | "publisher";
};

/** Résultat d'un scan de dossier : les entrées lues *et* celles qui ont échoué. */
export type ScanReport<T> = {
  items: T[];
  skipped: { folder: string; reason: string }[];
  repaired: { folder: string; reason: string }[];
};

const dataDir = process.env.PUBLISHER_DATA_DIR || path.join(process.cwd(), "data", "publisher");
const profilsDir = path.join(dataDir, "profils");
const webhooksDir = path.join(dataDir, "webhooks");
const categoriesDir = path.join(dataDir, "categories");
const messagesFile = path.join(dataDir, "messages", "messages.json");

// Le flux ne garde que les derniers messages : le fichier reste petit et la
// page charge vite, même après des mois de discussions.
const MAX_MESSAGES = 200;

// Fichiers parasites des archives (macOS, Windows, NAS) : jamais des données.
const NOISE = new Set([".DS_Store", "Thumbs.db", "desktop.ini", "Icon\r"]);

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const IMAGE_EXTENSIONS = Object.keys(IMAGE_MIME);

export function publisherDataDir(): string {
  return dataDir;
}

export function validText(value: unknown, fallback = "", max = 120): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

/** "modo" / "Modo" / "SM" / "admin" / "modérateur" → rôle canonique du studio. */
export function normalizeRole(value: unknown): PublisherRole {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (role === "modo" || role === "modérateur" || role === "moderateur" || role === "mod") return "modo";
  if (role === "sm" || role === "staff manager") return "SM";
  if (role === "admin" || role === "administrateur" || role === "owner") return "Admin";
  return "membre";
}

/** "Astan News" → "astan-news" : sert d'identifiant d'URL et de nom de dossier. */
export function slugify(value: string, fallback = "profil"): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

/** Numéro de dossier sûr : jamais de séparateur ni de remontée de chemin. */
function safeFolder(value: unknown, fallback = ""): string {
  const folder = validText(value, fallback, 80);
  return folder.includes("/") || folder.includes("\\") || folder.includes("..") ? fallback : folder;
}

function nowId(): string {
  return String(Date.now());
}

function now(): string {
  return new Date().toISOString();
}

function isoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

/** Écriture atomique (fichier temporaire + rename), comme le reste du serveur. */
async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const payload = JSON.stringify(value, null, 2);
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file).catch(async error => {
    await unlink(tmp).catch(() => undefined);
    throw error;
  });
  await writeFile(`${file}.bak`, payload, "utf8").catch(() => undefined);
}

async function readJson(file: string): Promise<unknown> {
  try {
    // Un BOM UTF-8 (Notepad, Excel, export de l'ancien site) fait échouer
    // JSON.parse : c'est l'une des causes d'un profil « disparu ».
    const raw = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    // Écriture interrompue : la sauvegarde .bak de la dernière écriture réussie.
    try {
      return JSON.parse((await readFile(`${file}.bak`, "utf8")).replace(/^\uFEFF/, ""));
    } catch {
      return null;
    }
  }
}

type FileInfo = { name: string; extension: string };

async function listFiles(directory: string): Promise<FileInfo[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && !NOISE.has(entry.name) && !entry.name.startsWith("."))
      .map(entry => ({ name: entry.name, extension: path.extname(entry.name).slice(1).toLowerCase() }));
  } catch {
    return [];
  }
}

/** Liste les sous-dossiers d'un dossier de données (les fichiers .bak sont ignorés). */
async function listFolders(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "__MACOSX")
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Choisit le JSON d'une entrée. `profil.json` d'abord, puis les variantes
 * produites par d'autres exports (`profile.json`, `data.json`, `index.json`),
 * puis n'importe quel `.json` du dossier.
 */
function pickJson(files: FileInfo[], preferred: string[]): string | null {
  const json = files.filter(file => file.extension === "json" && !file.name.endsWith(".bak"));
  if (!json.length) return null;
  for (const name of preferred) {
    const found = json.find(file => file.name.toLowerCase() === name);
    if (found) return found.name;
  }
  return json.sort((a, b) => a.name.localeCompare(b.name))[0].name;
}

/** Liste les images d'un dossier, `avatar.*` en premier. */
function pickImages(files: FileInfo[]): FileInfo[] {
  return files
    .filter(file => IMAGE_EXTENSIONS.includes(file.extension))
    .sort((a, b) => {
      const aAvatar = /^(avatar|photo|pp|profil)/i.test(a.name) ? 0 : 1;
      const bAvatar = /^(avatar|photo|pp|profil)/i.test(b.name) ? 0 : 1;
      return aAvatar - bAvatar || a.name.localeCompare(b.name);
    });
}

function firstString(value: Record<string, unknown>, keys: string[], fallback: string, max = 120): string {
  for (const key of keys) {
    const candidate = validText(value[key], "", max);
    if (candidate) return candidate;
  }
  return fallback;
}

// ==========================================
// AVATARS — stockage et résolution
// ==========================================

export function avatarPath(folder: string): string {
  return `/api/profiles/${encodeURIComponent(folder)}/avatar`;
}

export type AvatarInfo = { file: string; mime: string; extension: string; version: string };

async function imageInfo(file: string, extension: string): Promise<AvatarInfo | null> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) return null;
    return {
      file,
      extension,
      mime: IMAGE_MIME[extension] ?? "application/octet-stream",
      version: String(Math.trunc(info.mtimeMs)),
    };
  } catch {
    return null;
  }
}

/**
 * Retrouve l'image d'un profil, où qu'elle soit : `avatar.jpg` dans le dossier,
 * une autre image du dossier, ou `profils/<dossier>.jpg` (import à plat).
 */
export async function avatarInfo(folder: string, files?: FileInfo[]): Promise<AvatarInfo | null> {
  const clean = safeFolder(folder);
  if (!clean) return null;

  const directory = path.join(profilsDir, clean);
  const listing = files ?? (await listFiles(directory));
  for (const image of pickImages(listing)) {
    const info = await imageInfo(path.join(directory, image.name), image.extension);
    if (info) return info;
  }

  // Import à plat : `profils/nom.jpg` à côté de `profils/nom.json`.
  for (const extension of IMAGE_EXTENSIONS) {
    const info = await imageInfo(path.join(profilsDir, `${clean}.${extension}`), extension);
    if (info) return info;
  }
  return null;
}

export async function readAvatar(folder: string): Promise<{ content: Buffer; mime: string } | null> {
  const info = await avatarInfo(folder);
  if (!info) return null;
  try {
    return { content: await readFile(info.file), mime: info.mime };
  } catch {
    return null;
  }
}

// ==========================================
// PROFILS
// ==========================================

type ProfileFields = Omit<PublisherProfile, "folder" | "id" | "createdAt" | "avatarUpdatedAt">;

function normalizeProfile(
  raw: unknown,
  folder: string,
  avatar: AvatarInfo | null,
): PublisherProfile {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stored = validText(value.avatar ?? value.avatarUrl ?? value.photo, "", 400);
  const external = /^https?:\/\//i.test(stored) ? stored : null;

  return {
    id: validText(value.id ?? value._id, folder, 40),
    folder: safeFolder(value.folder, folder) || folder,
    name: firstString(value, ["name", "nom", "pseudo", "displayName", "display_name", "username", "title"], folder, 50),
    category: firstString(value, ["category", "categorie", "catégorie", "cat", "group", "groupe"], "", 60),
    role: normalizeRole(value.role ?? value.rang ?? value.rank),
    verified: bool(value.verified ?? value.verifie ?? value.verifié ?? value.certified),
    avatar: avatar ? avatarPath(folder) : external,
    avatarUpdatedAt: avatar ? avatar.version : null,
    createdAt: isoDate(value.createdAt ?? value.created ?? value.date, new Date(0).toISOString()),
  };
}

/** Scan tolérant : dossiers, fichiers à plat, variantes de noms et de champs. */
export async function scanProfiles(): Promise<ScanReport<PublisherProfile>> {
  const report: ScanReport<PublisherProfile> = { items: [], skipped: [], repaired: [] };
  let entries;
  try {
    entries = await readdir(profilsDir, { withFileTypes: true });
  } catch {
    return report;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "__MACOSX" || NOISE.has(entry.name)) continue;

    // `profils/nom.json` : import à plat, sans sous-dossier.
    if (entry.isFile()) {
      if (path.extname(entry.name).toLowerCase() !== ".json" || entry.name.endsWith(".bak")) continue;
      const base = entry.name.slice(0, -5);
      const folder = safeFolder(base) || slugify(base);
      const raw = await readJson(path.join(profilsDir, entry.name));
      if (!raw || typeof raw !== "object") {
        report.skipped.push({ folder: entry.name, reason: "JSON illisible (fichier ignoré)" });
        continue;
      }
      report.items.push(normalizeProfile(raw, folder, await avatarInfo(folder)));
      continue;
    }

    if (!entry.isDirectory()) continue;

    const folder = entry.name;
    const directory = path.join(profilsDir, folder);
    const files = await listFiles(directory);
    const jsonName = pickJson(files, ["profil.json", "profile.json", "data.json", "index.json"]);
    const images = pickImages(files);
    const avatar = await avatarInfo(folder, files);

    if (!jsonName && !avatar) {
      report.skipped.push({
        folder,
        reason: files.length
          ? `aucun profil exploitable (${files.slice(0, 3).map(file => file.name).join(", ")})`
          : "dossier vide",
      });
      continue;
    }

    const raw = jsonName ? await readJson(path.join(directory, jsonName)) : null;
    const usable = raw && typeof raw === "object";

    if (!usable && !avatar) {
      report.skipped.push({ folder, reason: `${jsonName} illisible et aucune image` });
      continue;
    }

    if (!usable) {
      // Photo seule : le profil est reconstruit depuis le nom du dossier, sinon
      // il n'apparaîtrait jamais alors que sa photo est bien là.
      report.repaired.push({
        folder,
        reason: jsonName
          ? `${jsonName} illisible : profil reconstruit depuis la photo`
          : "pas de JSON : profil reconstruit depuis la photo",
      });
    } else if (jsonName && jsonName.toLowerCase() !== "profil.json") {
      report.repaired.push({ folder, reason: `profil lu depuis ${jsonName}` });
    } else if (!jsonName) {
      report.repaired.push({ folder, reason: "image sans JSON : profil reconstruit" });
    }

    report.items.push(normalizeProfile(usable ? raw : null, folder, avatar));
  }

  report.items.sort(
    (a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) || a.createdAt.localeCompare(b.createdAt),
  );
  return report;
}

export async function readProfiles(): Promise<PublisherProfile[]> {
  return (await scanProfiles()).items;
}

export async function readProfile(folder: string): Promise<PublisherProfile | null> {
  const clean = safeFolder(folder);
  if (!clean) return null;
  const profiles = await readProfiles();
  return profiles.find(profile => profile.folder === clean) ?? null;
}

export function newProfileId(): string {
  return nowId();
}

export function newProfile(folder: string, fields: ProfileFields): PublisherProfile {
  return { id: nowId(), folder, createdAt: now(), avatarUpdatedAt: now(), ...fields };
}

export async function saveProfile(profile: PublisherProfile) {
  const folder = safeFolder(profile.folder);
  if (!folder) throw new Error("Nom de dossier de profil invalide");
  await writeJson(path.join(profilsDir, folder, "profil.json"), {
    id: profile.id,
    name: profile.name,
    folder,
    category: profile.category,
    role: profile.role,
    verified: profile.verified,
    avatar: profile.avatar,
    createdAt: profile.createdAt,
  });
}

// ==========================================
// WEBHOOKS
// ==========================================

// `?wait=true` (ou un `?thread_id=…`) est fréquent dans les URL copiées : sans
// ce suffixe toléré, le webhook existant était écarté et le salon disparaissait
// du sélecteur.
const WEBHOOK_URL_PATTERN =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+(?:[?#].*)?$/i;

function normalizeWebhook(raw: unknown, folder: string): PublisherWebhook {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: validText(value.id ?? value._id, folder, 40),
    folder: safeFolder(value.folder, folder) || folder,
    name: firstString(value, ["name", "nom", "label", "title", "channel"], folder, 60),
    url: firstString(value, ["url", "webhook", "webhookUrl", "link", "href"], "", 400),
    createdAt: isoDate(value.createdAt ?? value.created ?? value.date, new Date(0).toISOString()),
  };
}

export async function scanWebhooks(): Promise<ScanReport<PublisherWebhook>> {
  const report: ScanReport<PublisherWebhook> = { items: [], skipped: [], repaired: [] };
  for (const folder of await listFolders(webhooksDir)) {
    const directory = path.join(webhooksDir, folder);
    const files = await listFiles(directory);
    const jsonName = pickJson(files, ["webhook.json", "data.json", "index.json"]);
    if (!jsonName) {
      report.skipped.push({ folder, reason: "aucun webhook.json" });
      continue;
    }
    const raw = await readJson(path.join(directory, jsonName));
    if (!raw || typeof raw !== "object") {
      report.skipped.push({ folder, reason: `${jsonName} illisible` });
      continue;
    }
    const webhook = normalizeWebhook(raw, folder);
    if (!WEBHOOK_URL_PATTERN.test(webhook.url)) {
      report.skipped.push({
        folder,
        reason: webhook.url ? "URL de webhook Discord invalide" : "aucune URL de webhook",
      });
      continue;
    }
    report.items.push({ ...webhook, name: webhook.name.replace(/[,\s]+$/, "") || webhook.name });
  }

  // Deux dossiers peuvent pointer le même salon (copies successives de
  // l'ancien site) : le sélecteur ne doit pas afficher deux fois le même
  // webhook, sinon on ne sait plus lequel est réellement utilisé.
  const seen = new Map<string, PublisherWebhook>();
  const unique: PublisherWebhook[] = [];
  for (const webhook of report.items) {
    const existing = seen.get(webhook.url);
    if (existing) {
      report.repaired.push({
        folder: webhook.folder,
        reason: `doublon ignoré : même URL que « ${existing.name} »`,
      });
      continue;
    }
    seen.set(webhook.url, webhook);
    unique.push(webhook);
  }

  report.items = unique.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return report;
}

export async function readWebhooks(): Promise<PublisherWebhook[]> {
  return (await scanWebhooks()).items;
}

export function newWebhook(folder: string, name: string, url: string): PublisherWebhook {
  return { id: nowId(), folder, name, url, createdAt: now() };
}

export async function saveWebhook(webhook: PublisherWebhook) {
  const folder = safeFolder(webhook.folder);
  if (!folder) throw new Error("Nom de dossier de webhook invalide");
  await writeJson(path.join(webhooksDir, folder, "webhook.json"), {
    id: webhook.id,
    name: webhook.name,
    folder,
    url: webhook.url,
    createdAt: webhook.createdAt,
  });
}

// ==========================================
// CATÉGORIES
// ==========================================

function categoryFromFolder(folder: string): string {
  return folder.replace(/[-_]+/g, " ").trim() || folder;
}

export async function scanCategories(): Promise<ScanReport<PublisherCategory>> {
  const report: ScanReport<PublisherCategory> = { items: [], skipped: [], repaired: [] };
  for (const folder of await listFolders(categoriesDir)) {
    const directory = path.join(categoriesDir, folder);
    const files = await listFiles(directory);
    const jsonName = pickJson(files, ["categorie.json", "category.json", "data.json", "index.json"]);
    const raw = jsonName ? await readJson(path.join(directory, jsonName)) : null;
    const usable = raw && typeof raw === "object";
    const value = (usable ? raw : {}) as Record<string, unknown>;

    if (!usable) {
      // Dossier de catégorie sans JSON (archive incomplète) : la catégorie
      // existe quand même à l'écran, avec le nom de son dossier.
      report.repaired.push({
        folder,
        reason: jsonName ? `${jsonName} illisible : nom du dossier utilisé` : "pas de JSON : nom du dossier utilisé",
      });
    } else if (jsonName && jsonName.toLowerCase() !== "categorie.json") {
      report.repaired.push({ folder, reason: `catégorie lue depuis ${jsonName}` });
    }

    report.items.push({
      id: validText(value.id ?? value._id, folder, 40),
      folder: safeFolder(value.folder, folder) || folder,
      name: firstString(value, ["name", "nom", "title", "label"], categoryFromFolder(folder), 60),
      createdAt: isoDate(value.createdAt ?? value.created ?? value.date, new Date(0).toISOString()),
    });
  }
  report.items.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  return report;
}

export async function readCategories(): Promise<PublisherCategory[]> {
  const categories = (await scanCategories()).items;
  // Une catégorie utilisée par un profil mais absente du dossier `categories/`
  // doit apparaître dans les filtres, sinon le profil devient introuvable.
  const profiles = await readProfiles();
  const known = new Set(categories.map(category => category.name.toLocaleLowerCase("fr")));
  const extra = new Map<string, PublisherCategory>();
  for (const profile of profiles) {
    const name = profile.category.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("fr");
    if (known.has(key) || extra.has(key)) continue;
    extra.set(key, {
      id: slugify(name, "categorie"),
      folder: slugify(name, "categorie"),
      name,
      createdAt: profile.createdAt,
    });
  }
  return [...categories, ...extra.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function newCategory(name: string): PublisherCategory {
  return { id: nowId(), folder: slugify(name, "categorie"), name, createdAt: now() };
}

export async function saveCategory(category: PublisherCategory) {
  const folder = safeFolder(category.folder) || slugify(category.name, "categorie");
  await writeJson(path.join(categoriesDir, folder, "categorie.json"), {
    id: category.id,
    name: category.name,
    folder,
    createdAt: category.createdAt,
  });
}

// ==========================================
// MESSAGES
// ==========================================

/** Message le plus ancien en tête, le plus récent à la fin — comme l'ancien site. */
export async function readMessages(): Promise<PublisherMessage[]> {
  const parsed = await readJson(messagesFile);
  return Array.isArray(parsed) ? (parsed as PublisherMessage[]) : [];
}

export async function writeMessages(messages: PublisherMessage[]): Promise<void> {
  // Seuls les derniers messages sont conservés : le fichier reste petit.
  await writeJson(messagesFile, messages.slice(-MAX_MESSAGES));
}

/** Ajoute un message en fin de flux, en ignorant les doublons (reconnexion du bot). */
export async function pushMessage(message: PublisherMessage): Promise<boolean> {
  const messages = await readMessages();
  if (messages.some(existing => existing.id === message.id)) return false;
  messages.push(message);
  await writeMessages(messages);
  return true;
}

// ==========================================
// AVATARS — écriture
// ==========================================

const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function avatarExtension(mimeType: string): string | null {
  return AVATAR_EXTENSIONS[mimeType?.toLowerCase()] ?? null;
}

/** L'image vit dans le dossier du profil, comme sur l'ancien site. */
export async function saveAvatar(folder: string, mimeType: string, buffer: Buffer): Promise<string | null> {
  const clean = safeFolder(folder);
  const extension = avatarExtension(mimeType);
  if (!clean || !extension) return null;

  const directory = path.join(profilsDir, clean);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `avatar.${extension}`), buffer);
  // Un changement de type d'image laisserait l'ancien fichier derrière lui :
  // c'est lui que le navigateur servirait ensuite.
  const files = await listFiles(directory);
  await Promise.all(
    files
      .filter(file => IMAGE_EXTENSIONS.includes(file.extension) && /^(avatar|photo|pp|profil)[._-]/i.test(file.name))
      .filter(file => file.name.toLowerCase() !== `avatar.${extension}`)
      .map(file => unlink(path.join(directory, file.name)).catch(() => undefined)),
  );
  return avatarPath(clean);
}
