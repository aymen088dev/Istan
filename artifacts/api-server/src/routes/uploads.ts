import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Club logos are stored as files on the server (data/uploads) instead of
 * base64 data URLs inside the shared JSON/DB payloads. Clients upload once,
 * receive a stable URL, and the API serves the folder statically.
 */

const router: IRouter = Router();

const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads");
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED_MIME = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

// Same loose logging contract as the other routes (pino-http optional).
type LoggedRequest = Request & {
  log?: {
    error: (details: unknown, message: string) => void;
  };
};

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function safeFileName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function urlFor(fileName: string) {
  return `/api/uploads/${encodeURIComponent(fileName)}`;
}

router.post("/uploads", async (req: LoggedRequest, res): Promise<void> => {
  const raw = typeof req.body?.data === "string" ? req.body.data : "";
  if (!raw) {
    res.status(400).json({ message: "Champ 'data' manquant (data URL attendu)." });
    return;
  }

  const match = /^data:([^;,]+);base64,(.+)$/s.exec(raw.trim());
  if (!match) {
    res.status(400).json({ message: "Format attendu : data URL base64 d'une image." });
    return;
  }

  const mime = match[1].toLowerCase();
  const extension = ALLOWED_MIME.get(mime);
  if (!extension) {
    res.status(415).json({ message: `Type d'image non supporté : ${mime}.` });
    return;
  }

  const base64 = match[2].replace(/\s/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    res.status(400).json({ message: "Fichier vide." });
    return;
  }
  if (buffer.length > MAX_FILE_SIZE) {
    res.status(413).json({ message: "Logo trop volumineux (3 Mo maximum)." });
    return;
  }

  try {
    await mkdir(uploadsDir, { recursive: true });
    const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
    await writeFile(path.join(uploadsDir, fileName), buffer);
    res.status(201).json({ url: urlFor(fileName), fileName });
  } catch (error) {
    req.log?.error?.({ err: error }, "Logo upload failed");
    res.status(500).json({ message: "Impossible d'enregistrer le logo sur le serveur." });
  }
});

router.get("/uploads/:file", async (req, res): Promise<void> => {
  const fileName = safeFileName(req.params.file);
  if (!fileName || fileName.startsWith(".")) {
    res.status(400).end();
    return;
  }
  const filePath = path.join(uploadsDir, fileName);
  try {
    const content = await readFile(filePath);
    res.setHeader("content-type", MIME_BY_EXT[path.extname(fileName).toLowerCase()] || "application/octet-stream");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.status(200).end(content);
  } catch {
    res.status(404).json({ message: "Logo introuvable." });
  }
});

router.delete("/uploads/:file", async (req, res): Promise<void> => {
  const fileName = safeFileName(req.params.file);
  if (!fileName || fileName.startsWith(".")) {
    res.status(400).end();
    return;
  }
  try {
    await unlink(path.join(uploadsDir, fileName));
    res.status(204).send();
  } catch {
    res.status(404).end();
  }
});

export default router;
