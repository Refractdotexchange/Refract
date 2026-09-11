/**
 * Scores for the four PRISM films.
 *
 * Original music, synthesised from scratch — nothing sampled or licensed.
 *
 * Everything is in D minor at 96 BPM (a 2.5s bar), which is the tempo that
 * puts BestRoute's prism strike on bar 3 and its end card on bar 11. Under
 * that steady bed, accents are placed at the exact second each picture beat
 * happens, taken from the frame constants in the scene files. If you retime a
 * scene, retime the matching entry in CUES below.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mix, hz, sine, sineSweep, saw, noise, fm, pluck, svfLowpass, highpass, expEnv, adsr, writeWav, samples, SR } from "./synth.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "music");
const FPS = 30;
const s = (frame) => frame / FPS;
// 120 BPM: a 0.5s beat is exactly 15 frames at 30fps, so every downbeat lands
// on a whole frame and picture cues sit on the grid without drift.
const BEAT = 0.5;
const BAR = BEAT * 4;

/* ---------- harmony ------------------------------------------------------

   The films moved from an ambient bed to something with a pulse: A minor at
   120 BPM. That tempo is deliberate — a 0.5s beat is exactly 15 frames at
   30fps, so every downbeat lands on a whole frame and picture cues can be
   placed on the grid without drift.

   Voicings stay open and add9/9th-heavy: they read as modern and leave the
   middle clear for the bass, which now moves rather than droning.
--------------------------------------------------------------------------- */

const PROG = [
  { name: "Am9",    pad: [57, 60, 64, 67, 71], sub: 33, root: 45, arp: [57, 60, 64, 67, 71] },
  { name: "Fmaj9",  pad: [53, 57, 60, 64, 67], sub: 29, root: 41, arp: [53, 57, 60, 64, 67] },
  { name: "Cmaj9",  pad: [55, 59, 60, 64, 67], sub: 36, root: 48, arp: [55, 59, 60, 64, 67] },
  { name: "Em7",    pad: [55, 59, 62, 64, 67], sub: 28, root: 40, arp: [55, 59, 62, 64, 67] },
];
const chordAt = (i) => PROG[i % PROG.length];

/* ---------- instruments -------------------------------------------------- */

/** Wide detuned pad. Open voicing, gentle attack, sits behind everything. */
function pad(mix, midis, t, dur, { gain = 0.14, open = 1, send = 0.5 } = {}) {
  const len = samples(dur);
  midis.forEach((m, i) => {
    const v = saw(hz(m), dur, 3, 0.005 + i * 0.0012);
    const cut = 900 + 2100 * open;
    const f = svfLowpass(v, cut, 0.5);
    const env = adsr(len, 0.5, 0.7, 0.72, Math.min(1.4, dur * 0.45));
    for (let k = 0; k < len; k++) f[k] *= env[k];
    mix.add(f, t, { gain: gain / midis.length, pan: -0.55 + (i / (midis.length - 1 || 1)) * 1.1, send });
  });
}

/** Deep sine sub. Anchors the root without competing with the bassline. */
function sub(mix, midi, t, dur, gain = 0.42) {
  const len = samples(dur);
  const v = sine(hz(midi), dur);
  const env = adsr(len, 0.08, 0.3, 0.85, 0.5);
  for (let i = 0; i < len; i++) v[i] *= env[i];
  mix.add(v, t, { gain });
}

/**
 * Moving bassline — a filtered saw with a fast envelope on the cutoff, so each
 * note has a plucked attack. This is the main thing separating the new score
 * from the old drone.
 */
function bassNote(mix, midi, t, dur, { gain = 0.3, bite = 1 } = {}) {
  const len = samples(dur);
  const v = saw(hz(midi), dur, 2, 0.004);
  const cut = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t01 = i / len;
    cut[i] = 120 + (1500 + 900 * bite) * Math.exp(-t01 * 9);
  }
  const f = svfLowpass(v, cut, 0.88);
  const env = adsr(len, 0.004, 0.09, 0.55, 0.1);
  for (let i = 0; i < len; i++) f[i] *= env[i];
  mix.add(f, t, { gain, send: 0.12 });
}

/** Four-on-the-floor kick: pitch sweep plus a click for the transient. */
function kick(mix, t, gain = 0.72) {
  const len = samples(0.5);
  const body = sineSweep(150, 46, len, 5.2);
  const env = expEnv(len, 0.11);
  for (let i = 0; i < len; i++) body[i] *= env[i];
  const click = highpass(noise(samples(0.012)), 1800);
  for (let i = 0; i < click.length; i++) body[i] += click[i] * 0.5 * (1 - i / click.length);
  mix.add(body, t, { gain });
}

/** Layered noise clap on the backbeat. Three offset bursts, then a tail. */
function clap(mix, t, gain = 0.3) {
  const burst = (off, g) => {
    const len = samples(0.05);
    const n = highpass(svfLowpass(noise(len), 5200, 0.7), 900);
    const env = expEnv(len, 0.014);
    for (let i = 0; i < len; i++) n[i] *= env[i];
    mix.add(n, t + off, { gain: gain * g, send: 0.35 });
  };
  burst(0, 0.7); burst(0.011, 0.85); burst(0.023, 1);
  const tail = highpass(svfLowpass(noise(samples(0.24)), 4200, 0.6), 1100);
  const tenv = expEnv(tail.length, 0.07);
  for (let i = 0; i < tail.length; i++) tail[i] *= tenv[i];
  mix.add(tail, t + 0.03, { gain: gain * 0.5, send: 0.5 });
}

/** Closed hat. `open` stretches the decay for offbeat open hats. */
function hat(mix, t, { gain = 0.11, open = false, pan = 0 } = {}) {
  const dur = open ? 0.17 : 0.032;
  const n = highpass(noise(samples(dur)), open ? 6500 : 8200);
  const env = expEnv(n.length, open ? 0.06 : 0.011);
  for (let i = 0; i < n.length; i++) n[i] *= env[i];
  mix.add(n, t, { gain, pan, send: open ? 0.3 : 0.12 });
}

/** Short filtered chord stab — the rhythmic hook. */
function stab(mix, midis, t, { gain = 0.15, dur = 0.16, pan = 0 } = {}) {
  const len = samples(dur);
  midis.forEach((m) => {
    const v = saw(hz(m), dur, 2, 0.006);
    const f = svfLowpass(v, 2600, 0.8);
    const env = adsr(len, 0.005, 0.07, 0.25, 0.06);
    for (let i = 0; i < len; i++) f[i] *= env[i];
    mix.add(f, t, { gain: gain / midis.length, pan, send: 0.4 });
  });
}

function bell(mix, midi, t, { gain = 0.13, pan = 0, decay = 0.6, index = 3.2 } = {}) {
  const v = fm(hz(midi), 2.01, index, 1.4, decay);
  mix.add(v, t, { gain, pan, send: 0.7 });
}

