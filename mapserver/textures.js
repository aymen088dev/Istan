"use strict";

/* ------------------------------------------------------------------ */
/*  Banque de textures de blocs                                        */
/* ------------------------------------------------------------------ */
/*
 * Deux sources sont fusionnees :
 *
 *   1. les textures de MipMap (MIT) deja presentes, nommage "Java" ;
 *   2. la banque officielle Bedrock 1.26.50 (Mojang/bedrock-samples,
 *      resource_pack/textures/blocks), nommage Bedrock, ~730 fichiers
 *      supplementaires (feuilles, deepslate, cuivre, cerisier, pale oak...).
 *
 * `assets/bedrock_blocks.json` (genere depuis `blocks.json` +
 * `terrain_texture.json` de ce resource pack) donne pour chaque bloc
 * Bedrock la texture exacte de sa face superieure : c'est la resolution la
 * plus fiable, utilisee en priorite. A defaut on retombe sur les nommages
 * derives (`_fence`, `_wall`, `_slab`...) puis sur une couleur unie, jamais
 * sur le damier magenta.
 *
 * Les images peuvent etre des PNG (decodeur maison) ou des TGA (types 2/10,
 * 24/32 bits, 8 bits palette) quand le resource pack n'en fournit pas de PNG.
 */

const fs = require("fs");
const path = require("path");

const { decodePng, decodeTga } = require("./png");
const { blockColor } = require("./public/blocks");

const TEXTURES_DIR =
  process.env.MAP_TEXTURES_DIR ||
  path.join(__dirname, "assets", "textures", "blocks");
const BEDROCK_MAP_FILE = path.join(__dirname, "assets", "bedrock_blocks.json");
const BLOCK = 16; // taille de reference d'une texture de bloc

// Suffixes de blocs derives : on retombe sur leur materiau de base.
const DERIVED_SUFFIX = /(_fence_gate|_fence|_trapdoor|_door|_wall|_stairs|_slab|_pane|_bars|_carpet|_button|_pressure_plate)$/;

// Renommages connus (nom de bloc Bedrock -> fichier de texture).
const ALIASES = {
  grass_path: "dirt_path",
  reeds: "sugar_cane",
  tall_grass: "short_grass",
  wooden_door: "oak_door",
  fence_gate: "oak_fence_gate",
  lit_furnace: "furnace",
  burning_furnace: "furnace",
  redstone_wire: "redstone_dust",
  wooden_slab: "oak_slab",
  wooden_stairs: "oak_stairs",
  torchfire: "torch",
};

/*
 * Teintes des textures "masque" (grises) du pack Bedrock.
 *
 * Certaines textures ne sont pas colorées : le moteur les multiplie par une
 * couleur (eau, herbe, feuilles, poudre de redstone). Prises telles quelles
 * elles donnent des blocs **gris** (l'eau notamment). On applique donc la
 * teinte par défaut du jeu (les valeurs classiques : eau #3F76E4, herbe
 * #91BD59, feuillage #77AB2F, redstone rouge).
 */
const WATER_TINT = [63, 118, 228]; // #3F76E4
const GRASS_TINT = [145, 189, 89]; // #91BD59
const FOLIAGE_TINT = [119, 171, 47]; // #77AB2F
const REDSTONE_TINT = [255, 0, 0];

const TINTS = {
  water_still_grey: WATER_TINT,
  water_flow_grey: WATER_TINT,
  grass_top: GRASS_TINT,
  grass_side_carried: GRASS_TINT,
  grass_carried_top: GRASS_TINT,
  tallgrass: GRASS_TINT,
  tallgrass_carried: GRASS_TINT,
  double_plant_grass_top: GRASS_TINT,
  double_plant_fern_top: GRASS_TINT,
  fern: GRASS_TINT,
  fern_carried: GRASS_TINT,
  vine: FOLIAGE_TINT,
  waterlily: FOLIAGE_TINT,
  leaf_litter: FOLIAGE_TINT,
  bush: FOLIAGE_TINT,
  redstone_dust_cross: REDSTONE_TINT,
  redstone_dust_line: REDSTONE_TINT,
  redstone_dust_dot: REDSTONE_TINT,
};

