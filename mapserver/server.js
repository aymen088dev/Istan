#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const { chunksFromMipmap, playersFromMipmap, dimensionLabel, normalizeDimension } = require("./mipmap");
const { renderReliefPng } = require("./relief");
const { renderTilePng, blocksPerTile, MAX_ZOOM, MIN_ZOOM, TILE_SIZE } = require("./tiles");
const { encodePng } = require("./png");

// ---------------------------------------------------------------------------
// CONFIGURATION - modifie directement la cle ici
// ---------------------------------------------------------------------------
// Cle d'API exigee pour POST /api/chunk (header X-Api-Key).
// Mets ta valeur, et la MEME valeur dans `api_key` du plugin WorldMap.
// Chaine vide ("") = aucune authentification.
// La variable d'environnement MAP_API_KEY reste prioritaire si definie.
const API_KEY = "change-me";
// ---------------------------------------------------------------------------

const TILE_CHUNKS = Number(process.env.MAP_TILE_CHUNKS || 8);
const MAX_BODY = 512 * 1024;
const APPEND_FLUSH = 200000;
// Un joueur envoye par MipMap toutes les 5 s (100 ticks) : au-dela de 30 s sans
// nouvelle position on le considere parti.
const PLAYER_TTL_MS = Number(process.env.MAP_PLAYER_TTL_MS || 30000);

const SEP = "\u0000";

// UI MipMap vendoree (web/ du depot MipMap, MIT) : servie sur "/".
const MIPMAP_UI_DIR = path.join(__dirname, "public", "mipmap");
const SKIN_FALLBACK = path.join(__dirname, "assets", "skins", "default.png");
// Reglages exposes par GET /api/config (comme MipMap core/config.py).
const MAP_SIZE = Number(process.env.MAP_SIZE || 2000);
const MAP_UPDATE_INTERVAL = Number(process.env.MAP_UPDATE_INTERVAL || 5000);
const MAP_DEFAULT_WORLD = process.env.MAP_DEFAULT_WORLD || "Overworld";

