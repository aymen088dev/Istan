import { readGroqKey } from "./tokenConfig";

/**
 * Appels Groq partagés par les routes IA (effectif, XI) et par l'analyseur
 * mercato. La clé vient de `GROQ_API_KEY` ou de `token.json` (voir
 * `tokenConfig.ts`) : un seul endroit à corriger si le secret change.
 */

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

/** Refus de Groq déjà traduit pour l'utilisateur (l'interface affiche ce texte). */
export class GroqError extends Error {}

export async function groqApiKey(): Promise<string> {
  return readGroqKey();
}

/**
 * Un 502 générique ne dit pas quoi corriger : on reprend le code HTTP et le
 * motif renvoyés par Groq (clé refusée, modèle inconnu, quota…).
 */
export function groqErrorMessage(status: number, body: string): string {
  let detail = body.slice(0, 160).trim();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") detail = parsed.error.message.slice(0, 160);
  } catch {
    // Corps non JSON : le texte brut tronqué suffit.
  }
  if (status === 401 || status === 403) return "Clé Groq refusée. Vérifie GROQ_API_KEY ou token.json sur le serveur.";
  if (status === 404) return `Modèle Groq introuvable (404).${detail ? ` ${detail}` : " Vérifie GROQ_MODEL."}`;
  if (status === 429) return "Quota Groq atteint (429). Réessaie dans quelques instants.";
  return `Groq a refusé la requête (${status}).${detail ? ` ${detail}` : ""}`;
}

/** Appel brut à l'API Groq, avec délai maximal configurable. */
export async function groqFetch(apiKey: string, body: unknown, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

export async function groqJson<T>(apiKey: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  const response = await groqFetch(apiKey, body, timeoutMs);
  if (!response.ok) {
    throw new GroqError(groqErrorMessage(response.status, await response.text()));
  }
  return (await response.json()) as T;
}

/** Nettoie la réponse du modèle : blocs ```json, texte avant/après l'objet. */
export function parseModelJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const starts = [cleaned.indexOf("["), cleaned.indexOf("{")].filter(index => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
