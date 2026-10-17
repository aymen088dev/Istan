"use strict";

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const BUDGET = 4200; // taille max (px) du canvas hors-echelle
const MIN_SCALE = 2;
const MAX_SCALE = 64;
const TILE_FETCH = 6; // requetes de tile simultanees
const PX_HINT = 16; // px par largeur de bloc a zoom = 1

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d", { alpha: false });
const loaderEl = document.getElementById("loader");
const hintEl = document.getElementById("hint");
const liveEl = document.getElementById("live");
const liveLabel = document.getElementById("live-label");
const dimSelect = document.getElementById("dim-select");
const dimLabel = document.getElementById("dim-label");
const chunkCountEl = document.getElementById("chunk-count");
const playersPanel = document.getElementById("players-panel");
const playersList = document.getElementById("players-list");
const playersCount = document.getElementById("players-count");
const viewIsoBtn = document.getElementById("view-iso");
const viewReliefBtn = document.getElementById("view-relief");
const reliefWrap = document.getElementById("relief-wrap");
const reliefViewport = document.getElementById("relief-viewport");
const reliefImg = document.getElementById("relief");
const reliefCaption = document.getElementById("relief-caption");

/* ------------------------------------------------------------------ */
/*  Etat                                                               */
/* ------------------------------------------------------------------ */

const state = {
  dim: "overworld",
  view: "iso", // "iso" (isometrique client) ou "relief" (PNG rendu serveur)
  tileChunks: 8,
  chunks: new Map(), // "cx,cz" -> payload
  tiles: new Map(), // "tx,tz" -> { status, chunks }
  meta: null,
  fetching: new Set(),
  pending: 0,
  players: new Map(), // dim -> [ { name, x, y, z } ]
};

const cam = { panX: 0, panY: 0, zoom: 1 };

// Canvas hors-echelle + fenetre de rebuild progressive.
let offscreen = document.createElement("canvas");
let renderScale = PX_HINT;
let extent = { uMin: 0, uMax: 1, vMin: 0, vMax: 1 };
let rebuild = null;
let rebuildAgain = false;
let rebuildTimer = 0;
let dirty = true;

/* ------------------------------------------------------------------ */
/*  Projection isometrique                                             */
/* ------------------------------------------------------------------ */

// u : axe horizontal ("x - z"), 1 unite = 1 largeur de bloc
// v : axe vertical  ("(x+z)/4 - y/2")
function isoU(x, z) {
  return x - z;
}
function isoV(x, z, y) {
  return (x + z) * 0.25 - y * 0.5;
}
function screenX(u) {
  return cam.panX + u * renderScale * cam.zoom;
}
function screenY(v) {
  return cam.panY + v * renderScale * cam.zoom;
}

/* ------------------------------------------------------------------ */
/*  Acces aux donnees                                                   */
/* ------------------------------------------------------------------ */

function chunkKey(cx, cz) {
  return cx + "," + cz;
}
function tileKey(tx, tz) {
  return tx + "," + tz;
}

function getChunk(cx, cz) {
  return state.chunks.get(chunkKey(cx, cz)) || null;
}

/** Hauteur du bloc du dessus a (x, z), ou null si non charge. */
function topAt(x, z) {
  const chunk = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!chunk) return null;
  const cell = chunk.cells[((z & 15) << 4) | (x & 15)];
  return cell && cell.length ? cell[0] : null;
}

function cellAt(x, z) {
  const chunk = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!chunk) return null;
  const cell = chunk.cells[((z & 15) << 4) | (x & 15)];
  return cell && cell.length ? cell : null;
}

/* ------------------------------------------------------------------ */
/*  Reseau                                                             */
/* ------------------------------------------------------------------ */

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function loadStatus() {
  const data = await getJson("api/status");
  state.tileChunks = data.tile_size || 8;
  liveEl.classList.remove("err");
  liveEl.classList.add("on");
  liveLabel.textContent = data.chunks + " chunks";

  const dims = data.dimensions && data.dimensions.length ? data.dimensions : ["overworld"];
  fillDimSelect(dims, state.dim);
  return data;
}

function fillDimSelect(dims, current) {
  dimSelect.innerHTML = "";
  for (const d of dims) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d.replace("minecraft:", "");
    dimSelect.appendChild(opt);
  }
  if (dims.indexOf(current) === -1) state.dim = dims[0];
  dimSelect.value = state.dim;
  dimLabel.textContent = state.dim.replace("minecraft:", "");
}

