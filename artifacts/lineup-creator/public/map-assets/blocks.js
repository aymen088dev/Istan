"use strict";

/** Couleurs par bloc (identifiant court, sans le "minecraft:"). */
const BLOCK_COLORS = {
  air: "#000000",
  cave_air: "#000000",
  void_air: "#000000",

  grass_block: "#7cb342",
  grass: "#71a83f",
  tall_grass: "#6d9f3c",
  fern: "#6d9f3c",
  dirt: "#8b6a45",
  coarse_dirt: "#7d5f3d",
  rooted_dirt: "#8a6746",
  mud: "#4b4038",
  podzol: "#6b4a26",
  mycelium: "#6e6070",
  farmland: "#6d5233",
  grass_path: "#b5a06a",
  dirt_path: "#b5a06a",

  stone: "#7d7d7d",
  cobblestone: "#767676",
  mossy_cobblestone: "#6b7a5a",
  bedrock: "#575757",
  deepslate: "#4c4c52",
  cobbled_deepslate: "#525257",
  tuff: "#6b6b60",
  calcite: "#e6e6de",
  gravel: "#8a8a8a",
  clay: "#a3a8b5",
  sand: "#dbd3a0",
  red_sand: "#c69a5a",
  sandstone: "#d9d0a0",
  red_sandstone: "#c08a4a",

  water: "#3d6fd4",
  flowing_water: "#3d6fd4",
  ice: "#a3cbf0",
  packed_ice: "#93bce8",
  blue_ice: "#7fb3f0",
  snow: "#f2f6f8",
  snow_layer: "#f2f6f8",
  powder_snow: "#f2f6f8",

  oak_log: "#6b5431",
  birch_log: "#d6d2c0",
  spruce_log: "#4a3a22",
  jungle_log: "#6a5a3a",
  acacia_log: "#6d6d6d",
  dark_oak_log: "#4a3826",
  oak_leaves: "#4b9c2f",
  birch_leaves: "#6f9e3f",
  spruce_leaves: "#3f7540",
  jungle_leaves: "#4b9c2f",
  acacia_leaves: "#4b9c2f",
  dark_oak_leaves: "#3d7f2a",
  mangrove_leaves: "#4b9c2f",
  azalea_leaves: "#6f9e3f",
  cactus: "#5f8a3a",
  sugar_cane: "#9ac85a",
  bamboo: "#9ac85a",
  vine: "#4b9c2f",
  lily_pad: "#4b9c2f",

  oak_planks: "#a0784a",
  spruce_planks: "#7a5a3a",
  birch_planks: "#c8b98a",
  jungle_planks: "#a0784a",
  acacia_planks: "#9a5a32",
  dark_oak_planks: "#4a3626",
  crafting_table: "#8a6a45",
  chest: "#8a6a45",

  coal_ore: "#5c5c5c",
  iron_ore: "#b0a08c",
  copper_ore: "#a87d5a",
  gold_ore: "#e6d15a",
  redstone_ore: "#c84a4a",
  lapis_ore: "#4a6fd8",
  diamond_ore: "#5ee4e4",
  emerald_ore: "#3ddc84",
  deepslate_coal_ore: "#4c4c52",
  deepslate_iron_ore: "#6b6660",
  deepslate_gold_ore: "#7a7350",
  deepslate_redstone_ore: "#7a4a4a",
  deepslate_lapis_ore: "#4a5a8a",
  deepslate_diamond_ore: "#4a8a8a",
  deepslate_emerald_ore: "#4a7a60",

  netherrack: "#6d3a3a",
  nether_bricks: "#452527",
  nether_brick_fence: "#452527",
  nether_quartz_ore: "#a89a90",
  nether_gold_ore: "#8a5a3a",
  soul_sand: "#4a3a2a",
  soul_soil: "#4a3a2a",
  glowstone: "#d8b45a",
  magma: "#c86a2a",
  crimson_nylium: "#7a2a3a",
  warped_nylium: "#2a5a5a",
  shroomlight: "#e08a4a",
  lava: "#e06a1e",
  flowing_lava: "#e06a1e",
  basalt: "#3a3a3e",
  blackstone: "#2a2a2e",

  end_stone: "#dcd9a0",
  end_stone_bricks: "#d6d2a0",
  purpur_block: "#a87fa8",
  obsidian: "#1b1430",
  crying_obsidian: "#3a2a6a",

  white_wool: "#e8e8e8",
  orange_wool: "#e07a2a",
  magenta_wool: "#b04ac8",
  light_blue_wool: "#6ac0e8",
  yellow_wool: "#e8d13a",
  lime_wool: "#7ad03a",
  pink_wool: "#e88ab0",
  gray_wool: "#4a4a4a",
  light_gray_wool: "#a0a0a0",
  cyan_wool: "#3ab0c0",
  purple_wool: "#8a3ac0",
  blue_wool: "#3a4ac0",
  brown_wool: "#7a4a2a",
  green_wool: "#4a7a3a",
  red_wool: "#b03a3a",
  black_wool: "#1a1a1a",

  terracotta: "#9a5a3a",
  white_terracotta: "#d0d0c0",
  orange_terracotta: "#a05a2a",
  concrete: "#a0a0a0",
  glass: "#c8e4f0",
  brick_block: "#9a4a3a",
  bricks: "#9a4a3a",
  stone_bricks: "#7d7d7d",
  mossy_stone_bricks: "#6b7a5a",
  smooth_stone: "#8a8a8a",
  quartz_block: "#e8e4dc",
  glowstone_block: "#d8b45a",
  sea_lantern: "#b0d8d0",
  prismarine: "#5a9a9a",
  dark_prismarine: "#3a6a6a",
  sponge: "#c8c84a",
  hay_block: "#b0a03a",
  dried_kelp_block: "#4a5a2a",
  melon: "#7ab03a",
  pumpkin: "#c88a2a",
  carrots: "#c88a2a",
  wheat: "#b0a03a",
};

/** Couleur de repli deterministe pour un bloc inconnu. */
function fallbackColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 22, 42 + (Math.abs(hash >> 8) % 18));
}

function hslToHex(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n) =>
    Math.round(255 * (ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  const to2 = (v) => v.toString(16).padStart(2, "0");
  return "#" + to2(f(0)) + to2(f(8)) + to2(f(4));
}

const colorCache = new Map();

function blockColor(id) {
  let color = colorCache.get(id);
  if (color) return color;
  const short = id.includes(":") ? id.split(":")[1] : id;
  color = BLOCK_COLORS[short] || BLOCK_COLORS[id] || fallbackColor(short);
  colorCache.set(id, color);
  return color;
}

// Le serveur Node reutilise exactement la meme table de couleurs pour le
// rendu de relief (public/blocks.js est charge comme script dans le
// navigateur, et comme module cote serveur).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { BLOCK_COLORS, blockColor, fallbackColor };
}
