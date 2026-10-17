import { Router, type IRouter, type Request, type Response } from "express";
import {
  DEFAULT_GROQ_MODEL,
  GroqError,
  groqApiKey,
  groqErrorMessage,
  groqFetch,
  parseModelJson,
} from "../lib/groq";

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

async function generateRoster(req: LoggedRequest, res: Response, prompt: string) {
  const apiKey = await groqApiKey();
  if (!apiKey) {
    res.status(503).json({ message: "GROQ_API_KEY est absent. Ajoute-le dans l’environnement ou dans token.json sur le serveur." });
    return;
  }

  try {
    const response = await groqFetch(apiKey, {
        model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
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
      res.status(502).json({ message: groqErrorMessage(response.status, details) });
      return;
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content || "{\"players\":[]}";
    const players = normalizePlayers(parseModelJson(content));
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
  const apiKey = await groqApiKey();
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");

  const response = await groqFetch(apiKey, {
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
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
    throw new GroqError(groqErrorMessage(response.status, details));
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseModelJson(payload.choices?.[0]?.message?.content || "{}");
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
  // Répartition optionnelle des nationalités : [{ nationality, percent }].
  // Exemple : 40% BR, 30% FR — le reste de l'effectif garde la nationalité
  // par défaut. Les parts sont arrondies au joueur près par le modèle.
  const nationalityMix = (Array.isArray(criteria?.nationalityMix) ? criteria.nationalityMix : [])
    .map((entry: unknown) => (entry && typeof entry === "object" ? entry as Record<string, unknown> : {}))
    .map((entry: Record<string, unknown>) => ({
      nationality: text(entry.nationality, "", 32),
      percent: clamp(entry.percent, 1, 100, 0),
    }))
    .filter((entry: { nationality: string; percent: number }) => entry.nationality && entry.percent > 0)
    .slice(0, 8);
  const mixInstructions = nationalityMix.length > 0
    ? ` Répartition stricte des nationalités : ${nationalityMix.map((mix: { nationality: string; percent: number }) => `${mix.percent}% de joueurs ${mix.nationality}`).join(", ")} (arrondie au joueur près) ; les joueurs restants gardent la nationalité ${nationality}.`
    : "";
  await generateRoster(req, res, `Génère ${count} joueurs pour le club "${clubName}" en ${sport}. Âge entre ${ageMin} et ${ageMax}. OVR entre ${ratingMin} et ${ratingMax}. Nationalité préférée: ${nationality}.${mixInstructions} Répartis les joueurs sur ces postes: ${positions}. Utilise des noms crédibles et des numéros uniques. Si la nationalité est ISTANMUSTA, utilise les prénoms et noms du pays fictif.`);
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
    const message = error instanceof GroqError
      ? error.message
      : error instanceof Error && error.message === "GROQ_API_KEY_MISSING"
        ? "GROQ_API_KEY est absent. Ajoute-le dans l’environnement ou dans token.json sur le serveur."
        : "Erreur de connexion au service Groq.";
    res.status(502).json({ message });
  }
});

export default router;