let available = null; // Map nom sans extension -> nom de fichier
let bedrockMap = null; // bloc Bedrock -> nom sans extension

/** Index de la banque : nom sans extension -> fichier (PNG prioritaire). */
function availableTextures() {
  if (available) return available;
  available = new Map();
  try {
    for (const file of fs.readdirSync(TEXTURES_DIR)) {
      if (!file.endsWith(".png") && !file.endsWith(".tga")) continue;
      if (file.includes("_mers")) continue; // specular maps, inutiles ici
      const ext = path.extname(file);
      const base = file.slice(0, -ext.length);
      const prev = available.get(base);
      if (!prev || (prev.endsWith(".tga") && ext === ".png")) {
        available.set(base, file);
      }
    }
  } catch (err) {
    console.warn(`[map] dossier de textures illisible : ${TEXTURES_DIR} (${err.message})`);
  }
  return available;
}

/** Table Bedrock officielle : nom de bloc -> texture de la face du dessus. */
function bedrockBlocks() {
  if (bedrockMap) return bedrockMap;
  bedrockMap = new Map();
  try {
    const map = JSON.parse(fs.readFileSync(BEDROCK_MAP_FILE, "utf8"));
    for (const [name, file] of Object.entries(map)) bedrockMap.set(name, file);
  } catch (err) {
    console.warn(`[map] table Bedrock illisible : ${BEDROCK_MAP_FILE} (${err.message})`);
  }
  return bedrockMap;
}

/** Noms candidats pour un bloc, du plus precis au plus generique. */
function candidates(slug) {
  const out = [slug];
  const m = slug.match(DERIVED_SUFFIX);
  if (m) {
    const base = slug.slice(0, -m[1].length);
    out.push(base, base + "_planks", base + "s", base + "_block");
  }
  out.push(slug + "_block", slug + "_top", slug + "_side");
  const alias = ALIASES[slug];
  if (alias) out.push(alias);
  return out;
}

const resolved = new Map(); // slug -> nom de fichier | null
const synthesized = new Set(); // blocs sans texture : couleur unie
const cache = new Map(); // nom de fichier -> Buffer(16*16*4)
const scaledCache = new Map(); // "fichier@px" -> Buffer(px*px*4)

/** Nom de fichier de texture a utiliser pour un bloc, ou null. */
function resolveFile(blockName) {
  const slug = String(blockName || "").replace(/^minecraft:/, "");
  if (resolved.has(slug)) return resolved.get(slug);
  const files = availableTextures();
  let found = null;

  const official = bedrockBlocks().get(slug);
  if (official && files.has(official)) found = files.get(official);

  if (!found) {
    for (const candidate of candidates(slug)) {
      if (files.has(candidate)) {
        found = files.get(candidate);
        break;
      }
    }
  }

  resolved.set(slug, found);
  return found;
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) || 0,
    parseInt(hex.slice(3, 5), 16) || 0,
    parseInt(hex.slice(5, 7), 16) || 0,
  ];
}

