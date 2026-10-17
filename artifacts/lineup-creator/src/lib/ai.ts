export type GeneratedPlayer = {
  name: string;
  age: number;
  rating: number;
  nationality: string;
  position: string;
  number: string;
};

export type BestXISuggestion = {
  playerIds: string[];
};

/**
 * Le portail sert le CREATOR sous `/creator/` (BASE_URL) mais monte l'API du
 * serveur sur `/api` (voir projects.json). Un chemin relatif à BASE_URL visait
 * donc `/creator/api/...`, que le portail sert comme page HTML : le navigateur
 * recevait la page d'accueil, `response.json()` échouait, et l'IA se
 * comportait comme si elle avait renvoyé « 0 joueur », sans aucune erreur.
 */
const API_BASE = "/api";

function apiPath(path: string) {
  const normalizedPath = path.replace(/^\/api(?=\/)/, "");
  return `${API_BASE}/${normalizedPath.replace(/^\/+/, "")}`;
}

async function postAi(path: string, body: unknown): Promise<GeneratedPlayer[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35_000);
  let response: Response;
  try {
    response = await fetch(apiPath(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Le service IA met trop de temps à répondre. Vérifie la clé et la connexion du serveur.");
    }
    throw new Error("API indisponible. Vérifie que le serveur Node est bien démarré.");
  } finally {
    window.clearTimeout(timeout);
  }
  const rawBody = await response.text();
  let payload: { players?: GeneratedPlayer[]; message?: string } = {};
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    // Réponse non JSON (page du portail) : traitée plus bas, jamais ignorée.
  }
  if (!response.ok) throw new Error(payload.message || "La génération IA a échoué.");
  if (!Array.isArray(payload.players)) {
    throw new Error("L'API IA n'a pas répondu (le serveur a renvoyé une page au lieu de données). Recharge la page et réessaie.");
  }
  return payload.players;
}

export function generateSquadFromText(rawText: string, sport: string, clubName: string) {
  return postAi("/ai/squad-from-text", { rawText, sport, clubName });
}

export function generateSquadFromCriteria(criteria: {
  sport: string;
  clubName: string;
  count: number;
  ageMin: number;
  ageMax: number;
  ratingMin: number;
  ratingMax: number;
  nationality: string;
  positions: string;
  /** Répartition optionnelle des nationalités, ex. [{ nationality: "BR", percent: 40 }] */
  nationalityMix?: Array<{ nationality: string; percent: number }>;
}) {
  return postAi("/ai/squad-from-criteria", { criteria });
}

export async function suggestBestXI(
  players: Array<Pick<GeneratedPlayer, "name" | "age" | "rating" | "position" | "number"> & { id: string }>,
  sport: string,
  formation: string,
): Promise<BestXISuggestion> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35_000);
  let response: Response;
  try {
    response = await fetch(apiPath("/ai/best-xi"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players, sport, formation }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("La suggestion IA met trop de temps à répondre.");
    }
    throw new Error("API indisponible. Le placement automatique local reste disponible.");
  } finally {
    window.clearTimeout(timeout);
  }
  const rawBody = await response.text();
  let payload: { playerIds?: unknown; message?: string } = {};
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    // Réponse non JSON (page du portail) : traitée plus bas, jamais ignorée.
  }
  if (!response.ok) throw new Error(payload.message || "La suggestion IA a échoué.");
  if (!Array.isArray(payload.playerIds)) {
    throw new Error("L'API IA n'a pas répondu (le serveur a renvoyé une page au lieu de données). Recharge la page et réessaie.");
  }
  return {
    playerIds: payload.playerIds.filter((id): id is string => typeof id === "string"),
  };
}