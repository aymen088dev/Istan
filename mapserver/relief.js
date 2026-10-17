"use strict";

/* ------------------------------------------------------------------ */
/*  Relief vu de dessus (rendu cote serveur)                           */
/* ------------------------------------------------------------------ */
/*
 * A partir des chunks stockes (un bloc de surface par colonne), on
 * construit une grille hauteur + couleur, puis on l'eclaire comme le fait
 * le serveur web de MipMap (services/tileGenerator.py) :
 *
 *   1. teinte d'altitude par bandes : sombre + bleuté sous le niveau de la
 *      mer, un peu plus clair avec l'altitude, neigeux au sommet ;
 *   2. occlusion ambiante sur les 8 voisins (un voisin plus haut assombrit) ;
 *   3. éclairage directionnel depuis le nord-ouest (3 voisins) ;
 *   4. courbes de niveau tous les 20 blocs.
 *
 * L'éclairement est partagé avec le rendu des tuiles (`shade.js`). MipMap
 * recouvre chaque bloc de sa texture 16x16 et travaille en 16 px/bloc avec
 * une pyramide de zoom ; ici on reste en 1 px/bloc dans un seul PNG, la
 * couleur vient de la table `public/blocks.js`.
 *
 * Zero dependance : l'encodeur PNG maison s'appuie sur `zlib` (integre a
 * Node).
 */

const { encodePng } = require("./png");
const { blockColor } = require("./public/blocks");
const {
  SEA_LEVEL,
  LIGHT,
  clamp,
  altitudeShade,
  surfaceShade,
} = require("./shade");

const MAX_SIDE = Math.max(256, Number(process.env.MAP_RELIEF_MAX_SIDE || 4096));
const MAX_PIXELS = 12e6;
// Exageration verticale des ecarts de hauteur (1 = identique a MipMap).
const DEFAULT_EXAGGERATION = Number(process.env.MAP_RELIEF_EXAGGERATION || 1);

const rgbCache = new Map();

function hexToRgb(hex) {
  let out = rgbCache.get(hex);
  if (out) return out;
  out = [
    parseInt(hex.slice(1, 3), 16) || 0,
    parseInt(hex.slice(3, 5), 16) || 0,
    parseInt(hex.slice(5, 7), 16) || 0,
  ];
  rgbCache.set(hex, out);
  return out;
}

/** Bornes de chunks couvertes par une liste de chunks. */
function boundsOf(chunks) {
  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCz = Infinity;
  let maxCz = -Infinity;
  for (const c of chunks) {
    if (!c) continue;
    if (c.cx < minCx) minCx = c.cx;
    if (c.cx > maxCx) maxCx = c.cx;
    if (c.cz < minCz) minCz = c.cz;
    if (c.cz > maxCz) maxCz = c.cz;
  }
  if (!isFinite(minCx)) return null;
  return { minCx: minCx, maxCx: maxCx, minCz: minCz, maxCz: maxCz };
}

/**
 * Grille de relief : hauteur du bloc de surface + couleur, 1 pixel par bloc
 * (ou 1 pixel par cellule quand le monde depasse MAX_SIDE / MAX_PIXELS).
 * Sous-echantillonnage par hauteur maximale : on garde les reliefs visibles.
 */
