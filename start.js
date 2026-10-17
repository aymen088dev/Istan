const { createReadStream, createWriteStream, existsSync, readFileSync, statSync } = require("node:fs");
const { access, mkdir, rename } = require("node:fs/promises");
const { createGunzip } = require("node:zlib");
const { pipeline } = require("node:stream/promises");
const http = require("node:http");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const root = __dirname;
const projectConfigPath = path.join(root, "projects.json");
const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf8"));
const portalConfig = projectConfig.portal || {};
// Un seul endroit à modifier pour ajouter un projet : l'entrée `projects`.
// Les cartes du portail, les routes statiques, les redirections et les
// montages d'API sont tous dérivés de cette liste.
const projects = Array.isArray(projectConfig.projects) ? projectConfig.projects : [];
if (!projects.length) {
  throw new Error("projects.json must define a non-empty projects array");
}
for (const project of projects) {
  if (!project.id || !project.title || !project.href) {
    throw new Error("each project in projects.json needs an id, a title and an href");
  }
}
const staticRoutes = projects.flatMap(project => project.static || []);
const redirects = projects.flatMap(project => project.redirects || []);
// The Minecraft archive uses 10005 by default. A hosting allocation injected
// as PORT always wins, so the outside world only needs that one public port.
const configuredPublicPort = process.env.PORT || process.env.MAP_PORT || process.env.SERVER_PORT || process.env.PTERODACTYL_PORT || "10005";
const publicPort = Number(configuredPublicPort);
if (!Number.isInteger(publicPort) || publicPort <= 0 || publicPort > 65533) {
  throw new Error(`Invalid public port: "${configuredPublicPort}"`);
}
const apiPort = Number(process.env.API_PORT || publicPort + 1);
const mapPort = Number(process.env.MAP_SERVER_PORT || publicPort + 2);
for (const [name, port] of [["API", apiPort], ["map", mapPort]]) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || port === publicPort || (name === "map" && port === apiPort)) {
    throw new Error(`Invalid internal ${name} port: ${port}`);
  }
}
const creatorRoot = path.join(root, "artifacts", "lineup-creator", "dist", "public");
const bundledMapData = path.join(root, "mapserver", "data", "chunks.ndjson.gz");
const mapDataFile = process.env.MAP_DATA_FILE || path.join(root, "data", "chunks.ndjson");

// Chaque projet peut exposer une API via `api`. Le préfixe le plus long gagne :
// /api/map/... part donc vers la carte et /api/... vers le backend du CREATOR.
const apiTargets = projects
  .filter(project => project.api && project.api.prefix)
  .map(project => ({
    config: project.api,
    prefix: project.api.prefix.replace(/\/$/, ""),
    port: project.api.map ? mapPort : Number(process.env[project.api.portEnv] || project.api.port || apiPort),
  }))
  .sort((a, b) => b.prefix.length - a.prefix.length);
for (const target of apiTargets) {
  if (!Number.isInteger(target.port) || target.port <= 0 || target.port > 65535) {
    throw new Error(`Invalid port for the "${target.prefix}" API mount: ${target.port}`);
  }
}
const mapTarget = apiTargets.find(target => target.config.map) || null;
const mapConfig = (mapTarget && mapTarget.config.map) || {};