function pluckNote(mix, midi, t, { gain = 0.14, pan = 0, dur = 0.9 } = {}) {
  const v = pluck(hz(midi), dur, 0.45);
  const env = expEnv(v.length, dur * 0.4);
  for (let i = 0; i < v.length; i++) v[i] *= env[i];
  mix.add(v, t, { gain, pan, send: 0.5 });
}

function impact(mix, t, { gain = 0.55, tone = 46 } = {}) {
  const len = samples(2.2);
  const boom = sineSweep(tone * 2.4, tone, len, 5);
  const env = expEnv(len, 0.42);
  for (let i = 0; i < len; i++) boom[i] *= env[i];
  const air = svfLowpass(noise(samples(1.1)), 2600, 0.6);
  const aenv = expEnv(air.length, 0.3);
  for (let i = 0; i < air.length; i++) boom[i] += air[i] * aenv[i] * 0.28;
  mix.add(boom, t, { gain, send: 0.6 });
}

function riser(mix, t, dur, { gain = 0.2 } = {}) {
  const len = samples(dur);
  const n = noise(len);
  const cut = new Float32Array(len);
  for (let i = 0; i < len; i++) cut[i] = 300 + 6800 * Math.pow(i / len, 2.1);
  const sw = svfLowpass(n, cut, 0.55);
  for (let i = 0; i < len; i++) sw[i] *= Math.pow(i / len, 1.6);
  mix.add(sw, t, { gain, send: 0.6 });
}

function whoosh(mix, t, dur, { gain = 0.22 } = {}) {
  const len = samples(dur);
  const cut = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t01 = i / len;
    cut[i] = 400 + 3400 * Math.sin(Math.PI * t01);
  }
  const n = svfLowpass(noise(len), cut, 0.5);
  for (let i = 0; i < len; i++) n[i] *= Math.sin(Math.PI * (i / len));
  mix.add(n, t, { gain, pan: -0.6, send: 0.5 });
  mix.add(n, t + dur * 0.35, { gain: gain * 0.7, pan: 0.6, send: 0.5 });
}

/* ---------- the bed ------------------------------------------------------

   `density(t)` returns 0..1 and decides how much of the kit plays at that
   moment. Drums enter in stages rather than all at once: sub and pad below
   0.3, kick from 0.35, hats from 0.5, bassline from 0.6, clap from 0.75.
   That is how one arrangement gives four films four different shapes.
--------------------------------------------------------------------------- */

function bed(mix, dur, density, { chordEvery = 4, padGain = 0.14, subGain = 0.4 } = {}) {
  // Harmony: one chord per two bars.
  for (let i = 0, t = 0; t < dur; i++, t += chordEvery) {
    const c = chordAt(i);
    const span = Math.min(chordEvery + 0.9, dur - t);
    const d = density(t);
    pad(mix, c.pad, t, span, { gain: padGain * (0.55 + 0.45 * d), open: 0.35 + 0.65 * d });
    sub(mix, c.sub, t, span, subGain * (0.7 + 0.3 * d));
  }

  // Rhythm section on the 120 BPM grid.
  for (let b = 0, t = 0; t < dur; b++, t += BEAT) {
    const d = density(t);
    const beatInBar = b % 4;
    const chordIdx = Math.floor(t / chordEvery);
    const c = chordAt(chordIdx);

    if (d >= 0.35) kick(mix, t, 0.62 * Math.min(1, 0.7 + d * 0.5));
    if (d >= 0.75 && (beatInBar === 1 || beatInBar === 3)) clap(mix, t, 0.26 * d);

    if (d >= 0.5) {
      hat(mix, t + BEAT / 2, { gain: 0.075 * d, open: d >= 0.8 && beatInBar % 2 === 1, pan: 0.18 });
      if (d >= 0.65) hat(mix, t + BEAT / 4, { gain: 0.038 * d, pan: -0.22 });
    }

    // Bassline: root on the beat, an octave-up passing note on the and.
    if (d >= 0.6) {
      bassNote(mix, c.root, t, BEAT * 0.9, { gain: 0.26 * d, bite: d });
      if (beatInBar === 3) bassNote(mix, c.root + 12, t + BEAT / 2, BEAT * 0.45, { gain: 0.17 * d, bite: d });
    }

    // Offbeat stabs once the track is fully up.
    if (d >= 0.85 && beatInBar % 2 === 0) {
      stab(mix, c.pad.slice(1, 4), t + BEAT / 2, { gain: 0.1 * d, pan: beatInBar === 0 ? -0.3 : 0.3 });
    }
  }
}

/** Sixteenth-note arp over the current chord. */
function arp(mix, from, to, { gain = 0.1, step = BEAT / 2, chordEvery = 4 } = {}) {
  let i = 0;
  for (let t = from; t < to; t += step, i++) {
    const c = chordAt(Math.floor(t / chordEvery));
    const n = c.arp[i % c.arp.length] + (i % 8 === 7 ? 12 : 0);
    pluckNote(mix, n, t, { gain, pan: -0.45 + ((i % 4) / 3) * 0.9, dur: 0.7 });
  }
}

const ramp = (t, a, b, lo, hi) => (t <= a ? lo : t >= b ? hi : lo + ((t - a) / (b - a)) * (hi - lo));


/* ---------- second-wave instruments --------------------------------------

   The first four films share one arrangement. The next four each need their
   own character, so these are the pieces that give each one a different
   identity: a tension tick, an urgent two-note motif, a warm major arp and a
   slow swell. Each cue below also carries its own progression rather than
   using PROG.
--------------------------------------------------------------------------- */

/** Dry clock tick. Tension without melody. */
function tick(mix, t, { gain = 0.09, pitch = 2400 } = {}) {
  const len = samples(0.03);
  const n = highpass(noise(len), pitch);
  const env = expEnv(len, 0.007);
  for (let i = 0; i < len; i++) n[i] *= env[i];
  mix.add(n, t, { gain, send: 0.18 });
}

/** Two-note oscillating motif — reads as an alert without being a siren. */
function alarmStab(mix, a, b, t, { gain = 0.15, step = 0.14, times = 4 } = {}) {
  for (let i = 0; i < times; i++) {
    const m = i % 2 === 0 ? a : b;
    const dur = step * 0.85;
    const len = samples(dur);
    const v = saw(hz(m), dur, 2, 0.008);
    const f = svfLowpass(v, 1900, 0.92);
    const env = adsr(len, 0.004, 0.05, 0.3, 0.05);
    for (let k = 0; k < len; k++) f[k] *= env[k];
    mix.add(f, t + i * step, { gain: gain * (1 - i * 0.12), pan: i % 2 ? 0.25 : -0.25, send: 0.3 });
  }
}