async function loadMeta() {
  try {
    state.meta = await getJson("api/meta?dim=" + encodeURIComponent(state.dim));
    chunkCountEl.textContent = state.meta.count;
  } catch {
    state.meta = null;
    chunkCountEl.textContent = "0";
  }
}

function tilesInMetaRange() {
  const m = state.meta;
  if (!m) return [];
  const T = state.tileChunks;
  const tx0 = Math.floor(m.min_cx / T);
  const tx1 = Math.floor(m.max_cx / T);
  const tz0 = Math.floor(m.min_cz / T);
  const tz1 = Math.floor(m.max_cz / T);
  const out = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let tz = tz0; tz <= tz1; tz++) out.push([tx, tz]);
  }
  return out;
}

function tileStatus(tx, tz) {
  return state.tiles.get(tileKey(tx, tz));
}

function enqueueTile(tx, tz) {
  const key = tileKey(tx, tz);
  if (state.tiles.has(key) || state.fetching.has(key)) return;
  state.tiles.set(key, { status: "loading", chunks: [] });
  state.fetching.add(key);
  state.pending += 1;
  updateLoader();
}

async function pumpTiles(queue) {
  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const [tx, tz] = queue[i++];
      const key = tileKey(tx, tz);
      try {
        const data = await getJson(
          "api/tile/" +
            encodeURIComponent(state.dim) +
            "/" +
            tx +
            "/" +
            tz
        );
        ingestTile(tx, tz, data.chunks || []);
      } catch {
        state.tiles.delete(key);
      } finally {
        state.fetching.delete(key);
        state.pending -= 1;
        updateLoader();
      }
    }
  }
  const workers = [];
  for (let n = 0; n < TILE_FETCH; n++) workers.push(worker());
  await Promise.all(workers);
}

function ingestTile(tx, tz, chunks) {
  const list = [];
  for (const payload of chunks) {
    state.chunks.set(chunkKey(payload.cx, payload.cz), payload);
    list.push(payload);
  }
  state.tiles.set(tileKey(tx, tz), { status: "ready", chunks: list });
  scheduleRebuild();
}

function updateLoader() {
  loaderEl.classList.toggle("show", state.pending > 0);
}

/* ------------------------------------------------------------------ */
/*  Teinte de face (cache)                                             */
/* ------------------------------------------------------------------ */

const shadeCache = new Map();

