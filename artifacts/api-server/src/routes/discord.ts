import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import multer from "multer";
import {
  avatarInfo,
  pushMessage,
  readMessages,
  readProfiles,
  readWebhooks,
  validText,
  type PublisherMessage,
  type PublisherProfile,
  type PublisherWebhook,
} from "../lib/publisher";
import { resolvePublicBase } from "../lib/publicUrl";

/**
 * Flux Discord, publication et modération RP.
 *
 *  - `GET  /api/discord/messages` : flux affiché dans l'interface (alimenté par
 *    le bot `artifacts/discord-publisher/bot.js` et par les publications).
 *  - `POST /api/discord/messages` : relais du bot (en-tête `x-bot-secret`).
 *  - `POST /api/publish`          : envoie un message signé du profil choisi.
 *  - `POST /api/moderation`       : journalise un mute / ban RP dans le salon.
 */

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
});

const MODERATION_ROLES = new Set(["modo", "SM", "Admin"]);
const MODERATION_COLORS: Record<string, number> = { mute: 0xfaa61a, ban: 0xed4245 };
const DISCORD_TIMEOUT_MS = 15_000;

type DiscordAttachment = {
  id?: string;
  filename?: string;
  url?: string;
  proxy_url?: string;
  content_type?: string | null;
  size?: number;
};

type DiscordMessage = {
  id?: string;
  channel_id?: string;
  guild_id?: string;
  content?: string;
  timestamp?: string;
  author?: { id?: string; username?: string; global_name?: string | null; avatar?: string | null };
  attachments?: DiscordAttachment[];
};

type UploadedImages = Record<string, Express.Multer.File[]> | Express.Multer.File[] | undefined;

function imageFiles(req: { files?: unknown }): Express.Multer.File[] {
  const files = req.files as UploadedImages;
  if (!files) return [];
  return Array.isArray(files) ? files : files.images ?? [];
}

function avatarUrl(author: DiscordMessage["author"], fallback: string | null): string | null {
  if (!author?.id) return fallback;
  if (author.avatar) {
    const extension = author.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${extension}?size=128`;
  }
  if (!author.username) return fallback;
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(author.id) % 5n)}.png`;
}

/** Convertit un message renvoyé par Discord en message du flux local. */
function messageFromDiscord(
  raw: DiscordMessage,
  source: PublisherMessage["source"],
  fallback: Partial<PublisherMessage> = {},
): PublisherMessage {
  const authorName = raw.author?.username ?? fallback.authorName ?? "Publication";
  return {
    id: raw.id ?? `local-${randomUUID().slice(0, 10)}`,
    channelId: raw.channel_id ?? fallback.channelId ?? null,
    channelName: fallback.channelName ?? null,
    guildId: raw.guild_id ?? fallback.guildId ?? null,
    guildName: fallback.guildName ?? null,
    authorId: raw.author?.id ?? fallback.authorId ?? null,
    authorName,
    authorAvatar: avatarUrl(raw.author, fallback.authorAvatar ?? null),
    content: raw.content ?? fallback.content ?? "",
    attachments: (raw.attachments ?? []).map(attachment => ({
      id: attachment.id ?? randomUUID().slice(0, 10),
      name: attachment.filename ?? "fichier",
      url: attachment.url ?? "",
      proxyUrl: attachment.proxy_url ?? null,
      contentType: attachment.content_type ?? null,
      size: attachment.size ?? 0,
    })),
    timestamp: raw.timestamp ?? new Date().toISOString(),
    source,
  };
}

function webhookEndpoint(webhook: PublisherWebhook) {
  // `wait=true` : Discord renvoie le message créé, ce qui alimente le flux
  // local avec les vraies URL d'images, sans attendre le bot.
  return `${webhook.url}${webhook.url.includes("?") ? "&" : "?"}wait=true`;
}

async function postToDiscord(webhook: PublisherWebhook, body: { payload: unknown; files?: Express.Multer.File[] }) {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(body.payload));
  (body.files ?? []).forEach((file, index) => {
    form.append(
      `files[${index}]`,
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" }),
      file.originalname || `image-${index + 1}`,
    );
  });

  const response = await fetch(webhookEndpoint(webhook), {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
  });

  const text = await response.text();
  if (!response.ok) {
    return { error: `Discord a refusé l'envoi (${response.status}). ${text.slice(0, 200)}`.trim() };
  }
  try {
    return { message: JSON.parse(text) as DiscordMessage };
  } catch {
    return { message: {} as DiscordMessage };
  }
}