/** Nom de monde tel que le front MipMap l'attend (Overworld / Nether / TheEnd). */
function worldName(dim) {
  if (dim === "minecraft:overworld") return "Overworld";
  if (dim === "minecraft:nether") return "Nether";
  if (dim === "minecraft:the_end") return "TheEnd";
  const slug = String(dim || "").replace(/^minecraft:/, "");
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** Visage 8x8 (crop (8,8)-(16,16)) d'un skin MipMap, encode en PNG. */
function faceFromSkin(skinHex, skinShape) {
  if (typeof skinHex !== "string" || !Array.isArray(skinShape)) return null;
  const w = skinShape[0];
  const h = skinShape[1];
  const c = skinShape[2];
  if (![64, 128].includes(w) || !(h === 64 || h === 32 || h === 128) || !(c === 4 || c === 3)) {
    return null;
  }
  const bytes = Buffer.from(skinHex, "hex");
  if (bytes.length < w * h * c) return null;
  const FACE = 8;
  const face = Buffer.alloc(FACE * FACE * 4);
  for (let y = 0; y < FACE; y++) {
    for (let x = 0; x < FACE; x++) {
      const s = ((y + 8) * w + (x + 8)) * c;
      const o = (y * FACE + x) * 4;
      face[o] = bytes[s];
      face[o + 1] = bytes[s + 1];
      face[o + 2] = bytes[s + 2];
      face[o + 3] = c === 4 ? bytes[s + 3] : 255;
    }
  }
  return encodePng(FACE, FACE, face);
}

class MapStore {
  constructor({ dataFile = null, tileChunks = TILE_CHUNKS } = {}) {
    this.tileChunks = Math.max(1, tileChunks);
    this.chunks = new Map();
    this.tiles = new Map();
    this.dims = new Map();
    this.players = new Map();
    this.dataFile = dataFile;
    this.stream = null;
    this.lines = 0;
    this.appends = 0;
    // Incremente a chaque chunk ecrit : sert de cle de cache au relief.
    this.rev = 0;

    if (dataFile) {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      this._load();
      this.stream = fs.createWriteStream(dataFile, { flags: "a" });
    }
  }

  _key(dim, cx, cz) {
    return dim + SEP + cx + SEP + cz;
  }

  _tileKey(dim, tx, tz) {
    return dim + SEP + tx + SEP + tz;
  }

  tileOf(cx, cz) {
    return [Math.floor(cx / this.tileChunks), Math.floor(cz / this.tileChunks)];
  }

  static valid(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (typeof payload.dim !== "string" || !payload.dim) return false;
    if (!Number.isInteger(payload.cx) || !Number.isInteger(payload.cz)) return false;
    if (!Array.isArray(payload.palette) || !Array.isArray(payload.cells)) return false;
    if (payload.palette.length > 8192 || payload.cells.length > 1024) return false;
    for (const id of payload.palette) {
      if (typeof id !== "string") return false;
    }
    return true;
  }

  put(payload, { persist = true } = {}) {
    const key = this._key(payload.dim, payload.cx, payload.cz);
    const isNew = !this.chunks.has(key);
    this.chunks.set(key, payload);
    this.rev += 1;

    const [tx, tz] = this.tileOf(payload.cx, payload.cz);
    const tk = this._tileKey(payload.dim, tx, tz);
    let bucket = this.tiles.get(tk);
    if (!bucket) {
      bucket = new Set();
      this.tiles.set(tk, bucket);
    }
    bucket.add(key);

    let meta = this.dims.get(payload.dim);
    if (!meta) {
      meta = {
        count: 0,
        min_cx: payload.cx,
        max_cx: payload.cx,
        min_cz: payload.cz,
        max_cz: payload.cz,
        y_min: 9999,
        y_max: -9999,
      };
      this.dims.set(payload.dim, meta);
    }
    if (isNew) meta.count += 1;
    meta.min_cx = Math.min(meta.min_cx, payload.cx);
    meta.max_cx = Math.max(meta.max_cx, payload.cx);
    meta.min_cz = Math.min(meta.min_cz, payload.cz);
    meta.max_cz = Math.max(meta.max_cz, payload.cz);

    const cells = payload.cells;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!Array.isArray(cell)) continue;
      for (let j = 0; j < cell.length; j += 2) {
        const y = cell[j];
        if (typeof y === "number") {
          if (y < meta.y_min) meta.y_min = y;
          if (y > meta.y_max) meta.y_max = y;
        }
      }
    }

    if (persist && this.stream) {
      this.stream.write(JSON.stringify(payload) + "\n");
      this.appends += 1;
      if (this.appends >= APPEND_FLUSH) this.compact();
    }
    return isNew;
  }

  get(dim, cx, cz) {
    return this.chunks.get(this._key(dim, cx, cz)) || null;
  }

  /* --- joueurs (payload MipMap) ------------------------------------ */

  putPlayers(list) {
    const now = Date.now();
    for (const player of list) {
      this.players.set(player.name, { ...player, ts: player.ts || now });
    }
    this.playersSeen = now;
    return list.length;
  }

  /**
   * Joueurs recents, grouped par dimension.
   * Un joueur absent du dernier payload est considere parti : on retire
   * aussi les entrees trop anciennes (serveur de carte relance, plugin arrete).
   */
  onlinePlayers(ttlMs = PLAYER_TTL_MS) {
    const now = Date.now();
    const byDim = new Map();
    for (const [name, player] of this.players) {
      if (now - player.ts > ttlMs) {
        this.players.delete(name);
        continue;
      }
      let list = byDim.get(player.dimension);
      if (!list) {
        list = [];
        byDim.set(player.dimension, list);
      }
      list.push({
        name: player.name,
        xuid: player.xuid,
        x: player.x,
        y: player.y,
        z: player.z,
        skin: player.skin,
        skinShape: player.skinShape,
      });
    }
    return byDim;
  }

  tile(dim, tx, tz) {
    const bucket = this.tiles.get(this._tileKey(dim, tx, tz));
    if (!bucket) return [];
    const out = [];
    for (const key of bucket) out.push(this.chunks.get(key));
    return out.filter(Boolean);
  }

  /** Tous les chunks d'une dimension (sans la limite de `range`). */
  all(dim) {
    const out = [];
    for (const payload of this.chunks.values()) {
      if (payload.dim === dim) out.push(payload);
    }
    return out;
  }

  range(dim, cx0, cz0, cx1, cz1) {
    const out = [];
    for (const payload of this.chunks.values()) {
      if (payload.dim !== dim) continue;
      if (payload.cx < cx0 || payload.cx > cx1) continue;
      if (payload.cz < cz0 || payload.cz > cz1) continue;
      out.push(payload);
      if (out.length >= 4096) break;
    }
    return out;
  }

  stats() {
    return {
      chunks: this.chunks.size,
      tiles: this.tiles.size,
      dimensions: Array.from(this.dims.keys()),
      players: this.players.size,
      persisted: Boolean(this.stream),
    };
  }

  _load() {
    let text = "";
    try {
      text = fs.readFileSync(this.dataFile, "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      return;
    }
    const lines = text.split("\n");
    let parsed = 0;
    for (const line of lines) {
      if (!line) continue;
      try {
        const payload = JSON.parse(line);
        if (MapStore.valid(payload)) {
          this.put(payload, { persist: false });
          parsed += 1;
        }
      } catch {
        /* ligne corrompue : ignoree */
      }
    }
    this.lines = parsed;
    if (parsed > this.chunks.size * 1.5 + 1000) this.compact();
  }

  compact() {
    if (!this.dataFile) return;
    this.appends = 0;
    const tmp = this.dataFile + ".tmp";
    const out = fs.createWriteStream(tmp, { flags: "w" });
    for (const payload of this.chunks.values()) {
      out.write(JSON.stringify(payload) + "\n");
    }
    out.end();
    out.on("close", () => {
      try {
        if (this.stream) this.stream.close();
        fs.renameSync(tmp, this.dataFile);
        this.stream = fs.createWriteStream(this.dataFile, { flags: "a" });
      } catch (err) {
        console.error("[map] compactage impossible :", err.message);
      }
    });
  }

  async close() {
    if (!this.stream) return;
    await new Promise((resolve) => {
      this.stream.end(resolve);
    });
    this.stream = null;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const PUBLIC_DIR = path.join(__dirname, "public");

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendPng(res, buffer, width, height) {
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "X-Relief-Size": width + "x" + height,
  });
  res.end(buffer);
}

