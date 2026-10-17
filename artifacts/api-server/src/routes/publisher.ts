import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import {
  newCategory,
  newProfile,
  newWebhook,
  normalizeRole,
  publisherDataDir,
  readAvatar,
  readCategories,
  readMessages,
  readProfile,
  readProfiles,
  readWebhooks,
  saveAvatar,
  saveCategory,
  saveProfile,
  saveWebhook,
  scanCategories,
  scanProfiles,
  scanWebhooks,
  slugify,
  validText,
  type PublisherWebhook,
} from "../lib/publisher";
import { importPublisherArchive } from "../lib/publisherImport";
import { resolvePublicBase } from "../lib/publicUrl";

/**
 * Profils, webhooks et catégories du Discord Publisher.
 *
 * L'interface (`artifacts/discord-publisher/public/`) et les anciennes
 * installations appellent ces routes sur `/api/...` : le portail les renvoie
 * vers cette API, inchangées. Les données sont rangées en dossiers, comme dans
 * l'ancien site (`data/publisher/profils/<dossier>/profil.json`, etc.).
 */

const router: IRouter = Router();

const MAX_AVATAR_SIZE = 3 * 1024 * 1024; // 3 Mo, comme les logos du CREATOR

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE, files: 5 },
});

const WEBHOOK_URL_PATTERN = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i;

function avatarFiles(req: { files?: unknown }) {
  const files = req.files as Record<string, Express.Multer.File[]> | Express.Multer.File[] | undefined;
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return files.avatar ?? [];
}