/** Bright major arpeggio — things clicking into place. */
function warmArp(mix, midis, t, { gain = 0.13, step = 0.125, octave = true } = {}) {
  midis.forEach((m, i) => {
    const n = octave && i === midis.length - 1 ? m + 12 : m;
    pluckNote(mix, n, t + i * step, { gain, pan: -0.4 + (i / Math.max(1, midis.length - 1)) * 0.8, dur: 1.1 });
  });
}

/** Slow filter-opening swell. Weight and arrival. */
function swell(mix, midis, t, dur, { gain = 0.2 } = {}) {
  const len = samples(dur);
  midis.forEach((m, i) => {
    const v = saw(hz(m), dur, 4, 0.007 + i * 0.001);
    const cut = new Float32Array(len);
    for (let k = 0; k < len; k++) cut[k] = 220 + 2600 * Math.pow(k / len, 1.7);
    const f = svfLowpass(v, cut, 0.6);
    for (let k = 0; k < len; k++) f[k] *= Math.pow(k / len, 1.15);
    mix.add(f, t, { gain: gain / midis.length, pan: -0.6 + (i / Math.max(1, midis.length - 1)) * 1.2, send: 0.7 });
  });
}

/** Minimal bed: sub + pad from an explicit progression, no drums. */
function quietBed(mix, prog, dur, { chordEvery = 5, padGain = 0.15, subGain = 0.42, open = 0.5 } = {}) {
  for (let i = 0, t = 0; t < dur; i++, t += chordEvery) {
    const c = prog[i % prog.length];
    const span = Math.min(chordEvery + 1.0, dur - t);
    pad(mix, c.pad, t, span, { gain: padGain, open });
    sub(mix, c.sub, t, span, subGain);
  }
}

/** Drums over an explicit progression, with the same staged entry as `bed`. */
function drumBed(mix, prog, dur, density, { chordEvery = 4, padGain = 0.13, subGain = 0.38 } = {}) {
  for (let i = 0, t = 0; t < dur; i++, t += chordEvery) {
    const c = prog[i % prog.length];
    const span = Math.min(chordEvery + 0.9, dur - t);
    const d = density(t);
    pad(mix, c.pad, t, span, { gain: padGain * (0.55 + 0.45 * d), open: 0.3 + 0.7 * d });
    sub(mix, c.sub, t, span, subGain * (0.7 + 0.3 * d));
  }
  for (let b = 0, t = 0; t < dur; b++, t += BEAT) {
    const d = density(t);
    const inBar = b % 4;
    const c = prog[Math.floor(t / chordEvery) % prog.length];
    if (d >= 0.35) kick(mix, t, 0.6 * Math.min(1, 0.7 + d * 0.5));
    if (d >= 0.75 && (inBar === 1 || inBar === 3)) clap(mix, t, 0.24 * d);
    if (d >= 0.5) hat(mix, t + BEAT / 2, { gain: 0.07 * d, open: d >= 0.8 && inBar % 2 === 1, pan: 0.18 });
    if (d >= 0.6 && c.root != null) bassNote(mix, c.root, t, BEAT * 0.9, { gain: 0.25 * d, bite: d });
  }
}

/* ---------- per-film harmony --------------------------------------------- */

// PRICE IMPACT — D minor with a flat-9 colour. Unsettled, then resolved.
const PROG_IMPACT = [
  { name: "Dm",      pad: [50, 57, 62, 65], sub: 26, root: 38 },
  { name: "Dm(b9)",  pad: [50, 57, 63, 65], sub: 26, root: 38 },
  { name: "Bbmaj7",  pad: [46, 53, 57, 65], sub: 22, root: 34 },
  { name: "A7sus",   pad: [45, 52, 57, 62], sub: 21, root: 33 },
];

// CLONE GUARD — F# minor. Tight, alert, resolves to safety.
const PROG_GUARD = [
  { name: "F#m",     pad: [54, 61, 66, 69], sub: 30, root: 42 },
  { name: "Dmaj7",   pad: [50, 57, 61, 66], sub: 26, root: 38 },
  { name: "Bm7",     pad: [47, 54, 59, 66], sub: 23, root: 35 },
  { name: "C#7sus",  pad: [49, 56, 61, 66], sub: 25, root: 37 },
];

// PORTFOLIO — C major. Warm, accumulating, satisfied.
const PROG_FOLIO = [
  { name: "Cmaj9",   pad: [48, 55, 59, 64, 67], sub: 24, root: 36, arp: [48, 55, 59, 64, 67] },
  { name: "Am9",     pad: [45, 52, 57, 64, 67], sub: 21, root: 33, arp: [45, 52, 57, 64, 67] },
  { name: "Fmaj9",   pad: [41, 53, 57, 60, 67], sub: 29, root: 41, arp: [41, 53, 57, 60, 64] },
  { name: "G6/9",    pad: [43, 50, 59, 62, 66], sub: 31, root: 43, arp: [43, 50, 55, 59, 62] },
];

// SELF-CUSTODY — E minor. Slow, weighted, immovable.
const PROG_CUSTODY = [
  { name: "Em",      pad: [52, 59, 64, 67], sub: 28, root: 40 },
  { name: "Cmaj7",   pad: [48, 55, 59, 64], sub: 24, root: 36 },
  { name: "Am",      pad: [45, 52, 57, 64], sub: 21, root: 33 },
  { name: "Bsus4",   pad: [47, 54, 59, 64], sub: 23, root: 35 },
];

