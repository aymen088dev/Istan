"use strict";

/* =========================================================
   DISCORD PUBLISHER — BOT DE RELAIS

   Le bot écoute un salon Discord et pousse chaque message vers
   l'API du portail ISTAN : POST <SERVER_URL>/api/discord/messages
   Les messages sont ensuite affichés dans le flux en direct de
   l'interface Discord Publisher (/publisher/).

   Contexte et token, lus dans cet ordre (du plus fort au plus faible) :
     1. variables d'environnement (Startup Pterodactyl) :
          DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID,
          PUBLISHER_SERVER_URL, PUBLISHER_BOT_SECRET
     2. token.json de la RACINE du dépôt — les mêmes clés :
          DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID,
          PUBLISHER_SERVER_URL, PUBLISHER_BOT_SECRET
     3. artifacts/discord-publisher/token.json (emplacement d'origine,
        clés "token" et "DISCORD_BOT_TOKEN")

   Diagnostic (aucune valeur de token affichée) :
     node bot.js --check   lit le token, le teste contre l'API Discord et
                           vérifie l'accès au salon, puis quitte.
   ========================================================= */

let Client;
let GatewayIntentBits;

try {
    ({ Client, GatewayIntentBits } = require("discord.js"));
} catch (error) {
    console.error("❌ discord.js introuvable :", error.message);
    console.error("   Installe les dépendances depuis la RACINE du projet : `pnpm install`.");
    process.exit(1);
}

const fs = require("fs");
const path = require("path");

// ==========================================
// CONTEXTE — UN SEUL ENDROIT, À LA RACINE
// ==========================================
// Le token.json de la racine est celui du dépôt (il porte aussi la clé IA
// GROQ_API_KEY), et il est ignoré par git : ni un clone ni une archive ne
// l'apportent, il faut le créer sur le serveur. Le fichier du dossier du bot
// reste lu en dernier recours, pour ne casser aucune installation existante.

const ROOT_CONFIG_PATH = path.join(__dirname, "..", "..", "token.json");
const LOCAL_CONFIG_PATH = path.join(__dirname, "token.json");

function readConfigFile(file) {
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.error(`❌ JSON illisible : ${file} (${error.message})`);
        return null;
    }
}

const ROOT_CONFIG = readConfigFile(ROOT_CONFIG_PATH);
const LOCAL_CONFIG = readConfigFile(LOCAL_CONFIG_PATH);

/** Variable d'environnement, sinon le token.json de la racine, sinon celui du bot. */
function setting(name, fallback) {
    if (process.env[name]) return process.env[name];
    if (ROOT_CONFIG && ROOT_CONFIG[name]) return ROOT_CONFIG[name];
    if (LOCAL_CONFIG && LOCAL_CONFIG[name]) return LOCAL_CONFIG[name];
    return fallback;
}

// ==========================================
// CONFIGURATION
// ==========================================

const SERVER_URL = setting("PUBLISHER_SERVER_URL", "http://localhost:10005");
const BOT_SECRET = setting("PUBLISHER_BOT_SECRET", "CHANGE_MOI_PAR_UN_SECRET");
const TARGET_CHANNEL_ID = setting("DISCORD_CHANNEL_ID", "1407091475082383420");

// ==========================================
// TOKEN
// ==========================================

const TOKEN_PLACEHOLDERS = [
    "COLLE_TON_TOKEN_DISCORD_ICI",
    "TON_TOKEN",
    "TON_TOKEN_DISCORD",
    "CHANGE_MOI_PAR_UN_TOKEN",
];

/**
 * Rend le token *et d'où il vient* — la valeur elle-même n'est jamais
 * journalisée. Connaître la source permet de distinguer un token absent d'un
 * token refusé quand le bot tourne sur une machine à laquelle on n'a pas accès.
 */
