const { createReadStream, existsSync, statSync } = require("node:fs");
const { access, mkdir } = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const root = __dirname;
// Pterodactyl can expose the allocation under any of these names. Keep the
// fallback requested for manual `node start.js` launches, while allowing the
// panel to choose the actual port without editing this file.
const configuredPublicPort =
  process.env.PORT ||
  process.env.SERVER_PORT ||
  process.env.PTERODACTYL_PORT ||
  "10089";
const publicPort = Number(configuredPublicPort);
if (!Number.isInteger(publicPort) || publicPort <= 0 || publicPort > 65535) {
  throw new Error(`Invalid public port: "${configuredPublicPort}"`);
}
const apiPort = Number(process.env.API_PORT || publicPort + 1);
if (!Number.isInteger(apiPort) || apiPort <= 0 || apiPort > 65535) {
  throw new Error(`Invalid API port: "${process.env.API_PORT || apiPort}"`);
}
const staticRoot = path.join(root, "artifacts", "lineup-creator", "dist", "public");

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
      // Pterodactyl images often include npm/node but not pnpm. npx can
      // download pnpm without requiring root access.
      return { command: "npx", prefix: ["--yes", "pnpm@10.12.1"] };
    }
  }
}

async function runPnpm(args, env = {}) {
  const manager = packageManager();
  return run(manager.command, [...manager.prefix, ...args], env);
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
  })[ext] || "application/octet-stream";
}

function proxyApi(req, res) {
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: apiPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error", error => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "API indisponible", error: error.message }));
  });
  req.pipe(proxy);
}

async function serveStatic(req, res) {
  const requested = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  let filePath = path.resolve(staticRoot, relative);
  if (!filePath.startsWith(staticRoot)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  try {
    await access(filePath);
    if (statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(staticRoot, "index.html");
  }
  try {
    res.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

async function main() {
  await mkdir(path.join(root, "artifacts", "lineup-creator", "dist"), { recursive: true });
  if (!existsSync(path.join(root, "node_modules", ".pnpm"))) {
    console.log("Installing workspace dependencies with pnpm...");
    // The frontend and API build tools are devDependencies, so they must be
    // installed even when the application itself runs in production mode.
    await runPnpm(["install", "--frozen-lockfile"], { NODE_ENV: "development" });
  }
  await runPnpm(["--filter", "@workspace/lineup-creator", "run", "build"], {
    NODE_ENV: "production",
    PORT: String(publicPort),
    BASE_PATH: "/",
  });
  await runPnpm(["--filter", "@workspace/api-server", "run", "build"], {
    NODE_ENV: "production",
    PORT: String(apiPort),
  });

  const api = spawn(process.execPath, ["--enable-source-maps", path.join(root, "artifacts", "api-server", "dist", "index.mjs")], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", PORT: String(apiPort) },
    stdio: "inherit",
  });
  api.once("exit", code => {
    if (code && !server.listening) process.exit(code);
  });

  const server = http.createServer((req, res) => {
    if ((req.url || "").startsWith("/api/")) return proxyApi(req, res);
    return serveStatic(req, res);
  });
  server.listen(publicPort, "0.0.0.0", () => {
    console.log(`ISTAN CREATOR listening on port ${publicPort}`);
  });

  const shutdown = () => {
    server.close();
    api.kill("SIGTERM");
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});