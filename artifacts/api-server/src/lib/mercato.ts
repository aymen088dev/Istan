import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_GROQ_MODEL,
  GroqError,
  groqApiKey,
  groqFetch,
  groqErrorMessage,
  parseModelJson,
} from "./groq";
import { cleanBotToken, readDiscordBotToken } from "./tokenConfig";

/**
 * Analyseur mercato — portail indépendant du Discord Publisher.
 *
 * Il lit l'historique REST du salon demandé (4 mois par défaut), puis fait
 * extraire par lots les transferts individuels annoncés dans les messages.
 *
 * Le travail est long (des milliers de messages, plusieurs dizaines d'appels
 * Groq) : il tourne donc en tâche de fond avec une progression consultable,
 * et le rapport est écrit sur disque pour être relu sans tout réanalyser.
 */

const DISCORD_API = "https://discord.com/api/v10";
export const DEFAULT_CHANNEL_ID = "1465801451971412219";
export const DEFAULT_MONTHS = 4;
export const MAX_MONTHS = 6;

const MAX_PAGES = 220; // 22 000 messages au maximum
const MAX_ANALYSIS_MESSAGES = 12000;
const BATCH_CHAR_BUDGET = 7000;
const BATCH_MESSAGE_LIMIT = 60;
// Le quota Groq du palier gratuit se compte en tokens par minute : les lots
// partent un par un, avec une pause, plutôt que trois en parallèle (429).
const CONCURRENCY = 1;
const BATCH_PAUSE_MS = 700;
const GROQ_TIMEOUT_MS = 120_000;

const dataDir = process.env.MERCATO_DATA_DIR || path.join(process.cwd(), "data", "mercato");
const reportFile = path.join(dataDir, "report.json");
const cacheFile = path.join(dataDir, "messages.json");

export type MercatoMessage = {
  id: string;
  author: string;
  timestamp: string;
  text: string;
};

export type MercatoTransfer = {
  id: string;
  player: string;
  from: string | null;
  to: string | null;
  fee: string | null;
  type: "transfert" | "prêt" | "retour" | "libre" | "autre";
  date: string | null;
  confidence: number;
  quote: string;
  author: string | null;
  messageId: string | null;
};

export type MercatoReport = {
  channelId: string;
  channelName: string | null;
  generatedAt: string;
  since: string;
  until: string;
  messageCount: number;
  analyzedMessages: number;
  batches: number;
  failedBatches: number;
  model: string;
  transfers: MercatoTransfer[];
};

type DiscordEmbed = {
  title?: string;
  description?: string;
  author?: { name?: string };
  footer?: { text?: string };
  fields?: { name?: string; value?: string }[];
};

type DiscordRawMessage = {
  id?: string;
  content?: string;
  timestamp?: string;
  author?: { username?: string; global_name?: string | null; bot?: boolean };
  embeds?: DiscordEmbed[];
};

type ChannelInfo = { name?: string };

export type JobState = "fetching" | "analyzing" | "done" | "error";

export type MercatoJob = {
  id: string;
  state: JobState;
  phase: string;
  channelId: string;
  months: number;
  startedAt: string;
  finishedAt: string | null;
  messagesFetched: number;
  messagesKept: number;
  batchesTotal: number;
  batchesDone: number;
  batchesFailed: number;
  transfersFound: number;
  error: string | null;
  report: MercatoReport | null;
};

const jobs = new Map<string, MercatoJob>();
let activeJobId: string | null = null;

export function latestJob(): MercatoJob | null {
  if (!activeJobId) return null;
  return jobs.get(activeJobId) ?? null;
}

export function findJob(id: string): MercatoJob | null {
  return jobs.get(id) ?? null;
}

function isoNow(): string {
  return new Date().toISOString();
}

async function writeJsonAtomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const payload = JSON.stringify(value, null, 2);
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, file).catch(async error => {
    await unlink(tmp).catch(() => undefined);
    throw error;
  });
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