const CUES = {
  /** MEET FACET — arrival, then warmth. */
  "refract-intro": (dur) => {
    const mix = new Mix(dur);
    const REVEAL = s(36), MOVE = s(168), END = s(292);
    bed(mix, dur, (t) => (t < REVEAL ? 0.18 : ramp(t, REVEAL, MOVE, 0.45, 0.72)), { padGain: 0.17 });

    // Light travelling in, then condensing into him.
    whoosh(mix, 0, REVEAL, { gain: 0.2 });
    impact(mix, REVEAL, { gain: 0.6, tone: 49 });
    [62, 69, 74, 81].forEach((m, i) => bell(mix, m, REVEAL + i * 0.045, { gain: 0.15, pan: -0.5 + i * 0.33, decay: 1.1 }));

    arp(mix, REVEAL + 1.2, MOVE + 1.6, { gain: 0.09 });
    riser(mix, END - 1.5, 1.5, { gain: 0.17 });
    impact(mix, END, { gain: 0.42, tone: 38 });
    pad(mix, PROG[0].pad, END, dur - END + 0.6, { gain: 0.2, open: 1 });
    sub(mix, 38, END, dur - END, 0.44);
    return mix;
  },

  /** ONE TRADE IN — build, search, verdict, payoff. */
  "refract-best-route": (dur) => {
    const mix = new Mix(dur);
    const THROW = s(116), HIT = s(150), CARDS = s(172), RESOLVE = s(262);
    const JUDGE = s(430), CALLOUT = s(486), TURN = s(632), END = s(750);

    bed(mix, dur, (t) => {
      if (t < HIT) return 0.3;
      if (t < JUDGE) return ramp(t, HIT, JUDGE, 0.62, 0.9);
      if (t < CALLOUT) return 0.5;            // a beat of air under the verdict
      if (t < END) return 0.95;
      return 0.6;
    });

    // He winds up and throws.
    riser(mix, THROW - 1.1, 1.1 + (HIT - THROW), { gain: 0.2 });
    impact(mix, HIT, { gain: 0.7, tone: 44 });
    [74, 78, 81, 86, 89].forEach((m, i) => bell(mix, m, HIT + i * 0.05, { gain: 0.16, pan: -0.6 + i * 0.3, decay: 0.9 }));

    // Six venues being probed.
    arp(mix, CARDS, JUDGE - 0.4, { gain: 0.1 });
    for (let i = 0; i < 6; i++) bell(mix, [69, 72, 76, 79, 81, 84][i], RESOLVE + i * 0.6, { gain: 0.1, pan: -0.5 + i * 0.2, decay: 0.5 });

    // The verdict, then the number.
    riser(mix, JUDGE - 1.4, 1.4, { gain: 0.24 });
    impact(mix, JUDGE, { gain: 0.72, tone: 38 });
    pluckNote(mix, 74, JUDGE + 0.16, { gain: 0.2 });
    [81, 86, 89, 93].forEach((m, i) => bell(mix, m, CALLOUT + i * 0.07, { gain: 0.17, pan: -0.4 + i * 0.27, decay: 1.3 }));
    impact(mix, CALLOUT, { gain: 0.34, tone: 50 });

    impact(mix, TURN, { gain: 0.46, tone: 43 });
    riser(mix, END - 1.6, 1.6, { gain: 0.18 });
    impact(mix, END, { gain: 0.5, tone: 38 });
    pad(mix, PROG[0].pad, END, dur - END + 0.6, { gain: 0.21, open: 1 });
    sub(mix, 38, END, dur - END, 0.46);
    return mix;
  },

  /** YOU ROUTED IT — light, shimmering, gold falling. */
  "refract-cashback": (dur) => {
    const mix = new Mix(dur);
    const FAN = s(66), RAIN = s(92), RATE = s(132), EXAMPLE = s(268), END = s(470);
    bed(mix, dur, (t) => ramp(t, 0, RATE, 0.3, 0.72), { padGain: 0.18, subGain: 0.42 });

    whoosh(mix, FAN - 0.5, 1.2, { gain: 0.18 });

    // Shards landing. Seeded off a fixed sequence so the cue is reproducible.
    const scale = [69, 72, 74, 76, 79, 81, 84, 86];
    for (let i = 0; i < 30; i++) {
      const t = RAIN + i * 0.36 + ((i * 7919) % 13) * 0.017;
      if (t > END - 0.4) break;
      bell(mix, scale[(i * 5) % scale.length], t, {
        gain: 0.085 + ((i * 3) % 5) * 0.006,
        pan: -0.7 + ((i * 11) % 15) / 10,
        decay: 0.75,
      });
    }

    impact(mix, RATE, { gain: 0.4, tone: 46 });
    arp(mix, RATE + 0.6, EXAMPLE, { gain: 0.075 });
    pluckNote(mix, 74, EXAMPLE, { gain: 0.16 });
    riser(mix, END - 1.4, 1.4, { gain: 0.15 });
    impact(mix, END, { gain: 0.44, tone: 38 });
    pad(mix, PROG[0].pad, END, dur - END + 0.6, { gain: 0.2, open: 1 });
    sub(mix, 38, END, dur - END, 0.44);
    return mix;
  },

  /** SEE THEM ON THE CURVE — a scan, then discovery. */
  "refract-launch-pools": (dur) => {
    const mix = new Mix(dur);
    const SCOPE = s(66), CARDS = s(96), BULLETS = s(168), CURVE = s(292), END = s(470);
    bed(mix, dur, (t) => (t < SCOPE ? 0.24 : ramp(t, SCOPE, CURVE, 0.5, 0.86)));

    whoosh(mix, SCOPE - 0.4, 1.6, { gain: 0.22 });

    // One tick per token found — same 30-frame stagger the cards use.
    for (let i = 0; i < 6; i++) {
      const t = CARDS + i * (30 / FPS);
      bell(mix, [69, 74, 76, 81, 84, 88][i], t, { gain: 0.13, pan: -0.55 + i * 0.22, decay: 0.55 });
      pluckNote(mix, [50, 55, 57, 62, 65, 69][i], t + 0.05, { gain: 0.09, pan: -0.4 + i * 0.16 });
    }

    arp(mix, BULLETS, CURVE, { gain: 0.085 });
    riser(mix, CURVE - 1.2, 1.2, { gain: 0.18 });
    impact(mix, CURVE, { gain: 0.46, tone: 43 });
    arp(mix, CURVE + 0.6, END - 0.5, { gain: 0.1, step: BEAT / 2 });
    riser(mix, END - 1.4, 1.4, { gain: 0.16 });
    impact(mix, END, { gain: 0.48, tone: 38 });
    pad(mix, PROG[0].pad, END, dur - END + 0.6, { gain: 0.2, open: 1 });
    sub(mix, 38, END, dur - END, 0.44);
    return mix;
  },

  /* ------------------------------------------------------------------------
     Second wave. Each of these carries its own progression, tempo feel and
     instrument set, so the four do not sound like variations of one track.
  ------------------------------------------------------------------------ */

  /** THE SIZE MOVES THE PRICE — D minor. Tension held, then released. */
  "refract-price-impact": (dur) => {
    const mix = new Mix(dur);
    const SMALL = s(96), GROW = s(210), WARN = s(360), EASE = s(500), END = s(580);

    quietBed(mix, PROG_IMPACT, dur, { chordEvery: 5.5, padGain: 0.15, subGain: 0.4, open: 0.34 });

    // A clock under the small trade: steady, unhurried.
    for (let t = SMALL; t < GROW; t += BEAT) tick(mix, t, { gain: 0.075 });
    // As size grows the clock doubles and climbs.
    for (let t = GROW, k = 0; t < WARN; t += BEAT / 2, k++) {
      tick(mix, t, { gain: 0.06 + 0.05 * (k / 40), pitch: 2200 + k * 55 });
    }

    riser(mix, WARN - 2.0, 2.0, { gain: 0.22 });
    impact(mix, WARN, { gain: 0.6, tone: 34 });
    alarmStab(mix, 62, 61, WARN + 0.1, { gain: 0.16, step: 0.16, times: 4 });
    pad(mix, PROG_IMPACT[1].pad, WARN, EASE - WARN, { gain: 0.19, open: 0.5 });
    sub(mix, 26, WARN, EASE - WARN, 0.5);

    // Resolution: the warning did its job, the trade gets smaller.
    swell(mix, PROG_IMPACT[3].pad, EASE - 1.2, 2.4, { gain: 0.2 });
    [69, 74, 77].forEach((m, i) => bell(mix, m, EASE + i * 0.16, { gain: 0.13, pan: -0.4 + i * 0.4, decay: 1.2 }));
    impact(mix, END, { gain: 0.42, tone: 38 });
    pad(mix, PROG_IMPACT[0].pad, END, dur - END + 0.6, { gain: 0.2, open: 0.9 });
    sub(mix, 26, END, dur - END, 0.44);
    return mix;
  },

  /** THREE TOKENS, ONE NAME — F# minor. Urgent, then safe. */
  "refract-clone-guard": (dur) => {
    const mix = new Mix(dur);
    const SPOT = s(84), DUPES = s(150), FLAG = s(300), SAFE = s(430), END = s(520);

    drumBed(mix, PROG_GUARD, dur, (t) => {
      if (t < SPOT) return 0.2;
      if (t < FLAG) return ramp(t, SPOT, FLAG, 0.45, 0.82);
      if (t < SAFE) return 0.86;
      return ramp(t, SAFE, SAFE + 3, 0.86, 0.5);
    }, { chordEvery: 4, padGain: 0.13 });

    whoosh(mix, SPOT - 0.6, 1.0, { gain: 0.18 });
    // One stab per duplicate as it is spotted.
    [0, 0.42, 0.84].forEach((o, i) => alarmStab(mix, 66, 65, DUPES + o, { gain: 0.15 - i * 0.02, step: 0.13, times: 2 }));

    riser(mix, FLAG - 1.4, 1.4, { gain: 0.2 });
    impact(mix, FLAG, { gain: 0.58, tone: 30 });
    alarmStab(mix, 66, 65, FLAG + 0.08, { gain: 0.18, step: 0.15, times: 6 });

    // The all-clear: the alert motif inverts into a resolving fourth.
    swell(mix, PROG_GUARD[1].pad, SAFE - 1.0, 2.2, { gain: 0.21 });
    [61, 66, 70, 73].forEach((m, i) => bell(mix, m, SAFE + i * 0.12, { gain: 0.14, pan: -0.5 + i * 0.33, decay: 1.1 }));
    impact(mix, END, { gain: 0.4, tone: 42 });
    pad(mix, PROG_GUARD[0].pad, END, dur - END + 0.6, { gain: 0.2, open: 0.95 });
    sub(mix, 30, END, dur - END, 0.44);
    return mix;
  },

  /** EVERYTHING YOU HOLD — C major. Warm, accumulating, resolved. */
  "refract-portfolio": (dur) => {
    const mix = new Mix(dur);
    const SCAN = s(78), FOUND = s(168), STACK = s(300), TOTAL = s(430), END = s(520);

    drumBed(mix, PROG_FOLIO, dur, (t) => {
      if (t < SCAN) return 0.22;
      if (t < STACK) return ramp(t, SCAN, STACK, 0.4, 0.72);
      return ramp(t, STACK, TOTAL, 0.72, 0.9);
    }, { chordEvery: 4, padGain: 0.14, subGain: 0.36 });

    // Each found holding is one bright arpeggio.
    [0, 0.9, 1.8, 2.7].forEach((o, i) => {
      const c = PROG_FOLIO[i % PROG_FOLIO.length];
      warmArp(mix, c.arp, FOUND + o, { gain: 0.12, step: 0.115 });
    });

    arp(mix, STACK, TOTAL, { gain: 0.075, step: BEAT / 2, chordEvery: 4 });
    riser(mix, TOTAL - 1.2, 1.2, { gain: 0.16 });
    impact(mix, TOTAL, { gain: 0.5, tone: 36 });
    [72, 76, 79, 84].forEach((m, i) => bell(mix, m, TOTAL + i * 0.1, { gain: 0.13, pan: -0.45 + i * 0.3, decay: 1.3 }));
    swell(mix, PROG_FOLIO[0].pad, END - 1.0, 2.0, { gain: 0.2 });
    sub(mix, 24, END, dur - END, 0.44);
    return mix;
  },

  /** YOUR KEYS, YOUR TRADE — E minor. Slow, weighted, immovable. */
  "refract-self-custody": (dur) => {
    const mix = new Mix(dur);
    const LOCK = s(90), EXACT = s(210), SIGN = s(340), END = s(450);

    // Deliberately sparse: half-time kick only, so the space reads as solidity.
    quietBed(mix, PROG_CUSTODY, dur, { chordEvery: 5, padGain: 0.16, subGain: 0.46, open: 0.42 });
    for (let t = LOCK, i = 0; t < END; t += BEAT * 2, i++) {
      kick(mix, t, i % 2 === 0 ? 0.6 : 0.42);
      if (t > EXACT) hat(mix, t + BEAT, { gain: 0.05, pan: 0.2 });
    }

    impact(mix, LOCK, { gain: 0.56, tone: 28 });
    // The approval closing: two low, definite notes.
    bassNote(mix, 40, EXACT, 0.8, { gain: 0.3, bite: 0.4 });
    bassNote(mix, 35, EXACT + 0.9, 1.0, { gain: 0.28, bite: 0.4 });

    swell(mix, PROG_CUSTODY[0].pad, SIGN - 1.4, 2.6, { gain: 0.22 });
    impact(mix, SIGN, { gain: 0.5, tone: 33 });
    [64, 67, 71].forEach((m, i) => bell(mix, m, SIGN + i * 0.18, { gain: 0.12, pan: -0.35 + i * 0.35, decay: 1.5 }));
    impact(mix, END, { gain: 0.44, tone: 40 });
    pad(mix, PROG_CUSTODY[0].pad, END, dur - END + 0.6, { gain: 0.21, open: 1 });
    sub(mix, 28, END, dur - END, 0.46);
    return mix;
  },

  /** STOP PICKING A SIZE — three sizes struck out, then an open field. */
  "refract-any-amount": (dur) => {
    const mix = new Mix(dur);
    const CHIPS = s(96), STRIKE = s(176), FIELD = s(236), TYPE = s(258);
    const SPLIT = s(372), REDACT = s(404), END = s(556);

    // Held back until the strike, so the removal of the old way is the first
    // thing the music reacts to rather than the third.
    bed(mix, dur, (t) => {
      if (t < STRIKE) return 0.3;
      if (t < FIELD) return ramp(t, STRIKE, FIELD, 0.5, 0.72);
      if (t < SPLIT) return 0.84;
      return 0.95;
    }, { padGain: 0.17 });

    // Each denomination arriving, then each one crossed out.
    [0, 1, 2].forEach((i) => hat(mix, CHIPS + i * 0.3, { gain: 0.07, pan: -0.3 + i * 0.3 }));
    [0, 1, 2].forEach((i) => tick(mix, STRIKE + i * 0.27, { gain: 0.15, pan: -0.3 + i * 0.3 }));

    // The field opening is the turn, so it gets the impact.
    riser(mix, FIELD - 1.4, 1.4, { gain: 0.18 });
    impact(mix, FIELD, { gain: 0.56, tone: 33 });

    // One tick per digit typed, tracking the picture's 46-frame type-on.
    for (let i = 0; i < 6; i++) tick(mix, TYPE + i * (46 / FPS / 6), { gain: 0.1, pan: 0.1 });

    // The split: two notes, the second left hanging because it is the half
    // that never resolves into a visible number.
    bassNote(mix, 38, SPLIT, 0.7, { gain: 0.3, bite: 0.4 });
    bassNote(mix, 45, SPLIT + 0.8, 1.1, { gain: 0.26, bite: 0.35 });

    // Redaction reads as something closing rather than landing.
    swell(mix, PROG[0].pad, REDACT - 1.2, 2.2, { gain: 0.22 });
    [67, 71, 74].forEach((m, i) => bell(mix, m, REDACT + i * 0.16, { gain: 0.12, pan: -0.35 + i * 0.35, decay: 1.6 }));

    impact(mix, END, { gain: 0.44, tone: 38 });
    pad(mix, PROG[0].pad, END, dur - END + 0.6, { gain: 0.2, open: 1 });
    sub(mix, 38, END, dur - END, 0.45);
    return mix;
  },
};

