/**
 * Bande originale de la pub Litel — version 2, synthèse pure, aucun sample.
 *
 *   node tools/score.mjs
 *
 * 112 BPM en fa majeur. L'arrangement suit le découpage de la composition :
 *   0.0 → 7.5   intro feutrée (nappe, arpège filtré, pas)
 *   7.5 → 12.5  entrée batterie + basse (façade)
 *   12.5 → 20.5 groove complet, stabs, hook (prix)
 *   20.5 → 28.5 drop dense, basse syncopée (rayons)
 *   28.5 → 35.5 outro, accord final tenu, extinction
 *
 * Écrit un WAV 48 kHz stéréo de 35,5 s dans assets/audio/score.wav.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const DURATION = 35.5;
const BPM = 112;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const N = Math.ceil(SR * DURATION);

const CUT = { intro: 0, facade: 7.5, prices: 12.5, aisle: 20.5, end: 28.5 };

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../assets/audio/score.wav");
mkdirSync(dirname(out), { recursive: true });

/* ------------------------------------------------------------------ */
/* outils                                                              */
/* ------------------------------------------------------------------ */

let seed = 0x51ed270b;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rnd() * 2 - 1;

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const saw = (p) => 2 * (p - Math.floor(p + 0.5));
const sat = (v, k = 1.6) => Math.tanh(v * k);

const track = () => ({ l: new Float32Array(N), r: new Float32Array(N) });

const drums = track();
const bassBus = track();
const music = track();
const air = track();
const send = track();

/** Écrit un instrument dans un bus ; `rev` alimente la reverb. */
function place(bus, start, dur, gain, pan, gen, rev = 0) {
  const i0 = Math.floor(start * SR);
  const count = Math.floor(dur * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  for (let k = 0; k < count; k++) {
    const i = i0 + k;
    if (i < 0 || i >= N) continue;
    const v = gen(k / SR, k);
    bus.l[i] += v * gl;
    bus.r[i] += v * gr;
    if (rev > 0) {
      send.l[i] += v * gl * rev;
      send.r[i] += v * gr * rev;
    }
  }
}

/* ------------------------------------------------------------------ */
/* harmonie                                                            */
/* ------------------------------------------------------------------ */

/* Fa majeur : Fmaj9 – Dm9 – Bb∆9 – C9. */
const CHORDS = [
  { keys: [57, 60, 64, 67], lead: [65, 69, 72, 76], bass: 41 },
  { keys: [53, 57, 60, 64], lead: [62, 65, 69, 72], bass: 38 },
  { keys: [50, 53, 57, 60], lead: [58, 62, 65, 69], bass: 34 },
  { keys: [52, 55, 58, 62], lead: [60, 64, 67, 70], bass: 36 },
];
const chordAt = (t) => CHORDS[Math.floor(t / BAR) % 4];

/* ------------------------------------------------------------------ */
/* batterie                                                            */
/* ------------------------------------------------------------------ */

function kickGen() {
  let ph = 0;
  return (t) => {
    const f = 44 + 132 * Math.exp(-t * 34);
    ph += (2 * Math.PI * f) / SR;
    const body = Math.sin(ph) * Math.exp(-t * 7.2);
    const click = noise() * Math.exp(-t * 320) * 0.4;
    return sat(body + click, 1.9);
  };
}

function clapGen() {
  let hp = 0;
  let last = 0;
  return (t) => {
    const n = noise();
    hp = 0.72 * (hp + n - last);
    last = n;
    const burst = (d) => (t >= d ? Math.exp(-(t - d) * 140) : 0);
    return hp * (burst(0) * 0.55 + burst(0.011) * 0.75 + burst(0.023) * 0.85) * Math.exp(-t * 9);
  };
}

function hatGen(open = false) {
  let hp = 0;
  let prev = 0;
  return (t) => {
    const n = noise();
    hp = 0.9 * (hp + n - prev);
    prev = n;
    return hp * Math.exp(-t * (open ? 34 : 130));
  };
}

function tambGen() {
  let hp = 0;
  let prev = 0;
  return (t) => {
    const n = noise();
    hp = 0.85 * (hp + n - prev);
    prev = n;
    return hp * Math.exp(-t * 42) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 92 * t));
  };
}

