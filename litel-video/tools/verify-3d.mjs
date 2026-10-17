/**
 * Banc d'essai temporaire : capture les plans 3D de la pub Litel.
 *   node tools/verify-3d.mjs
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/usr/lib/node_modules/hyperframes/package.json");
const puppeteer = require("puppeteer-core");

const ROOT = resolve(import.meta.dirname, "..");
const CHROME =
  "/home/daytona/.cache/hyperframes/chrome/chrome-headless-shell/linux-152.0.7977.30/chrome-headless-shell-linux64/chrome-headless-shell";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const file = path.endsWith("/") ? join(path, "index.html") : path;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((r) => server.listen(4177, "127.0.0.1", r));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox",
    "--allow-file-access-from-files",
  ],
  defaultViewport: { width: 1080, height: 1920 },
});

const page = await browser.newPage();
/* la composition attend le registre injecté par HyperFrames */
await page.evaluateOnNewDocument(() => {
  window.__timelines = {};
});
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

const resp = await page.goto("http://127.0.0.1:4177/", { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("http", resp ? resp.status() : "?")
for (let i = 0; i < 100; i++) {
  const ok = await page.evaluate(() => Boolean(window.__timelines && window.__timelines.litel));
  if (ok) break;
  await new Promise((r) => setTimeout(r, 150));
}

try {
  const ok = await page.evaluate(() => Boolean(window.__timelines && window.__timelines.litel));
  if (!ok) throw new Error("timeline absente");
} catch (err) {
  console.log("timeline absente");
  console.log("logs:", logs.slice(0, 12));
  console.log(
    "globals:",
    await page.evaluate(() => ({
      gsap: typeof window.gsap,
      three: typeof window.THREE,
      l3d: typeof window.LITEL3D,
      keys: Object.keys(window.__timelines || {}),
      probe: (() => {
        try {
          const t = window.gsap.timeline();
          return "tl ok " + t.duration();
        } catch (e) {
          return "tl err " + e.message;
        }
      })(),
    })),
  );
  await browser.close();
  server.close();
  process.exit(1);
}

const info = await page.evaluate(() => ({
  three: typeof window.THREE,
  ready: window.LITEL3D ? window.LITEL3D.ready : false,
  stage: document.getElementById("stage").className,
  canvas: (() => {
    const c = document.getElementById("gl");
    return c ? { w: c.width, h: c.height, css: c.clientWidth + "x" + c.clientHeight } : null;
  })(),
}));
console.log("état:", JSON.stringify(info));

for (const t of [2.5, 6.5, 24, 31]) {
  await page.evaluate((time) => {
    window.__timelines.litel.seek(time, false);
    if (window.LITEL3D) window.LITEL3D.render(time);
  }, t);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `/tmp/litel-${t}.png` });
  console.log("capture", t);
}

console.log("logs:", logs.filter((l) => !l.includes("GL Driver Message")).slice(0, 12));

await browser.close();
server.close();
