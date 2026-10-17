/**
 * Effets sonores du montage, synthétisés localement.
 *
 *   node tools/sfx.mjs
 *
 * Chaque fichier est court et sec : ils soulignent les entrées de plans, les
 * compteurs et les transitions sans jamais masquer la voix.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../assets/audio");
mkdirSync(out, { recursive: true });

let seed = 0x2545f491;
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

/* Whoosh : bruit balayé du grave vers l'aigu, panoramique qui traverse. */
write("sfx-whoosh.wav", 0.85, (t) => {
  const p = t / 0.85;
  const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
  const n = rnd() * 2 - 1;
  const lp = 1 - Math.exp(-2 * Math.PI * (240 + 3200 * p) / SR);
  // suivi d'état simple via accumulation locale
  const v = n * env * lp * 2.4;
  return [v * (1 - p * 0.7), v * (0.3 + p * 0.7)];
});

/* Impact : sub qui descend + souffle court. */
write("sfx-impact.wav", 1.3, (t) => {
  const f = 38 + 60 * Math.exp(-t * 12);
  const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 4.5);
  const noise = (rnd() * 2 - 1) * Math.exp(-t * 26) * 0.18;
  const v = Math.tanh((body + noise) * 1.4);
  return [v, v];
});

/* Pop d'interface : court, brillant, parfait pour un compteur. */
write("sfx-pop.wav", 0.14, (t) => {
  const env = Math.exp(-t * 60);
  const v = Math.sin(2 * Math.PI * (880 + 700 * t) * t) * env * 0.55;
  return [v, v];
});

/* Tick : clic sec pour les listes qui défilent. */
write("sfx-tick.wav", 0.07, (t) => {
  const env = Math.exp(-t * 130);
  const v = ((rnd() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 2100 * t) * 0.4) * env;
  return [v, v];
});

/* Riser : montée de bruit filtré pour amener la scène suivante. */
write("sfx-riser.wav", 1.6, (t) => {
  const p = t / 1.6;
  const env = p ** 2.4;
  const n = rnd() * 2 - 1;
  const cutoff = 300 + 5200 * p ** 2;
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  const v = n * env * a * 6;
  return [v * 0.9, v * 1.1];
});
