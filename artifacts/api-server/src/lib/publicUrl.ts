/**
 * Quelle adresse publique le portail expose-t-il ?
 *
 * Discord ne télécharge l'avatar d'un webhook que depuis une URL qu'il peut
 * joindre. Deux erreurs rendaient cette URL inutilisable :
 *
 * 1. Elle n'était construite que si `PUBLIC_BASE_URL` était défini — sinon
 *    `avatar_url` partait à `undefined` et la photo n'apparaissait jamais.
 * 2. Elle était ensuite déduite du protocole de la requête **interne** : le
 *    proxy du portail parle en clair à l'API, on annonçait donc `http://`
 *    alors que l'adresse publique n'existe qu'en `https://`. Discord recevait
 *    une URL injoignable et ignorait l'avatar, sans erreur.
 *
 * L'origine est donc prise dans cet ordre :
 *
 * 1. `publicBase` envoyé par la page elle-même (`location.origin`) : c'est la
 *    seule source qui décrit une URL *constatée fonctionnelle*, puisque le
 *    navigateur charge déjà l'interface et `/api/` depuis cette origine ;
 * 2. `PUBLIC_BASE_URL` (scripts, curl, clients sans navigateur) ;
 * 3. les en-têtes de la requête, avec un protocole deviné selon la cible :
 *    une adresse IP:port est en HTTP (hébergement Pterodactyl), un nom de
 *    domaine est en HTTPS.
 */

type MinimalRequest = {
  headers: Record<string, string | string[] | undefined>;
};

export type PublicBaseSource = "portail" | "PUBLIC_BASE_URL" | "x-forwarded-host" | "host" | null;

export type PublicBase = {
  /** Base utilisable par Discord, ou `null` si aucune ne l'est. */
  url: string | null;
  source: PublicBaseSource;
  /** Raison lisible quand `url` est `null`. */
  reason: string | null;
};

function firstHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.split(",")[0].trim() : "";
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function privateReason(hostname: string, source: PublicBaseSource): PublicBase {
  return {
    url: null,
    source,
    reason:
      `L'adresse « ${hostname} » est locale : Discord ne peut pas la joindre. ` +
      "Utilise l'adresse publique du portail (domaine ou IP publique), ou définis PUBLIC_BASE_URL.",
  };
}

/** URL fournie par un client (navigateur) ou par la configuration. */
function normalizeBase(value: unknown, source: PublicBaseSource): PublicBase | null {
  const trimmed = typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { url: null, source, reason: `${source} n'est pas une URL valide.` };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { url: null, source, reason: `${source} doit commencer par http:// ou https://.` };
  }
  if (isPrivateHost(parsed.hostname)) return privateReason(parsed.hostname, source);

  // Seule l'origine compte : `/api/...` est servi à la racine du portail, et
  // une valeur copiée depuis la barre d'adresse (`https://domaine/publisher`)
  // ne doit pas produire `https://domaine/publisher/api/...`.
  return { url: parsed.origin, source, reason: null };
}

export function resolvePublicBase(req: MinimalRequest, requested?: unknown): PublicBase {
  // 1. Ce que la page utilise réellement pour joindre l'API.
  const fromPage = normalizeBase(requested, "portail");
  if (fromPage?.url) return fromPage;

  // 2. Configuration explicite (scripts, appels hors navigateur).
  const configured = normalizeBase(process.env.PUBLIC_BASE_URL, "PUBLIC_BASE_URL");
  if (configured?.url || configured?.reason) return configured;

  // 3. En-têtes de la requête.
  const forwardedHost = firstHeader(req.headers["x-forwarded-host"]);
  const host = forwardedHost || firstHeader(req.headers["host"]);
  if (!host) {
    return {
      url: null,
      source: null,
      reason: "Aucun nom d'hôte dans la requête : définis PUBLIC_BASE_URL.",
    };
  }

  const hostname = host.split(":")[0];
  if (isPrivateHost(hostname)) return privateReason(hostname, forwardedHost ? "x-forwarded-host" : "host");

  // `x-forwarded-proto` d'un vrai proxy fait foi ; sinon on devine : une
  // IP:port est en HTTP, un nom de domaine en HTTPS (le portail n'écoute qu'en
  // clair côté interne, l'indice du socket serait donc toujours faux).
  const forwardedProto = firstHeader(req.headers["x-forwarded-proto"]).toLowerCase();
  const protocol = forwardedProto ? (forwardedProto === "http" ? "http" : "https") : isIpLiteral(hostname) ? "http" : "https";

  return {
    url: `${protocol}://${host}`,
    source: forwardedHost ? "x-forwarded-host" : "host",
    reason: null,
  };
}
