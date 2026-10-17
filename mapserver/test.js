"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp, MapStore } = require("./server");
const { normalizeDimension, chunksFromMipmap, playersFromMipmap } = require("./mipmap");
const { encodePng, decodePng, decodeTga } = require("./png");
const { renderReliefPng } = require("./relief");
const { blockColor } = require("./public/blocks");
const { scaledTexture, resolveFile } = require("./textures");

/** Chunk uniforme : toutes les colonnes a la hauteur `y` (herbe). */
function flatChunk(cx, cz, y) {
  const cells = new Array(256);
  for (let i = 0; i < 256; i++) cells[i] = [y, 0];
  return {
    v: 1,
    dim: "overworld",
    cx: cx,
    cz: cz,
    depth: 1,
    palette: ["minecraft:grass_block"],
    cells: cells,
  };
}

function pixelAt(img, x, z) {
  const o = (z * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
}

function rgbOf(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function near(actual, expected, tol = 1) {
  return actual.every((v, i) => Math.abs(v - expected[i]) <= tol);
}

function sampleChunk(cx, cz) {
  const cells = [];
  for (let i = 0; i < 256; i++) {
    const y = 64 + ((i * 7) % 9);
    cells.push([y, 1, y - 1, 0, y - 2, 0, y - 3, 0]);
  }
  return {
    v: 1,
    dim: "overworld",
    cx: cx,
    cz: cz,
    depth: 4,
    palette: ["minecraft:stone", "minecraft:grass_block"],
    cells: cells,
  };
}

async function req(base, pathname, options = {}) {
  const res = await fetch(base + pathname, options);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body: body };
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mapserver-"));
  const dataFile = path.join(tmpDir, "chunks.ndjson");

  const app = createApp({
    dataFile: dataFile,
    apiKey: "secret",
    publicDir: path.join(__dirname, "public"),
  });

  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + app.server.address().port;

  const payload = sampleChunk(0, 0);

  // 0. helpers de compatibilite MipMap
  assert.strictEqual(normalizeDimension("Overworld"), "minecraft:overworld");
  assert.strictEqual(normalizeDimension("The End"), "minecraft:the_end");
  assert.strictEqual(normalizeDimension("TheEnd"), "minecraft:the_end");
  assert.strictEqual(normalizeDimension("minecraft:nether"), "minecraft:nether");
  assert.strictEqual(normalizeDimension(undefined), "minecraft:overworld");
  assert.strictEqual(chunksFromMipmap({}).error, "champ 'chunk' manquant");
  assert.strictEqual(playersFromMipmap({}).error, "champ 'players' manquant");

  // 1. ecriture sans cle -> refuse
  let r = await req(base, "/api/chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(r.status, 401, "ecriture sans cle doit etre refusee");

  // 2. mauvaise cle -> refuse
  r = await req(base, "/api/chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": "nope" },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(r.status, 401, "mauvaise cle doit etre refusee");

  // 3. bonne cle -> accepte
  r = await req(base, "/api/chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": "secret" },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(r.status, 200, "ecriture acceptee");
  assert.strictEqual(r.body.ok, true);

  // 4. payload invalide -> 422
  r = await req(base, "/api/chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": "secret" },
    body: JSON.stringify({ dim: "overworld", cx: 1 }),
  });
  assert.strictEqual(r.status, 422, "payload invalide refuse");

  // 5. statuts
  r = await req(base, "/api/status");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.chunks, 1, "un chunk en memoire");
  assert.strictEqual(r.body.tile_size, 8);
  assert.deepStrictEqual(r.body.dimensions, ["overworld"]);

  // 6. meta
  r = await req(base, "/api/meta?dim=overworld");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.count, 1);
  assert.ok(r.body.y_max >= r.body.y_min, "bornes Y coherentes");

  // 7. tile
  r = await req(base, "/api/tile/overworld/0/0");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.chunks.length, 1);

  // 8. tile absente -> vide
  r = await req(base, "/api/tile/overworld/99/99");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.chunks.length, 0);

  // 9. chunk individuel
  r = await req(base, "/api/chunk/overworld/0/0");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.cx, 0);

  // 10. plage
  r = await req(base, "/api/chunks?dim=overworld&cx0=-1&cz0=-1&cx1=1&cz1=1");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.chunks.length, 1);

  // 11. statique : "/" sert l'interface MipMap vendoree, /static ses assets
  r = await req(base, "/");
  assert.strictEqual(r.status, 200, "index servi");
  assert.ok(/<!doctype html>/i.test(String(r.body)), "index HTML");
  assert.ok(String(r.body).includes("static/js/map.js"), "interface MipMap servie");

  r = await req(base, "/static/css/style.css");
  assert.strictEqual(r.status, 200, "asset MipMap servi");

  r = await req(base, "/styles.css");
  assert.strictEqual(r.status, 200);

  // 12. traversal refuse
  r = await req(base, "/../server.js");
  assert.ok(r.status === 403 || r.status === 404, "traversal bloque, got " + r.status);

  // 13. methode inconnue
  r = await req(base, "/api/status", { method: "DELETE" });
  assert.strictEqual(r.status, 405);

  // 14. persistance
  await app.store.close();
  app.server.close();

  const reloaded = new MapStore({ dataFile: dataFile });
  assert.strictEqual(reloaded.chunks.size, 1, "reload depuis ndjson");
  assert.ok(reloaded.get("overworld", 0, 0), "chunk relue");
  await reloaded.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // ------------------------------------------------------------------
  // Compatibilite MipMap : c'est exactement ce que le plugin poste.
  // ------------------------------------------------------------------
  const mipmapApp = createApp({
    dataFile: path.join(tmpDir, "mipmap.ndjson"),
    apiKey: "",
    publicDir: path.join(__dirname, "public"),
  });
  await new Promise((resolve) => mipmapApp.server.listen(0, "127.0.0.1", resolve));
  const mipBase = "http://127.0.0.1:" + mipmapApp.server.address().port;

  // 15. payload chunks brut, tel qu'envoye par le plugin Endstone
  const blocks = [];
  for (let i = 0; i < 256; i++) {
    const x = 16 + (i % 16);
    const z = 32 + Math.floor(i / 16);
    blocks.push({
      name: i % 2 ? "minecraft:grass_block" : "minecraft:stone",
      coordinates: [x, 64 + (i % 3), z],
    });
  }
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunk: { dimension: "Overworld", blocks: blocks } }),
  });
  assert.strictEqual(r.status, 200, "le plugin exige HTTP 200");
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.created, 1);

  // 16. le chunk est range et lisible par l'UI (format interne)
  const stored = mipmapApp.store.get("minecraft:overworld", 1, 2);
  assert.ok(stored, "chunk (1,2) stocke");
  assert.strictEqual(stored.cells.length, 256);
  assert.deepStrictEqual(
    stored.palette.slice().sort(),
    ["minecraft:grass_block", "minecraft:stone"]
  );
  assert.deepStrictEqual(stored.cells[0], [64, 0], "cell 0 = pierre");
  assert.deepStrictEqual(stored.cells[5], [66, 1], "cell 5 = herbe, y = 64 + 5%3");

  r = await req(mipBase, "/api/chunk/minecraft:overworld/1/2");
  assert.strictEqual(r.status, 200, "l'UI peut le relire");

  // 17. dimensions MipMap normalisees
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunk: {
        dimension: "The End",
        blocks: [{ name: "minecraft:end_stone", coordinates: [0, 64, 0] }],
      },
    }),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.dim, "minecraft:the_end", '"The End" -> the_end');
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunk: {
        dimension: "Nether",
        blocks: [{ name: "minecraft:netherrack", coordinates: [0, 64, 0] }],
      },
    }),
  });
  assert.strictEqual(r.body.dim, "minecraft:nether");

  // 18. payload invalide -> erreur explicite (le plugin la journalise)
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunk: { dimension: "Overworld", blocks: [] } }),
  });
  assert.strictEqual(r.status, 422, "blocks vides refuses");
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pas: "chunk" }),
  });
  assert.strictEqual(r.status, 422, "champ 'chunk' manquant refuse");

  // 19. payload joueurs
  r = await req(mipBase, "/api/players-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      players: [
        {
          name: "Steve",
          xuid: "12345",
          skin: "89504e47",
          skinShape: [64, 64, 4],
          dimension: "Overworld",
          x: 10.5,
          y: 64,
          z: -3.25,
        },
        { name: "Mip" },
      ],
    }),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.players, 1, "l'entree sans position est ignoree");

  r = await req(mipBase, "/api/players");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.count, 1);
  const steve = r.body.dimensions["minecraft:overworld"][0];
  assert.strictEqual(steve.name, "Steve");
  assert.strictEqual(steve.x, 10.5);
  assert.deepStrictEqual(steve.skinShape, [64, 64, 4]);

  // 20. un joueur arrete d'etre envoye -> retire apres le TTL
  const past = Date.now() - 60000;
  mipmapApp.store.players.get("Steve").ts = past;
  r = await req(mipBase, "/api/players");
  assert.strictEqual(r.body.count, 0, "joueur hors TTL retire");

  // 21. jeton optionnel (le plugin peut le passer dans l'URL)
  // dataFile dans le tmp : sinon le test ecrit dans mapserver/data/chunks.ndjson
  const locked = createApp({
    dataFile: path.join(tmpDir, "locked.ndjson"),
    apiKey: "",
    mipmapToken: "s3cret",
  });
  await new Promise((resolve) => locked.server.listen(0, "127.0.0.1", resolve));
  const lockBase = "http://127.0.0.1:" + locked.server.address().port;
  r = await req(lockBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunk: { dimension: "Overworld", blocks } }),
  });
  assert.strictEqual(r.status, 401, "sans jeton : refuse");
  r = await req(lockBase, "/api/chunks-data?key=s3cret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunk: { dimension: "Overworld", blocks } }),
  });
  assert.strictEqual(r.status, 200, "avec jeton : accepte");
  locked.server.close();
  await locked.store.close();

  // 22. chunk negatif + nom de dimension "TheEnd" (utilise par le webmap amont) :
  //     les coordonnees de chunk sont deduites des blocs, comme en amont.
  const negBlocks = [];
  for (let i = 0; i < 256; i++) {
    negBlocks.push({
      name: "minecraft:deepslate",
      coordinates: [-16 + (i % 16), 12, -32 + Math.floor(i / 16)],
    });
  }
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunk: { dimension: "TheEnd", blocks: negBlocks, chunkX: -1, chunkZ: -2 },
    }),
  });
  assert.strictEqual(r.status, 200, "chunk negatif accepte");
  assert.strictEqual(r.body.dim, "minecraft:the_end", '"TheEnd" -> the_end');
  const neg = mipmapApp.store.get("minecraft:the_end", -1, -2);
  assert.ok(neg, "chunk (-1,-2) stocke");
  assert.strictEqual(neg.cells.length, 256);
  assert.deepStrictEqual(neg.cells[0], [12, 0], "cell 0 = coin (-16,-32)");
  assert.ok(neg.cells.every((c) => c.length === 2), "aucune colonne vide");

  // 23. relief vu de dessus, rendu cote serveur -> PNG
  const reliefRes = await fetch(mipBase + "/api/relief/minecraft:overworld");
  assert.strictEqual(reliefRes.status, 200, "relief servi");
  assert.strictEqual(reliefRes.headers.get("content-type"), "image/png");
  const reliefPng = Buffer.from(await reliefRes.arrayBuffer());
  assert.deepStrictEqual(
    [...reliefPng.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "signature PNG du relief"
  );
  assert.ok(reliefPng.readUInt32BE(16) >= 16, "image de relief dimensionnee");
  const noRelief = await fetch(mipBase + "/api/relief/minecraft:nowhere");
  assert.strictEqual(noRelief.status, 404, "dimension inconnue : pas de relief");

  // 24. briques internes : encodeur PNG + relief deterministes
  const flat = Buffer.alloc(4 * 4 * 4, 255);
  const flatPng = encodePng(4, 4, flat);
  assert.deepStrictEqual(
    [...flatPng.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "encodeur PNG"
  );
  assert.strictEqual(flatPng.readUInt32BE(16), 4, "largeur PNG encodee");
  assert.strictEqual(flatPng.readUInt32BE(20), 4, "hauteur PNG encodee");
  const synthetic = renderReliefPng([sampleChunk(0, 0)]);
  assert.strictEqual(synthetic.width, 16, "un chunk = 16 px");
  assert.strictEqual(synthetic.height, 16, "un chunk = 16 px");
  assert.ok(synthetic.buffer.length > 100, "PNG de relief non vide");

  // 25. ombrage "facon MipMap" : bandes d'altitude, voile bleu, blanchiment,
  //     courbes de niveau. On decode le PNG et on compare a la formule exacte.
  const shadePng = renderReliefPng([
    flatChunk(0, 0, 64), // plaine (< 100 -> x0.9)
    flatChunk(1, 0, -64), // fond marin (profondeur max -> sombre + bleu)
    flatChunk(2, 0, 210), // montagne (> 150 -> clair + neige)
    flatChunk(0, 1, 80), // sur une courbe de niveau (tous les 20 blocs)
    flatChunk(1, 1, 81), // meme altitude, hors courbe
  ]);
  const shadeImg = decodePng(shadePng.buffer);
  const grass = rgbOf(blockColor("minecraft:grass_block"));
  assert.strictEqual(shadeImg.width, 48, "monde 3x2 chunks = 48 px de large");
  assert.strictEqual(shadeImg.height, 32, "monde 3x2 chunks = 32 px de haut");

  // 25a. plaine plate a y=64 : bande < 100 -> base x 0.9, AO/lumiere neutres
  const plainPx = pixelAt(shadeImg, 8, 8);
  assert.ok(
    near(plainPx.slice(0, 3), grass.map((c) => Math.floor(c * 0.9))) && plainPx[3] === 255,
    "plaine y=64 = couleur de base x 0.9, obtenu " + plainPx.join(",")
  );

  // 25b. fond marin y=-64 : x0.3 + voile bleu (0,30,80,40) de MipMap
  const alpha = 40 / 255;
  const deepNoTint = Math.floor(grass[2] * 0.3 * (1 - alpha));
  const deepExpected = [
    Math.floor(grass[0] * 0.3 * (1 - alpha)),
    Math.floor(grass[1] * 0.3 * (1 - alpha) + 30 * alpha),
    Math.floor(grass[2] * 0.3 * (1 - alpha) + 80 * alpha),
  ];
  const deepPx = pixelAt(shadeImg, 24, 8);
  assert.ok(
    near(deepPx.slice(0, 3), deepExpected),
    "fond marin y=-64 = formule bleue, obtenu " + deepPx.join(",") +
      " attendu " + deepExpected.join(",")
  );
  assert.ok(deepPx[2] > deepNoTint + 4, "le fond marin est bien tire vers le bleu : b=" + deepPx[2] + " vs sans teinte " + deepNoTint);

  // 25c. montagne y=210 : 1.2 + (h-150)/170 x 0.3 + voile blanc
  const mountainBright = 1.2 + ((210 - 150) / (320 - 150)) * 0.3;
  const snow = Math.min(((210 - 150) / (320 - 150)) * 0.4, 0.4);
  const snowA = Math.min(snow * 0.3, 0.3);
  const mountainExpected = grass.map((c) =>
    Math.floor(c * mountainBright * (1 - snowA) + 255 * snowA)
  );
  const mountainPx = pixelAt(shadeImg, 40, 8);
  assert.ok(
    near(mountainPx.slice(0, 3), mountainExpected),
    "montagne y=210 = formule altitude, obtenu " + mountainPx.join(",") +
      " attendu " + mountainExpected.join(",")
  );
  assert.ok(mountainPx[0] > plainPx[0], "la montagne est plus claire que la plaine");

  // 25d. courbe de niveau (y=80) plus foncee que y=81, meme couleur
  const contourPx = pixelAt(shadeImg, 4, 24);
  const noContourPx = pixelAt(shadeImg, 20, 24);
  assert.ok(
    contourPx[0] < noContourPx[0] && contourPx[1] < noContourPx[1],
    "courbe de niveau y=80 plus foncee que y=81 : " +
      contourPx.slice(0, 3).join(",") +
      " < " +
      noContourPx.slice(0, 3).join(",")
  );

  // 26. portage MipMap en Node : config, textures, tuiles, joueurs + skins
  r = await req(mipBase, "/api/config");
  assert.strictEqual(r.status, 200, "config servie");
  assert.strictEqual(r.body.defaultWorld, "Overworld");
  assert.strictEqual(r.body.maxZoom, 4);
  assert.strictEqual(r.body.tileSize, 256);

  // Le decodeur PNG maison relit une texture vendorée (16x16 RGBA).
  const grassPng = fs.readFileSync(
    path.join(__dirname, "assets", "textures", "blocks", "grass_block.png")
  );
  const grassImg = decodePng(grassPng);
  assert.strictEqual(grassImg.width, 16, "texture 16 px de large");
  assert.strictEqual(grassImg.height, 16, "texture 16 px de haut");
  assert.strictEqual(grassImg.data.length, 16 * 16 * 4, "texture decodée en RGBA");

  // Une tuile zoom 4 (0,0) rendue depuis un chunk plat d'herbe y=64.
  const flatBlocks = [];
  for (let i = 0; i < 256; i++) {
    flatBlocks.push({
      name: "minecraft:grass_block",
      coordinates: [i % 16, 64, Math.floor(i / 16)],
    });
  }
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunk: { dimension: "Overworld", blocks: flatBlocks } }),
  });
  assert.strictEqual(r.status, 200, "chunk plat accepte");

  const tileRes = await fetch(mipBase + "/api/tiles/Overworld/4/0/0");
  assert.strictEqual(tileRes.status, 200, "tuile servie");
  assert.strictEqual(tileRes.headers.get("content-type"), "image/png");
  const tilePng = Buffer.from(await tileRes.arrayBuffer());
  assert.deepStrictEqual(
    [...tilePng.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "signature PNG de la tuile"
  );
  const tileImg = decodePng(tilePng);
  assert.strictEqual(tileImg.width, 256, "tuile 256 px");
  assert.strictEqual(tileImg.height, 256, "tuile 256 px");

  // Pixel (8,8) = bloc (0,0), texture herbe x0.9 (plaine plate, AO/lumiere neutres).
  const tex = scaledTexture("minecraft:grass_block", 16);
  const ti = (8 * 16 + 8) * 4; // texture du bloc (0,0), pixel interne (8,8)
  const expectedTile = [
    Math.floor(tex[ti] * 0.9),
    Math.floor(tex[ti + 1] * 0.9),
    Math.floor(tex[ti + 2] * 0.9),
  ];
  const tilePx = pixelAt(tileImg, 8, 8);
  assert.ok(
    near(tilePx.slice(0, 3), expectedTile) && tilePx[3] === 255,
    "tuile = texture du bloc x0.9, obtenu " + tilePx.join(",") +
      " attendu " + expectedTile.join(",")
  );

  // Revalidation : la tuile est etiquetee par la revision du store, donc le
  // navigateur ne garde pas une tuile vide alors que des chunks sont arrives.
  const revalidate = await fetch(mipBase + "/api/tiles/Overworld/4/0/0");
  const etag = revalidate.headers.get("etag");
  assert.ok(etag, "tuile etiquetee (ETag)");
  assert.strictEqual(revalidate.headers.get("cache-control"), "no-cache");
  const notModified = await fetch(mipBase + "/api/tiles/Overworld/4/0/0", {
    headers: { "If-None-Match": etag },
  });
  assert.strictEqual(notModified.status, 304, "tuile inchangee -> 304");

  // Coordonnees negatives : le chunk (-1,-1) doit alimenter la tuile (-1,-1)
  // (l'ancienne cle de chunk faisait se recouvrir cz = -1 et cz = 255).
  const negFlatBlocks = [];
  for (let i = 0; i < 256; i++) {
    negFlatBlocks.push({
      name: "minecraft:grass_block",
      coordinates: [(i % 16) - 16, 64, Math.floor(i / 16) - 16],
    });
  }
  r = await req(mipBase, "/api/chunks-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunk: { dimension: "Overworld", blocks: negFlatBlocks } }),
  });
  assert.strictEqual(r.status, 200, "chunk en coordonnees negatives accepte");

  const negTile = await fetch(mipBase + "/api/tiles/Overworld/4/-1/-1");
  assert.strictEqual(negTile.status, 200, "tuile negative servie");
  const negImg = decodePng(Buffer.from(await negTile.arrayBuffer()));
  assert.strictEqual(pixelAt(negImg, 8, 8)[3], 255, "tuile negative opaque");

  // Hors zone : tuile transparente en 200 (et non 404) pour que la carte ne
  // se vide pas quand on dezoome.
  const emptyTile = await fetch(mipBase + "/api/tiles/Overworld/4/500/500");
  assert.strictEqual(emptyTile.status, 200, "tuile hors zone -> 200 transparente");
  assert.strictEqual(emptyTile.headers.get("content-type"), "image/png");
  const emptyImg = decodePng(Buffer.from(await emptyTile.arrayBuffer()));
  assert.strictEqual(emptyImg.width, 256, "tuile vide 256 px");
  assert.strictEqual(pixelAt(emptyImg, 128, 128)[3], 0, "tuile vide transparente");

  // Banque de textures : table Bedrock 1.26.50 (face du dessus) puis derives,
  // puis repli couleur (plus jamais de magenta).
  assert.strictEqual(
    resolveFile("minecraft:oak_fence"),
    "planks_oak.png",
    "cloture -> planches (table Bedrock)"
  );
  assert.strictEqual(
    resolveFile("minecraft:cobblestone_wall"),
    "cobblestone.png",
    "mur -> pierre taillee"
  );
  assert.strictEqual(
    resolveFile("minecraft:purple_stained_glass_pane"),
    "glass_purple.png",
    "vitre teintee -> verre teinte"
  );
  assert.strictEqual(resolveFile("minecraft:melon"), "melon_block.png", "melon -> bloc de melon");
  assert.strictEqual(
    resolveFile("minecraft:cherry_log"),
    "cherry_log_top.png",
    "bucher -> face du dessus (cerisier)"
  );
  assert.strictEqual(
    resolveFile("minecraft:pale_oak_leaves"),
    "pale_oak_leaves.tga",
    "texture TGA du resource pack officiel"
  );

  // Decodeur TGA (types 2/10, 24/32 bits, palette 8 bits) : les feuilles,
  // le cactus, la canne a sucre... n'existent qu'en TGA dans le pack Mojang.
  const tgaImg = decodeTga(
    fs.readFileSync(path.join(__dirname, "assets", "textures", "blocks", "fern.tga"))
  );
  assert.strictEqual(tgaImg.width, 16, "TGA 16 px de large");
  assert.strictEqual(tgaImg.height, 16, "TGA 16 px de haut");
  assert.strictEqual(tgaImg.data.length, 16 * 16 * 4, "TGA decode en RGBA");
  assert.ok(tgaImg.data[3] > 0 || tgaImg.data[16 * 3] > 0, "TGA avec des pixels opaques");

  // Couverture de la banque Bedrock : ~1300 blocs de 1.26.50 ont une texture.
  const bedrockTable = JSON.parse(
    fs.readFileSync(path.join(__dirname, "assets", "bedrock_blocks.json"), "utf8")
  );
  const bedrockNames = Object.keys(bedrockTable);
  assert.ok(bedrockNames.length > 1300, "table Bedrock fournie (" + bedrockNames.length + ")");
  const missing = bedrockNames.filter((name) => !resolveFile("minecraft:" + name));
  assert.strictEqual(missing.length, 0, "chaque bloc de la table a une texture : " + missing.slice(0, 5));
  const textureFiles = fs.readdirSync(path.join(__dirname, "assets", "textures", "blocks"));
  assert.ok(textureFiles.length > 1700, "banque de textures etendue (" + textureFiles.length + " fichiers)");

  // Textures "masque" du pack Bedrock : grises dans le fichier, teintees par
  // le moteur. Sans teinte on obtenait de l'eau GRISE ; on applique donc la
  // couleur par defaut du jeu (eau bleue, herbe verte, feuillage, redstone).
  const channelAvg = (block) => {
    const data = scaledTexture(block, 16);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < 256; i++) {
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
    }
    return [r / 256, g / 256, b / 256];
  };

  const waterAvg = channelAvg("minecraft:water");
  assert.ok(
    waterAvg[2] > waterAvg[0] + 40 && waterAvg[2] > waterAvg[1],
    "eau bleue (et non grise), obtenu " + waterAvg.map(Math.round).join(",")
  );
  const grassAvg = channelAvg("minecraft:grass");
  assert.ok(
    grassAvg[1] > grassAvg[0] && grassAvg[1] > grassAvg[2],
    "herbe verte, obtenu " + grassAvg.map(Math.round).join(",")
  );
  const stoneAvg = channelAvg("minecraft:stone");
  assert.strictEqual(
    Math.round(Math.max(...stoneAvg) - Math.min(...stoneAvg)),
    0,
    "la pierre reste grise (on ne teinte pas tout)"
  );
  const unknownTex = scaledTexture("minecraft:pas_un_bloc_connu", 16);
  assert.ok(
    !(unknownTex[0] === 255 && unknownTex[1] === 0 && unknownTex[2] === 255),
    "bloc inconnu : couleur du bloc, pas magenta (" +
      [unknownTex[0], unknownTex[1], unknownTex[2]].join(",") +
      ")"
  );
  assert.strictEqual(unknownTex[3], 255, "texture de repli opaque");

  // Joueurs : forme attendue par le front MipMap + visage 8x8 depuis le skin.
  const skinHex = Buffer.alloc(64 * 64 * 4, 200).toString("hex");
  r = await req(mipBase, "/api/players-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      players: [
        {
          name: "Alex",
          xuid: "1",
          skin: skinHex,
          skinShape: [64, 64, 4],
          dimension: "Overworld",
          x: 8,
          y: 64,
          z: 8,
        },
      ],
    }),
  });
  assert.strictEqual(r.status, 200, "joueur accepte");

  r = await req(mipBase, "/api/players");
  const alex = (r.body.players || []).find((p) => p.name === "Alex");
  assert.ok(alex, "Alex present dans /api/players");
  assert.strictEqual(alex.dimension, "Overworld", "dimension en nom de monde");
  assert.strictEqual(alex.skin, "/api/players/Alex/skin.png");

  const skinRes = await fetch(mipBase + "/api/players/Alex/skin.png");
  assert.strictEqual(skinRes.status, 200, "skin servi");
  const face = decodePng(Buffer.from(await skinRes.arrayBuffer()));
  assert.strictEqual(face.width, 8, "visage 8x8");
  assert.strictEqual(face.height, 8, "visage 8x8");

  mipmapApp.server.close();
  await mipmapApp.store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log("OK - 26 scenarios passes");
}

main().catch((err) => {
  console.error("ECHEC :", err.message);
  // On quitte franchement : sinon les serveurs de test restent en ecoute et
  // le processus ne se termine jamais (timeout du runner).
  process.exit(1);
});