/** Texture unie 16x16 a partir de la couleur du bloc (jamais magenta). */
function colorTexture(blockName) {
  const rgb = hexToRgb(blockColor(blockName));
  const buf = Buffer.alloc(BLOCK * BLOCK * 4);
  for (let i = 0; i < BLOCK * BLOCK; i++) {
    buf[i * 4] = rgb[0];
    buf[i * 4 + 1] = rgb[1];
    buf[i * 4 + 2] = rgb[2];
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

/** Decode une texture PNG ou TGA. */
function decodeImage(file, buffer) {
  return file.endsWith(".tga") ? decodeTga(buffer) : decodePng(buffer);
}

/** Multiplie une texture par la teinte du jeu (textures "masque" grises). */
function applyTint(data, tint) {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = (data[i] * tint[0] + 127) / 255;
    out[i + 1] = (data[i + 1] * tint[1] + 127) / 255;
    out[i + 2] = (data[i + 2] * tint[2] + 127) / 255;
    out[i + 3] = data[i + 3];
  }
  return out;
}

/** Recadre la premiere image d'une texture (bandes animees des texture packs). */
function firstFrame(img) {
  const w = Math.min(img.width, BLOCK);
  const h = Math.min(img.height, BLOCK);
  if (w === img.width && h === img.height) return img.data;
  const out = Buffer.alloc(BLOCK * BLOCK * 4);
  for (let y = 0; y < h; y++) {
    const src = y * img.width * 4;
    img.data.copy(out, y * BLOCK * 4, src, src + w * 4);
  }
  return out;
}

/**
 * Texture 16x16 RGBA d'un bloc : le fichier resolu, sinon une couleur unie.
 * Ne renvoie jamais null.
 */
function textureFor(blockName) {
  const file = resolveFile(blockName);
  if (!file) {
    const slug = String(blockName || "").replace(/^minecraft:/, "");
    if (!synthesized.has(slug)) {
      synthesized.add(slug);
      if (synthesized.size <= 12) {
        console.warn(`[map] pas de texture pour "${slug}" : couleur du bloc utilisee`);
      }
    }
    return colorTexture(blockName);
  }
  if (cache.has(file)) return cache.get(file);
  let data = null;
  try {
    data = firstFrame(decodeImage(file, fs.readFileSync(path.join(TEXTURES_DIR, file))));
    const tint = TINTS[file.replace(/\.(png|tga)$/, "")];
    if (tint) data = applyTint(data, tint);
  } catch (err) {
    console.warn(`[map] texture illisible : ${file} (${err.message})`);
  }
  if (!data) data = colorTexture(blockName);
  cache.set(file, data);
  return data;
}

/**
 * Texture reduite/agrandie a `px` pixels de cote (moyenne de boite en
 * reduction, plus proche voisin en agrandissement). Mise en cache.
 */
function scaledTexture(blockName, px) {
  const file = resolveFile(blockName);
  const key = (file || "color:" + String(blockName || "").replace(/^minecraft:/, "")) + "@" + px;
  const hit = scaledCache.get(key);
  if (hit) return hit;

  const src = textureFor(blockName);
  const out = Buffer.alloc(px * px * 4);

  if (px === BLOCK) {
    out.set(src);
  } else if (px > BLOCK) {
    for (let y = 0; y < px; y++) {
      const sy = Math.min(BLOCK - 1, Math.floor((y * BLOCK) / px));
      for (let x = 0; x < px; x++) {
        const sx = Math.min(BLOCK - 1, Math.floor((x * BLOCK) / px));
        const s = (sy * BLOCK + sx) * 4;
        const o = (y * px + x) * 4;
        out[o] = src[s];
        out[o + 1] = src[s + 1];
        out[o + 2] = src[s + 2];
        out[o + 3] = src[s + 3];
      }
    }
  } else {
    for (let y = 0; y < px; y++) {
      const y0 = Math.floor((y * BLOCK) / px);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * BLOCK) / px));
      for (let x = 0; x < px; x++) {
        const x0 = Math.floor((x * BLOCK) / px);
        const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * BLOCK) / px));
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            const s = (sy * BLOCK + sx) * 4;
            r += src[s];
            g += src[s + 1];
            b += src[s + 2];
            a += src[s + 3];
            n += 1;
          }
        }
        const o = (y * px + x) * 4;
        out[o] = Math.round(r / n);
        out[o + 1] = Math.round(g / n);
        out[o + 2] = Math.round(b / n);
        out[o + 3] = Math.round(a / n);
      }
    }
  }

  scaledCache.set(key, out);
  return out;
}

function stats() {
  return {
    dir: TEXTURES_DIR,
    available: availableTextures().size,
    bedrock: bedrockBlocks().size,
    loaded: cache.size,
    scaled: scaledCache.size,
    resolved: resolved.size,
    colorOnly: synthesized.size,
  };
}

function clear() {
  cache.clear();
  scaledCache.clear();
  resolved.clear();
  synthesized.clear();
  available = null;
  bedrockMap = null;
}

module.exports = {
  TEXTURES_DIR,
  BLOCK,
  textureFor,
  scaledTexture,
  resolveFile,
  candidates,
  stats,
  clear,
};
