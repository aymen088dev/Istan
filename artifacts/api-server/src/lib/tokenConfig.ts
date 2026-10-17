import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Configuration lue dans `token.json` — le fichier que l'utilisateur dépose à
 * la racine du serveur — puis dans l'environnement.
 *
 * Les valeurs ne quittent jamais le serveur : les routes n'exposent que
 * « clé présente / absente » et la provenance, jamais le secret lui-même.
 * Emplacements essayés : `TOKEN_JSON_PATH`, le dossier courant (le portail
 * lance l'API depuis la racine), puis le dossier parent (API lancée seule
 * depuis `artifacts/api-server`).
 */

export type ServerConfig = Record<string, unknown>;

function candidateFiles(): string[] {
  return [
    process.env.TOKEN_JSON_PATH,
    path.join(process.cwd(), "token.json"),
    path.join(process.cwd(), "..", "token.json"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

export async function readServerConfig(): Promise<ServerConfig> {
  for (const file of candidateFiles()) {
    try {
      const raw = (await readFile(file, "utf8")).replace(/^\uFEFF/, "").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as ServerConfig;
      }
    } catch {
      // Fichier absent ou illisible : on essaie l'emplacement suivant.
    }
  }
  return {};
}

function pick(config: ServerConfig, keys: string[]): string {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Clé Groq : `GROQ_API_KEY` (environnement) puis `token.json`. */
export async function readGroqKey(): Promise<string> {
  const fromEnv = typeof process.env.GROQ_API_KEY === "string" ? process.env.GROQ_API_KEY.trim() : "";
  if (fromEnv) return fromEnv;
  const config = await readServerConfig();
  return pick(config, ["GROQ_API_KEY", "GROQ_API_TOKEN", "apiKey", "token", "key"]);
}

/**
 * Token du bot Discord. `token` est la clé historique de `token.json` : elle
 * est conservée pour ne pas casser une installation existante.
 */
export async function readDiscordBotToken(): Promise<{ token: string; source: string }> {
  const fromEnv = typeof process.env.DISCORD_BOT_TOKEN === "string" ? process.env.DISCORD_BOT_TOKEN.trim() : "";
  if (fromEnv) return { token: fromEnv, source: "environnement (DISCORD_BOT_TOKEN)" };

  const config = await readServerConfig();
  const token = pick(config, ["DISCORD_BOT_TOKEN", "DISCORD_TOKEN", "token", "TOKEN"]);
  return token
    ? { token, source: "token.json" }
    : { token: "", source: "token.json (aucune clé Discord)" };
}

/** Même nettoyage que `bot.js` : guillemets, préfixe « Bot », espaces, sauts de ligne. */
export function cleanBotToken(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^(bot|bearer)\s+/i, "")
    .replace(/\s+/g, "");
}