// ==========================================
// DISCORD — HISTORIQUE DU SALON
// ==========================================

function discordMessageText(raw: DiscordRawMessage): string {
  const parts: string[] = [raw.content ?? ""];
  for (const embed of raw.embeds ?? []) {
    parts.push(
      [
        embed.title,
        embed.description,
        embed.author?.name,
        ...(embed.fields ?? []).map(field => [field.name, field.value].filter(Boolean).join(" : ")),
        embed.footer?.text,
      ]
        .filter((part): part is string => Boolean(part && String(part).trim()))
        .join("\n"),
    );
  }
  return parts
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function discordErrorMessage(status: number, body: string): string {
  let detail = body.slice(0, 200).trim();
  try {
    const parsed = JSON.parse(body) as { message?: unknown; code?: unknown };
    if (typeof parsed.message === "string") detail = parsed.message;
  } catch {
    // Corps non JSON.
  }
  if (status === 401)
    return "Token Discord refusé (401). Vérifie DISCORD_BOT_TOKEN dans token.json : il a peut-être été régénéré.";
  if (status === 403)
    return (
      "Le bot n'a pas accès à ce salon (403). Ajoute-le au serveur et donne-lui « Voir le salon » " +
      "et « Lire l'historique des messages »."
    );
  if (status === 404) return `Salon Discord introuvable (404). ${detail}`.trim();
  if (status === 429) return "Discord limite les requêtes (429). Réessaie dans quelques instants.";
  return `Discord a refusé la requête (${status}). ${detail}`.trim();
}

async function discordGet<T>(token: string, route: string): Promise<T> {
  const response = await fetch(`${DISCORD_API}${route}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "User-Agent": "DiscordBot (istan-mercato, 1.0)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(discordErrorMessage(response.status, await response.text()));
  }
  return (await response.json()) as T;
}

async function readChannelInfo(token: string, channelId: string): Promise<string | null> {
  try {
    const channel = await discordGet<ChannelInfo>(token, `/channels/${channelId}`);
    return channel.name ?? null;
  } catch {
    return null;
  }
}

/** Historique complet depuis `since`, du plus récent au plus ancien. */
async function fetchHistory(
  token: string,
  channelId: string,
  since: number,
  job: MercatoJob,
): Promise<DiscordRawMessage[]> {
  const collected: DiscordRawMessage[] = [];
  let before: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (before) params.set("before", before);
    const batch = await discordGet<DiscordRawMessage[]>(
      token,
      `/channels/${channelId}/messages?${params.toString()}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;

    let reachedCutoff = false;
    for (const message of batch) {
      const stamp = message.timestamp ? Date.parse(message.timestamp) : Number.NaN;
      if (Number.isFinite(stamp) && stamp < since) {
        reachedCutoff = true;
        continue;
      }
      collected.push(message);
    }

    job.messagesFetched = collected.length;
    job.phase = `Récupération de l'historique (${collected.length} messages)`;

    if (reachedCutoff || batch.length < 100) break;
    before = batch[batch.length - 1]?.id;
    if (!before) break;
  }

  return collected;
}

// ==========================================
// GROQ — EXTRACTION DES TRANSFERTS
// ==========================================

function normalizeType(value: unknown): MercatoTransfer["type"] {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("prêt") || raw.includes("pret") || raw.includes("loan")) return "prêt";
  if (raw.includes("retour") || raw.includes("return")) return "retour";
  if (raw.includes("libre") || raw.includes("free")) return "libre";
  if (raw.includes("transfer")) return "transfert";
  return raw ? "autre" : "transfert";
}

function clean(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function feeText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return clean(value, 60);
}

