/**
 * A small synthesis kit — oscillators, envelopes, filters, reverb — used by
 * compose.mjs to score the PRISM films.
 *
 * Written in plain JS over Float32Array rather than pulled from a library:
 * the whole kit is a few hundred lines, it has no install step, and the music
 * is then original work with no licence to track.
 */

import fs from "node:fs";

export const SR = 48000;
export const samples = (sec) => Math.max(0, Math.round(sec * SR));
export const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const dbGain = (db) => Math.pow(10, db / 20);

/* ---------- envelopes ---------------------------------------------------- */

/** Exponential decay. `tau` is the time to fall to 1/e. */
export function expEnv(len, tau) {
  const e = new Float32Array(len);
  const k = -1 / (tau * SR);
  for (let i = 0; i < len; i++) e[i] = Math.exp(i * k);
  return e;
}

export function adsr(len, a, d, s, r) {
  const e = new Float32Array(len);
  const A = samples(a), D = samples(d), R = samples(r);
  const S = Math.max(0, len - A - D - R);
  let i = 0;
  for (let j = 0; j < A && i < len; j++, i++) e[i] = j / Math.max(1, A);
  for (let j = 0; j < D && i < len; j++, i++) e[i] = 1 + (s - 1) * (j / Math.max(1, D));
  for (let j = 0; j < S && i < len; j++, i++) e[i] = s;
  for (let j = 0; j < R && i < len; j++, i++) e[i] = s * (1 - j / Math.max(1, R));
  return e;
}

/* ---------- oscillators -------------------------------------------------- */

export function sine(freq, len, phase = 0) {
  const o = new Float32Array(len);
  const w = (2 * Math.PI * freq) / SR;
  for (let i = 0; i < len; i++) o[i] = Math.sin(i * w + phase);
  return o;
}

/** Sine whose pitch glides between two frequencies — the body of a kick. */
export function sineSweep(f0, f1, len, curve = 3) {
  const o = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const f = f1 + (f0 - f1) * Math.pow(1 - t, curve);
    ph += (2 * Math.PI * f) / SR;
    o[i] = Math.sin(ph);
  }
  return o;
}

/** Detuned saw stack. The supersaw is what gives the pads their width. */
export function saw(freq, len, voices = 3, detune = 0.006) {
  const o = new Float32Array(len);
  for (let v = 0; v < voices; v++) {
    const mul = 1 + detune * (v - (voices - 1) / 2);
    const inc = (freq * mul) / SR;
    let ph = Math.random();
    for (let i = 0; i < len; i++) {
      ph += inc;
      if (ph >= 1) ph -= 1;
      o[i] += 2 * ph - 1;
    }
  }
  const g = 1 / voices;
  for (let i = 0; i < len; i++) o[i] *= g;
  return o;
}

export function noise(len) {
  const o = new Float32Array(len);
  for (let i = 0; i < len; i++) o[i] = Math.random() * 2 - 1;
  return o;
}

/** Two-operator FM — bright, metallic, good for bells and shard hits. */
export function fm(carrier, ratio, index, len, decay) {
  const o = new Float32Array(len);
  const env = expEnv(len, decay);
  const wc = (2 * Math.PI * carrier) / SR;
  const wm = (2 * Math.PI * carrier * ratio) / SR;
  for (let i = 0; i < len; i++) {
    o[i] = Math.sin(i * wc + index * env[i] * Math.sin(i * wm)) * env[i];
  }
  return o;
}

/** Karplus-Strong pluck. A noise burst round a delay line reads as a string. */
export function pluck(freq, len, damp = 0.5) {
  const n = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.random() * 2 - 1;
  const o = new Float32Array(len);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const nxt = buf[(idx + 1) % n];
    o[i] = cur;
    buf[idx] = (cur + nxt) * 0.5 * (1 - damp * 0.006);
    idx = (idx + 1) % n;
  }
  return o;
}

/* ---------- filters ------------------------------------------------------ */

/** State-variable lowpass. `cutoff` may be a number or a per-sample array, so
    a filter sweep is the same call as a static one. */
