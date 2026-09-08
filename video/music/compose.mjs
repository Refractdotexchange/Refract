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
const BAR = 2.5;
const BEAT = BAR / 4;

/* ---------- harmony ------------------------------------------------------ */

// i - VI - III - iv in D minor, voiced open so the pad never muddies the sub.
const PROG = [
  { name: "Dm9",    pad: [50, 57, 60, 65], sub: 38, arp: [50, 57, 60, 65, 69] },
  { name: "Bbmaj7", pad: [46, 53, 57, 65], sub: 34, arp: [46, 53, 57, 65, 69] },
  { name: "Fadd9",  pad: [48, 53, 60, 67], pad2: 55, sub: 41, arp: [48, 53, 55, 60, 67] },
  { name: "Gm7",    pad: [50, 55, 58, 65], sub: 43, arp: [50, 55, 58, 65, 70] },
];
const chordAt = (i) => PROG[i % PROG.length];

/* ---------- instruments -------------------------------------------------- */

/** Wide supersaw pad under a slow filter sweep. The bed of every cue. */
function pad(mix, midis, t, dur, { gain = 0.16, open = 1, send = 0.55 } = {}) {
  const len = samples(dur);
  const env = adsr(len, Math.min(1.1, dur * 0.34), 0.5, 0.8, Math.min(1.4, dur * 0.4));
  // Cutoff drifts up across the note so a held chord keeps developing.
  const cut = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t01 = i / len;
    cut[i] = (520 + 900 * open * t01) * (1 + 0.12 * Math.sin((2 * Math.PI * i) / (SR * 3.1)));
  }
  midis.forEach((m, k) => {
    const raw = saw(hz(m), len, 3, 0.008);
    const filt = svfLowpass(raw, cut, 1.1);
    for (let i = 0; i < len; i++) filt[i] *= env[i];
    mix.add(filt, t, { gain: gain / Math.sqrt(midis.length), pan: -0.55 + (1.1 * k) / Math.max(1, midis.length - 1), send });
  });
}

function sub(mix, midi, t, dur, gain = 0.5) {
  const len = samples(dur);
  const o = sine(hz(midi), len);
  const env = adsr(len, 0.02, 0.15, 0.85, Math.min(0.6, dur * 0.4));
  for (let i = 0; i < len; i++) o[i] *= env[i];
  mix.add(svfLowpass(o, 180, 0.7), t, { gain, send: 0.05 });
}

function kick(mix, t, gain = 0.62) {
  const len = samples(0.42);
  const body = sineSweep(112, 44, len, 4);
  const env = expEnv(len, 0.085);
  const click = highpass(noise(samples(0.008)), 1800);
  for (let i = 0; i < len; i++) body[i] *= env[i];
  for (let i = 0; i < click.length; i++) body[i] += click[i] * 0.16;
  mix.add(body, t, { gain, send: 0.06 });
}

function hat(mix, t, gain = 0.1, decay = 0.028) {
  const len = samples(0.09);
  const n = highpass(noise(len), 7000);
  const env = expEnv(len, decay);
  for (let i = 0; i < len; i++) n[i] *= env[i];
  mix.add(n, t, { gain, pan: 0.28, send: 0.25 });
}

/** Bright FM bell — the sound of a quote resolving, or a gold shard landing. */
function bell(mix, midi, t, { gain = 0.14, pan = 0, decay = 0.6, index = 3.2 } = {}) {
  const len = samples(decay * 4);
  mix.add(fm(hz(midi), 2.01, index, len, decay), t, { gain, pan, send: 0.75 });
}

function pluckNote(mix, midi, t, { gain = 0.15, pan = 0, dur = 0.9 } = {}) {
  const len = samples(dur);
  const p = pluck(hz(midi), len, 0.55);
  const env = expEnv(len, dur * 0.42);
  for (let i = 0; i < len; i++) p[i] *= env[i];
  mix.add(svfLowpass(p, 3200, 0.8), t, { gain, pan, send: 0.5 });
}

/** Low boom plus a bloom of noise — lands on picture hits. */
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

/** Noise sweeping up through a filter — tension into a cut. */
function riser(mix, t, dur, { gain = 0.2 } = {}) {
  const len = samples(dur);
  const n = noise(len);
  const cut = new Float32Array(len);
  for (let i = 0; i < len; i++) cut[i] = 300 + 6800 * Math.pow(i / len, 2.1);
  const sw = svfLowpass(n, cut, 0.55);
  for (let i = 0; i < len; i++) sw[i] *= Math.pow(i / len, 1.6);
  mix.add(sw, t, { gain, send: 0.6 });
}

/** Filtered noise passing left to right — a scope sweep, a beam crossing. */
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

/* ---------- the bed ------------------------------------------------------ */

/**
 * Lays the harmonic bed across the whole film. `density(t)` returns 0..1 and
 * decides how much of the kit is playing at that moment, which is how each
 * film gets its own shape out of one arrangement.
 */
function bed(mix, dur, density, { chordEvery = 5, padGain = 0.16, subGain = 0.46 } = {}) {
  for (let i = 0, t = 0; t < dur; i++, t += chordEvery) {
    const c = chordAt(i);
    const len = Math.min(chordEvery + 1.6, dur - t + 1.2);
    const d = density(t + chordEvery * 0.5);
    pad(mix, c.pad, t, len, { gain: padGain * (0.55 + 0.45 * d), open: 0.4 + 0.6 * d });
    sub(mix, c.sub, t, Math.min(chordEvery, dur - t), subGain * (0.5 + 0.5 * d));
  }

  for (let b = 0; b * BEAT < dur; b++) {
    const t = b * BEAT;
    const d = density(t);
    if (d > 0.42 && b % 4 === 0) kick(mix, t, 0.5 * d);
    if (d > 0.62 && b % 4 === 2) kick(mix, t, 0.34 * d);
    if (d > 0.5 && b % 2 === 1) hat(mix, t, 0.075 * d);
    if (d > 0.8 && b % 4 === 3) hat(mix, t + BEAT / 2, 0.05 * d);
  }
}

/** Ascending chord-tone arpeggio — reads as searching. */
function arp(mix, from, to, { gain = 0.11, step = BEAT / 2, chordEvery = 5 } = {}) {
  let k = 0;
  for (let t = from; t < to; t += step, k++) {
    const c = chordAt(Math.floor(t / chordEvery));
    const notes = c.arp;
    const m = notes[k % notes.length] + 12;
    pluckNote(mix, m, t, { gain, pan: -0.4 + 0.8 * ((k % 5) / 4), dur: 0.7 });
  }
}

/* ---------- cues --------------------------------------------------------- */

const ramp = (t, a, b, lo, hi) => (t <= a ? lo : t >= b ? hi : lo + ((t - a) / (b - a)) * (hi - lo));

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
};

/* ---------- render ------------------------------------------------------- */

// Must match durationInFrames in src/Root.tsx.
const DURATIONS = {
  "refract-intro": 360 / FPS,
  "refract-best-route": 840 / FPS,
  "refract-cashback": 570 / FPS,
  "refract-launch-pools": 570 / FPS,
};

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

for (const [name, build] of Object.entries(CUES)) {
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
