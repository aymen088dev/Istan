/**
 * Effets sonores de la pub Litel, synthétisés localement.
 *
 *   node tools/sfx.mjs
 *
 * Pas, porte automatique, caisse enregistreuse, pop de prix et swoosh.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../assets/audio");
mkdirSync(out, { recursive: true });

let seed = 0x7f4a7c15;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function write(name, seconds, gen) {
  const n = Math.ceil(SR * seconds);
  const bytes = 44 + n * 4;
  const buf = Buffer.alloc(bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(bytes - 8, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  for (let i = 0; i < n; i++) {
    const [l, r] = gen(i / SR);
    buf.writeInt16LE(Math.round(clamp(l) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(clamp(r) * 32767), 46 + i * 4);
  }
  writeFileSync(resolve(out, name), buf);
  console.log(`${name} · ${seconds}s`);
}

/* Pas sur l'asphalte : impact grave + petit frottement. */
write("sfx-step.wav", 0.22, (t) => {
  const env = Math.exp(-t * 26);
  const thud = Math.sin(2 * Math.PI * (70 + 40 * Math.exp(-t * 30)) * t) * env;
  const grit = (rnd() * 2 - 1) * Math.exp(-t * 55) * 0.14;
  const v = Math.tanh((thud + grit) * 1.3) * 0.8;
  return [v, v * 0.9];
});

/* Porte automatique : souffle qui monte, puis carillon d'entrée. */
write("sfx-door.wav", 1.5, (t) => {
  const p = Math.min(1, t / 1.0);
  const n = rnd() * 2 - 1;
  const cutoff = 400 + 2600 * p;
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  const air = n * a * (1 - p) * 0.5;
  const chime = t > 0.55 ? Math.sin(2 * Math.PI * 1568 * (t - 0.55)) * Math.exp(-(t - 0.55) * 6) * 0.16 : 0;
  const chime2 = t > 0.72 ? Math.sin(2 * Math.PI * 2093 * (t - 0.72)) * Math.exp(-(t - 0.72) * 7) * 0.1 : 0;
  return [air + chime, air + chime2];
});

/* Caisse : deux bips brillants. */
write("sfx-ding.wav", 0.65, (t) => {
  const b1 = t < 0.18 ? Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t * 22) * 0.35 : 0;
  const t2 = t - 0.16;
  const b2 = t2 > 0 ? Math.sin(2 * Math.PI * 2637 * t2) * Math.exp(-t2 * 12) * 0.3 : 0;
  return [b1 + b2, b1 + b2];
});

/* Pop de prix. */
write("sfx-pop.wav", 0.13, (t) => {
  const env = Math.exp(-t * 45);
  const v = Math.sin(2 * Math.PI * (620 + 900 * t) * t) * env * 0.6;
  return [v, v];
});

/* Swoosh de titre. */
write("sfx-swoosh.wav", 0.55, (t) => {
  const p = t / 0.55;
  const env = Math.sin(Math.PI * p) ** 2;
  const n = rnd() * 2 - 1;
  const a = 1 - Math.exp((-2 * Math.PI * (600 + 2400 * p)) / SR);
  const v = n * a * env * 0.55;
  return [v * (0.4 + p * 0.6), v * (1 - p * 0.5)];
});