function readToken() {
    if (process.env.DISCORD_BOT_TOKEN) {
        return {
            token: process.env.DISCORD_BOT_TOKEN,
            source: "variable d'environnement DISCORD_BOT_TOKEN",
        };
    }

    if (ROOT_CONFIG && (ROOT_CONFIG.DISCORD_BOT_TOKEN || ROOT_CONFIG.token)) {
        return {
            token: ROOT_CONFIG.DISCORD_BOT_TOKEN || ROOT_CONFIG.token,
            source: `${ROOT_CONFIG_PATH} (racine) · clé "DISCORD_BOT_TOKEN"`,
        };
    }

    if (LOCAL_CONFIG && (LOCAL_CONFIG.DISCORD_BOT_TOKEN || LOCAL_CONFIG.token)) {
        return {
            token: LOCAL_CONFIG.DISCORD_BOT_TOKEN || LOCAL_CONFIG.token,
            source: `${LOCAL_CONFIG_PATH} · clé "token"`,
        };
    }

    const etat = [ROOT_CONFIG_PATH, LOCAL_CONFIG_PATH]
        .map(file => `${file} (${fs.existsSync(file) ? "présent, sans clé de token" : "absent"})`)
        .join(" ; ");
    return { token: null, source: etat };
}

const { token: rawToken, source: TOKEN_SOURCE } = readToken();

if (!rawToken || !String(rawToken).trim()) {
    console.error("❌ Aucun token Discord. Emplacements essayés : " + TOKEN_SOURCE);
    console.error(
        '   Ajoute "DISCORD_BOT_TOKEN" dans ' + ROOT_CONFIG_PATH + " (racine du dépôt), " +
        "ou définis la variable DISCORD_BOT_TOKEN."
    );
    console.error(
        "   ⚠️ token.json est ignoré par git : il n'arrive pas par un clone ni par une archive, " +
        "il faut le recréer sur le serveur (ou passer par DISCORD_BOT_TOKEN)."
    );
    process.exit(1);
}

