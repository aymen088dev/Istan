/**
 * Termine la connexion HeyGen par code d'appareil.
 *
 * Le flux est lancé par une requête `device_authorization` (voir la commande
 * documentée dans video/README). Ce script attend l'approbation, échange le
 * code contre des jetons et écrit `~/.heygen/credentials` au format attendu par
 * le CLI HeyGen et par le moteur audio de HyperFrames.
 *
 *   node tools/heygen-auth.mjs [--timeout 150]
 *
 * Aucun jeton n'est affiché : seul le résultat (connecté ou motif d'échec)
 * sort sur la console.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLIENT_ID = process.env.HYPERFRAMES_OAUTH_CLIENT_ID || "q2A2QRSke2LrFTPJhoDbHtXh";
const TOKEN_URL = "https://api2.heygen.com/v1/oauth/token";
const GRANT = "urn:ietf:params:oauth:grant-type:device_code";

const argTimeout = process.argv.indexOf("--timeout");
const maxSeconds = argTimeout > 0 ? Number(process.argv[argTimeout + 1]) : 150;

const statePath = "/tmp/heygen-device.json";
let state;
try {
  state = JSON.parse(readFileSync(statePath, "utf8"));
} catch {
  console.error("✗ aucun code d'appareil en attente : relance d'abord la demande d'autorisation.");
  process.exit(2);
}

const deadline = Date.now() + maxSeconds * 1000;
let interval = Math.max(5, Number(state.interval) || 5);

async function attempt() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: GRANT,
    device_code: state.device_code,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.access_token) return { tokens: data };
  const code = data.error || `http_${res.status}`;
  if (code === "authorization_pending") return { pending: true };
  if (code === "slow_down") {
    interval += 5;
    return { pending: true };
  }
  return { error: code, detail: data.error_description || "" };
}

let tokens = null;
while (Date.now() < deadline && !tokens) {
  await new Promise((r) => setTimeout(r, interval * 1000));
  const result = await attempt();
  if (result.error) {
    console.error(`✗ autorisation refusée ou expirée : ${result.error}${result.detail ? ` (${result.detail})` : ""}`);
    process.exit(1);
  }
  tokens = result.tokens;
}

if (!tokens) {
  console.error("✗ toujours en attente : le code n'a pas été approuvé dans le délai.");
  process.exit(3);
}

const dir = join(homedir(), ".heygen");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = join(dir, "credentials");
const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
const payload = {
  oauth: {
    access_token: tokens.access_token,
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    expires_at: expiresAt,
    ...(tokens.scope ? { scope: tokens.scope } : {}),
    ...(tokens.token_type ? { token_type: tokens.token_type } : {}),
  },
};
writeFileSync(file, JSON.stringify(payload), { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`✓ connecté — jeton valable jusqu'à ${expiresAt}`);