function shade(hex, factor) {
  const key = hex + "|" + factor;
  let out = shadeCache.get(key);
  if (out) return out;
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.max(0, Math.min(255, Math.round(r * factor)));
  g = Math.max(0, Math.min(255, Math.round(g * factor)));
  b = Math.max(0, Math.min(255, Math.round(b * factor)));
  out = "rgb(" + r + "," + g + "," + b + ")";
  shadeCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ */
/*  Rendu d'une colonne                                                */
/* ------------------------------------------------------------------ */

const FACE_X = 0.78;
const FACE_Z = 0.6;

function drawSide(g, x, z, cell, palette, neighborTop, dirX, dirZ, S, px, py) {
  const half = S / 2;
  const quarter = S / 4;
  const drop = S / 2; // hauteur d'un bloc
  const u = isoU(x, z);
  const isX = dirX !== 0;

  for (let j = 0; j < cell.length; j += 2) {
    const yTop = cell[j];
    if (yTop <= neighborTop) break;
    const yBottom = Math.max(yTop - 1, neighborTop);
    const v = isoV(x, z, yTop);
    const h = (yTop - yBottom) * drop;
    if (h <= 0) continue;

    const color = shade(blockColor(palette[cell[j + 1]]), isX ? FACE_X : FACE_Z);
    const ax = px(isX ? u + 0.5 : u - 0.5);
    const ay = py(v);
    const bx = px(u);
    const by = py(v + quarter);
    const pyh = h;

    g.fillStyle = color;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(bx, by + pyh);
    g.lineTo(ax, ay + pyh);
    g.closePath();
    g.fill();
  }
}

function drawColumn(g, x, z, cell, palette, S, px, py) {
  const topY = cell[0];
  const u = isoU(x, z);
  const v = isoV(x, z, topY);
  const cx = px(u);
  const cy = py(v);
  const half = S / 2;
  const quarter = S / 4;

  const nx = topAt(x + 1, z);
  const nz = topAt(x, z + 1);
  if (nx !== null && nx < topY) drawSide(g, x, z, cell, palette, nx, 1, 0, S, px, py);
  if (nz !== null && nz < topY) drawSide(g, x, z, cell, palette, nz, 0, 1, S, px, py);

  g.fillStyle = blockColor(palette[cell[1]]);
  g.beginPath();
  g.moveTo(cx, cy - quarter);
  g.lineTo(cx + half, cy);
  g.lineTo(cx, cy + quarter);
  g.lineTo(cx - half, cy);
  g.closePath();
  g.fill();
}

function drawChunk(g, payload, S, ou, ov) {
  const cells = payload.cells;
  const palette = payload.palette;
  const baseX = payload.cx * 16;
  const baseZ = payload.cz * 16;
  const px = (u) => (u - ou) * S;
  const py = (v) => (v - ov) * S;

  // Ordre "peintre" : du fond vers l'avant (x + z croissant).
  for (let sum = 0; sum <= 30; sum++) {
    for (let ix = 0; ix < 16; ix++) {
      const iz = sum - ix;
      if (iz < 0 || iz > 15) continue;
      const cell = cells[(iz << 4) | ix];
      if (!cell || cell.length === 0) continue;
      drawColumn(g, baseX + ix, baseZ + iz, cell, palette, S, px, py);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Etendue du monde + rebuild progressif                              */
/* ------------------------------------------------------------------ */

function computeExtent() {
  const yMin = state.meta ? state.meta.y_min : -64;
  const yMax = state.meta ? state.meta.y_max : 320;
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (const c of state.chunks.values()) {
    const x0 = c.cx * 16;
    const z0 = c.cz * 16;
    const x1 = x0 + 15;
    const z1 = z0 + 15;
    const du0 = x0 - z1;
    const du1 = x1 - z0;
    if (du0 < uMin) uMin = du0;
    if (du1 > uMax) uMax = du1;
    const dv0 = (x0 + z0) * 0.25 - yMax * 0.5;
    const dv1 = (x1 + z1) * 0.25 - yMin * 0.5;
    if (dv0 < vMin) vMin = dv0;
    if (dv1 > vMax) vMax = dv1;
  }

  if (!isFinite(uMin)) {
    uMin = -1;
    uMax = 1;
    vMin = -1;
    vMax = 1;
  }
  uMin -= 1;
  uMax += 1;
  vMin -= 1;
  vMax += 1;
  extent = { uMin: uMin, uMax: uMax, vMin: vMin, vMax: vMax };
}

function chooseScale() {
  const w = Math.max(1, extent.uMax - extent.uMin);
  const h = Math.max(1, extent.vMax - extent.vMin);
  let s = Math.min(BUDGET / w, BUDGET / h);
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

function scheduleRebuild() {
  dirty = true;
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(startRebuild, 180);
}

function startRebuild() {
  if (state.chunks.size === 0) return;
  if (rebuild) {
    rebuildAgain = true;
    return;
  }

  computeExtent();
  const scale = chooseScale();
  const w = Math.max(1, Math.ceil((extent.uMax - extent.uMin) * scale));
  const h = Math.max(1, Math.ceil((extent.vMax - extent.vMin) * scale));

  const target = document.createElement("canvas");
  target.width = w;
  target.height = h;
  const g = target.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#0d1117";
  g.fillRect(0, 0, w, h);

  const T = state.tileChunks;
  const list = [];
  for (const key of state.tiles.keys()) {
    const parts = key.split(",");
    const tx = Number(parts[0]);
    const tz = Number(parts[1]);
    list.push({ tx: tx, tz: tz });
  }
  // Ordre "peintre" entre tiles : plus petit (tx+tz) d'abord.
  list.sort((a, b) => a.tx + a.tz - (b.tx + b.tz) || a.tx - b.tx);

  rebuild = {
    canvas: target,
    ctx: g,
    list: list,
    i: 0,
    scale: scale,
    ou: extent.uMin,
    ov: extent.vMin,
  };
}

function stepRebuild() {
  if (!rebuild) return;
  const T = state.tileChunks;
  const t0 = performance.now();

  while (rebuild.i < rebuild.list.length && performance.now() - t0 < 22) {
    const t = rebuild.list[rebuild.i++];
    const bucket = state.tiles.get(tileKey(t.tx, t.tz));
    if (!bucket) continue;
    const chunks = bucket.chunks.slice().sort(
      (a, b) => a.cx + a.cz - (b.cx + b.cz) || a.cx - b.cx
    );
    for (const payload of chunks) {
      drawChunk(rebuild.ctx, payload, rebuild.scale, rebuild.ou, rebuild.ov);
    }
  }

  if (rebuild.i >= rebuild.list.length) {
    offscreen = rebuild.canvas;
    renderScale = rebuild.scale;
    rebuild = null;
    dirty = false;
    justFinished = true;
    if (rebuildAgain) {
      rebuildAgain = false;
      startRebuild();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Boucle d'affichage                                                 *//* ------------------------------------------------------------------ */

function render() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);

  if (offscreen.width > 0 && offscreen.height > 0) {
    const s = renderScale * cam.zoom;
    const dw = (extent.uMax - extent.uMin) * s;
    const dh = (extent.vMax - extent.vMin) * s;
    ctx.imageSmoothingEnabled = cam.zoom < 1;
    ctx.drawImage(offscreen, screenX(extent.uMin), screenY(extent.vMin), dw, dh);
  }

  drawPlayers();
}

function loop() {
  stepRebuild();
  render();
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ */
/*  Joueurs (payload MipMap /api/players-data)                        */
/* ------------------------------------------------------------------ */

async function loadPlayers() {
  let data;
  try {
    data = await getJson("api/players");
  } catch {
    // Le serveur expose peut-etre pas /api/players (version anterieure) :
    // on masque simplement les marqueurs plutot que de casser la carte.
    return 0;
  }
  state.players = new Map();
  const dims = data && data.dimensions ? data.dimensions : {};
  let total = 0;
  for (const dim of Object.keys(dims)) {
    const list = dims[dim] || [];
    state.players.set(dim, list);
    total += list.length;
  }
  playersCount.textContent = total;
  playersPanel.hidden = total === 0;
  renderPlayerList();
  return total;
}

function renderPlayerList() {
  const list = state.players.get(state.dim) || [];
  playersList.innerHTML = "";
  for (const player of list) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "swatch";
    const name = document.createElement("span");
    name.textContent = player.name;
    const where = document.createElement("span");
    where.className = "where";
    where.textContent = Math.round(player.x) + ", " + Math.round(player.z);
    li.append(dot, name, where);
    playersList.appendChild(li);
  }
}

/** Marqueurs : silhouette posee au sol + tete, et nom quand c'est lisible. */
function drawPlayers() {
  const list = state.players.get(state.dim);
  if (!list || !list.length) return;
  const s = renderScale * cam.zoom;
  const headY = 1.8; // hauteur de tete en blocs

  for (const player of list) {
    const px = screenX(isoU(player.x, player.z));
    const py = screenY(isoV(player.x, player.z, player.y));
    if (px < -40 || py < -40 || px > canvas.width + 40 || py > canvas.height + 40) {
      continue;
    }

    // Ombre au sol
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(px, py, Math.max(3, s * 0.32), Math.max(1.5, s * 0.16), 0, 0, Math.PI * 2);
    ctx.fill();

    // Corps
    const head = py - headY * s;
    ctx.strokeStyle = "#35c4e8";
    ctx.lineWidth = Math.max(1.5, Math.min(3.5, s * 0.14));
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, head);
    ctx.stroke();

    // Tete
    ctx.fillStyle = "#2ee6a8";
    ctx.beginPath();
    ctx.arc(px, head, Math.max(2.5, Math.min(9, s * 0.3)), 0, Math.PI * 2);
    ctx.fill();

    if (s >= 9) {
      ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(6, 10, 14, 0.85)";
      ctx.strokeText(player.name, px, head - Math.max(6, s * 0.5));
      ctx.fillStyle = "#e8eff7";
      ctx.fillText(player.name, px, head - Math.max(6, s * 0.5));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Relief vu de dessus (rendu cote serveur)                           */
/* ------------------------------------------------------------------ */

let reliefUrl = null;
let reliefToken = 0;

// Pan/zoom de l'image de relief (mode "vu de dessus").
const reliefView = { zoom: 1, x: 0, y: 0 };
const RELIEF_MIN_ZOOM = 0.2;
const RELIEF_MAX_ZOOM = 32;

function applyReliefTransform() {
  reliefImg.style.transform =
    "translate(" + reliefView.x + "px, " + reliefView.y + "px) scale(" + reliefView.zoom + ")";
}

function clampReliefZoom(z) {
  return Math.max(RELIEF_MIN_ZOOM, Math.min(RELIEF_MAX_ZOOM, z));
}

function resetReliefView() {
  reliefView.zoom = 1;
  reliefView.x = 0;
  reliefView.y = 0;
  applyReliefTransform();
}

/** Zoom relief en gardant le point sous le curseur fixe (clientX/Y optionnels). */
function reliefZoomAt(factor, clientX, clientY) {
  const rect = reliefViewport.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const sx = typeof clientX === "number" ? clientX : cx;
  const sy = typeof clientY === "number" ? clientY : cy;
  const vx = sx - cx;
  const vy = sy - cy;
  const z0 = reliefView.zoom;
  const z1 = clampReliefZoom(z0 * factor);
  const k = z1 / z0;
  reliefView.x = vx - k * (vx - reliefView.x);
  reliefView.y = vy - k * (vy - reliefView.y);
  reliefView.zoom = z1;
  applyReliefTransform();
}

let reliefDrag = null;

function bindReliefInteraction() {
  reliefViewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    reliefDrag = { x: e.clientX, y: e.clientY };
    reliefViewport.setPointerCapture(e.pointerId);
    reliefViewport.classList.add("drag");
    hideHint();
  });

  reliefViewport.addEventListener("pointermove", (e) => {
    if (!reliefDrag) return;
    reliefView.x += e.clientX - reliefDrag.x;
    reliefView.y += e.clientY - reliefDrag.y;
    reliefDrag = { x: e.clientX, y: e.clientY };
    applyReliefTransform();
  });

  const endReliefDrag = (e) => {
    reliefDrag = null;
    reliefViewport.classList.remove("drag");
    if (e && e.pointerId !== undefined) {
      try {
        reliefViewport.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };
  reliefViewport.addEventListener("pointerup", endReliefDrag);
  reliefViewport.addEventListener("pointercancel", endReliefDrag);

  reliefViewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      hideHint();
      reliefZoomAt(e.deltaY < 0 ? 1.16 : 1 / 1.16, e.clientX, e.clientY);
    },
    { passive: false }
  );

  reliefViewport.addEventListener("dblclick", () => resetReliefView());
}

async function loadRelief() {
  const dim = state.dim;
  const token = ++reliefToken;
  reliefCaption.textContent = "rendu du relief…";
  reliefImg.removeAttribute("src");
  loaderEl.classList.add("show");
  try {
    const res = await fetch(
      "api/relief/" + encodeURIComponent(dim) + "?t=" + Date.now(),
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    if (token !== reliefToken) return;
    if (reliefUrl) URL.revokeObjectURL(reliefUrl);
    reliefUrl = URL.createObjectURL(blob);
    reliefImg.onload = () => {
      reliefCaption.textContent =
        "relief vu de dessus · " +
        reliefImg.naturalWidth +
        "×" +
        reliefImg.naturalHeight +
        " px · rendu serveur";
    };
    reliefImg.src = reliefUrl;
  } catch (err) {
    if (token !== reliefToken) return;
    reliefCaption.textContent = "relief indisponible (" + err.message + ")";
  } finally {
    if (token === reliefToken) loaderEl.classList.remove("show");
  }
}

/** Bascule l'habillage (boutons, canvas/relief) sans toucher aux donnees. */
function applyViewUi(view) {
  const relief = view === "relief";
  viewIsoBtn.classList.toggle("active", !relief);
  viewReliefBtn.classList.toggle("active", relief);
  reliefWrap.hidden = !relief;
  canvas.style.visibility = relief ? "hidden" : "visible";
  // En relief l'indice reste visible jusqu'a la premiere interaction ; en 3D
  // il suit l'auto-cadrage.
  if (!relief) hintEl.classList.toggle("hide", !autoFit);
}

function hideHint() {
  hintEl.classList.add("hide");
}

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  applyViewUi(view);
  if (view === "relief") {
    loadRelief();
  } else {
    scheduleVisibleTiles();
  }
}

/* ------------------------------------------------------------------ */
/*  Camera                                                             */
/* ------------------------------------------------------------------ */

let autoFit = true;
let justFinished = false;
let tilesTimer = 0;

function clampZoom(v) {
  return Math.max(0.03, Math.min(16, v));
}

function fit() {
  computeExtent();
  const w = canvas.width;
  const h = canvas.height;
  const ew = Math.max(1, extent.uMax - extent.uMin);
  const eh = Math.max(1, extent.vMax - extent.vMin);
  const s = (Math.min(w / ew, h / eh) || 1) * 0.9;
  cam.zoom = clampZoom(s / renderScale);
  const k = renderScale * cam.zoom;
  const midU = (extent.uMin + extent.uMax) / 2;
  const midV = (extent.vMin + extent.vMax) / 2;
  cam.panX = w / 2 - midU * k;
  cam.panY = h / 2 - midV * k;
}

function zoomAt(factor, sx, sy) {
  const k0 = renderScale * cam.zoom;
  const u = (sx - cam.panX) / k0;
  const v = (sy - cam.panY) / k0;
  cam.zoom = clampZoom(cam.zoom * factor);
  const k1 = renderScale * cam.zoom;
  cam.panX = sx - u * k1;
  cam.panY = sy - v * k1;
}

function canvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const rx = canvas.width / Math.max(1, rect.width);
  const ry = canvas.height / Math.max(1, rect.height);
  return { x: (clientX - rect.left) * rx, y: (clientY - rect.top) * ry };
}

/* ------------------------------------------------------------------ */
/*  Tiles visibles                                                     */
/* ------------------------------------------------------------------ */

function visibleChunkRange() {
  const s = renderScale * cam.zoom;
  const w = canvas.width;
  const h = canvas.height;
  const u1 = (0 - cam.panX) / s;
  const u2 = (w - cam.panX) / s;
  const v1 = (0 - cam.panY) / s;
  const v2 = (h - cam.panY) / s;

  const yMin = state.meta ? state.meta.y_min : -64;
  const yMax = state.meta ? state.meta.y_max : 320;
  // v = (x+z)*0.25 - y*0.5  =>  (x+z) = (v + y*0.5) * 4
  const sumMin = (v1 + yMax * 0.5) * 4;
  const sumMax = (v2 + yMin * 0.5) * 4;
  const m = 8;
  return {
    xMin: Math.floor((sumMin + u1) / 2) - m,
    xMax: Math.ceil((sumMax + u2) / 2) + m,
    zMin: Math.floor((sumMin - u2) / 2) - m,
    zMax: Math.ceil((sumMax - u1) / 2) + m,
  };
}

function updateVisibleTiles() {
  if (!state.meta) return;
  // En mode relief c'est le serveur qui rend l'image : pas de tuiles a tirer.
  if (state.view !== "iso") return;
  const T = state.tileChunks;
  const B = 16 * T;
  const r = visibleChunkRange();
  const tx0 = Math.floor(r.xMin / B);
  const tx1 = Math.floor(r.xMax / B);
  const tz0 = Math.floor(r.zMin / B);
  const tz1 = Math.floor(r.zMax / B);
  const meta = state.meta;

  const queue = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let tz = tz0; tz <= tz1; tz++) {
      const cx0 = tx * B;
      const cz0 = tz * B;
      if (cx0 > meta.max_cx * 16 + 15 || cx0 + B - 1 < meta.min_cx * 16) continue;
      if (cz0 > meta.max_cz * 16 + 15 || cz0 + B - 1 < meta.min_cz * 16) continue;
      if (state.tiles.has(tileKey(tx, tz)) || state.fetching.has(tileKey(tx, tz))) continue;
      queue.push([tx, tz]);
    }
  }
  if (queue.length) {
    queue.forEach((t) => enqueueTile(t[0], t[1]));
    pumpTiles(queue);
  }
}

function scheduleVisibleTiles() {
  clearTimeout(tilesTimer);
  tilesTimer = setTimeout(updateVisibleTiles, 160);
}

/* ------------------------------------------------------------------ */
/*  Interactions                                                       */
/* ------------------------------------------------------------------ */

function stopAuto() {
  if (autoFit) {
    autoFit = false;
    hintEl.classList.add("hide");
  }
}

function onResize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
  const h = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    scheduleVisibleTiles();
  }
}

function bindControls() {
  window.addEventListener("resize", onResize);

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("drag");
    stopAuto();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    cam.panX += (e.clientX - drag.x) * dpr;
    cam.panY += (e.clientY - drag.y) * dpr;
    drag = { x: e.clientX, y: e.clientY };
    scheduleVisibleTiles();
  });
  const endDrag = (e) => {
    drag = null;
    canvas.classList.remove("drag");
    if (e && e.pointerId !== undefined) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stopAuto();
      const p = canvasPoint(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, p.x, p.y);
      scheduleVisibleTiles();
    },
    { passive: false }
  );

  document.getElementById("zoom-in").addEventListener("click", () => {
    if (state.view === "relief") {
      reliefZoomAt(1.3);
      return;
    }
    stopAuto();
    zoomAt(1.3, canvas.width / 2, canvas.height / 2);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    if (state.view === "relief") {
      reliefZoomAt(1 / 1.3);
      return;
    }
    stopAuto();
    zoomAt(1 / 1.3, canvas.width / 2, canvas.height / 2);
  });
  document.getElementById("zoom-reset").addEventListener("click", () => {
    if (state.view === "relief") {
      resetReliefView();
      return;
    }
    autoFit = true;
    fit();
    scheduleVisibleTiles();
  });

  // Double-clic : recentre la vue (3D comme relief).
  canvas.addEventListener("dblclick", () => {
    autoFit = true;
    fit();
    scheduleVisibleTiles();
  });

  bindReliefInteraction();

  viewIsoBtn.addEventListener("click", () => setView("iso"));
  viewReliefBtn.addEventListener("click", () => setView("relief"));

  dimSelect.addEventListener("change", () => switchDim(dimSelect.value));
}