function buildGrid(chunks) {
  const bounds = boundsOf(chunks);
  if (!bounds) return null;

  const baseX = bounds.minCx * 16;
  const baseZ = bounds.minCz * 16;
  const blocksW = (bounds.maxCx - bounds.minCx + 1) * 16;
  const blocksH = (bounds.maxCz - bounds.minCz + 1) * 16;

  let stride = 1;
  while (
    stride < 64 &&
    (Math.max(blocksW, blocksH) / stride > MAX_SIDE ||
      Math.ceil(blocksW / stride) * Math.ceil(blocksH / stride) > MAX_PIXELS)
  ) {
    stride += 1;
  }

  const width = Math.max(1, Math.ceil(blocksW / stride));
  const height = Math.max(1, Math.ceil(blocksH / stride));
  const y = new Float32Array(width * height);
  const r = new Uint8Array(width * height);
  const g = new Uint8Array(width * height);
  const b = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);

  for (const chunk of chunks) {
    if (!chunk || !Array.isArray(chunk.cells)) continue;
    const palette = chunk.palette || [];
    const bx0 = chunk.cx * 16 - baseX;
    const bz0 = chunk.cz * 16 - baseZ;
    for (let iz = 0; iz < 16; iz++) {
      for (let ix = 0; ix < 16; ix++) {
        const cell = chunk.cells[(iz << 4) | ix];
        if (!cell || cell.length < 2) continue;
        const blockY = cell[0];
        if (typeof blockY !== "number" || !isFinite(blockY)) continue;
        const px = Math.floor((bx0 + ix) / stride);
        const pz = Math.floor((bz0 + iz) / stride);
        if (px < 0 || pz < 0 || px >= width || pz >= height) continue;
        const di = pz * width + px;
        // Le bloc le plus haut gagne : silhouette du relief.
        if (!mask[di] || blockY > y[di]) {
          mask[di] = 1;
          y[di] = blockY;
          const rgb = hexToRgb(blockColor(palette[cell[1]] || ""));
          r[di] = rgb[0];
          g[di] = rgb[1];
          b[di] = rgb[2];
        }
      }
    }
  }

  return {
    width: width,
    height: height,
    stride: stride,
    minX: baseX,
    minZ: baseZ,
    y: y,
    r: r,
    g: g,
    b: b,
    mask: mask,
  };
}

/** Eclaire la grille (recette MipMap partagee) et renvoie un buffer RGBA. */
function shadeGrid(grid, exaggeration) {
  const width = grid.width;
  const height = grid.height;
  const stride = grid.stride;
  const y = grid.y;
  const r = grid.r;
  const g = grid.g;
  const b = grid.b;
  const mask = grid.mask;
  const rgba = Buffer.alloc(width * height * 4);
  const blueAlpha = 40 / 255; // voile bleu de MipMap (0, 30, ?, 40)

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      const o = i * 4;
      if (!mask[i]) {
        rgba[o + 3] = 0; // zone non cartographiee : transparente
        continue;
      }

      const sh = surfaceShade(grid, x, z, {
        blocksPerCell: stride,
        exaggeration: exaggeration,
      });

      // 1. luminosite par altitude
      let cr = r[i] * sh.brightness;
      let cg = g[i] * sh.brightness;
      let cb = b[i] * sh.brightness;

      // 2. teinte : bleu sous le niveau de la mer / neige au sommet
      if (sh.blue > 0) {
        const tintB = sh.blue * 80;
        cr = cr * (1 - blueAlpha);
        cg = cg * (1 - blueAlpha) + 30 * blueAlpha;
        cb = cb * (1 - blueAlpha) + tintB * blueAlpha;
      } else if (sh.snow > 0) {
        const a = Math.min(sh.snow * 0.3, 0.3);
        cr = cr * (1 - a) + 255 * a;
        cg = cg * (1 - a) + 255 * a;
        cb = cb * (1 - a) + 255 * a;
      }

      // 3. occlusion ambiante + lumiere nord-ouest, 4. courbe de niveau
      const factor = sh.ao * sh.light * sh.contour;

      rgba[o] = clamp((cr * factor) | 0, 0, 255);
      rgba[o + 1] = clamp((cg * factor) | 0, 0, 255);
      rgba[o + 2] = clamp((cb * factor) | 0, 0, 255);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/**
 * Rend le relief d'une dimension en PNG.
 * `chunks` : payloads internes de la dimension.
 * Retourne { buffer, width, height, stride, minX, minZ } ou null.
 */
function renderReliefPng(chunks, opts = {}) {
  const grid = buildGrid(chunks);
  if (!grid) return null;
  const exaggeration =
    typeof opts.exaggeration === "number" && opts.exaggeration > 0
      ? opts.exaggeration
      : DEFAULT_EXAGGERATION;
  const rgba = shadeGrid(grid, exaggeration);
  const buffer = encodePng(grid.width, grid.height, rgba);
  return {
    buffer: buffer,
    width: grid.width,
    height: grid.height,
    stride: grid.stride,
    minX: grid.minX,
    minZ: grid.minZ,
  };
}

module.exports = {
  renderReliefPng,
  buildGrid,
  boundsOf,
  shadeGrid,
  altitudeShade,
  LIGHT,
  SEA_LEVEL,
};
