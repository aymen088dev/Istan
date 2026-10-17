/**
 * Voix off française du film, générée par HeyGen (Starfish) puis calée sur le
 * découpage des plans.
 *
 *   node tools/voice.mjs            # génère les segments manquants + assemble
 *   node tools/voice.mjs --force    # régénère tout
 *
 * Le script n'écrit jamais de jeton : l'authentification vient de
 * ~/.heygen/credentials, posée par `hyperframes auth login --device`.
 *
 * Chaque segment est complété par du silence jusqu'à la durée exacte de son
 * plan, puis les sept segments sont concaténés : `assets/audio/voice.wav`
 * mesure donc exactement 70,5 s et se cale sur les `data-start` de la
 * composition sans dérive.
 */

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const audioDir = join(root, "assets/audio");
const segmentDir = join(audioDir, "voice");
mkdirSync(segmentDir, { recursive: true });

const TTS_SCRIPT =
  process.env.HF_TTS_SCRIPT ||
  "/usr/lib/node_modules/hyperframes/dist/skills/media-use/audio/scripts/heygen-tts.mjs";
const VOICE = process.env.HEYGEN_VOICE_ID || "018a94cf15574491a0bab7f6799ac15b"; // Marc Aurèle (fr)
const SPEED = process.env.HEYGEN_VOICE_SPEED || "1.02";
const FORCE = process.argv.includes("--force");

/** Une phrase par plan, calée sur les data-start du film. */
export const SEGMENTS = [
  {
    id: "01",
    start: 0,
    duration: 7,
    text: "Un seul serveur. Tous tes projets. Quatre outils qui travaillent ensemble.",
  },
  {
    id: "02",
    start: 7,
    duration: 8.5,
    text: "Istan Projects, c'est le portail qui rassemble tout. Une adresse, quatre applications, un seul accès.",
  },
  {
    id: "03",
    start: 15.5,
    duration: 11,
    text: "Creator, pour composer tes équipes de foot et de hockey. Tu gères tes clubs, tes effectifs, et tu exportes des visuels prêts à publier.",
  },
  {
    id: "04",
    start: 26.5,
    duration: 11,
    text: "Publisher, pour écrire sur Discord avec l'identité de tes profils. Le salon en direct, les webhooks, et le journal des mutes et des bans RP.",
  },
  {
    id: "05",
    start: 37.5,
    duration: 13,
    text: "Mercato Analyser relit quatre mois de messages. Trois cent quarante et un messages, quarante-huit transferts, avec le joueur, les clubs, le montant et la source. Et l'export en un clic.",
  },
  {
    id: "06",
    start: 50.5,
    duration: 10,
    text: "MipMap affiche ton monde Minecraft chunk par chunk : le relief, la carte, et les joueurs en direct. Le plugin Endstone fait le reste.",
  },
  {
    id: "07",
    start: 60.5,
    duration: 10,
    text: "Une seule commande pour tout démarrer. Istan Projects : vos projets, un seul accès.",
  },
];

const TOTAL = 70.5;

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  const value = Number(r.stdout.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`durée illisible pour ${file}`);
  return value;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} a échoué: ${(r.stderr || r.stdout).slice(0, 400)}`);
  return r.stdout;
}

for (const seg of SEGMENTS) {
  const raw = join(segmentDir, `${seg.id}-raw.wav`);
  if (FORCE || !existsSync(raw)) {
    console.log(`· génération ${seg.id}…`);
    run("node", [TTS_SCRIPT, seg.text, "-o", raw, "--lang", "fr", "--voice", VOICE, "--speed", SPEED]);
  }
  const d = probe(raw);
  const room = seg.duration - 0.35;
  const status = d <= room ? "ok" : `TROP LONG (${(d - room).toFixed(2)} s de trop)`;
  console.log(`  ${seg.id} · ${d.toFixed(2)} s / ${seg.duration} s utiles → ${status}`);
  seg.measured = d;
}

const tooLong = SEGMENTS.filter((s) => s.measured > s.duration - 0.35);
if (tooLong.length) {
  console.error(
    `✗ ${tooLong.length} segment(s) dépassent leur plan. Raccourcis le texte ou augmente HEYGEN_VOICE_SPEED.`,
  );
  process.exit(1);
}

/* Recale chaque segment : 0,35 s de respiration, puis silence jusqu'à la fin du plan. */
const padded = [];
for (const seg of SEGMENTS) {
  const raw = join(segmentDir, `${seg.id}-raw.wav`);
  const out = join(segmentDir, `${seg.id}-pad.wav`);
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    raw,
    "-af",
    `adelay=350:all=1,apad=whole_dur=${seg.duration},atrim=0:${seg.duration},asetpts=N/SR/TB`,
    "-ar",
    "48000",
    "-ac",
    "1",
    out,
  ]);
  padded.push(out);
}

const listFile = join(segmentDir, "concat.txt");
writeFileSync(listFile, padded.map((p) => `file '${p}'`).join("\n") + "\n");
const assembled = join(audioDir, "voice.wav");
run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  listFile,
  "-ar",
  "48000",
  "-ac",
  "1",
  assembled,
]);

const total = probe(assembled);
console.log(`✓ ${assembled} · ${total.toFixed(2)} s (attendu ${TOTAL} s)`);
if (Math.abs(total - TOTAL) > 0.05) {
  console.error("✗ durée assemblée incohérente avec le film");
  process.exit(1);
}
rmSync(join(tmpdir(), "heygen-device.json"), { force: true });