/** Dossier unique : "Astan News" → "astan-news", puis "astan-news-2"… */
function uniqueFolder(name: string, taken: string[]): string {
  const base = slugify(name, "profil");
  if (!taken.includes(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

function relativeDataDir(): string {
  const full = publisherDataDir();
  const relative = path.relative(process.cwd(), full);
  return relative && !relative.startsWith("..") ? relative : full;
}

async function ensureCategory(name: string) {
  const clean = validText(name, "", 60);
  if (!clean) return null;
  const categories = await readCategories();
  const existing = categories.find(category => category.name === clean);
  if (existing) return existing;
  const category = newCategory(clean);
  await saveCategory(category);
  return category;
}

function profileShape(body: unknown) {
  const value = (body ?? {}) as Record<string, unknown>;
  return {
    name: validText(value.name, "", 50),
    category: validText(value.category, "", 60),
    role: normalizeRole(value.role),
    verified: value.verified === true || value.verified === "true" || value.verified === "on" || value.verified === "1",
  };
}

// ==========================================
// PROFILS
// ==========================================

router.get("/profiles", async (_req, res): Promise<void> => {
  res.json(await readProfiles());
});

router.post("/profiles", upload.any(), async (req, res): Promise<void> => {
  const fields = profileShape(req.body);
  if (!fields.name) {
    res.status(400).json({ error: "Le nom du profil est obligatoire." });
    return;
  }

  const profiles = await readProfiles();
  const folder = uniqueFolder(fields.name, profiles.map(profile => profile.folder));
  const avatarFile = avatarFiles(req)[0];
  let avatar: string | null = null;

  if (avatarFile) {
    avatar = await saveAvatar(folder, avatarFile.mimetype, avatarFile.buffer);
    if (!avatar) {
      res.status(415).json({ error: "Format d'image non supporté (PNG, JPG, WEBP ou GIF)." });
      return;
    }
  }

  const profile = newProfile(folder, { ...fields, avatar });
  await saveProfile(profile);
  await ensureCategory(fields.category);
  res.status(201).json({ profile });
});

router.put("/profiles/:folder", upload.any(), async (req, res): Promise<void> => {
  const folder = validText(req.params.folder, "", 80);
  const existing = await readProfile(folder);
  if (!existing) {
    res.status(404).json({ error: "Profil introuvable." });
    return;
  }

  const fields = profileShape(req.body);
  if (!fields.name) {
    res.status(400).json({ error: "Le nom du profil est obligatoire." });
    return;
  }

  const avatarFile = avatarFiles(req)[0];
  let avatar = existing.avatar;
  if (avatarFile) {
    const saved = await saveAvatar(existing.folder, avatarFile.mimetype, avatarFile.buffer);
    if (!saved) {
      res.status(415).json({ error: "Format d'image non supporté (PNG, JPG, WEBP ou GIF)." });
      return;
    }
    avatar = saved;
  }

  const profile = { ...existing, ...fields, avatar };
  await saveProfile(profile);
  await ensureCategory(fields.category);
  res.json({ profile });
});

/** L'avatar vit dans le dossier du profil : `profils/<dossier>/avatar.<ext>`. */
router.get("/profiles/:folder/avatar", async (req, res): Promise<void> => {
  const folder = validText(req.params.folder, "", 80);
  const avatar = folder ? await readAvatar(folder) : null;
  if (!avatar) {
    res.status(404).json({ error: "Avatar introuvable." });
    return;
  }
  res.setHeader("content-type", avatar.mime);
  // Le nom du fichier ne change pas quand on remplace l'image : on laisse le
  // navigateur revalider pour ne pas servir un ancien avatar.
  res.setHeader("cache-control", "no-cache");
  res.status(200).end(avatar.content);
});

// ==========================================
// WEBHOOKS
// ==========================================

/** Les URL de webhook restent côté serveur : elles ne sont jamais renvoyées. */
function publicWebhook(webhook: PublisherWebhook) {
  return { id: webhook.id, folder: webhook.folder, name: webhook.name };
}

router.get("/webhooks", async (_req, res): Promise<void> => {
  const webhooks = await readWebhooks();
  res.json(webhooks.map(publicWebhook));
});

router.post("/webhooks", async (req, res): Promise<void> => {
  const value = (req.body ?? {}) as Record<string, unknown>;
  const name = validText(value.name, "", 60);
  const url = validText(value.url, "", 400);

  if (!name || !url) {
    res.status(400).json({ error: "Renseigne un nom et une URL de webhook." });
    return;
  }
  if (!WEBHOOK_URL_PATTERN.test(url)) {
    res.status(400).json({ error: "URL de webhook Discord invalide." });
    return;
  }

  const webhooks = await readWebhooks();
  const webhook = newWebhook(uniqueFolder(name, webhooks.map(item => item.folder)), name, url);
  await saveWebhook(webhook);
  res.status(201).json({ webhook: publicWebhook(webhook) });
});

// ==========================================
// CATÉGORIES
// ==========================================

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await readCategories();
  res.json([...categories].sort((a, b) => a.name.localeCompare(b.name, "fr")));
});

router.post("/categories", async (req, res): Promise<void> => {
  const name = validText((req.body ?? {}).name, "", 60);
  if (!name) {
    res.status(400).json({ error: "Le nom de la catégorie est obligatoire." });
    return;
  }
  const category = await ensureCategory(name);
  res.status(201).json({ category });
});

// ==========================================
// SANTÉ DES DONNÉES
// ==========================================

/**
 * Pourquoi un profil importé n'apparaît pas ? Cette route répond.
 *
 * Elle liste les entrées réellement chargées, celles qui ont été réparées
 * (autre nom de fichier, photo seule, BOM…) et surtout celles qui ont été
 * ignorées **avec leur raison**, plus l'état de livraison des photos à Discord.
 * Sans elle, un dossier incomplet était indiscernable d'un dossier absent.
 */
router.get("/publisher/health", async (req, res): Promise<void> => {
  const [profiles, categories, webhooks, messages] = await Promise.all([
    scanProfiles(),
    scanCategories(),
    scanWebhooks(),
    readMessages(),
  ]);

  const base = resolvePublicBase(req);
  const withoutPhoto = profiles.items
    .filter(profile => !profile.avatar)
    .map(profile => ({ folder: profile.folder, name: profile.name }));

  res.json({
    dataDir: relativeDataDir(),
    counts: {
      profiles: profiles.items.length,
      categories: categories.items.length,
      webhooks: webhooks.items.length,
      messages: messages.length,
      withPhoto: profiles.items.length - withoutPhoto.length,
      withoutPhoto: withoutPhoto.length,
    },
    avatars: {
      canSend: Boolean(base.url),
      baseUrl: base.url,
      source: base.source,
      reason: base.reason,
      missing: withoutPhoto.slice(0, 50),
    },
    skipped: {
      profiles: profiles.skipped,
      categories: categories.skipped,
      webhooks: webhooks.skipped,
    },
    repaired: {
      profiles: profiles.repaired,
      categories: categories.repaired,
    },
  });
});

// ==========================================
// IMPORT D'UNE INSTALLATION EXISTANTE
// ==========================================

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024, files: 1 },
});

/**
 * `POST /api/publisher/import` — archive ZIP (data.zip de l'ancien site).
 * `overwrite=1` remplace les entrées existantes ; sinon elles sont conservées.
 */
router.post("/publisher/import", importUpload.single("archive"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Choisis une archive ZIP (data.zip) à importer." });
    return;
  }

  try {
    const report = await importPublisherArchive(file.buffer, {
      overwrite: String((req.body ?? {}).overwrite ?? "") === "1",
    });
    const [profiles, categories, webhooks] = await Promise.all([
      scanProfiles(),
      scanCategories(),
      scanWebhooks(),
    ]);

    res.status(201).json({
      report,
      visible: {
        profiles: profiles.items.length,
        categories: categories.items.length,
        webhooks: webhooks.items.length,
        withPhoto: profiles.items.filter(profile => profile.avatar).length,
      },
      skipped: profiles.skipped,
      repaired: profiles.repaired,
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
