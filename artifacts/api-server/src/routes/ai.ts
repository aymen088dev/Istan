import { Router, type IRouter, type Request, type Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";

type GeneratedPlayer = {
  name: string;
  age: number;
  rating: number;
  nationality: string;
  position: string;
  number: string;
};

type AiResponse = { players: GeneratedPlayer[] };
type LoggedRequest = Request & {
  log?: {
    error: (details: unknown, message: string) => void;
  };
};

const router: IRouter = Router();
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

async function readTokenFile() {
  const candidates = [
    process.env.TOKEN_JSON_PATH,
    path.join(process.cwd(), "token.json"),
    path.join(process.cwd(), "..", "token.json"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      const raw = (await readFile(candidate, "utf8")).trim();
      const parsed = JSON.parse(raw) as unknown;
      const value = typeof parsed === "string"
        ? parsed
        : parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).GROQ_API_KEY
            ?? (parsed as Record<string, unknown>).GROQ_API_TOKEN
            ?? (parsed as Record<string, unknown>).apiKey
            ?? (parsed as Record<string, unknown>).token
            ?? (parsed as Record<string, unknown>).key
          : undefined;
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    } catch {
      // The environment variable remains the primary configuration.
    }
  }
  return "";
}

async function groqFetch(apiKey: string, body: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(process.env.GROQ_BASE_URL || GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function text(value: unknown, fallback: string, maxLength = 80) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function normalizePlayers(value: unknown): GeneratedPlayer[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { players?: unknown }).players)
      ? (value as { players: unknown[] }).players
      : [];

  return source
    .filter(player => player && typeof player === "object")
    .slice(0, 40)
    .map((player, index) => {
      const item = player as Record<string, unknown>;
      return {
        name: text(item.name, `Joueur ${index + 1}`, 80),
        age: clamp(item.age, 15, 45, 22),
        rating: clamp(item.rating ?? item.ovr, 1, 99, 75),
        nationality: text(item.nationality ?? item.country, "ISTANMUSTA", 32).toUpperCase(),
        position: text(item.position, "MC", 24).toUpperCase(),
        number: text(item.number ?? item.jerseyNumber, String(index + 1), 3),
      };
    });
}

function parseJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = Math.min(...[cleaned.indexOf("["), cleaned.indexOf("{")].filter(index => index >= 0));
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return []; }
    }
    return [];
  }
}

async function generateRoster(req: LoggedRequest, res: Response, prompt: string) {
  const apiKey = process.env.GROQ_API_KEY || await readTokenFile();
  if (!apiKey) {
    res.status(503).json({ message: "GROQ_API_KEY est absent. Ajoute-le dans l’environnement ou dans token.json sur le serveur." });
    return;
  }

  try {
    const response = await groqFetch(apiKey, {
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.7,
        max_tokens: 5000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Tu es un directeur sportif. Réponds uniquement avec un objet JSON valide de la forme {\"players\":[...]}. Chaque joueur doit avoir name, age, rating, nationality, position et number. N'invente jamais de champs hors de ce format.",
          },
          { role: "user", content: prompt },
        ],
    });

    if (!response.ok) {
      const details = await response.text();
      req.log?.error?.({ status: response.status, details: details.slice(0, 500) }, "Groq request failed");
      res.status(502).json({ message: "Groq n'a pas pu générer l'effectif." });
      return;
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content || "{\"players\":[]}";
    const players = normalizePlayers(parseJson(content));
    if (players.length === 0) {
      res.status(502).json({ message: "La réponse IA ne contient aucun joueur exploitable." });
      return;
    }
    res.json({ players } satisfies AiResponse);
  } catch (error) {
    req.log?.error?.({ err: error }, "Groq generation error");
    res.status(502).json({ message: "Erreur de connexion au service Groq." });
  }
}

async function requestGroqJson(req: LoggedRequest, prompt: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY || await readTokenFile();
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");

  const response = await groqFetch(apiKey, {
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Réponds uniquement avec un objet JSON valide. N'invente jamais d'identifiant et utilise uniquement ceux fournis.",
        },
        { role: "user", content: prompt },
      ],
  });

  if (!response.ok) {
    const details = await response.text();
    req.log?.error?.({ status: response.status, details: details.slice(0, 500) }, "Groq request failed");
    throw new Error("GROQ_REQUEST_FAILED");
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseJson(payload.choices?.[0]?.message?.content || "{}");
}