/** Traduit une route publique de la carte vers le chemin natif du mapserver. */
function mapUpstreamPath(pathname) {
  const mipmapPrefix = mapConfig.mipmapPrefix || `${mapTarget.prefix}/mipmap/`;
  if (pathname.startsWith(mipmapPrefix)) return `/api/${pathname.slice(mipmapPrefix.length)}`;
  const suffix = pathname.slice(mapTarget.prefix.length);
  return `/api${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

function packageManager() {
  const configured = process.env.PNPM_BIN || "pnpm";
  try {
    execFileSync(configured, ["--version"], { stdio: "ignore" });
    return { command: configured, prefix: [] };
  } catch {
    try {
      execFileSync("corepack", ["pnpm", "--version"], { stdio: "ignore" });
      return { command: "corepack", prefix: ["pnpm"] };
    } catch {
      return { command: "npx", prefix: ["--yes", "pnpm@10.12.1"] };
    }
  }
}

async function runPnpm(args, env = {}) {
  const manager = packageManager();
  return run(manager.command, [...manager.prefix, ...args], env);
}

/**
 * Le bot de relais Discord n'est pas un service du portail : rien ne le
 * lançait, donc sa console restait muette et le bot n'était jamais en ligne.
 * On le démarre ici, à côté de l'API et de la carte, avec ses journaux dans le
 * même terminal. Il reste désactivé par défaut : "DISCORD_BOT": "1" dans
 * token.json (racine) ou DISCORD_BOT=1 l'active.
 */
function botConfig() {
  const readJson = file => {
    if (!existsSync(file)) return {};
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      console.log(`Bot Discord : ${file} illisible (${error.message}).`);
      return {};
    }
  };
  const discordDir = path.join(root, "artifacts", "discord-publisher");
  const rootConfig = readJson(path.join(root, "token.json"));
  const localConfig = readJson(path.join(discordDir, "token.json"));
  const flag = process.env.DISCORD_BOT ?? rootConfig.DISCORD_BOT ?? "";
  return {
    script: path.join(discordDir, "bot.js"),
    token: process.env.DISCORD_BOT_TOKEN || rootConfig.DISCORD_BOT_TOKEN || rootConfig.token
      || localConfig.DISCORD_BOT_TOKEN || localConfig.token || "",
    enabled: ["1", "true", "yes", "on"].includes(String(flag).trim().toLowerCase()),
  };
}

async function prepareMapData() {
  if (existsSync(mapDataFile) || !existsSync(bundledMapData)) return;
  await mkdir(path.dirname(mapDataFile), { recursive: true });
  const temporaryFile = `${mapDataFile}.initializing`;
  await pipeline(createReadStream(bundledMapData), createGunzip(), createWriteStream(temporaryFile, { flags: "wx" }));
  await rename(temporaryFile, mapDataFile);
  console.log(`Restored bundled Minecraft map data to ${mapDataFile}`);
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".m4a": "audio/mp4",
    ".vtt": "text/vtt; charset=utf-8",
    ".woff2": "font/woff2",
  })[ext] || "application/octet-stream";
}

function proxyTo(req, res, port, requestPath = req.url) {
  // Le portail réécrit `Host` vers l'API locale ; sans ces en-têtes, celle-ci ne
  // sait plus par quelle adresse publique elle est jointe — et Discord ne peut
  // donc pas télécharger les photos de profil des publications.
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  if (!headers["x-forwarded-host"] && req.headers.host) headers["x-forwarded-host"] = req.headers.host;
  // `x-forwarded-proto` n'est PAS ajouté ici : ce socket interne est toujours en
  // clair, l'annonce serait « http » même quand l'adresse publique est en HTTPS.
  // L'API préfère l'origine annoncée par la page, puis devine le protocole.
  const proxy = http.request({
    hostname: "127.0.0.1",
    port,
    path: requestPath,
    method: req.method,
    headers,
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error", error => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Service indisponible", error: error.message }));
  });
  req.pipe(proxy);
}

function proxyMap(req, res, requestPath = req.url) {
  proxyTo(req, res, mapPort, requestPath);
}

/** Routes carte historiques, hors préfixe du projet (POST /api/chunks-data…). */
function isMapApiRequest(req) {
  if (!mapTarget) return false;
  const pathname = (req.url || "/").split("?")[0];
  if (req.method === "POST") return (mapConfig.postRoutes || []).includes(pathname);
  const [, route, subroute] = pathname.split("/").filter(Boolean);
  const routeName = route === "map" ? subroute : route;
  return (mapConfig.getRoutes || []).includes(routeName);
}

async function serveStatic(req, res, { rootDir = creatorRoot, prefix = "", fallback = false, index = "index.html" } = {}) {
  let requested;
  try {
    requested = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400); res.end("Bad request"); return;
  }
  const relativePath = prefix && requested.startsWith(prefix) ? requested.slice(prefix.length) : requested;
  const relative = (relativePath === "/" || relativePath === "" ? index : relativePath).replace(/^\/+/, "");
  const resolvedRoot = path.resolve(rootDir);
  let filePath = path.resolve(resolvedRoot, relative);
  if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + path.sep)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  try {
    await access(filePath);
    if (statSync(filePath).isDirectory()) filePath = path.join(filePath, index);
  } catch {
    if (!fallback) { res.writeHead(404); res.end("Not found"); return; }
    filePath = path.join(resolvedRoot, index);
  }
  // Seuls les fichiers produits par Vite (dossier `assets/`, nom haché) peuvent
  // être mis en cache un an : `index.js`, `enhancements.js` ou `studio.css` du
  // publisher gardent leur nom d'une version à l'autre, et un cache immuable y
  // figeait durablement une ancienne interface dans le navigateur.
  const hashed = /[\\/]assets[\\/]/.test(filePath);
  const size = statSync(filePath).size;
  const headers = {
    "content-type": contentType(filePath),
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "accept-ranges": "bytes",
  };

  // Les vidéos se lisent en 206 : sans `Range`, Safari ne démarre pas la
  // lecture d'un MP4 et Chrome doit télécharger les 12 Mo avant d'autoriser un
  // déplacement dans la timeline.
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (match) {
      const hasStart = match[1] !== "";
      const hasEnd = match[2] !== "";
      if (hasStart) {
        start = Number(match[1]);
        end = hasEnd ? Math.min(Number(match[2]), size - 1) : size - 1;
      } else if (hasEnd) {
        start = Math.max(0, size - Number(match[2]));
      }
      if (start > end || start >= size) {
        res.writeHead(416, { "content-range": `bytes */${size}` });
        res.end();
        return;
      }
      status = 206;
      headers["content-range"] = `bytes ${start}-${end}/${size}`;
    }
  }
  headers["content-length"] = String(end - start + 1);
  res.writeHead(status, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath, { start, end }).pipe(res);
}

async function main() {
  await mkdir(path.join(root, "artifacts", "lineup-creator", "dist"), { recursive: true });
  await prepareMapData();
  if (!existsSync(path.join(root, "node_modules", ".pnpm"))) {
    console.log("Installing workspace dependencies with pnpm...");
    await runPnpm(["install", "--frozen-lockfile"], { NODE_ENV: "development" });
  }

  // Build the creator with its own URL prefix; the portal stays at the server root.
  await runPnpm(["--filter", "@workspace/lineup-creator", "run", "build"], {
    NODE_ENV: "production", PORT: String(publicPort), BASE_PATH: "/creator/",
  });
  // LeagueManager : même contrat que le créateur — build avec son préfixe d'URL.
  await runPnpm(["--filter", "@workspace/leaguemanager", "run", "build"], {
    NODE_ENV: "production", PORT: String(publicPort), BASE_PATH: "/leaguemanager/",
  });
  await runPnpm(["--filter", "@workspace/api-server", "run", "build"], {
    NODE_ENV: "production", PORT: String(apiPort),
  });

  const api = spawn(process.execPath, ["--enable-source-maps", path.join(root, "artifacts", "api-server", "dist", "index.mjs")], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", PORT: String(apiPort) },
    stdio: "inherit",
  });
  const map = spawn(process.execPath, [path.join(root, "mapserver", "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(mapPort), MAP_PORT: String(mapPort), HOST: "127.0.0.1",
      MAP_DATA_FILE: mapDataFile,
    },
    stdio: "inherit",
  });

  // Le bot Discord, quand il est activé : ses journaux arrivent ici, sinon on
  // dit explicitement pourquoi il ne tourne pas — plus de console muette.
  const bot = botConfig();
  let botProcess = null;
  if (!bot.enabled) {
    console.log('Bot Discord : non lancé. Mets "DISCORD_BOT": "1" dans token.json (racine) ou DISCORD_BOT=1 pour l\'activer.');
  } else if (!bot.token) {
    console.log('Bot Discord : activé, mais aucun token trouvé — ajoute "DISCORD_BOT_TOKEN" dans token.json (racine).');
  } else {
    botProcess = spawn(process.execPath, [bot.script], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    botProcess.on("exit", code => console.log(`Bot Discord arrêté (code ${code}).`));
    console.log(`Bot Discord : lancé (${path.relative(root, bot.script)}).`);
  }

  const server = http.createServer((req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    const query = (req.url || "").includes("?") ? `?${req.url.split("?").slice(1).join("?")}` : "";

    if (pathname === "/projects.json") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
      res.end(JSON.stringify({ portal: portalConfig, projects }));
      return;
    }
    const redirect = redirects.find(route => route.paths.includes(pathname));
    if (redirect) {
      res.writeHead(302, { location: redirect.location }); res.end(); return;
    }
    // API de la carte : préfixe dédié, retraduit au format natif du mapserver.
    if (mapTarget && (pathname === mapTarget.prefix || pathname.startsWith(`${mapTarget.prefix}/`))) {
      return proxyMap(req, res, mapUpstreamPath(pathname) + query);
    }
    if (isMapApiRequest(req)) return proxyMap(req, res);
    const apiTarget = apiTargets.find(target => !target.config.map && (pathname === target.prefix || pathname.startsWith(`${target.prefix}/`)));
    if (apiTarget) {
      return proxyTo(req, res, apiTarget.port, `${apiTarget.prefix}${pathname.slice(apiTarget.prefix.length)}${query}`);
    }
    for (const route of staticRoutes) {
      if (pathname.startsWith(route.prefix)) {
        const rootDir = path.resolve(root, route.root);
        return serveStatic(req, res, {
          prefix: route.prefix,
          rootDir,
          fallback: Boolean(route.fallback),
          index: route.index || "index.html",
        });
      }
    }
    if (pathname === "/") return serveStatic(req, res, { index: "portal.html" });
    return serveStatic(req, res);
  });

  server.listen(publicPort, "0.0.0.0", () => {
    console.log(`Project launcher listening on port ${publicPort}`);
    console.log(`  launcher: http://0.0.0.0:${publicPort}/`);
    for (const project of projects) {
      console.log(`  ${project.title}: http://0.0.0.0:${publicPort}${project.href}`);
    }
    console.log(`  map data: ${mapDataFile}`);
  });

  const shutdown = () => {
    server.close();
    api.kill("SIGTERM");
    map.kill("SIGTERM");
    if (botProcess) botProcess.kill("SIGTERM");
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});