/**
 * Tuile de carte.
 *
 * Le contenu change des qu'un chunk arrive : on ne peut pas mettre en cache
 * longtemps cote navigateur (une tuile vide resterait vide a l'ecran). On
 * etiquette donc la reponse avec la revision du store et on repond 304 tant
 * qu'aucun chunk n'a bouge.
 */
function sendTile(req, res, buffer, rev) {
  const etag = '"r' + rev + '"';
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache");
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": buffer.length,
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buffer);
}

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("payload trop volumineux"));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

function serveStatic(res, publicDir, pathname) {
  const root = path.resolve(publicDir);
  const rel = pathname === "/" ? "/index.html" : pathname;
  const full = path.resolve(root, "." + (rel.startsWith("/") ? rel : "/" + rel));
  if (full !== root && !full.startsWith(root + path.sep)) {
    sendJson(res, 403, { error: "acces refuse" });
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      sendJson(res, 404, { error: "introuvable" });
      return;
    }
    const type = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": buf.length,
      "Cache-Control": "no-cache",
    });
    res.end(buf);
  });
}

function handleChunkPost(req, res, store, apiKey, onReject) {
  if (apiKey) {
    const given = req.headers["x-api-key"];
    if (given !== apiKey) {
      req.resume();
      if (typeof onReject === "function") onReject(given);
      sendJson(res, 401, { error: "cle d'API invalide" });
      return;
    }
  }
  readBody(req, MAX_BODY)
    .then((buf) => {
      let payload;
      try {
        payload = JSON.parse(buf.toString("utf8"));
      } catch {
        sendJson(res, 400, { error: "JSON invalide" });
        return;
      }
      if (!MapStore.valid(payload)) {
        sendJson(res, 422, { error: "payload invalide" });
        return;
      }
      const isNew = store.put(payload);
      sendJson(res, 200, { ok: true, chunk: [payload.cx, payload.cz], new: isNew });
    })
    .catch((err) => sendJson(res, 413, { error: err.message }));
}