/* ---------- render ------------------------------------------------------- */

// Must match durationInFrames in src/Root.tsx.
const DURATIONS = {
  "refract-intro": 360 / FPS,
  "refract-best-route": 840 / FPS,
  "refract-cashback": 570 / FPS,
  "refract-launch-pools": 570 / FPS,
  "refract-price-impact": 660 / FPS,
  "refract-clone-guard": 600 / FPS,
  "refract-portfolio": 600 / FPS,
  "refract-self-custody": 540 / FPS,
  "refract-any-amount": 660 / FPS,
};

/* ---------- motion type --------------------------------------------------

   Thirteen type-driven films, scored from one builder rather than thirteen
   hand-written cues. The picture is already described as data in
   `src/motion/script.ts`; `emit-cues.mjs` resolves that to frame times, and
   everything below is derived from them — a tick as each beat of type lands,
   an impact on every beat the script marks `punch`, and the fan beat scored as
   the resolve. Retiming a beat therefore retimes its music with no second
   edit, which is the one thing the hand-cued scenes above cannot promise.

   The four groups get four characters so a thread of them does not sound like
   one track thirteen times: the confessions are unsettled D minor, the honesty
   films slow and weighted in E minor, the manifesto gets the full A minor
   arrangement the first four films share, and the craft films are warm C major.
-------------------------------------------------------------------------- */

