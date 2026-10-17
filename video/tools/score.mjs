/**
 * Bande sonore originale pour la vidéo ISTAN Projects.
 *
 * Aucun sample, aucune licence : tout est synthétisé ici en PCM puis écrit en
 * WAV 48 kHz / 16 bits stéréo. Le rendu est déterministe (PRNG à graine fixe),
 * donc relancer le script redonne exactement le même fichier.
 *
 *   node tools/score.mjs
 *
 * Structure : 100 BPM, nappe Am9 / Fmaj7 / Cmaj7 / G6, sub, kick feutré,
 * charleys, arpèges filtrés et nappe de bruit vinyle. Le morceau accompagne
 * les 70,5 s du montage et reste volontairement bas : la voix doit passer
 * devant sans égalisation.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const DURATION = 70.5;
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../assets/audio/score.wav");
mkdirSync(dirname(out), { recursive: true });
const BPM = 100;
const BEAT = 60 / BPM;
const N = Math.ceil(SR * DURATION);
const L = new Float32Array(N);
const R = new Float32Array(N);

/* ---------- utilitaires ---------- */

let seed = 0x9e3779b9;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function addAt(i, l, r) {
  if (i < 0 || i >= N) return;
  L[i] += l;
  R[i] += r;
}

/** Écrit une voix mono avec panoramique constant. */
function voice(start, dur, gain, pan, gen) {
  const first = Math.floor(start * SR);
  const count = Math.floor(dur * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  for (let k = 0; k < count; k++) {
    const i = first + k;
    if (i >= N) break;
    const v = gen(k / SR, k);
    L[i] += v * gl;
    R[i] += v * gr;
  }
}

const saw = (phase) => 2 * (phase - Math.floor(phase + 0.5));

/* ---------- harmonie ---------- */

const CHORDS = [
  { notes: [45, 60, 64, 71], bass: 33 }, // Am9
  { notes: [41, 57, 60, 64], bass: 29 }, // Fmaj7
  { notes: [48, 64, 67, 71], bass: 36 }, // Cmaj7
  { notes: [43, 59, 62, 64], bass: 31 }, // G6
];

const bars = Math.ceil(DURATION / (BEAT * 4));

/* Nappe : trois saws désaccordés par note, filtre passe-bas qui respire. */
for (let bar = 0; bar < bars; bar++) {
  const chord = CHORDS[bar % 4];
  const start = bar * 4 * BEAT;
  const dur = 4 * BEAT + 1.1;
  chord.notes.forEach((note, index) => {
    const f = hz(note);
    const amp = index === 0 ? 0.5 : 0.34;
    let lp = 0;
    voice(start, dur, 0.052 * amp, (index / 3) * 1.2 - 0.6, (t) => {
      const attack = Math.min(1, t / 0.55);
      const release = Math.min(1, Math.max(0, (dur - 0.2 - t) / 1.0));
      const env = attack * release;
      const cutoff = 820 + 260 * Math.sin(t * 0.7 + index);
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
      const raw =
        saw(f * 0.997 * t) + saw(f * t) + saw(f * 1.004 * t + 0.25) + 0.12 * Math.sin(2 * Math.PI * f * 2 * t);
      lp += a * (raw - lp);
      return lp * env;
    });
  });
}

/* Sub : une note par temps, légèrement saturée. */
for (let beat = 0; beat < DURATION / BEAT; beat++) {
  const chord = CHORDS[Math.floor(beat / 4) % 4];
  const f = hz(chord.bass);
  voice(beat * BEAT, BEAT * 0.92, 0.14, 0, (t) => {
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 3.2);
    const s = Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(2 * Math.PI * f * 2 * t);
    return Math.tanh(s * 1.6) * env;
  });
}

/* Kick feutré, quatre temps, sans claquer. */
for (let beat = 0; beat < DURATION / BEAT; beat++) {
  voice(beat * BEAT, 0.42, 0.34, 0, (t) => {
    const f = 47 + 90 * Math.exp(-t * 34);
    const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9);
    const click = (rnd() * 2 - 1) * Math.exp(-t * 220) * 0.25;
    return body + click;
  });
}

/* Charleys sur les contretemps. */
for (let beat = 0; beat < DURATION / BEAT; beat++) {
  voice(beat * BEAT + BEAT / 2, 0.09, 0.05, 0.35, (t) => {
    const n = rnd() * 2 - 1;
    const hp = n * Math.exp(-t * 95);
    return hp;
  });
}

/* Arpèges : entrent après l'intro, filtre ouvert, écho court. */
const arpStart = 15.5;
const arp = new Float32Array(N);
const step = BEAT / 4;
let stepIndex = 0;
for (let t = arpStart; t < DURATION; t += step, stepIndex++) {
  const bar = Math.floor(t / (BEAT * 4));
  const chord = CHORDS[bar % 4];
  const note = chord.notes[(stepIndex * 3 + bar) % chord.notes.length] + 12;
  const f = hz(note);
  const first = Math.floor(t * SR);
  const count = Math.floor(0.5 * SR);
  const pan = stepIndex % 2 === 0 ? -0.4 : 0.4;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * 0.035;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * 0.035;
  let lp = 0;
  for (let k = 0; k < count; k++) {
    const i = first + k;
    if (i >= N) break;
    const tt = k / SR;
    const env = Math.exp(-tt * 12) * Math.min(1, tt / 0.004);
    const a = 1 - Math.exp((-2 * Math.PI * (2400 + 1200 * Math.sin(tt * 6))) / SR);
    lp += a * (saw(f * tt) - lp);
    const v = lp * env;
    arp[i] += v;
    addAt(i, v * gl, v * gr);
  }
}
/* Écho de l'arpège (3/16 puis 6/16), plus discret à chaque rebond. */
for (let i = 0; i < N; i++) {
  const a = arp[i];
  if (!a) continue;
  const d1 = Math.floor((BEAT * 3) / 4 * SR);
  const d2 = Math.floor((BEAT * 6) / 4 * SR);
  addAt(i + d1, a * 0.11, a * 0.16);
  addAt(i + d2, a * 0.05, a * 0.07);
}

/* Bruit vinyle : très bas, décorrélé gauche/droite. */
let lpL = 0;
let lpR = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const a = 0.22;
  lpL += a * (rnd() * 2 - 1 - lpL);
  lpR += a * (rnd() * 2 - 1 - lpR);
  const fade = Math.min(1, t / 1.2) * Math.min(1, Math.max(0, (DURATION - t) / 1.6));
  L[i] += lpL * 0.006 * fade;
  R[i] += lpR * 0.006 * fade;
}

/* ---------- mastering simple ---------- */

let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const target = 0.36;
const g = peak > 0 ? target / peak : 1;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const edge = Math.min(1, t / 1.0) * Math.min(1, Math.max(0, (DURATION - t) / 1.8));
  L[i] = Math.tanh(L[i] * g * 1.15) * edge;
  R[i] = Math.tanh(R[i] * g * 1.15) * edge;
}

/* ---------- écriture WAV ---------- */

const bytes = 44 + N * 4;
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
buf.writeUInt32LE(N * 4, 40);

const clamp = (v) => Math.max(-1, Math.min(1, v));
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(clamp(L[i]) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(clamp(R[i]) * 32767), 46 + i * 4);
}

writeFileSync(out, buf);
console.log(`score.wav écrit : ${(bytes / 1024 / 1024).toFixed(1)} Mo · ${DURATION}s · ${SR} Hz`);