/**
 * POST /api/chunks-data  <- plugin MipMap (endpoint `api.chunks`)
 *
 * Le plugin n'envoie aucun header d'authentification (URL libre dans sa
 * config). On peut verrouiller la route avec MAP_MIPMAP_TOKEN :
 * le plugin accepte n'importe quelle URL, donc
 *   api.chunks = "http://.../api/chunks-data?key=<token>"
 * reste 100 % compatible.
 */
function handleMipmapChunksPost(req, res, store, token) {
  if (token && req.mipmapKey !== token) {
    req.resume();
    sendJson(res, 401, { error: "jeton invalide" });
    return;
  }
  readBody(req, MAX_BODY)
    .then((buf) => {
      let body;
      try {
        body = JSON.parse(buf.toString("utf8"));
      } catch {
        sendJson(res, 400, { error: "JSON invalide" });
        return;
      }
      const result = chunksFromMipmap(body);
      if (result.error) {
        sendJson(res, 422, { error: result.error });
        return;
      }
      let created = 0;
      for (const payload of result.payloads) {
        if (store.put(payload)) created += 1;
      }
      // 200 obligatoire : sinon le plugin journalise une erreur par chunk.
      sendJson(res, 200, {
        ok: true,
        dim: result.dim,
        chunks: result.payloads.length,
        created: created,
      });
    })
    .catch((err) => sendJson(res, 413, { error: err.message }));
}

/**
 * POST /api/players-data  <- plugin MipMap (endpoint `api.players`)
 */
function handleMipmapPlayersPost(req, res, store, token) {
  if (token && req.mipmapKey !== token) {
    req.resume();
    sendJson(res, 401, { error: "jeton invalide" });
    return;
  }
  readBody(req, MAX_BODY)
    .then((buf) => {
      let body;
      try {
        body = JSON.parse(buf.toString("utf8"));
      } catch {
        sendJson(res, 400, { error: "JSON invalide" });
        return;
      }
      const result = playersFromMipmap(body);
      if (result.error) {
        sendJson(res, 422, { error: result.error });
        return;
      }
      const count = store.putPlayers(result.players);
      sendJson(res, 200, { ok: true, players: count });
    })
    .catch((err) => sendJson(res, 413, { error: err.message }));
}