const MOTION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "motion-cues.json"), "utf8"));

const MOTION_GROUPS = {
  confession: { prog: PROG_IMPACT,  lo: 0.18, hi: 0.86, chordEvery: 4, tone: 42, colour: "alarm" },
  honesty:    { prog: PROG_CUSTODY, lo: 0.14, hi: 0.70, chordEvery: 5, tone: 38, colour: "swell" },
  manifesto:  { prog: PROG,         lo: 0.26, hi: 1.00, chordEvery: 4, tone: 44, colour: "bells" },
  craft:      { prog: PROG_FOLIO,   lo: 0.32, hi: 0.82, chordEvery: 4, tone: 46, colour: "arp"   },
};

function motionScore(film, dur) {
  const mix = new Mix(dur);
  const g = MOTION_GROUPS[film.group];
  const bodyEnd = s(film.bodyEnd);
  const chordAtT = (t) => g.prog[Math.floor(t / g.chordEvery) % g.prog.length];

  // The kit fills out across the body, then steps back under the end card so
  // the lockup is not competing with a full arrangement.
  const density = (t) => (t >= bodyEnd ? 0.38 : ramp(t, 0, bodyEnd * 0.7, g.lo, g.hi));
  drumBed(mix, g.prog, dur, density, { chordEvery: g.chordEvery, padGain: 0.14, subGain: 0.4 });

  // One dry tick per beat of type. Slams get a brighter one — the set's
  // equivalent of a key click, and the thing that makes the cuts feel written.
  let punchIndex = 0;
  for (const c of film.cues) {
    const t = s(c.at);
    if (t >= bodyEnd) continue;
    tick(mix, t, { gain: c.k === "slam" ? 0.085 : 0.06, pitch: c.k === "slam" ? 3400 : 2200 });

    if (c.punch) {
      impact(mix, t, { gain: 0.46, tone: g.tone });
      const chord = chordAtT(t);
      if (g.colour === "alarm" && punchIndex === 0) {
        // The first punch of a confession is the wrong number arriving.
        alarmStab(mix, chord.pad[1], chord.pad[2], t + 0.12, { gain: 0.14, times: 4 });
      } else if (g.colour === "swell") {
        swell(mix, chord.pad, Math.max(0, t - 0.9), 1.5, { gain: 0.17 });
      } else if (g.colour === "arp") {
        warmArp(mix, chord.pad.slice(0, 4), t + 0.1, { gain: 0.11, step: 0.1 });
      } else {
        chord.pad.slice(1, 4).forEach((m, i) => bell(mix, m + 12, t + i * 0.05, { gain: 0.13, pan: -0.4 + i * 0.4, decay: 1.0 }));
      }
      punchIndex++;
    }

    // The resolve: the fan going out of Facet gets the brightest figure in the
    // film, whatever the group's palette is.
    if (c.fan) {
      const chord = chordAtT(t);
      warmArp(mix, chord.pad, t + 0.15, { gain: 0.13, step: 0.115 });
      [72, 76, 79, 84].forEach((m, i) => bell(mix, m, t + 0.3 + i * 0.06, { gain: 0.12, pan: -0.5 + i * 0.33, decay: 1.3 }));
    }
  }

  // Into the end card.
  riser(mix, Math.max(0, bodyEnd - 1.5), 1.5, { gain: 0.16 });
  impact(mix, bodyEnd, { gain: 0.44, tone: g.tone - 4 });
  pad(mix, g.prog[0].pad, bodyEnd, dur - bodyEnd + 0.6, { gain: 0.2, open: 1 });
  sub(mix, g.prog[0].sub, bodyEnd, Math.max(0.1, dur - bodyEnd), 0.45);
  return mix;
}

for (const film of MOTION.films) {
  const name = `refract-${film.slug}`;
  CUES[name] = (dur) => motionScore(film, dur);
  DURATIONS[name] = film.durationInFrames / FPS;
}

/* ---------- the three bespoke films --------------------------------------

   These carry frame constants rather than a beat list, so each gets a written
   cue like the eight explainers do — but reading `MOTION.bespoke`, which is
   generated from `src/films/timing.ts`. Retiming a film still moves its music.

   Three characters, because three different arguments: HeadToHead is a race
   and wants a pulse, TokenFaces is generative and wants something that
   accumulates rather than builds, OneScreen is a demo and stays out of the way
   until the trade lands.
-------------------------------------------------------------------------- */

