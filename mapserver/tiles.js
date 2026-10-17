"use strict";

/* ------------------------------------------------------------------ */
/*  Tuiles de carte "facon MipMap" (rendu cote serveur)                */
/* ------------------------------------------------------------------ */
/*
 * MipMap pre-genere des tuiles 256x256 a 16 px/bloc (zoom-4) puis construit
 * la pyramide de zoom par reduction. Ici on rend la tuile demandee a la
 * volee depuis les chunks stockes : chaque bloc est recouvert de sa texture
 * (`textures.js`) et eclaire avec la recette MipMap (`shade.js`).
 *
 * Conventions (identiques a MipMap / Leaflet CRS.Simple) :
 *   - zoom 4 -> 16 blocs par tuile, 16 px/bloc ;
 *   - zoom 0 -> 256 blocs par tuile, 1 px/bloc ;
 *   - la tuile (tx, ty) couvre les blocs [tx*B, tx*B + B) x [ty*B, ty*B + B).
 */

const { encodePng } = require("./png");
const { surfaceShade } = require("./shade");
const { scaledTexture } = require("./textures");

const CHUNK = 16;
const TILE_SIZE = 256;
const MAX_ZOOM = 4;
const MIN_ZOOM = 0;
const BLOCKS_AT_MAX_ZOOM = 16;
const DEFAULT_EXAGGERATION = Number(process.env.MAP_RELIEF_EXAGGERATION || 1);

const CHUNK_OFFSET = 1 << 19; // demi-fenetre : ±524288 chunks
const CHUNK_SPAN = 1 << 20;

/** Cle numerique (cx, cz) sans collision, y compris en negatif. */
function chunkKey(cx, cz) {
  return (cx + CHUNK_OFFSET) * CHUNK_SPAN + (cz + CHUNK_OFFSET);
}

/** Nombre de blocs couverts par une tuile a ce zoom (16 .. 256). */
function blocksPerTile(zoom) {
  return BLOCKS_AT_MAX_ZOOM * Math.pow(2, MAX_ZOOM - zoom);
}

/** Nombre de pixels par bloc a ce zoom (16 .. 1). */
function pixelsPerBlock(zoom) {
  return TILE_SIZE / blocksPerTile(zoom);
}

/**
 * Rend une tuile PNG depuis les chunks couvrant la zone.
 * Retourne { buffer, mapped, blocks, pixelsPerBlock } ou null si la zone
 * n'est pas cartographiee (aucun bloc).
 */
function renderTilePng(chunks, options = {}) {
  const zoom = Number(options.zoom);
  if (!Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
    return null;
  }
  const tx = Number(options.tx);
  const ty = Number(options.ty);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;

  const exaggeration =
    typeof options.exaggeration === "number" && options.exaggeration > 0
      ? options.exaggeration
      : DEFAULT_EXAGGERATION;

  const blocks = blocksPerTile(zoom);
  const px = pixelsPerBlock(zoom);
  const bx0 = tx * blocks;
  const bz0 = ty * blocks;

  // Index des chunks fournis : coordonnees de chunk -> payload.
  // Cle numerique sans collision sur ±524288 chunks (±8,4 M de blocs), donc
  // valable aussi pour les coordonnees negatives (l'ancien `& 0xff` faisait
  // se recouvrir cz = -1 et cz = 255, d'ou des tuiles fausses ou vides).
  const byChunk = new Map();
  for (const chunk of chunks) {
    if (chunk) byChunk.set(chunkKey(chunk.cx, chunk.cz), chunk);
  }

  const width = blocks;
  const height = blocks;
  const y = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);
  const names = new Array(width * height); // nom du bloc de surface
  let mapped = 0;

  for (let iz = 0; iz < blocks; iz++) {
    const bz = bz0 + iz;
    for (let ix = 0; ix < blocks; ix++) {
      const bx = bx0 + ix;
      const chunk = byChunk.get(chunkKey(Math.floor(bx / CHUNK), Math.floor(bz / CHUNK)));
      if (!chunk || !Array.isArray(chunk.cells)) continue;
      const cell = chunk.cells[((bz & 15) << 4) | (bx & 15)];
      if (!cell || cell.length < 2) continue;
      const blockY = cell[0];
      if (typeof blockY !== "number" || !isFinite(blockY)) continue;
      const i = iz * width + ix;
      y[i] = blockY;
      mask[i] = 1;
      names[i] = chunk.palette ? chunk.palette[cell[1]] : null;
      mapped += 1;
    }
  }

  if (!mapped) return null;

  const grid = { width: width, height: height, y: y, mask: mask };
  const rgba = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
  const blueAlpha = 40 / 255;

  for (let iz = 0; iz < blocks; iz++) {
    for (let ix = 0; ix < blocks; ix++) {
      const i = iz * width + ix;
      if (!mask[i]) continue;

      const sh = surfaceShade(grid, ix, iz, {
        blocksPerCell: 1,
        exaggeration: exaggeration,
      });
      const tex = scaledTexture(names[i], px);
      const factor = sh.ao * sh.light * sh.contour;

      let tintBlue = 0;
      let tintSnow = 0;
      if (sh.blue > 0) tintBlue = sh.blue * 80;
      else if (sh.snow > 0) tintSnow = Math.min(sh.snow * 0.3, 0.3);

      const px0 = ix * px;
      const pz0 = iz * px;
      for (let pz = 0; pz < px; pz++) {
        const rowOff = (pz0 + pz) * TILE_SIZE;
        for (let px2 = 0; px2 < px; px2++) {
          const t = (pz * px + px2) * 4;
          let r = tex[t] * sh.brightness;
          let g = tex[t + 1] * sh.brightness;
          let b = tex[t + 2] * sh.brightness;

          if (tintBlue > 0) {
            r *= 1 - blueAlpha;
            g = g * (1 - blueAlpha) + 30 * blueAlpha;
            b = b * (1 - blueAlpha) + tintBlue * blueAlpha;
          } else if (tintSnow > 0) {
            r = r * (1 - tintSnow) + 255 * tintSnow;
            g = g * (1 - tintSnow) + 255 * tintSnow;
            b = b * (1 - tintSnow) + 255 * tintSnow;
          }

          r *= factor;
          g *= factor;
          b *= factor;

          const o = (rowOff + px0 + px2) * 4;
          rgba[o] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
          rgba[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
          rgba[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
          rgba[o + 3] = tex[t + 3];
        }
      }
    }
  }

  return {
    buffer: encodePng(TILE_SIZE, TILE_SIZE, rgba),
    mapped: mapped,
    blocks: blocks,
    pixelsPerBlock: px,
  };
}

module.exports = {
  renderTilePng,
  blocksPerTile,
  pixelsPerBlock,
  CHUNK,
  TILE_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
};