function createApp(options = {}) {
  const store = options.store || new MapStore(options);
  const apiKey =
    options.apiKey !== undefined
      ? options.apiKey
      : process.env.MAP_API_KEY || API_KEY;
  const mipmapToken =
    options.mipmapToken !== undefined
      ? options.mipmapToken
      : process.env.MAP_MIPMAP_TOKEN || "";
  const publicDir = options.publicDir || PUBLIC_DIR;
  const startedAt = Date.now();
  let authRejected = 0;
  // Cache du relief par dimension : evite de re-rendre l'image a chaque
  // rechargement tant qu'aucun nouveau chunk n'est arrive (store.rev).
  const reliefCache = new Map();
  // Cache des tuiles : vide des qu'un nouveau chunk arrive.
  const tileCache = new Map();
  let tileCacheRev = -1;
  // Tuile vide (transparente) : renvoyee 200 au lieu d'un 404 pour une zone
  // non cartographiee. Leaflet recupere les tuiles de chaque niveau de zoom ;
  // un 404 fait disparaitre le morceau et la carte semble se vider quand on
  // dezoome, alors qu'une tuile transparente garde l'affichage stable.
  let emptyTile = null;

  const server = http.createServer(async (req, res) => {
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      sendJson(res, 400, { error: "url invalide" });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      sendJson(res, 400, { error: "url invalide" });
      return;
    }
    // Jeton optionnel des routes MipMap : il transite par l'URL configuree
    // dans le plugin, donc aucun header n'est necessaire.
    req.mipmapKey = url.searchParams.get("key") || req.headers["x-api-key"] || "";

    try {
      if (pathname === "/api/chunks-data" && req.method === "POST") {
        handleMipmapChunksPost(req, res, store, mipmapToken);
        return;
      }

      if (pathname === "/api/players-data" && req.method === "POST") {
        handleMipmapPlayersPost(req, res, store, mipmapToken);
        return;
      }
      if (pathname === "/api/chunk" && req.method === "POST") {
        handleChunkPost(req, res, store, apiKey, (given) => {
          authRejected += 1;
          // On ne journalise la cle recue que par sa TAILLE : ca suffit a
          // distinguer une valeur d'une autre sans exposer de secret.
          if (authRejected <= 3 || authRejected % 500 === 0) {
            const len = given ? String(given).length : 0;
            console.warn(
              `[map] POST /api/chunk refuse (401) : cle recue ${len} caracteres`
            );
          }
        });
        return;
      }

      if (req.method !== "GET") {
        sendJson(res, 405, { error: "methode non autorisee" });
        return;
      }

      if (pathname === "/api/status") {
        const playersByDim = store.onlinePlayers();
        // Une dimension peut n'avoir que des joueurs pour l'instant (le
        // plugin envoie les positions avant le moindre chunk) : on la
        // propose quand meme au selecteur.
        const dims = Array.from(store.dims.keys());
        for (const dim of playersByDim.keys()) {
          if (!dims.includes(dim)) dims.push(dim);
        }
        sendJson(res, 200, {
          ok: true,
          tile_size: store.tileChunks,
          uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
          auth_rejected: authRejected,
          ...store.stats(),
          dimensions: dims,
          players_online: Array.from(playersByDim.values()).reduce(
            (n, list) => n + list.length,
            0
          ),
        });
        return;
      }

      if (pathname === "/api/players") {
        const playersByDim = store.onlinePlayers();
        const out = {};
        const flat = [];
        for (const [dim, list] of playersByDim) {
          out[dim] = list;
          // Forme attendue par le front MipMap : dimension en nom de monde.
          for (const p of list) {
            flat.push({
              name: p.name,
              x: p.x,
              y: p.y,
              z: p.z,
              dimension: worldName(dim),
              skin: "/api/players/" + encodeURIComponent(p.name) + "/skin.png",
            });
          }
        }
        sendJson(res, 200, {
          ok: true,
          status: "success",
          updated: store.playersSeen || 0,
          count: flat.length,
          dimensions: out,
          players: flat,
        });
        return;
      }

      if (pathname === "/api/config") {
        sendJson(res, 200, {
          mapSize: MAP_SIZE,
          updateInterval: MAP_UPDATE_INTERVAL,
          defaultWorld: MAP_DEFAULT_WORLD,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          tileSize: TILE_SIZE,
        });
        return;
      }

      if (pathname === "/api/meta") {
        const dim = url.searchParams.get("dim");
        const meta = dim ? store.dims.get(dim) : null;
        if (!meta) {
          // Pas encore de chunk pour cette dimension : on renvoie une meta
          // vide plutot qu'une 404, sinon l'interface casse a l'arrivee d'un
          // joueur dans une dimension non encore cartographiee.
          if (dim && store.onlinePlayers().has(dim)) {
            sendJson(res, 200, {
              dim: dim,
              count: 0,
              min_cx: 0,
              max_cx: 0,
              min_cz: 0,
              max_cz: 0,
              y_min: -64,
              y_max: 320,
            });
            return;
          }
          sendJson(res, 404, { error: "dimension inconnue", dim: dim });
          return;
        }
        sendJson(res, 200, { dim: dim, ...meta });
        return;
      }

      const parts = pathname.split("/").filter(Boolean);

      if (parts[0] === "api" && parts[1] === "relief" && parts.length === 3) {
        // GET /api/relief/<dim>[.png]  ->  relief vu de dessus rendu ici.
        let dim = parts[2];
        if (dim.endsWith(".png")) dim = dim.slice(0, -4);
        if (!store.dims.has(dim)) {
          const normalized = normalizeDimension(dim);
          if (store.dims.has(normalized)) dim = normalized;
        }
        const chunks = store.all(dim);
        if (!chunks.length) {
          sendJson(res, 404, { error: "aucun chunk pour cette dimension", dim: dim });
          return;
        }
        const cached = reliefCache.get(dim);
        if (cached && cached.rev === store.rev) {
          sendPng(res, cached.png, cached.width, cached.height);
          return;
        }
        const relief = renderReliefPng(chunks);
        if (!relief) {
          sendJson(res, 404, { error: "relief impossible", dim: dim });
          return;
        }
        reliefCache.set(dim, {
          rev: store.rev,
          png: relief.buffer,
          width: relief.width,
          height: relief.height,
        });
        sendPng(res, relief.buffer, relief.width, relief.height);
        return;
      }

      if (parts[0] === "api" && parts[1] === "tile" && parts.length === 5) {
        const [, , dim, tx, tz] = parts;
        sendJson(res, 200, {
          dim: dim,
          tx: Number(tx),
          tz: Number(tz),
          chunks: store.tile(dim, Number(tx), Number(tz)),
        });
        return;
      }

      if (parts[0] === "api" && parts[1] === "chunk" && parts.length === 5) {
        const [, , dim, cx, cz] = parts;
        const payload = store.get(dim, Number(cx), Number(cz));
        if (!payload) {
          sendJson(res, 404, { error: "chunk introuvable" });
          return;
        }
        sendJson(res, 200, payload);
        return;
      }

      if (parts[0] === "api" && parts[1] === "tiles" && parts.length === 6) {
        // GET /api/tiles/<world>/<z>/<x>/<y>  ->  tuile PNG (rendu MipMap).
        const dim = normalizeDimension(parts[2]);
        const zoom = Number(parts[3]);
        const tx = Number(parts[4]);
        const ty = Number(parts[5]);
        if (![zoom, tx, ty].every((n) => Number.isInteger(n))) {
          sendJson(res, 400, { error: "coordonnees de tuile invalides" });
          return;
        }
        if (!store.dims.has(dim)) {
          sendJson(res, 404, { error: "dimension inconnue", dim: dim });
          return;
        }
        const key = dim + SEP + zoom + SEP + tx + SEP + ty;
        if (tileCacheRev !== store.rev) {
          tileCache.clear();
          tileCacheRev = store.rev;
        }
        const cached = tileCache.get(key);
        if (cached) {
          sendTile(req, res, cached, store.rev);
          return;
        }
        const blocks = blocksPerTile(zoom);
        const cx0 = Math.floor((tx * blocks) / 16);
        const cz0 = Math.floor((ty * blocks) / 16);
        const cx1 = Math.floor((tx * blocks + blocks - 1) / 16);
        const cz1 = Math.floor((ty * blocks + blocks - 1) / 16);
        let tile = null;
        try {
          tile = renderTilePng(store.range(dim, cx0, cz0, cx1, cz1), {
            zoom: zoom,
            tx: tx,
            ty: ty,
          });
        } catch (err) {
          // Une tuile ne doit jamais casser la carte : on trace et on renvoie
          // la tuile vide plutot qu'une erreur 500.
          console.warn(`[map] tuile ${dim}/${zoom}/${tx}/${ty} impossible : ${err.message}`);
        }
        if (!tile) {
          if (!emptyTile) {
            emptyTile = encodePng(TILE_SIZE, TILE_SIZE, Buffer.alloc(TILE_SIZE * TILE_SIZE * 4));
          }
          sendTile(req, res, emptyTile, store.rev);
          return;
        }
        if (tileCache.size > 4096) tileCache.clear();
        tileCache.set(key, tile.buffer);
        sendTile(req, res, tile.buffer, store.rev);
        return;
      }

      if (
        parts[0] === "api" &&
        parts[1] === "players" &&
        parts.length === 4 &&
        parts[3] === "skin.png"
      ) {
        const name = parts[2];
        const player = store.players.get(name);
        const face = player ? faceFromSkin(player.skin, player.skinShape) : null;
        if (face) {
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": face.length,
            "Cache-Control": "public, max-age=3600",
          });
          res.end(face);
          return;
        }
        fs.readFile(SKIN_FALLBACK, (err, buf) => {
          if (err) {
            sendJson(res, 404, { error: "skin introuvable" });
            return;
          }
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": buf.length,
            "Cache-Control": "public, max-age=3600",
          });
          res.end(buf);
        });
        return;
      }

      if (pathname === "/api/chunks") {
        const params = url.searchParams;
        const dim = params.get("dim");
        const cx0 = Number(params.get("cx0"));
        const cz0 = Number(params.get("cz0"));
        const cx1 = Number(params.get("cx1"));
        const cz1 = Number(params.get("cz1"));
        if (!dim || ![cx0, cz0, cx1, cz1].every(Number.isFinite)) {
          sendJson(res, 400, { error: "parametres dim/cx0/cz0/cx1/cz1 manquants" });
          return;
        }
        sendJson(res, 200, {
          dim: dim,
          chunks: store.range(dim, cx0, cz0, cx1, cz1),
        });
        return;
      }

      if (req.method === "GET") {
        // Interface MipMap vendoree : "/" -> index.html, "/static/*" -> assets.
        if (pathname === "/" || pathname === "/mipmap") {
          serveStatic(res, MIPMAP_UI_DIR, "/index.html");
          return;
        }
        if (pathname.startsWith("/static/")) {
          serveStatic(res, MIPMAP_UI_DIR, pathname);
          return;
        }
        serveStatic(res, publicDir, pathname);
        return;
      }

      sendJson(res, 405, { error: "methode non autorisee" });
    } catch (err) {
      sendJson(res, 500, { error: String((err && err.message) || err) });
    }
  });

  return { server: server, store: store };
}