const B = MOTION.bespoke;

// HEAD TO HEAD — B minor, driving. Two lanes, one pulse.
const PROG_RACE = [
  { name: "Bm",     pad: [47, 54, 59, 66], sub: 23, root: 35 },
  { name: "G6",     pad: [43, 50, 59, 64], sub: 31, root: 43 },
  { name: "D",      pad: [50, 57, 62, 66], sub: 26, root: 38 },
  { name: "A/C#",   pad: [49, 57, 61, 64], sub: 25, root: 37 },
];

CUES["refract-head-to-head"] = (dur) => {
  const mix = new Mix(dur);
  const t = B["head-to-head"];
  const end = s(t.end);
  // Holds a steady drive from the moment both lanes are fed, because the film
  // is a race and a race does not build, it runs.
  drumBed(mix, PROG_RACE, dur, (x) => (x >= end ? 0.4 : x < s(t.send) ? 0.35 : 0.88), { chordEvery: 4 });

  whoosh(mix, s(t.send) - 0.4, 0.8, { gain: 0.2 });
  // Each probe resolving gets its own note, climbing — the sound of a search
  // completing rather than of something being hit.
  for (let i = 0; i < 5; i++) {
    pluckNote(mix, [66, 69, 71, 74, 78][i], s(t.probeFrom + i * t.probeGap), { gain: 0.14, pan: -0.5 + i * 0.25, dur: 0.8 });
  }
  tick(mix, s(t.leftLand), { gain: 0.1, pitch: 1800 });
  impact(mix, s(t.rightLand), { gain: 0.5, tone: 41 });
  warmArp(mix, PROG_RACE[0].pad, s(t.rightLand) + 0.12, { gain: 0.12, step: 0.11 });
  impact(mix, s(t.delta), { gain: 0.44, tone: 45 });
  [74, 78, 81, 86].forEach((m, i) => bell(mix, m, s(t.delta) + 0.06 * i, { gain: 0.13, pan: -0.45 + i * 0.3, decay: 1.1 }));
  riser(mix, end - 1.4, 1.4, { gain: 0.16 });
  impact(mix, end, { gain: 0.42, tone: 37 });
  pad(mix, PROG_RACE[0].pad, end, dur - end + 0.6, { gain: 0.2, open: 1 });
  sub(mix, PROG_RACE[0].sub, end, Math.max(0.1, dur - end), 0.45);
  return mix;
};

// TOKEN FACES — G lydian, bright and accumulating. No drums until the wall is
// most of the way up: the film is additive, and so is the arrangement.
const PROG_FACES = [
  { name: "Gmaj9",  pad: [55, 59, 62, 66, 69], sub: 31, root: 43 },
  { name: "Amaj9",  pad: [57, 61, 64, 68, 71], sub: 33, root: 45 },
  { name: "Em9",    pad: [52, 59, 62, 66, 71], sub: 28, root: 40 },
  { name: "Cmaj7#11", pad: [48, 55, 59, 64, 66], sub: 24, root: 36 },
];

CUES["refract-token-faces"] = (dur) => {
  const mix = new Mix(dur);
  const t = B["token-faces"];
  const end = s(t.end);
  const wall = s(t.wallFrom);
  drumBed(mix, PROG_FACES, dur, (x) => (x >= end ? 0.35 : x < wall ? 0.2 : ramp(x, wall, s(t.hero), 0.42, 0.8)), { chordEvery: 5 });

  bell(mix, 74, s(t.bloom), { gain: 0.16, decay: 1.6 });
  // One note per disc, cycling the chord — forty eight of them, quiet enough
  // to read as texture rather than as a melody.
  for (let i = 1; i < t.wallCount; i++) {
    const at = s(t.wallFrom + i * t.wallGap);
    if (at >= end) break;
    const chord = PROG_FACES[Math.floor(at / 5) % PROG_FACES.length];
    pluckNote(mix, chord.pad[i % chord.pad.length] + (i % 9 === 8 ? 12 : 0), at, {
      gain: 0.055, pan: -0.6 + ((i % 12) / 11) * 1.2, dur: 0.7,
    });
  }
  swell(mix, PROG_FACES[0].pad, s(t.hero) - 1.0, 1.6, { gain: 0.18 });
  impact(mix, s(t.hero), { gain: 0.4, tone: 43 });
  warmArp(mix, PROG_FACES[0].pad, s(t.line), { gain: 0.12, step: 0.12 });
  riser(mix, end - 1.4, 1.4, { gain: 0.15 });
  impact(mix, end, { gain: 0.42, tone: 38 });
  pad(mix, PROG_FACES[0].pad, end, dur - end + 0.6, { gain: 0.2, open: 1 });
  sub(mix, PROG_FACES[0].sub, end, Math.max(0.1, dur - end), 0.44);
  return mix;
};

// ONE SCREEN — A minor, the same key as the first four explainers, because
// this one is a product demo and belongs to that family. Sparse under the
// interface, full only once the trade is signed.
CUES["refract-one-screen"] = (dur) => {
  const mix = new Mix(dur);
  const t = B["one-screen"];
  const end = s(t.end);
  bed(mix, dur, (x) => {
    if (x >= end) return 0.42;
    if (x < s(t.quoteFrom)) return 0.3;
    if (x < s(t.pick)) return 0.55;
    if (x < s(t.done)) return 0.72;
    return 0.95;
  }, { padGain: 0.15 });

  // Typing, then each quote landing.
  for (let i = 0; i < 4; i++) tick(mix, s(t.amount) + i * 0.16, { gain: 0.07, pitch: 3000 });
  for (let i = 0; i < 6; i++) tick(mix, s(t.quoteFrom + i * t.rowGap), { gain: 0.075, pitch: 2400 + i * 120 });

  impact(mix, s(t.pick), { gain: 0.46, tone: 44 });
  [74, 78, 81].forEach((m, i) => bell(mix, m, s(t.pick) + i * 0.055, { gain: 0.14, pan: -0.35 + i * 0.35, decay: 1.0 }));
  pluckNote(mix, 69, s(t.impact), { gain: 0.12, dur: 0.9 });
  alarmStab(mix, 64, 67, s(t.approve), { gain: 0.1, times: 2, step: 0.16 });
  impact(mix, s(t.done), { gain: 0.52, tone: 40 });
  warmArp(mix, PROG[0].pad, s(t.done) + 0.12, { gain: 0.13, step: 0.11 });
  riser(mix, end - 1.4, 1.4, { gain: 0.16 });
  impact(mix, end, { gain: 0.42, tone: 38 });
  pad(mix, PROG[0].pad, end, dur - end + 0.6, { gain: 0.2, open: 1 });
  sub(mix, PROG[0].sub, end, Math.max(0.1, dur - end), 0.45);
  return mix;
};

