"use strict";

/* ------------------------------------------------------------------ */
/*  Compatibilite MipMap (plugin Endstone / LeviLamina)                */
/* ------------------------------------------------------------------ */
/*
 * Le plugin MipMap (github.com/MipaSenpai/MipMap) POST deux payloads vers
 * une URL libre definie dans plugins/mipmap/config.toml :
 *
 *   api.chunks  -> http://.../api/chunks-data
 *   api.players -> http://.../api/players-data
 *
 * Il exige une reponse HTTP 200, sinon il journalise une erreur par chunk.
 *
 * Payload chunks :
 *   { "chunk": { "dimension": "Overworld",
 *                "blocks": [ { "name": "minecraft:grass_block",
 *                               "coordinates": [x, y, z] }, ... ] } }
 *
 * Un bloc par colonne (surface, hors blocs "blacklist" du plugin), 256 par
 * chunk. Le plugin n'envoie PAS les coordonnees du chunk : on les deduit des
 * coordonnees de blocs.
 *
 * Payload joueurs :
 *   { "players": [ { "name", "xuid", "skin" (PNG hex), "skinShape",
 *                    "dimension", "x", "y", "z" } ] }
 *
 * Ce module est volontairement sans dependance et sans I/O : il transforme les
 * payloads MipMap en notre format interne (palette + cells, 256 entrees).
 */

const DIMENSIONS = {
  overworld: "minecraft:overworld",
  world: "minecraft:overworld",
  main: "minecraft:overworld",
  nether: "minecraft:nether",
  thenether: "minecraft:nether",
  theend: "minecraft:the_end",
  end: "minecraft:the_end",
};

/**
 * "Overworld" / "The End" / "minecraft:nether" -> identifiant canonique.
 * Inconnu -> "minecraft:<slug>" pour ne jamais perdre la dimension.
 */
function normalizeDimension(name) {
  const raw = String(name == null ? "" : name).trim();
  if (!raw) return DIMENSIONS.overworld;
  const key = raw
    .toLowerCase()
    .replace(/^minecraft:/, "")
    .replace(/[\s_-]/g, "");
  if (DIMENSIONS[key]) return DIMENSIONS[key];
  const slug = raw.toLowerCase().replace(/^minecraft:/, "").replace(/[^a-z0-9_]/g, "_");
  return "minecraft:" + (slug || "overworld");
}

/** Libelle lisible pour l'interface. */
function dimensionLabel(id) {
  return String(id || "").replace(/^minecraft:/, "") || "monde";
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Convertit un payload MipMap en 0..N chunks internes.
 * Retourne { payloads, dim } ou { error }.
 *
 * Un chunk MipMap peut en théorie déborder sur plusieurs chunks 16x16 : on
 * regroupe donc par (x >> 4, z >> 4) au lieu de faire confiance à l'alignement.
 */
function chunksFromMipmap(body) {
  const chunk = body && typeof body === "object" ? body.chunk : null;
  if (!chunk || typeof chunk !== "object") {
    return { error: "champ 'chunk' manquant" };
  }
  const blocks = chunk.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { error: "'chunk.blocks' vide ou invalide" };
  }
  if (blocks.length > 4096) {
    return { error: "'chunk.blocks' trop volumineux" };
  }

  const dim = normalizeDimension(chunk.dimension);
  const groups = new Map();

  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      return { error: "entree de bloc invalide" };
    }
    const name = typeof block.name === "string" ? block.name : "";
    const coords = block.coordinates;
    if (!name || !Array.isArray(coords) || coords.length < 3) {
      return { error: "bloc sans nom ou sans coordonnees" };
    }
    const [x, y, z] = coords;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
      return { error: "coordonnees non finies" };
    }

    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const key = cx + "," + cz;
    let group = groups.get(key);
    if (!group) {
      group = { cx: cx, cz: cz, cols: new Map() };
      groups.set(key, group);
    }
    const index = (z - cz * 16) * 16 + (x - cx * 16);
    const prev = group.cols.get(index);
    // MipMap n'envoie que la surface, mais on garde le plus haut si jamais
    // deux blocs tombent dans la meme colonne.
    if (prev === undefined || y > prev.y) {
      group.cols.set(index, { y: y, name: name });
    }
  }

  const payloads = [];
  for (const group of groups.values()) {
    const palette = [];
    const paletteIndex = new Map();
    const cells = new Array(256);
    let filled = 0;

    for (let i = 0; i < 256; i++) {
      const col = group.cols.get(i);
      if (!col) {
        cells[i] = [];
        continue;
      }
      let idx = paletteIndex.get(col.name);
      if (idx === undefined) {
        idx = palette.length;
        paletteIndex.set(col.name, idx);
        palette.push(col.name);
      }
      cells[i] = [col.y, idx];
      filled += 1;
    }

    if (!filled) continue;
    payloads.push({
      v: 1,
      dim: dim,
      cx: group.cx,
      cz: group.cz,
      depth: 1, // MipMap n'envoie que la surface : pas de parois a dessiner
      palette: palette,
      cells: cells,
    });
  }

  if (!payloads.length) return { error: "aucun bloc exploitable" };
  return { payloads: payloads, dim: dim };
}

/**
 * Convertit un payload joueurs MipMap en liste normalisee.
 * Retourne { players } ou { error }.
 */
function playersFromMipmap(body) {
  const list = body && typeof body === "object" ? body.players : null;
  if (!Array.isArray(list)) return { error: "champ 'players' manquant" };
  if (list.length > 512) return { error: "trop de joueurs" };

  const now = Date.now();
  const players = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) continue;
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.z)) {
      continue;
    }
    players.push({
      name: name,
      xuid: raw.xuid == null ? null : raw.xuid,
      dimension: normalizeDimension(raw.dimension),
      x: raw.x,
      y: raw.y,
      z: raw.z,
      skin: typeof raw.skin === "string" ? raw.skin : "",
      skinShape: Array.isArray(raw.skinShape) ? raw.skinShape.slice(0, 3) : null,
      ts: now,
    });
  }
  return { players: players };
}

module.exports = {
  DIMENSIONS,
  normalizeDimension,
  dimensionLabel,
  chunksFromMipmap,
  playersFromMipmap,
};