const kicks = [];
const kickTimes = [];

for (let beat = 0; beat * BEAT < DURATION - 0.1; beat++) {
  const t = beat * BEAT;
  const inBeat = t >= CUT.facade - 0.05;
  const full = t >= CUT.prices - 0.05;
  const drop = t >= CUT.aisle - 0.05;
  const outro = t >= CUT.end - 0.05;

  if (inBeat && !(outro && beat % 4 !== 0)) {
    place(drums, t, 0.4, drop ? 0.42 : 0.36, 0, kickGen());
    kicks.push(t);
    kickTimes.push(t);
  }

  if (inBeat && !outro && (beat % 4 === 1 || beat % 4 === 3)) {
    place(drums, t, 0.3, 0.15, 0.08, clapGen(), 0.18);
  }

  if (full && !outro) {
    place(drums, t + BEAT / 2, 0.34, 0.2, -0.05, clapGen(), 0.12);
  }
}

/* charleys en 16es, ouverts sur les contretemps à partir des prix */
for (let step = 0; (step * BEAT) / 4 < DURATION - 0.1; step++) {
  const t = (step * BEAT) / 4;
  if (t < CUT.facade - 0.05) continue;
  const outro = t >= CUT.end;
  const sixteen = t >= CUT.prices - 0.05;
  if (outro && step % 2 === 1) continue;
  if (!sixteen && step % 2 === 1) continue;
  const open = t >= CUT.aisle && step % 4 === 2;
  place(drums, t, open ? 0.2 : 0.06, open ? 0.075 : step % 4 === 2 ? 0.06 : 0.036, step % 2 ? 0.5 : -0.5, hatGen(open));
}

/* tambourin sur le drop */
for (let step = 0; (step * BEAT) / 2 < DURATION; step++) {
  const t = (step * BEAT) / 2;
  if (t < CUT.aisle - 0.05 || t >= CUT.end) continue;
  place(drums, t, 0.16, step % 2 ? 0.1 : 0.055, 0.32, tambGen(), 0.1);
}

/* ------------------------------------------------------------------ */
/* basse funk                                                          */
/* ------------------------------------------------------------------ */

function bassGen(f, dur) {
  let ph1 = 0;
  let ph2 = 0;
  let lp = 0;
  return (t) => {
    ph1 += (2 * Math.PI * f) / SR;
    ph2 += (2 * Math.PI * f * 1.004) / SR;
    const env = Math.min(1, t / 0.006) * Math.exp(-t * (t > dur - 0.03 ? 22 : 4.5));
    const cutoff = 180 + 900 * Math.exp(-t * 9);
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
    const raw = saw(ph1 * 0.5) * 0.5 + saw(ph2 * 0.5) * 0.5 + 0.35 * Math.sin(2 * Math.PI * f * 0.5 * t);
    lp += a * (raw - lp);
    return sat(lp * env, 1.9) * 0.9;
  };
}

for (let step = 0; (step * BEAT) / 2 < DURATION - 0.2; step++) {
  const t = (step * BEAT) / 2;
  if (t < CUT.facade - 0.05) continue;
  const chord = chordAt(t);
  const full = t >= CUT.prices - 0.05;
  const drop = t >= CUT.aisle - 0.05;
  const outro = t >= CUT.end;
  if (outro && step % 4 !== 0) continue;

  let note = chord.bass;
  if (full && step % 4 === 3) note += 12;
  if (drop && step % 8 === 5) note += 7;
  if (!full && step % 2 === 1) continue;

  const dur = drop ? BEAT * 0.4 : BEAT * 0.46;
  place(bassBus, t, dur, drop ? 0.3 : 0.24, 0, bassGen(hz(note), dur));
}