router.post("/ai/squad-from-text", async (req, res) => {
  const rawText = typeof req.body?.rawText === "string" ? req.body.rawText.trim() : "";
  if (!rawText) {
    res.status(400).json({ message: "Le texte de l'effectif est obligatoire." });
    return;
  }

  const sport = text(req.body?.sport, "football", 20);
  const clubName = text(req.body?.clubName, "ce club", 80);
  await generateRoster(req, res, `Sport: ${sport}. Club: ${clubName}. Transforme ce texte brut en effectif structuré. Conserve les informations présentes, complète uniquement les champs manquants avec des valeurs cohérentes. Pour nationality, reconnais les noms de pays en français/anglais, les codes ISO et les emojis de drapeaux, puis renvoie un code ISO à deux lettres (ou ISTANMUSTA pour le pays fictif). Pays fictif disponible: ISTANMUSTA. Texte brut:\n${rawText.slice(0, 14000)}`);
});

router.post("/ai/squad-from-criteria", async (req, res) => {
  const criteria = req.body?.criteria && typeof req.body.criteria === "object" ? req.body.criteria : req.body;
  const sport = text(criteria?.sport, "football", 20);
  const clubName = text(criteria?.clubName, "ce club", 80);
  const count = clamp(criteria?.count, 1, 40, 23);
  const ageMin = clamp(criteria?.ageMin, 15, 45, 18);
  const ageMax = Math.max(ageMin, clamp(criteria?.ageMax, ageMin, 45, 32));
  const ratingMin = clamp(criteria?.ratingMin, 1, 99, 65);
  const ratingMax = Math.max(ratingMin, clamp(criteria?.ratingMax, ratingMin, 99, 85));
  const nationality = text(criteria?.nationality, "ISTANMUSTA", 32);
  const positions = text(criteria?.positions, sport === "hockey" ? "G, DG, DD, C, AG, AD" : "GB, DC, AG, AD, MDC, MC, MOC, BU", 160);
  await generateRoster(req, res, `Génère ${count} joueurs pour le club "${clubName}" en ${sport}. Âge entre ${ageMin} et ${ageMax}. OVR entre ${ratingMin} et ${ratingMax}. Nationalité préférée: ${nationality}. Répartis les joueurs sur ces postes: ${positions}. Utilise des noms crédibles et des numéros uniques. Si la nationalité est ISTANMUSTA, utilise les prénoms et noms du pays fictif.`);
});

router.post("/ai/best-xi", async (req, res) => {
  const sport = text(req.body?.sport, "football", 20);
  const formation = text(req.body?.formation, "4-3-3", 80);
  const players: Record<string, unknown>[] = Array.isArray(req.body?.players)
    ? req.body.players.filter((player: unknown): player is Record<string, unknown> => Boolean(player) && typeof player === "object").slice(0, 40)
    : [];

  if (players.length === 0) {
    res.status(400).json({ message: "L'effectif est obligatoire." });
    return;
  }

  const compactPlayers = players.map((player: Record<string, unknown>) => ({
    id: text(player.id, "", 100),
    name: text(player.name, "Joueur", 80),
    position: text(player.position, "INCONNU", 40),
    rating: clamp(player.rating, 1, 99, 75),
    number: text(player.number, "", 4),
  })).filter(player => player.id);

  try {
    const suggestion = await requestGroqJson(req, `Sport: ${sport}. Formation: ${formation}. Classe ces joueurs par pertinence pour construire un XI dans cette formation. Tiens compte d'abord du poste naturel, du côté gauche/droit, puis de la note. Ne supprime aucun joueur de la liste. Réponds avec {"playerIds":["id-1","id-2",...]} et uniquement les identifiants fournis, dans l'ordre de préférence.\nJoueurs:\n${JSON.stringify(compactPlayers)}`);
    const rawIds = suggestion && typeof suggestion === "object" && Array.isArray((suggestion as { playerIds?: unknown }).playerIds)
      ? (suggestion as { playerIds: unknown[] }).playerIds
      : [];
    const validIds = new Set(compactPlayers.map(player => player.id));
    const playerIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && validIds.has(id)))];
    if (playerIds.length === 0) {
      res.status(502).json({ message: "Groq n'a pas fourni de choix exploitable." });
      return;
    }
    res.json({ playerIds });
  } catch (error) {
    req.log?.error?.({ err: error }, "Groq best XI error");
    const message = error instanceof Error && error.message === "GROQ_API_KEY_MISSING"
      ? "GROQ_API_KEY est absent. Ajoute-le dans l’environnement ou dans token.json sur le serveur."
      : "Erreur de connexion au service Groq.";
    res.status(502).json({ message });
  }
});

export default router;