/**
 * Photo du profil, prête pour `avatar_url`.
 *
 * Trois causes d'échec silencieux sont traitées ici :
 *  - pas de photo dans le dossier du profil ;
 *  - fichier annoncé dans le JSON mais absent du disque ;
 *  - base publique inconnue (`PUBLIC_BASE_URL` absent, portail joint en
 *    localhost) : Discord ne peut pas télécharger l'image.
 * Dans les trois cas on renvoie une raison lisible, affichée par l'interface.
 */
async function profileAvatar(
  profile: PublisherProfile,
  req: { headers: Record<string, string | string[] | undefined> },
  requestedBase?: unknown,
): Promise<{ url: string | null; warning: string | null }> {
  if (!profile.avatar) {
    return {
      url: null,
      warning: `Le profil « ${profile.name} » n'a pas de photo : importe-en une pour qu'elle apparaisse sur Discord.`,
    };
  }

  // Photo hébergée ailleurs (import depuis Discord) : on la laisse telle quelle.
  if (/^https?:\/\//i.test(profile.avatar)) return { url: profile.avatar, warning: null };

  const info = await avatarInfo(profile.folder);
  if (!info) {
    return {
      url: null,
      warning:
        `La photo du profil « ${profile.name} » est annoncée mais absente du disque ` +
        `(profils/${profile.folder}/). Réimporte l'image, elle sera renvoyée à Discord.`,
    };
  }

  // L'origine annoncée par la page (`location.origin`) est la plus fiable :
  // c'est une URL que le navigateur utilise déjà. `PUBLIC_BASE_URL` et les
  // en-têtes servent de repli pour les appels sans navigateur.
  const base = resolvePublicBase(req, requestedBase);
  if (!base.url) return { url: null, warning: `Photo non envoyée : ${base.reason}` };

  const suffix = info.version ? `?v=${info.version}` : "";
  return { url: `${base.url}${profile.avatar}${suffix}`, warning: null };
}

// ==========================================
// FLUX DES MESSAGES
// ==========================================

router.get("/discord/messages", async (req, res): Promise<void> => {
  const requested = Number(req.query.limit);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(200, Math.trunc(requested))) : 100;
  const messages = await readMessages();
  // Le fichier va du plus ancien au plus récent : le flux montre les derniers
  // messages, du plus récent au plus ancien.
  res.json(messages.slice(-limit).reverse());
});