function normalizeDate(value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function slug(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type BatchTransfer = Record<string, unknown>;

function buildPrompt(batch: MercatoMessage[], batchIndex: number, total: number, channelId: string): string {
  const lines = batch.map((message, index) => {
    const date = message.timestamp.slice(0, 10);
    return `m${index} [${date}] ${message.author}: ${message.text.replace(/\n/g, " / ")}`;
  });

  return [
    `Salon Discord ${channelId} — lot ${batchIndex + 1}/${total}.`,
    "Voici des messages d'un serveur de football RP. Extrais les transferts INDIVIDUELS de joueurs réellement annoncés : un joueur qui signe, est recruté, vendu, acheté, prêté, revient de prêt, part libre ou quitte un club pour un autre.",
    "Règles strictes :",
    "- Ne garde que ce qui est écrit dans les messages : aucun nom de club ou de joueur inventé.",
    "- Un message peut annoncer plusieurs joueurs (récapitulatif, liste de prêts) : crée une entrée par joueur nommé.",
    "- Garde les annonces conclues : « officiel », « signe », « recrute », « vend », « acheté », « quitte », « rejoint », « prêt », « libre », « arrive en provenance de ».",
    "- Exclus les offres, propositions, négociations en cours, rumeurs, intentions (« propose », « offre », « demande », « à venir », « aimerait »), les effectifs et les résultats de matchs.",
    "- Exclus les entraîneurs, staffs et clubs : uniquement des joueurs.",
    "- `source` est l'étiquette du message (m0, m1…) ; `quote` est un extrait exact du message (max 160 caractères, sans ellipses ni reformulation) qui justifie l'extraction.",
    "- Sens du transfert : « A vend X à B » ou « B achète X à A » ⇒ from = A, to = B. Quand une fiche d'identité suit (« Club : … »), ce club est la destination (to), pas le club quitté.",
    "- `from` = club quitté, `to` = club rejoint. Mets null si le message ne le nomme pas. Si le message dit seulement « X rejoint Y », `to` = Y et `from` = null.",
    "- `fee` = montant tel qu'écrit (ex. « 45 M », « 8 000 000 $ », « prêt avec option 2,5 M »), sinon null.",
    "- `type` parmi : transfert, prêt, retour, libre, autre.",
    "- `date` = date de l'annonce au format AAAA-MM-JJ (déduite de l'étiquette du message).",
    "- `confidence` entre 0 et 1 selon la clarté de l'annonce (0,95 = officiel explicite ; 0,7 = annonce informelle claire ; 0,4 = formulation ambiguë).",
    'Réponds uniquement avec un objet JSON : {"transfers":[{"player":"...","from":"...","to":"...","fee":"...","type":"transfert","date":"AAAA-MM-JJ","source":"m0","confidence":0.9,"quote":"..."}]}',
    "",
    "Exemples :",
    '- « Le CS Axium vend Amine El Idrissi pour 1M$ ! ## Identité complète **Club :** Hanovre 96 » ⇒ {player:"Amine El Idrissi", from:"CS Axium", to:"Hanovre 96", fee:"1M$", type:"transfert"} (le club de la fiche est la destination).',
    '- « AstanCity vend Amir Loriente et demande 17M » ⇒ aucune entrée : c\'est un prix demandé, pas un transfert conclu.',
    '- « RC Turkiya propose Adrien Le Boucher au CS Axium en prêt gratuit » ⇒ aucune entrée : proposition, pas un accord.',
    '- « Le CS Axium recrute en prêt Adrien Le Boucher pour 1 an (option 2,5M) » ⇒ {player:"Adrien Le Boucher", from:null, to:"CS Axium", fee:"2,5M", type:"prêt"}.',
    "",
    "Messages :",
    ...lines,
  ].join("\n");
}

let resolvedModel: string | null = null;

/**
 * Choisit le meilleur modèle disponible une seule fois : le 120b comprend
 * mieux le sens d'un transfert que le 20b, mais on retombe proprement s'il
 * n'est pas proposé au compte (404). `GROQ_MODEL` reste prioritaire.
 */
async function pickModel(apiKey: string): Promise<string> {
  const configured = process.env.GROQ_MODEL?.trim();
  if (configured) return configured;
  if (resolvedModel) return resolvedModel;

  for (const candidate of ["openai/gpt-oss-120b", DEFAULT_GROQ_MODEL]) {
    try {
      const response = await groqFetch(
        apiKey,
        {
          model: candidate,
          temperature: 0,
          max_tokens: 16,
          messages: [{ role: "user", content: "Réponds uniquement : OK" }],
        },
        20_000,
      );
      if (response.ok) {
        resolvedModel = candidate;
        console.log(`[mercato] modèle Groq : ${candidate}`);
        return candidate;
      }
      console.warn(`[mercato] modèle ${candidate} indisponible (${response.status})`);
    } catch (error) {
      console.warn(`[mercato] modèle ${candidate} injoignable :`, (error as Error).message);
    }
  }
  resolvedModel = DEFAULT_GROQ_MODEL;
  return resolvedModel;
}

async function analyzeBatch(
  apiKey: string,
  model: string,
  batch: MercatoMessage[],
  batchIndex: number,
  total: number,
  channelId: string,
): Promise<MercatoTransfer[]> {
  const body: Record<string, unknown> = {
    model,
    // Déterminisme maximal : deux analyses du même salon doivent donner la
    // même liste, pas une variation selon l'humeur du modèle.
    temperature: 0,
    // Marge large : les modèles de raisonnement comptent leurs réflexions
    // dans max_tokens, et un JSON coupé serait rejeté.
    max_tokens: 5000,
    messages: [
      {
        role: "system",
        content:
          "Tu es un analyste mercato rigoureux. Tu extrais des faits explicitement écrits dans des messages Discord. Tu ne complètes jamais une information manquante et tu réponds uniquement avec l'objet JSON demandé, sans texte autour ni bloc de code.",
      },
      { role: "user", content: buildPrompt(batch, batchIndex, total, channelId) },
    ],
  };
  if (/gpt-oss|reasoning/i.test(model)) body.reasoning_effort = "low";

  let response = await groqFetch(apiKey, body, GROQ_TIMEOUT_MS);
  for (let attempt = 1; attempt <= 3 && (response.status === 429 || response.status >= 500); attempt += 1) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 8000;
    console.warn(`[mercato] Groq ${response.status} lot ${batchIndex + 1}, nouvelle tentative dans ${Math.round(wait / 1000)} s`);
    await new Promise(resolve => setTimeout(resolve, Math.min(wait, 30_000)));
    response = await groqFetch(apiKey, body, GROQ_TIMEOUT_MS);
  }
  if (!response.ok) {
    throw new GroqError(groqErrorMessage(response.status, await response.text()));
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = parseModelJson(payload.choices?.[0]?.message?.content ?? "") as
    | { transfers?: unknown }
    | null;
  const rawTransfers = Array.isArray(parsed?.transfers)
    ? parsed.transfers
    : Array.isArray(parsed)
      ? parsed
      : [];

  // Le modèle laisse parfois passer une intention (« propose », « demande 17M »)
  // alors que l'annonce n'est pas conclue : on l'écarte ici aussi, sinon le
  // rapport présente des négociations comme des transferts.
  const proposal = /\b(propose|proposent|demande\s+\d|fait une offre|n[ée]gocie|serait|pourrait|aimerait)\b/i;
  const official = /\b(officiel|officielle|officialise|signe|sign[ée]|recrute|recrutement)\b/i;

  const transfers: MercatoTransfer[] = [];
  for (const raw of rawTransfers) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as BatchTransfer;
    const player = clean(item.player, 80);
    const from = clean(item.from, 80);
    const to = clean(item.to, 80);
    if (!player) continue;
    if (!from && !to) continue;
    if (from && to && slug(from) === slug(to)) continue;

    const source = clean(item.source, 8);
    const index = source && /^m\d+$/.test(source) ? Number(source.slice(1)) : Number.NaN;
    const origin = Number.isInteger(index) && index >= 0 && index < batch.length ? batch[index] : null;

    const quote = clean(item.quote, 160) ?? clean(origin?.text, 160) ?? "";
    if (proposal.test(quote) && !official.test(quote)) continue;

    const confidenceRaw = typeof item.confidence === "number" ? item.confidence : Number(item.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw))
      : 0.6;

    transfers.push({
      id: `${origin?.id ?? `b${batchIndex}`}-${transfers.length}`,
      player,
      from,
      to,
      fee: feeText(item.fee),
      type: normalizeType(item.type),
      date: normalizeDate(item.date, origin?.timestamp ?? null),
      confidence,
      quote,
      author: origin?.author ?? null,
      messageId: origin?.id ?? null,
    });
  }
  return transfers;
}