function main() {
  const port = Number(process.env.PORT || process.env.MAP_PORT || 10005);
  const host = process.env.HOST || "0.0.0.0";
  const dataFile =
    process.env.MAP_DATA_FILE || path.join(__dirname, "data", "chunks.ndjson");
  const apiKey = process.env.MAP_API_KEY || API_KEY;
  const mipmapToken = process.env.MAP_MIPMAP_TOKEN || "";

  const app = createApp({ dataFile: dataFile, apiKey: apiKey, mipmapToken: mipmapToken });

  app.server.listen(port, host, () => {
    console.log(`[map] carte dispo sur http://${host}:${port}/`);
    console.log(`[map] donnees : ${dataFile}`);
    console.log(`[map] auth WorldMap (X-Api-Key) : ${apiKey ? "activee" : "desactivee"}`);
    console.log(
      `[map] routes MipMap : POST /api/chunks-data, /api/players-data` +
        ` (${mipmapToken ? "jeton exige (?key=)" : "ouvertes, sans jeton"})`
    );
    console.log(`[map] interface MipMap (Node) : http://${host}:${port}/`);
    console.log(
      `[map] tuiles : GET /api/tiles/<monde>/<zoom>/<x>/<y> (textures MipMap, 16 px/bloc)`
    );
    console.log(`[map] relief vu de dessus : GET /api/relief/<dim>`);
    console.log(`[map] chunks en memoire : ${app.store.chunks.size}`);
  });

  const shutdown = (signal) => {
    console.log(`[map] ${signal} -> arret propre`);
    app.server.close(() => {});
    app.store.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main();
}

module.exports = { MapStore, TILE_CHUNKS, MAX_BODY, createApp };