router.post("/discord/messages", async (req, res): Promise<void> => {
  const secret = process.env.PUBLISHER_BOT_SECRET;
  if (secret && req.get("x-bot-secret") !== secret) {
    res.status(401).json({ error: "Secret de bot invalide." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const authorName = validText(body.authorName, "", 80);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!authorName || (typeof body.content !== "string" && !attachments.length)) {
    res.status(400).json({ error: "Message Discord incomplet (auteur et contenu attendus)." });
    return;
  }

  const message: PublisherMessage = {
    id: validText(body.id, `bot-${randomUUID().slice(0, 10)}`, 40),
    channelId: validText(body.channelId, "", 40) || null,
    channelName: validText(body.channelName, "", 80) || null,
    guildId: validText(body.guildId, "", 40) || null,
    guildName: validText(body.guildName, "", 80) || null,
    authorId: validText(body.authorId, "", 40) || null,
    authorName,
    authorAvatar: typeof body.authorAvatar === "string" ? body.authorAvatar.slice(0, 400) : null,
    content: typeof body.content === "string" ? body.content.slice(0, 4_000) : "",
    attachments: attachments.slice(0, 10).map((raw, index) => {
      const attachment = (raw ?? {}) as Record<string, unknown>;
      return {
        id: validText(attachment.id, `file-${index}`, 40),
        name: validText(attachment.name, "fichier", 200),
        url: validText(attachment.url, "", 500),
        proxyUrl: typeof attachment.proxyUrl === "string" ? attachment.proxyUrl : null,
        contentType: typeof attachment.contentType === "string" ? attachment.contentType : null,
        size: Number(attachment.size) || 0,
      };
    }),
    timestamp: validText(body.timestamp, new Date().toISOString(), 40),
    source: "discord",
  };

  const stored = await pushMessage(message);
  res.status(201).json({ ok: true, stored });
});

// ==========================================
// PUBLICATION
// ==========================================

router.post("/publish", upload.any(), async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const message = validText(body.message, "", 2_000);
  const images = imageFiles(req).slice(0, 4);

  if (!message && !images.length) {
    res.status(400).json({ error: "Ajoute un message ou une image." });
    return;
  }

  const [webhooks, profiles] = await Promise.all([readWebhooks(), readProfiles()]);
  const webhook = webhooks.find(item => item.folder === validText(body.webhookFolder, "", 80));
  const profile = profiles.find(item => item.folder === validText(body.profileFolder, "", 80));

  if (!webhook) {
    res.status(400).json({ error: "Webhook introuvable : choisis un salon." });
    return;
  }
  if (!profile) {
    res.status(400).json({ error: "Profil introuvable : choisis une identité." });
    return;
  }

  const avatar = await profileAvatar(profile, req, body.publicBase);

  // `dryRun=1` : vérifie webhook, profil et photo sans rien envoyer dans le
  // salon. C'est ce que teste le bouton « Tester le réglage » de l'interface —
  // on ne découvre plus un problème de photo après une publication réelle.
  if (String(body.dryRun ?? "") === "1") {
    res.status(200).json({
      dryRun: true,
      message: `Réglage valide : webhook « ${webhook.name} », profil « ${profile.name} ».`,
      profile: profile.name,
      webhook: webhook.name,
      avatarSent: Boolean(avatar.url),
      avatarUrl: avatar.url,
      avatarWarning: avatar.warning,
    });
    return;
  }

  try {
    const result = await postToDiscord(webhook, {
      payload: {
        content: message,
        username: profile.name,
        ...(avatar.url ? { avatar_url: avatar.url } : {}),
      },
      files: images,
    });

    if (result.error) {
      res.status(502).json({ error: result.error });
      return;
    }

    // Le flux se met à jour tout de suite, avec l'identité du profil.
    await pushMessage(
      messageFromDiscord(result.message ?? {}, "publisher", {
        content: message,
        authorName: profile.name,
        authorAvatar: profile.avatar,
        channelName: webhook.name,
      }),
    );

    res.status(201).json({
      message: "Publication envoyée sur Discord.",
      avatarSent: Boolean(avatar.url),
      avatarUrl: avatar.url,
      avatarWarning: avatar.warning,
    });
  } catch (error) {
    res.status(502).json({ error: `Discord injoignable : ${(error as Error).message}` });
  }
});

// ==========================================
// MODÉRATION RP
// ==========================================

router.post("/moderation", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = body.action === "ban" ? "ban" : body.action === "mute" ? "mute" : null;
  const reason = validText(body.reason, "", 500);

  if (!action) {
    res.status(400).json({ error: "Action inconnue (mute ou ban)." });
    return;
  }

  const [webhooks, profiles] = await Promise.all([readWebhooks(), readProfiles()]);
  const webhook = webhooks.find(item => item.folder === validText(body.webhookFolder, "", 80));
  const moderator = profiles.find(item => item.folder === validText(body.moderatorFolder, "", 80));
  const target = profiles.find(item => item.folder === validText(body.targetProfileFolder, "", 80));

  if (!webhook || !moderator || !target) {
    res.status(400).json({ error: "Webhook, modérateur ou profil ciblé introuvable." });
    return;
  }
  if (!MODERATION_ROLES.has(moderator.role)) {
    res.status(403).json({ error: "Ce profil n'a pas le rôle requis pour modérer." });
    return;
  }

  const label = action === "mute" ? "Mute" : "Ban";
  const avatar = await profileAvatar(moderator, req, body.publicBase);
  try {
    const result = await postToDiscord(webhook, {
      payload: {
        username: moderator.name,
        ...(avatar.url ? { avatar_url: avatar.url } : {}),
        embeds: [
          {
            title: `${action === "mute" ? "🔇" : "⛔"} ${label} — ${target.name}${target.verified ? " ✓" : ""}`,
            color: MODERATION_COLORS[action],
            fields: [
              { name: "Modérateur", value: `${moderator.name} (${moderator.role})`, inline: true },
              { name: "Profil visé", value: `${target.name}${target.category ? ` · ${target.category}` : ""}`, inline: true },
              { name: "Motif", value: reason || "Non précisé" },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "Modération RP — ISTAN Publisher" },
          },
        ],
      },
    });

    if (result.error) {
      res.status(502).json({ error: result.error });
      return;
    }

    await pushMessage(
      messageFromDiscord(result.message ?? {}, "publisher", {
        content: `${label} — ${target.name}`,
        authorName: moderator.name,
        authorAvatar: moderator.avatar,
        channelName: webhook.name,
      }),
    );

    res.status(201).json({ message: `${label} appliqué à ${target.name}.` });
  } catch (error) {
    res.status(502).json({ error: `Discord injoignable : ${(error as Error).message}` });
  }
});

export default router;