export function svfLowpass(x, cutoff, q = 0.9) {
  const o = new Float32Array(x.length);
  let low = 0, band = 0;
  const arr = typeof cutoff === "number" ? null : cutoff;
  for (let i = 0; i < x.length; i++) {
    const fc = arr ? arr[i] : cutoff;
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR * 0.45)) / SR);
    const high = x[i] - low - q * band;
    band += f * high;
    low += f * band;
    o[i] = low;
  }
  return o;
}

export function highpass(x, cutoff) {
  const o = new Float32Array(x.length);
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = rc / (rc + 1 / SR);
  let prevIn = 0, prevOut = 0;
  for (let i = 0; i < x.length; i++) {
    prevOut = a * (prevOut + x[i] - prevIn);
    prevIn = x[i];
    o[i] = prevOut;
  }
  return o;
}

/* ---------- space -------------------------------------------------------- */

/** Schroeder reverb: four parallel combs into two allpasses. Cheap, and the
    long warm tail is most of why these cues sound like a room and not a beep. */
export function reverb(x, { decay = 2.6, damp = 0.28, spread = 0 } = {}) {
  const combs = [1557, 1617, 1491, 1422].map((d) => d + spread);
  const allpass = [225, 556];
  const out = new Float32Array(x.length);

  for (const d of combs) {
    const buf = new Float32Array(d);
    const fb = Math.pow(0.001, d / SR / decay);
    let idx = 0, store = 0;
    for (let i = 0; i < x.length; i++) {
      const y = buf[idx];
      store = y * (1 - damp) + store * damp;
      buf[idx] = x[i] + store * fb;
      out[i] += y;
      idx = (idx + 1) % d;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] *= 0.25;

  for (const d of allpass) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const y = buf[idx];
      const v = out[i] + y * 0.5;
      buf[idx] = v;
      out[i] = y - out[i];
      idx = (idx + 1) % d;
    }
  }
  return out;
}

/* ---------- mixing ------------------------------------------------------- */

export class Mix {
  constructor(durationSec) {
    this.len = samples(durationSec);
    this.dry = [new Float32Array(this.len), new Float32Array(this.len)];
    this.wet = [new Float32Array(this.len), new Float32Array(this.len)];
  }

  /** Place a mono signal at `t` seconds. `send` is how much goes to reverb. */
  add(sig, t, { gain = 1, pan = 0, send = 0 } = {}) {
    const start = samples(t);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    const n = Math.min(sig.length, this.len - start);
    for (let i = 0; i < n; i++) {
      const s = sig[i];
      this.dry[0][start + i] += s * gl;
      this.dry[1][start + i] += s * gr;
      if (send > 0) {
        this.wet[0][start + i] += s * gl * send;
        this.wet[1][start + i] += s * gr * send;
      }
    }
  }

  /** Sum dry and reverb, fade the tail, and normalise to a broadcast-ish peak. */
  render({ reverbDecay = 2.8, wetGain = 0.9, fadeOut = 0.6, peak = 0.89 } = {}) {
    const out = [new Float32Array(this.len), new Float32Array(this.len)];
    for (let c = 0; c < 2; c++) {
      const tail = reverb(this.wet[c], { decay: reverbDecay, spread: c * 23 });
      for (let i = 0; i < this.len; i++) out[c][i] = this.dry[c][i] + tail[i] * wetGain;
    }

    const fade = samples(fadeOut);
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < fade; i++) {
        const j = this.len - fade + i;
        out[c][j] *= Math.pow(1 - i / fade, 1.7);
      }
    }

    let max = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < this.len; i++) max = Math.max(max, Math.abs(out[c][i]));
    // Soft-clip anything that still pokes through after normalising.
    const g = max > 0 ? peak / max : 1;
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < this.len; i++) out[c][i] = Math.tanh(out[c][i] * g * 1.05) * 0.96;
    }
    return out;
  }
}

/** 16-bit stereo PCM WAV. */
export function writeWav(path, channels) {
  const len = channels[0].length;
  const bytes = len * 4;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < 2; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  fs.writeFileSync(path, buf);
  return buf.length;
}