/* ------------------------------------------------------------------ */
/* claviers, nappe, arpège                                             */
/* ------------------------------------------------------------------ */

function keysGen(notes, dur) {
  const phases = notes.map(() => ({ p: 0, m: 0 }));
  let lp = 0;
  return (t) => {
    let sum = 0;
    for (let i = 0; i < notes.length; i++) {
      const f = hz(notes[i]);
      const st = phases[i];
      st.p += (2 * Math.PI * f) / SR;
      st.m += (2 * Math.PI * f * 2) / SR;
      const fm = Math.sin(st.p + 1.1 * Math.sin(st.m) * Math.exp(-t * 6));
      sum += fm * (1 - i * 0.06);
    }
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 2.6) * Math.min(1, Math.max(0, (dur - t) / 0.25));
    const a = 1 - Math.exp((-2 * Math.PI * 2400) / SR);
    lp += a * (sum - lp);
    return lp * env * 0.28;
  };
}

function padGen(notes, dur) {
  const phases = notes.flatMap(() => [0, 0, 0]);
  let lp = 0;
  return (t) => {
    let sum = 0;
    for (let i = 0; i < notes.length; i++) {
      const f = hz(notes[i]);
      for (let d = 0; d < 3; d++) {
        const idx = i * 3 + d;
        const detune = 1 + (d - 1) * 0.0035;
        phases[idx] += (2 * Math.PI * f * detune) / SR;
        sum += saw(phases[idx]);
      }
    }
    sum /= notes.length * 2.2;
    const attack = Math.min(1, t / 0.55);
    const release = Math.min(1, Math.max(0, (dur - t) / 0.6));
    const a = 1 - Math.exp((-2 * Math.PI * (900 + 500 * Math.sin(t * 0.7))) / SR);
    lp += a * (sum - lp);
    return lp * attack * release * 0.5;
  };
}

function pluckGen(f, bright = 3400) {
  let ph = 0;
  let lp = 0;
  return (t) => {
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp(-t * 13) * Math.min(1, t / 0.002);
    const a = 1 - Math.exp((-2 * Math.PI * bright) / SR);
    lp += a * (saw(ph) - lp);
    return lp * env;
  };
}

function bellGen(f) {
  return (t) => {
    const env = Math.exp(-t * 3.2) * Math.min(1, t / 0.004);
    return (
      Math.sin(2 * Math.PI * f * t) * 0.6 +
      Math.sin(2 * Math.PI * f * 2.01 * t) * 0.22 +
      Math.sin(2 * Math.PI * f * 3.02 * t) * 0.12
    ) * env;
  };
}

/* nappe : présente du début à la fin, plus dense sur l'outro */
for (let bar = 0; bar * BAR < DURATION; bar++) {
  const t = bar * BAR;
  const chord = CHORDS[bar % 4];
  const dur = Math.min(BAR + 0.3, DURATION - t);
  if (dur <= 0.05) continue;
  const level = t < CUT.facade ? 0.42 : t < CUT.end ? 0.13 : 0.22;
  place(music, t, dur, level, 0.05, padGen(chord.keys, dur), 0.35);
}

/* claviers : stabs rythmiques à partir de la façade */
for (let step = 0; (step * BEAT) / 2 < DURATION; step++) {
  const t = (step * BEAT) / 2;
  if (t >= CUT.end) {
    if (step % 8 === 0) {
      place(music, t, BEAT * 1.2, 0.12, 0, keysGen(chordAt(t).keys, BEAT * 1.2), 0.45);
    }
    continue;
  }
  if (t < CUT.facade) continue;
  const full = t >= CUT.prices - 0.05;
  if (full && step % 4 === 1) {
    place(music, t, BEAT * 0.55, 0.16, step % 2 ? 0.25 : -0.25, keysGen(chordAt(t).keys, BEAT * 0.55), 0.3);
  } else if (!full && step % 4 === 0) {
    place(music, t, BEAT * 0.7, 0.13, 0, keysGen(chordAt(t).keys, BEAT * 0.7), 0.3);
  }
}