for (const [slug, t] of Object.entries(B)) DURATIONS[`refract-${slug}`] = t.duration / FPS;

/* ---------- the comparison set -------------------------------------------

   Three treatments of one brand, scored to sit apart from each other: a slow
   orbit, a bed that stays under a speaking voice, and a hard-cut track.
-------------------------------------------------------------------------- */

const T3 = MOTION.three;

// DIMENSIONAL — slow, wide, weightless. Bells on the camera's turning points.
CUES["refract-dimensional"] = (dur) => {
  const mix = new Mix(dur);
  const t = T3.dimensional;
  const end = s(t.end);
  quietBed(mix, PROG_FOLIO, dur, { chordEvery: 5, padGain: 0.17, subGain: 0.44, open: 0.62 });
  drumBed(mix, PROG_FOLIO, dur, (x) => (x >= end ? 0.3 : ramp(x, s(t.settle), s(t.rest), 0.2, 0.62)), { chordEvery: 5, padGain: 0.05, subGain: 0.12 });

  whoosh(mix, 0, s(t.settle), { gain: 0.18 });
  impact(mix, s(t.settle), { gain: 0.42, tone: 40 });
  // One figure per camera move, so the score turns when the picture does.
  [t.swing, t.cross, t.rest].forEach((frame, i) => {
    warmArp(mix, PROG_FOLIO[(i + 1) % PROG_FOLIO.length].pad, s(frame) - 0.3, { gain: 0.1, step: 0.13 });
    bell(mix, [79, 74, 83][i], s(frame), { gain: 0.13, pan: [-0.4, 0.4, 0][i], decay: 1.5 });
  });
  swell(mix, PROG_FOLIO[0].pad, s(t.line) - 1.2, 1.8, { gain: 0.18 });
  riser(mix, end - 1.5, 1.5, { gain: 0.15 });
  impact(mix, end, { gain: 0.42, tone: 38 });
  pad(mix, PROG_FOLIO[0].pad, end, dur - end + 0.6, { gain: 0.2, open: 1 });
  sub(mix, PROG_FOLIO[0].sub, end, Math.max(0.1, dur - end), 0.44);
  return mix;
};

// FACET SPEAKS — a bed, and nothing else. It has to stay under a voice, so
// there are no impacts and no drums: only pad, sub and a soft pulse.
CUES["refract-facet-speaks"] = (dur) => {
  const mix = new Mix(dur);
  const t = T3.speaks;
  const end = s(t.end);
  quietBed(mix, PROG_CUSTODY, dur, { chordEvery: 5, padGain: 0.13, subGain: 0.34, open: 0.42 });
  for (let x = 0; x < end; x += BEAT * 2) {
    hat(mix, x, { gain: 0.03, pan: 0.12 });
    if (x % (BEAT * 8) < 0.01) pluckNote(mix, PROG_CUSTODY[Math.floor(x / 5) % 4].pad[2], x, { gain: 0.05, dur: 1.1 });
  }
  swell(mix, PROG_CUSTODY[0].pad, end - 2.0, 2.0, { gain: 0.14 });
  impact(mix, end, { gain: 0.34, tone: 38 });
  pad(mix, PROG_CUSTODY[0].pad, end, dur - end + 0.6, { gain: 0.19, open: 1 });
  sub(mix, PROG_CUSTODY[0].sub, end, Math.max(0.1, dur - end), 0.42);
  return mix;
};

// QUICK CUTS — full kit from the first bar, and a hit on every cut.
CUES["refract-quick-cuts"] = (dur) => {
  const mix = new Mix(dur);
  const t = T3.quick;
  const end = s(t.end);
  drumBed(mix, PROG_GUARD, dur, (x) => (x >= end ? 0.4 : 0.95), { chordEvery: 4 });
  t.cuts.forEach((frame, i) => {
    const at = s(frame);
    if (at >= end) return;
    impact(mix, at, { gain: 0.34, tone: 44 });
    tick(mix, at, { gain: 0.1, pitch: 3200 });
    stab(mix, PROG_GUARD[i % 4].pad.slice(1, 4), at, { gain: 0.13, pan: i % 2 ? 0.28 : -0.28 });
  });
  riser(mix, end - 1.2, 1.2, { gain: 0.18 });
  impact(mix, end, { gain: 0.46, tone: 38 });
  pad(mix, PROG_GUARD[0].pad, end, dur - end + 0.6, { gain: 0.2, open: 1 });
  sub(mix, PROG_GUARD[0].sub, end, Math.max(0.1, dur - end), 0.45);
  return mix;
};

for (const [slug, t] of Object.entries(T3)) DURATIONS[`refract-${{
  dimensional: "dimensional", speaks: "facet-speaks", quick: "quick-cuts",
}[slug]}`] = t.duration / FPS;



/** Integrated loudness, via ffmpeg's EBU R128 meter (which reports on stderr). */
function measureLufs(file) {
  const r = spawnSync("ffmpeg", ["-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const m = (r.stderr || "").match(/I:\s+(-?[\d.]+) LUFS/g);
  return m ? parseFloat(m[m.length - 1].match(/(-?[\d.]+)/)[1]) : null;
}

/**
 * Match every cue to one loudness target. Without this the four sit between
 * -13 and -17.5 LUFS and jump audibly when they are cut together. -15 LUFS
 * leaves headroom under the -14 that the social platforms normalise to, so
 * nothing gets turned down on upload.
 */
const TARGET_LUFS = -15;

/**
 * Optional filters: `node music/compose.mjs mt-` rebuilds only the motion-type
 * tracks. With none given, every cue is rebuilt.
 */
const only = process.argv.slice(2);
const wanted = Object.keys(CUES).filter((n) => only.length === 0 || only.some((f) => n.includes(f)));
if (wanted.length === 0) {
  console.error(`no cue matches ${only.join(" ")}`);
  process.exit(1);
}

for (const name of wanted) {
  const build = CUES[name];
  const dur = DURATIONS[name];
  const t0 = Date.now();
  const raw = path.join(OUT, `${name}.raw.wav`);
  const final = path.join(OUT, `${name}.wav`);

  writeWav(raw, build(dur).render());

  const lufs = measureLufs(raw);
  const gain = lufs === null ? 0 : TARGET_LUFS - lufs;
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", raw,
    "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.94:level=disabled`,
    "-c:a", "pcm_s16le", final,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  fs.unlinkSync(raw);

  const bytes = fs.statSync(final).size;
  console.log(
    `${name}.wav  ${dur.toFixed(2)}s  ${(bytes / 1e6).toFixed(1)}MB  ` +
    `${lufs?.toFixed(1)} -> ${TARGET_LUFS} LUFS (${gain >= 0 ? "+" : ""}${gain.toFixed(1)}dB)  (${Date.now() - t0}ms)`
  );
}