// Nettoyage d'un copier-coller : guillemets, préfixe « Bot » / « Bearer », et
// surtout espaces et retours à la ligne. Un token coupé sur deux lignes casse
// l'en-tête HTTP Authorization et Discord répond « invalid Authorization
// header » — un message qui n'oriente vers aucune cause réelle.
const TOKEN_BRUT = String(rawToken).trim();
const TOKEN = TOKEN_BRUT
    .replace(/^["']|["']$/g, "")
    .replace(/^(bot|bearer)\s+/i, "")
    .replace(/["']$/g, "")
    .replace(/\s+/g, "");

if (TOKEN !== TOKEN_BRUT) {
    console.warn(
        `⚠️ Token nettoyé avant usage (${TOKEN_BRUT.length} → ${TOKEN.length} caractères) : ` +
        "guillemets, préfixe « Bot » ou espaces / retours à la ligne retirés " +
        `(source : ${TOKEN_SOURCE}).`
    );
}

// Hors A-Z a-z 0-9 . _ - rien n'a sa place dans un token. On nomme le caractère
// fautif par son code Unicode au lieu de laisser Discord répondre une erreur
// d'en-tête muette. La valeur du token n'est jamais affichée.
const CARACTERES_INATTENDUS = [...new Set([...TOKEN].filter(c => !/[A-Za-z0-9._-]/.test(c)))];
if (CARACTERES_INATTENDUS.length) {
    console.error(
        `❌ Token Discord invalide (source : ${TOKEN_SOURCE}) : caractère(s) inattendu(s) ` +
        CARACTERES_INATTENDUS
            .map(c => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
            .join(", ") +
        "."
    );
    console.error("   Un token ne contient que A-Z a-z 0-9 . _ - : recopie-le en un seul bloc.");
    process.exit(1);
}

// Un token de bot fait ~70 caractères en 3 segments séparés par des points. Un
// placeholder du dépôt ou une valeur tronquée se détecte ici, avant le réseau.
const TOKEN_SEGMENTS = TOKEN.split(".");
if (TOKEN_PLACEHOLDERS.includes(TOKEN) || TOKEN_SEGMENTS.length !== 3 || TOKEN_SEGMENTS.some(segment => !segment)) {
    console.error(
        `❌ Token Discord invalide (source : ${TOKEN_SOURCE}) : ${TOKEN.length} caractères, ` +
        `${TOKEN_SEGMENTS.length} segment(s).`
    );
    console.error("   Attendu : 3 segments séparés par des points, ~70 caractères au total.");
    console.error("   Régénère-le : discord.com/developers/applications → ton application → Bot → Reset Token.");
    process.exit(1);
}

// ==========================================
// DIAGNOSTIC : node bot.js --check
// ==========================================

const DISCORD_API = "https://discord.com/api/v10";

/**
 * Appel REST Discord : rend le code HTTP et le corps, ou l'erreur réseau.
 * Sert au mode --check comme au garde-fou de connexion. Le token est transmis
 * mais jamais journalisé.
 */
async function probe(chemin) {
    try {
        const response = await fetch(`${DISCORD_API}${chemin}`, {
            headers: {
                Authorization: `Bot ${TOKEN}`,
                "User-Agent": "DiscordBot (istan-portal, 1.0)",
            },
        });
        const body = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, body };
    } catch (error) {
        return { ok: false, status: 0, body: null, error };
    }
}

async function checkToken() {
    console.log(`🔑 Token lu depuis : ${TOKEN_SOURCE}`);
    console.log(`🟩 Node ${process.version} — discord.js exige Node 18 ou plus.`);

    const cibles = [
        ["utilisateur du bot", "/users/@me"],
        [`salon ${TARGET_CHANNEL_ID}`, `/channels/${TARGET_CHANNEL_ID}`],
    ];

    for (const [libelle, chemin] of cibles) {
        const resultat = await probe(chemin);
        if (resultat.error) {
            console.error(`❌ ${libelle} → ${resultat.error.message}`);
            console.error("   Sortie HTTPS (port 443) vers discord.com à vérifier depuis ce serveur.");
            continue;
        }
        console.log(`${resultat.ok ? "✅" : "❌"} ${libelle} → HTTP ${resultat.status}`);
        if (!resultat.ok) {
            console.log(`   ${resultat.body && resultat.body.message ? resultat.body.message : "(sans détail)"}`);
        } else if (resultat.body && resultat.body.username) {
            console.log(`   bot : ${resultat.body.username} (id ${resultat.body.id})`);
        } else if (resultat.body && resultat.body.name) {
            console.log(`   salon : ${resultat.body.name}`);
        }
    }

    console.log("ℹ️ Test REST : il ne dépend pas des intents privilégiés et ne lit aucun message.");
}

/**
 * Garde-fou : appelé si le bot n'est jamais passé en ligne. Il imprime la cause
 * probable — c'est ce qui manquait quand l'hébergeur n'affichait rien du tout.
 */
async function explainMissingConnection() {
    console.error(`❌ Toujours pas connecté après ${READY_TIMEOUT_MS / 1000} s.`);
    console.error(`   • token lu depuis : ${TOKEN_SOURCE}`);
    console.error(`   • Node ${process.version} (discord.js exige Node 18 ou plus)`);
    console.error(`   • dernier événement gateway : ${lastGatewayEvent}`);

    const resultat = await probe("/users/@me");
    if (resultat.error) {
        console.error(
            `   • test REST /users/@me impossible (${resultat.error.message}) ⇒ la sortie HTTPS (port 443) ` +
            "vers discord.com est très probablement bloquée depuis ce serveur."
        );
    } else if (resultat.ok) {
        console.error(
            `   • test REST /users/@me → 200 (${resultat.body.username}) ⇒ le token est BON : la connexion au ` +
            "gateway (WebSocket, port 443) est bloquée ou filtrée."
        );
    } else {
        console.error(
            `   • test REST /users/@me → HTTP ${resultat.status} ⇒ le token est refusé (faux, révoqué, ` +
            "régénéré, ou guillemets/espaces dans la variable)."
        );
    }

    console.error("   → Détails bruts de la connexion : relance avec DISCORD_DEBUG=1.");
    process.exit(1);
}

// ==========================================
// CLIENT DISCORD
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Délai avant de conclure que la connexion n'aboutira pas : 30 SECONDES par
// défaut, comme l'annonce le message de démarrage. La variable était lue en
// millisecondes : un réglage légitime (DISCORD_READY_TIMEOUT=60) faisait
// expirer le garde-fou en 60 ms et le bot annonçait un échec alors qu'il
// connectait juste après.
const READY_TIMEOUT_S = (() => {
    const brut = Number(process.env.DISCORD_READY_TIMEOUT);
    if (!Number.isFinite(brut) || brut <= 0) return 30;
    return Math.min(Math.max(brut, 5), 600);
})();
const READY_TIMEOUT_MS = READY_TIMEOUT_S * 1000;

if (process.env.DISCORD_READY_TIMEOUT && Number(process.env.DISCORD_READY_TIMEOUT) !== READY_TIMEOUT_S) {
    console.warn(
        `⚠️ DISCORD_READY_TIMEOUT=${process.env.DISCORD_READY_TIMEOUT} hors bornes : ramené à ${READY_TIMEOUT_S} s (5 à 600 s).`
    );
}
let readyWatchdog = null;
let lastGatewayEvent = "aucun (la poignée de main n'a jamais abouti)";

// ==========================================
// BOT PRÊT
// ==========================================

client.once("ready", () => {
    if (readyWatchdog) clearTimeout(readyWatchdog);
    console.log("==================================");
    console.log(`✅ Bot connecté : ${client.user.tag}`);
    console.log(`🎯 Salon surveillé : ${TARGET_CHANNEL_ID}`);
    console.log(`🌐 Portail : ${SERVER_URL}`);
    console.log("==================================");
});

// ==========================================
// NOUVEAU MESSAGE
// ==========================================

client.on("messageCreate", async message => {
    try {
        // Uniquement le salon concerné.
        if (message.channelId !== TARGET_CHANNEL_ID) return;
        // Ignorer les bots pour ne pas boucler sur nos propres publications.
        if (message.author.bot) return;

        const attachments = Array.from(message.attachments.values()).map(attachment => ({
            id: attachment.id,
            name: attachment.name,
            url: attachment.url,
            proxyUrl: attachment.proxyURL,
            contentType: attachment.contentType || null,
            size: attachment.size,
        }));

        const data = {
            id: message.id,
            channelId: message.channelId,
            channelName: message.channel?.name || null,
            guildId: message.guildId || null,
            guildName: message.guild?.name || null,
            authorId: message.author.id,
            authorName: message.author.username,
            authorDisplayName:
                message.member?.displayName || message.author.globalName || message.author.username,
            authorAvatar: message.author.displayAvatarURL({ extension: "png", size: 128 }),
            content: message.content || "",
            attachments,
            timestamp: message.createdAt.toISOString(),
        };

        const response = await fetch(`${SERVER_URL}/api/discord/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-bot-secret": BOT_SECRET,
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Le portail a refusé le message :", response.status, errorText);
            return;
        }

        console.log(`📩 ${message.author.username} → message récupéré`);
    } catch (error) {
        console.error("❌ Erreur récupération message :", error);
    }
});

// ==========================================
// ERREURS DISCORD
// ==========================================

client.on("error", error => {
    console.error("❌ Erreur Discord :", error);
});

// ==========================================
// GATEWAY — LA RAISON, EN CLAIR
// ==========================================

// Codes de fermeture du gateway Discord (doc « Gateway Close Event Codes ») :
// sans ce tableau, l'hébergeur n'affiche qu'un nombre entre parenthèses.
const GATEWAY_CLOSE_REASONS = {
    1000: "fermeture normale (demandée)",
    1001: "partie distante hors ligne (maintenance Discord)",
    1006: "connexion coupée sans réponse — sortie HTTPS (443) vers discord.com bloquée ou instable",
    4003: "non authentifié : le token n'a pas été transmis",
    4004: "token refusé (faux, révoqué, ou token d'une autre application)",
    4008: "trop de connexions : Discord limite ce bot (une autre instance est-elle encore en ligne ?)",
    4010: "shard invalide",
    4011: "sharding requis (le bot est sur trop de serveurs)",
    4013: "intent invalide : valeur demandée refusée par Discord",
    4014: "intents privilégiés non activés dans le portail (Message Content / Server Members)",
};

function gatewayReason(code) {
    const raison = GATEWAY_CLOSE_REASONS[code];
    return raison ? `${code} — ${raison}` : `${code} (code absent du tableau GATEWAY_CLOSE_REASONS)`;
}

// DISCORD_DEBUG=1 déroule le journal brut du gateway (DNS, TLS, heartbeats) :
// c'est ce qu'il faut donner à l'hébergeur quand rien d'autre ne parle.
if (process.env.DISCORD_DEBUG) {
    client.on("debug", message => console.log(`🐞 ${message}`));
    client.on("warn", message => console.warn(`⚠️ ${message}`));
}

client.on("shardDisconnect", event => {
    lastGatewayEvent = `déconnexion (${gatewayReason(event.code)})`;
    console.error(`❌ Gateway déconnecté : ${lastGatewayEvent}`);
});

client.on("shardReconnecting", shardId => {
    lastGatewayEvent = `reconnexion en cours (shard ${shardId})`;
    console.warn(`⚠️ Reconnexion au gateway (shard ${shardId})…`);
});

client.on("shardResume", shardId => {
    lastGatewayEvent = `session reprise (shard ${shardId})`;
    console.log(`✅ Session reprise (shard ${shardId}).`);
});

client.on("shardError", (error, shardId) => {
    lastGatewayEvent = `erreur de connexion (shard ${shardId}) : ${error.message}`;
    console.error(`❌ Erreur de connexion au gateway (shard ${shardId}) : ${error.message}`);
});

client.on("invalidated", () => {
    console.error("❌ Session invalidée par Discord : ce token ne peut plus se reconnecter (régénère-le).");
});

// ==========================================
// CONNEXION
// ==========================================

if (process.argv.includes("--check")) {
    checkToken().then(() => process.exit(0));
} else {
    console.log(`🔑 Token lu depuis : ${TOKEN_SOURCE}`);
    console.log(`🟩 Node ${process.version} — discord.js exige Node 18 ou plus.`);
    console.log(`⏱️ Sans connexion dans ${READY_TIMEOUT_MS / 1000} s, la cause sera affichée ici (DISCORD_READY_TIMEOUT pour changer le délai).`);

    readyWatchdog = setTimeout(explainMissingConnection, READY_TIMEOUT_MS);

    client.login(TOKEN).catch(error => {
        if (readyWatchdog) clearTimeout(readyWatchdog);
        const message = String(error && error.message ? error.message : error);
        console.error("❌ Connexion au gateway Discord impossible :", message);
        if (/disallowed intents/i.test(message)) {
            console.error(
                "   → Active les intents privilégiés : discord.com/developers/applications → ton application " +
                "→ Bot → « Message Content Intent » (+ « Server Members »)."
            );
        } else if (/token/i.test(message)) {
            console.error(`   → Token refusé (faux, révoqué, régénéré depuis) : source utilisée = ${TOKEN_SOURCE}.`);
        } else if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|fetch failed|getaddrinfo/i.test(message)) {
            console.error("   → Sortie HTTPS vers discord.com bloquée depuis ce serveur (port 443).");
        }
        process.exit(1);
    });

    // Dernier filet : sans ces gestionnaires, une erreur inattendue laisse
    // l'hébergeur muet (ou affiche une pile illisible) au lieu d'une raison.
    process.on("unhandledRejection", reason => {
        console.error(
            "❌ Promesse rejetée non gérée :",
            reason instanceof Error ? reason.stack || reason.message : reason
        );
    });

    process.on("uncaughtException", error => {
        console.error("❌ Exception non rattrapée :", error && error.stack ? error.stack : error);
        process.exit(1);
    });
}