function mergeTransfers(groups: MercatoTransfer[][]): MercatoTransfer[] {
  const byKey = new Map<string, MercatoTransfer>();
  for (const transfer of groups.flat()) {
    // Même joueur vers le même club = même transfert, répété dans plusieurs
    // messages (annonce, confirmation, récapitulatif).
    const key = `${slug(transfer.player)}|${slug(transfer.to ?? "")}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, transfer);
      continue;
    }
    const better = transfer.confidence > existing.confidence ? transfer : existing;
    const earliest =
      existing.date && transfer.date
        ? Date.parse(transfer.date) <= Date.parse(existing.date)
          ? existing.date
          : transfer.date
        : existing.date ?? transfer.date;
    byKey.set(key, {
      ...better,
      date: earliest,
      from: better.from ?? existing.from,
      to: better.to ?? existing.to,
      fee: better.fee ?? existing.fee,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const left = a.date ? Date.parse(a.date) : 0;
    const right = b.date ? Date.parse(b.date) : 0;
    return right - left || a.player.localeCompare(b.player, "fr");
  });
}

// ==========================================
// RAPPORT
// ==========================================

export async function readReport(): Promise<MercatoReport | null> {
  const raw = await readJson(reportFile);
  if (!raw || typeof raw !== "object") return null;
  const report = raw as MercatoReport;
  return Array.isArray(report.transfers) ? report : null;
}

export async function readCachedMessages(): Promise<MercatoMessage[] | null> {
  const raw = await readJson(cacheFile);
  if (!raw || typeof raw !== "object") return null;
  const cache = raw as { messages?: unknown };
  return Array.isArray(cache.messages) ? (cache.messages as MercatoMessage[]) : null;
}

// ==========================================
// JOB
// ==========================================

export type AnalysisOptions = {
  channelId?: unknown;
  months?: unknown;
};

export function startAnalysis(options: AnalysisOptions = {}): MercatoJob {
  const running = activeJobId ? jobs.get(activeJobId) : null;
  if (running && (running.state === "fetching" || running.state === "analyzing")) return running;

  const channelId =
    clean(options.channelId, 32) ?? process.env.MERCATO_CHANNEL_ID?.trim() ?? DEFAULT_CHANNEL_ID;
  if (!/^\d{5,25}$/.test(channelId)) {
    throw new Error("Identifiant de salon Discord invalide.");
  }
  const requestedMonths = Number(options.months);
  const months = Number.isFinite(requestedMonths)
    ? Math.min(MAX_MONTHS, Math.max(1, Math.round(requestedMonths)))
    : DEFAULT_MONTHS;

  const job: MercatoJob = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    state: "fetching",
    phase: "Préparation",
    channelId,
    months,
    startedAt: isoNow(),
    finishedAt: null,
    messagesFetched: 0,
    messagesKept: 0,
    batchesTotal: 0,
    batchesDone: 0,
    batchesFailed: 0,
    transfersFound: 0,
    error: null,
    report: null,
  };
  jobs.set(job.id, job);
  activeJobId = job.id;
  void runAnalysis(job);
  return job;
}

async function runAnalysis(job: MercatoJob) {
  try {
    const { token, source } = await readDiscordBotToken();
    if (!token) {
      throw new Error(
        "Aucun token de bot Discord : ajoute DISCORD_BOT_TOKEN dans token.json (racine du serveur).",
      );
    }
    const cleanToken = cleanBotToken(token);
    const apiKey = await groqApiKey();
    if (!apiKey) {
      throw new Error("Aucune clé Groq : ajoute GROQ_API_KEY dans token.json ou dans l'environnement.");
    }

    const until = Date.now();
    const since = until - job.months * 30 * 24 * 60 * 60 * 1000;
    const [channelName, rawMessages] = await Promise.all([
      readChannelInfo(cleanToken, job.channelId),
      fetchHistory(cleanToken, job.channelId, since, job),
    ]);

    job.messagesFetched = rawMessages.length;
    job.phase = "Préparation des lots";
    const messages: MercatoMessage[] = [];
    for (const raw of rawMessages) {
      const text = discordMessageText(raw);
      if (!raw.id || !text || text.length < 6) continue;
      messages.push({
        id: raw.id,
        author: raw.author?.global_name || raw.author?.username || "Inconnu",
        timestamp: raw.timestamp ?? isoNow(),
        text: text.slice(0, 2600),
      });
    }
    messages.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const kept = messages.slice(-MAX_ANALYSIS_MESSAGES);
    job.messagesKept = kept.length;

    await writeJsonAtomic(cacheFile, {
      channelId: job.channelId,
      channelName,
      fetchedAt: isoNow(),
      since: new Date(since).toISOString(),
      messages: kept,
    });

    if (!kept.length) {
      throw new Error(
        "Aucun message texte récupéré. Vérifie que le bot a accès au salon et que « Message Content Intent » est activé.",
      );
    }

    const batches: MercatoMessage[][] = [];
    let current: MercatoMessage[] = [];
    let size = 0;
    for (const message of kept) {
      const cost = message.text.length + 60;
      if (current.length >= BATCH_MESSAGE_LIMIT || (size + cost > BATCH_CHAR_BUDGET && current.length)) {
        batches.push(current);
        current = [];
        size = 0;
      }
      current.push(message);
      size += cost;
    }
    if (current.length) batches.push(current);

    job.batchesTotal = batches.length;
    job.state = "analyzing";
    job.phase = `Analyse IA (0/${batches.length} lots)`;
    const model = await pickModel(apiKey);
    const results: MercatoTransfer[][] = new Array(batches.length).fill([]);
    let cursor = 0;

    const worker = async () => {
      while (cursor < batches.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await analyzeBatch(apiKey, model, batches[index], index, batches.length, job.channelId);
        } catch (error) {
          job.batchesFailed += 1;
          results[index] = [];
          console.error(`[mercato] lot ${index + 1} échoué :`, (error as Error).message);
        }
        job.batchesDone += 1;
        job.phase = `Analyse IA (${job.batchesDone}/${batches.length} lots)`;
        job.transfersFound = mergeTransfers(results).length;
        await new Promise(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));

    const transfers = mergeTransfers(results);
    const report: MercatoReport = {
      channelId: job.channelId,
      channelName,
      generatedAt: isoNow(),
      since: new Date(since).toISOString(),
      until: new Date(until).toISOString(),
      messageCount: rawMessages.length,
      analyzedMessages: kept.length,
      batches: batches.length,
      failedBatches: job.batchesFailed,
      model,
      transfers,
    };
    await writeJsonAtomic(reportFile, report);

    job.report = report;
    job.transfersFound = transfers.length;
    job.state = "done";
    job.phase = "Analyse terminée";
    job.finishedAt = isoNow();
    console.log(
      `[mercato] ${kept.length} messages analysés, ${transfers.length} transferts (token ${source}).`,
    );
  } catch (error) {
    job.state = "error";
    job.phase = "Échec";
    job.error = (error as Error).message || "Analyse impossible.";
    job.finishedAt = isoNow();
    console.error("[mercato]", job.error);
  }
}
