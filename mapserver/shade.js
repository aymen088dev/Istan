"use strict";

/* ------------------------------------------------------------------ */
/*  Eclairage "facon MipMap" (partage relief / tuiles)                 */
/* ------------------------------------------------------------------ */
/*
 * Reprend la recette du generateur de tuiles de MipMap
 * (webmap/services/tileGenerator.py) : bandes d'altitude, occlusion
 * ambiante sur 8 voisins, lumiere directionnelle nord-ouest et courbe de
 * niveau tous les 20 blocs. Le relief vu de dessus et les tuiles de carte
 * partagent ce module pour rester coherents.
 */

const SEA_LEVEL = 63;
const MIN_HEIGHT = -64;
const MAX_HEIGHT = 320;
const CONTOUR_EVERY = 20; // courbe de niveau tous les N blocs
const CONTOUR_ALPHA = 30; // voile noir (alpha 0..255) pose par MipMap

// Direction de la lumiere : nord-ouest (voisins -x / -z).
const LIGHT = [-1, -1];

const NEIGH8 = [];
for (let dz = -1; dz <= 1; dz++) {
  for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dz === 0) continue;
    NEIGH8.push([dx, dz]);
  }
}
const NEIGH_LIGHT = [
  [LIGHT[0], LIGHT[1]],
  [LIGHT[0], 0],
  [0, LIGHT[1]],
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Teinte d'altitude (bandes de MipMap) :
 *   y < 63  -> assombri + tire vers le bleu (profondeur)
 *   y < 100 -> 0.9
 *   y < 150 -> 0.9 .. 1.1
 *   y >=150 -> 1.2 .. 1.5, blanc au-dessus de 200
 */
function altitudeShade(h) {
  if (h < SEA_LEVEL) {
    const depth = clamp((SEA_LEVEL - h) / (SEA_LEVEL - MIN_HEIGHT), 0, 1);
    return { brightness: 0.3 + (1 - depth) * 0.5, blue: depth, snow: 0 };
  }
  if (h < 100) return { brightness: 0.9, blue: 0, snow: 0 };
  if (h < 150) return { brightness: 0.9 + ((h - 100) / 50) * 0.2, blue: 0, snow: 0 };
  const mountain = (h - 150) / (MAX_HEIGHT - 150);
  const snow = h > 200 ? Math.min(mountain * 0.4, 0.4) : 0;
  return { brightness: 1.2 + mountain * 0.3, blue: 0, snow: snow };
}

/** Voile noir des courbes de niveau (facteur multiplicatif). */
function contourFactor(h) {
  const isContour = h > MIN_HEIGHT && Math.abs(h % CONTOUR_EVERY) < 1e-6;
  return isContour ? 1 - CONTOUR_ALPHA / 255 : 1;
}

/**
 * Occlusion ambiante (8 voisins) + lumiere directionnelle nord-ouest.
 * `blocksPerCell` normalise les ecarts quand une cellule couvre plusieurs
 * blocs (sous-echantillonnage).
 */
function neighborShade(grid, x, z, blocksPerCell, exaggeration) {
  const width = grid.width;
  const height = grid.height;
  const y = grid.y;
  const mask = grid.mask;
  const i = z * width + x;
  const h = y[i];
  const e = exaggeration;
  const scale = blocksPerCell > 0 ? blocksPerCell : 1;

  let occlusion = 0;
  let valid = 0;
  for (let n = 0; n < NEIGH8.length; n++) {
    const nx = x + NEIGH8[n][0];
    const nz = z + NEIGH8[n][1];
    if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
    const ni = nz * width + nx;
    if (!mask[ni]) continue;
    const diff = ((y[ni] - h) * e) / scale;
    if (diff > 0) occlusion += Math.min(diff / 10, 0.15);
    else if (diff < 0) occlusion -= Math.min(-diff / 20, 0.05);
    valid += 1;
  }
  if (valid > 0) occlusion /= valid;
  const ao = clamp(1 - occlusion, 0.6, 1.2);

  let shadow = 0;
  for (let n = 0; n < NEIGH_LIGHT.length; n++) {
    const nx = x + NEIGH_LIGHT[n][0];
    const nz = z + NEIGH_LIGHT[n][1];
    if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
    const ni = nz * width + nx;
    if (!mask[ni]) continue;
    const diff = ((y[ni] - h) * e) / scale;
    if (diff > 0) shadow += Math.min(diff / 8, 0.2);
  }
  const light = Math.max(0.7, 1 - shadow / NEIGH_LIGHT.length);
  return { ao: ao, light: light };
}

/**
 * Eclairage complet d'une cellule (bloc ou groupe de blocs).
 * Retourne les composantes dans l'ordre d'application de MipMap :
 * brightness, puis teinte (blue|snow), puis ao, puis light, puis contour.
 */
function surfaceShade(grid, x, z, opts = {}) {
  const blocksPerCell = opts.blocksPerCell || 1;
  const exaggeration = opts.exaggeration || 1;
  const h = grid.y[z * grid.width + x];
  const band = altitudeShade(h);
  const nb = neighborShade(grid, x, z, blocksPerCell, exaggeration);
  return {
    height: h,
    brightness: band.brightness,
    blue: band.blue,
    snow: band.snow,
    ao: nb.ao,
    light: nb.light,
    contour: contourFactor(h),
  };
}

module.exports = {
  SEA_LEVEL,
  MIN_HEIGHT,
  MAX_HEIGHT,
  CONTOUR_EVERY,
  CONTOUR_ALPHA,
  LIGHT,
  NEIGH8,
  NEIGH_LIGHT,
  clamp,
  altitudeShade,
  contourFactor,
  neighborShade,
  surfaceShade,
};
