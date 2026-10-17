/**
 * Voix off de la pub Litel, calée sur les cinq plans.
 *
 *   node tools/voice.mjs [--force]
 *
 * Deux moteurs, choisis automatiquement :
 *   · HeyGen (voix starfish, qualité studio) si HEYGEN_API_KEY / HYPERFRAMES_API_KEY
 *     est présent dans l'environnement ;
 *   · sinon Kokoro-82M en local (voix française ff_siwis, aucun compte requis).
 *
 * Chaque phrase est mesurée puis complétée par du silence jusqu'à la durée
 * exacte de son plan : `assets/audio/voice.wav` fait 35,5 s, donc les
 * `data-start` de la composition restent valables. Le fichier de sous-titres
 * `assets/audio/voice.vtt` est écrit à partir des durées réellement mesurées.
 */

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const audioDir = join(root, "assets/audio");
const segmentDir = join(audioDir, "voice");
mkdirSync(segmentDir, { recursive: true });

const HYPERFRAMES_CLI =
  process.env.HF_CLI || "/usr/lib/node_modules/hyperframes/bin/hyperframes.mjs";

const TTS_SCRIPT =
  process.env.HF_TTS_SCRIPT ||
  "/usr/lib/node_modules/hyperframes/dist/skills/media-use/audio/scripts/heygen-tts.mjs";
const HEYGEN_VOICE = process.env.HEYGEN_VOICE_ID || "018a94cf15574491a0bab7f6799ac15b";
const KOKORO_VOICE = process.env.KOKORO_VOICE || "ff_siwis";
const PROVIDER_OVERRIDE = process.env.LITEL_TTS_PROVIDER || "";
const FORCE = process.argv.includes("--force");

const provider = (() => {
  if (PROVIDER_OVERRIDE) return PROVIDER_OVERRIDE;
  if (process.env.HEYGEN_API_KEY || process.env.HYPERFRAMES_API_KEY || process.env.HEYGEN_ACCESS_TOKEN) {
    return "heygen";
  }
  return "kokoro";
})();

export const SEGMENTS = [
  { id: "01", start: 0, duration: 7.5, text: "Sept heures du soir à Istanmusta. Tu sors du travail, et tu sais déjà où tu vas." },
  { id: "02", start: 7.5, duration: 5, text: "Litel. Au bout de ta rue, dans tous les quartiers." },
  {
    id: "03",
    start: 12.5,
    duration: 8,
    text: "Des petits prix toute l'année. Riz, café, savon : le panier complet à moins de dix.",
  },
  {
    id: "04",
    start: 20.5,
    duration: 8,
    text: "Douze mille produits en rayon, un nouveau rayon chaque semaine, et des promos qui changent tous les mardis.",
  },
  { id: "05", start: 28.5, duration: 7, text: "Litel. Des petits prix. Partout en Istanmusta." },
];

const TOTAL = 35.5;
const LEAD = 0.35;
const MARGIN = 0.35;

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  const value = Number(String(r.stdout).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`durée illisible pour ${file}`);
  return value;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} a échoué: ${(r.stderr || r.stdout || "").slice(-400)}`);
  return r.stdout || "";
}

function synth(text, out, speed) {
  if (provider === "heygen") {
    run("node", [
      TTS_SCRIPT,
      text,
      "-o",
      out,
      "--lang",
      "fr",
      "--voice",
      HEYGEN_VOICE,
      "--speed",
      speed.toFixed(3),
    ]);
    return;
  }
  run("node", [
    HYPERFRAMES_CLI,
    "tts",
    text,
    "-o",
    out,
    "--voice",
    KOKORO_VOICE,
    "--lang",
    "fr-fr",
    "--speed",
    speed.toFixed(3),
  ]);
}

console.log(`· moteur de voix : ${provider}${provider === "kokoro" ? ` (${KOKORO_VOICE}, local)` : ""}`);

/* ---- 1. synthèse, avec ajustement du débit pour tenir chaque plan ---- */

for (const seg of SEGMENTS) {
  const raw = join(segmentDir, `${seg.id}-raw.wav`);
  if (FORCE || !existsSync(raw)) {
    let speed = Number(process.env.HEYGEN_VOICE_SPEED || 1.02);
    for (let attempt = 0; attempt < 3; attempt++) {
      console.log(`· ${seg.id} · synthèse à ${speed.toFixed(2)}×`);
      synth(seg.text, raw, speed);
      const d = probe(raw);
      const room = seg.duration - MARGIN;
      if (d <= room) {
        console.log(`  ${seg.id} · ${d.toFixed(2)} s / ${seg.duration} s → ok`);
        break;
      }
      if (attempt === 2) {
        throw new Error(
          `segment ${seg.id} trop long même à ${speed.toFixed(2)}× (${d.toFixed(2)} s pour ${room.toFixed(2)} s) — raccourcis le texte.`,
        );
      }
      speed = Math.min(1.45, speed * (d / room) * 1.03);
    }
  }
  seg.measured = probe(raw);
  console.log(`  ${seg.id} · ${seg.measured.toFixed(2)} s / ${seg.duration} s → ${seg.measured <= seg.duration - MARGIN ? "ok" : "TROP LONG"}`);
}

if (SEGMENTS.some((s) => s.measured > s.duration - MARGIN)) {
  console.error("✗ un segment dépasse son plan : raccourcis le texte ou augmente la vitesse.");
  process.exit(1);
}

/* ---- 2. calage sur les plans et assemblage ---- */

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
    `adelay=${Math.round(LEAD * 1000)}:all=1,apad=whole_dur=${seg.duration},atrim=0:${seg.duration},asetpts=N/SR/TB`,
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
console.log(`✓ ${assembled} · ${total.toFixed(2)} s`);
if (Math.abs(total - TOTAL) > 0.05) {
  console.error("✗ durée assemblée incohérente");
  process.exit(1);
}

/* ---- 3. sous-titres alignés sur les durées mesurées ---- */

const stamp = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
};

const vtt = ["WEBVTT", "", ...SEGMENTS.flatMap((seg, i) => {
  const from = seg.start + LEAD;
  const to = Math.min(seg.start + seg.duration - 0.15, from + seg.measured + 0.25);
  return [
    String(i + 1),
    `${stamp(from)} --> ${stamp(to)}`,
    seg.text,
    "",
  ];
})].join("\n");

const vttFile = join(audioDir, "voice.vtt");
writeFileSync(vttFile, vtt);
console.log(`✓ ${vttFile} · ${SEGMENTS.length} sous-titres alignés`);