/* arpège brillant : entrée discrète, plein sur le drop */
for (let step = 0; (step * BEAT) / 2 < DURATION - 0.1; step++) {
  const t = (step * BEAT) / 2;
  const chord = chordAt(t);
  const note = chord.lead[(step * 2 + Math.floor(t / BAR)) % chord.lead.length] + (t >= CUT.aisle ? 12 : 0);
  const level = t < CUT.facade ? 0.16 : t < CUT.prices ? 0.075 : t < CUT.aisle ? 0.09 : t < CUT.end ? 0.1 : 0.11;
  place(music, t, 0.4, level, step % 2 ? 0.55 : -0.55, pluckGen(hz(note)), 0.4);
}

/* intro : sub tenu, pouls feutré, charley lointain — on installe sans cogner */
function subGen(f, dur) {
  let ph = 0;
  return (t) => {
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (dur - t) / 0.5));
    return (Math.sin(ph) + 0.22 * Math.sin(2 * Math.PI * f * 2 * t)) * env * 0.34;
  };
}

for (let bar = 0; (bar + 1) * BAR < CUT.facade; bar++) {
  const t = bar * BAR;
  const dur = Math.min(BAR, CUT.facade - t);
  place(bassBus, t, dur, 0.5, 0, subGen(hz(CHORDS[bar % 4].bass), dur));
}

for (let beat = 0; beat * BEAT < CUT.facade - 0.05; beat++) {
  const t = beat * BEAT;
  if (t >= 3.4 && beat % 2 === 0) {
    place(drums, t, 0.36, 0.1 + 0.05 * ((t - 3.4) / 4), 0, kickGen());
  }
  if (t >= 2.6) {
    place(drums, t + BEAT / 2, 0.08, 0.022, 0.4, hatGen());
  }
  if (t >= 5.2 && beat % 2 === 1) {
    place(drums, t, 0.18, 0.03, -0.3, tambGen(), 0.2);
  }
}

/* hook : petite phrase de cloche, plans 3 et 4 */
const HOOK = [
  [0, 69, 1.0],
  [1, 72, 0.5],
  [1.5, 74, 0.5],
  [2, 77, 1.0],
  [3, 76, 0.75],
];
for (let bar = 0; bar * BAR < DURATION; bar++) {
  const t0 = bar * BAR;
  if (t0 < CUT.prices - 0.05 || t0 >= CUT.end) continue;
  for (const [beatOffset, note, len] of HOOK) {
    const t = t0 + beatOffset * BEAT;
    if (t > DURATION - 0.3) continue;
    place(air, t, len * BEAT, 0.085, 0.2, bellGen(hz(note)), 0.55);
  }
}

/* ------------------------------------------------------------------ */
/* effets : risers et impacts sur les coupes                           */
/* ------------------------------------------------------------------ */

function riserGen(dur) {
  let lp = 0;
  let bp = 0;
  return (t) => {
    const n = noise();
    const p = Math.min(1, t / dur);
    const cutoff = 300 + 6200 * p * p;
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
    lp += a * (n - lp);
    bp += 0.002 * (lp - bp);
    return (lp - bp) * 0.5 * Math.pow(p, 1.6);
  };
}

for (const cut of [CUT.facade, CUT.prices, CUT.aisle, CUT.end]) {
  const dur = cut === CUT.facade ? 2.2 : 1.4;
  if (cut - dur < 0) continue;
  place(air, cut - dur, dur, 0.16, 0.15, riserGen(dur), 0.3);
}