async function switchDim(dim) {
  if (dim === state.dim) return;
  state.dim = dim;
  dimLabel.textContent = dim.replace("minecraft:", "");
  renderPlayerList();
  state.chunks.clear();
  state.tiles.clear();
  state.fetching.clear();
  state.pending = 0;
  updateLoader();
  autoFit = true;
  offscreen = document.createElement("canvas");
  await loadMeta();
  if (state.view === "relief") {
    resetReliefView();
    loadRelief();
    return;
  }
  updateVisibleTiles();
  scheduleRebuild();
}

/* ------------------------------------------------------------------ */
/*  Demarrage                                                          */
/* ------------------------------------------------------------------ */

async function poll() {
  try {
    const data = await getJson("api/status");
    liveEl.classList.remove("err");
    liveEl.classList.add("on");
    liveLabel.textContent = data.chunks + " chunks";
    const before = state.meta ? state.meta.count : -1;
    if (before !== -1 && data.chunks !== before) {
      await loadMeta();
      if (state.view === "relief") {
        loadRelief();
      } else {
        updateVisibleTiles();
      }
    }
    await loadPlayers();
  } catch {
    liveEl.classList.remove("on");
    liveEl.classList.add("err");
    liveLabel.textContent = "hors ligne";
  }
}

async function boot() {
  onResize();
  bindControls();
  loop();

  // La carte s'ouvre a plat (relief vu de dessus) : c'est la vue "de face".
  // `?view=iso` (ou le bouton 3D) pour repasser en isometrique. On applique
  // l'habillage tout de suite pour eviter un flash de la vue 3D.
  const wantIso = new URLSearchParams(location.search).get("view") === "iso";
  state.view = wantIso ? "iso" : "relief";
  applyViewUi(state.view);

  try {
    await loadStatus();
    await loadMeta();
    await loadPlayers();
  } catch (err) {
    liveEl.classList.add("err");
    liveLabel.textContent = "hors ligne";
    console.error(err);
  }

  if (wantIso) {
    updateVisibleTiles();
  } else {
    resetReliefView();
    loadRelief();
  }
  setInterval(poll, 8000);
}

// Finalise le zoom automatique a chaque rebuild, tant que l'utilisateur
// n'a pas touche a la camera.
setInterval(() => {
  if (justFinished) {
    justFinished = false;
    if (autoFit) fit();
    updateVisibleTiles();
  }
}, 60);

document.addEventListener("DOMContentLoaded", boot);