function impactGen() {
  let ph = 0;
  return (t) => {
    const f = 34 + 58 * Math.exp(-t * 9);
    ph += (2 * Math.PI * f) / SR;
    return sat(Math.sin(ph) * Math.exp(-t * 3.4) + noise() * Math.exp(-t * 40) * 0.15, 1.4);
  };
}

for (const cut of [CUT.facade, CUT.prices, CUT.aisle, CUT.end]) {
  place(air, cut, 1.6, cut === CUT.end ? 0.34 : 0.24, 0, impactGen(), 0.25);
}

/* ------------------------------------------------------------------ */
/* reverb (Schroeder) sur le bus send                                  */
/* ------------------------------------------------------------------ */

function reverbChannel({ room, damp }) {
  const combs = [1687, 1601, 2053, 2251].map((d) => ({ buf: new Float32Array(d), i: 0, lp: 0 }));
  const aps = [389, 211].map((d) => ({ buf: new Float32Array(d), i: 0 }));
  return (input) => {
    let wet = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * (1 - damp) + c.lp * damp;
      c.buf[c.i] = input + c.lp * room;
      c.i = (c.i + 1) % c.buf.length;
      wet += y;
    }
    wet *= 0.25;
    for (const ap of aps) {
      const y = ap.buf[ap.i];
      ap.buf[ap.i] = wet + y * 0.6;
      ap.i = (ap.i + 1) % ap.buf.length;
      wet = y - wet * 0.6;
    }
    return wet;
  };
}

const verbL = reverbChannel({ room: 0.76, damp: 0.28 });
const verbR = reverbChannel({ room: 0.74, damp: 0.3 });

/* ducking : la musique s'efface sous chaque grosse caisse */
const duck = new Float32Array(N).fill(1);
for (const k of kickTimes) {
  const i0 = Math.floor(k * SR);
  const len = Math.floor(0.3 * SR);
  for (let k2 = 0; k2 < len; k2++) {
    const i = i0 + k2;
    if (i >= N) break;
    const g = 1 - 0.28 * Math.exp(-(k2 / SR) * 9);
    if (g < duck[i]) duck[i] = g;
  }
}

/* ------------------------------------------------------------------ */
/* mix et écriture                                                     */
/* ------------------------------------------------------------------ */

const L = new Float32Array(N);
const R = new Float32Array(N);

for (let i = 0; i < N; i++) {
  const wetL = verbL(send.l[i]);
  const wetR = verbR(send.r[i]);
  L[i] = drums.l[i] * 0.95 + bassBus.l[i] * 0.98 * duck[i] + music.l[i] * duck[i] + air.l[i] + wetL * 0.9;
  R[i] = drums.r[i] * 0.95 + bassBus.r[i] * 0.98 * duck[i] + music.r[i] * duck[i] + air.r[i] + wetR * 0.9;
}

/* étage de gain doux */
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const trim = peak > 0 ? 0.5 / peak : 1;

for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fadeIn = Math.min(1, t / 0.6);
  const tail = t > DURATION - 1.6 ? Math.max(0, (DURATION - t) / 1.6) : 1;
  const edge = fadeIn * tail * tail;
  L[i] = sat(L[i] * trim * 1.5, 1.25) * edge;
  R[i] = sat(R[i] * trim * 1.5, 1.25) * edge;
}

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

let peakOut = 0;
let sumSq = 0;
for (let i = 0; i < N; i++) {
  peakOut = Math.max(peakOut, Math.abs(L[i]), Math.abs(R[i]));
  sumSq += L[i] * L[i] + R[i] * R[i];
}
const rms = Math.sqrt(sumSq / (N * 2));
const db = (v) => (20 * Math.log10(Math.max(v, 1e-6))).toFixed(1);
console.log(`score.wav · ${DURATION}s · pic ${db(peakOut)} dBFS · RMS ${db(rms)} dBFS · ${(bytes / 1024 / 1024).toFixed(1)} Mo`);
console.log(`arrangement · ${kicks.length} kicks · coupes ${Object.values(CUT).join(" / ")}`);
