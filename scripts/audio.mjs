// Synthesize a clean SFX soundtrack (royalty-free, generated) that is synced to
// the animation events in scene/hero-9x16.html. Writes a 16-bit stereo WAV.
//
// Usage: node scripts/audio.mjs [out.wav] [durationSec]
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SR = 44100;

// Deterministic noise so renders are reproducible.
let _seed = 8675309;
const noise = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return (_seed / 0x40000000) - 1; };

export function generateAudio(duration = 18, outPath) {
  const N = Math.ceil(duration * SR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);

  const idx = t => Math.floor(t * SR);
  const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

  // --- soft UI "mouse click": two crisp transients (press + release) ---
  function click(t, gain = 0.5, pan = 0) {
    const lg = gain * (1 - Math.max(0, pan)), rg = gain * (1 + Math.min(0, pan));
    for (const off of [0, 0.018]) {
      const start = idx(t + off);
      const len = Math.floor(0.035 * SR);
      for (let k = 0; k < len; k++) {
        const x = k / SR;
        const env = Math.exp(-x * 900);
        const s = (noise() * 0.55 + Math.sin(2 * Math.PI * 2600 * x) * 0.7) * env * (off ? 0.7 : 1);
        add(start + k, s * lg, s * rg);
      }
    }
  }

  // --- airy whoosh: lowpass-filtered noise with a brightening sweep + bell envelope ---
  function whoosh(t, dur = 0.38, gain = 0.22) {
    const start = idx(t), len = Math.floor(dur * SR);
    let lp = 0;
    for (let k = 0; k < len; k++) {
      const x = k / len;                       // 0..1
      const env = Math.sin(Math.PI * x);       // bell
      const cutoff = 0.02 + 0.5 * x;           // open filter over time → "whoosh"
      lp += (noise() - lp) * cutoff;
      const s = lp * env * gain;
      const ps = 0.6 + 0.4 * Math.sin(x * 3);  // gentle stereo drift
      add(start + k, s * (1 - 0.3 * ps), s * (1 + 0.3 * (ps - 1)));
    }
  }

  // --- sub thump: weight for the brand/statement reveal ---
  function sub(t, freq = 72, dur = 0.5, gain = 0.4) {
    const start = idx(t), len = Math.floor(dur * SR);
    for (let k = 0; k < len; k++) {
      const x = k / SR;
      const env = Math.exp(-x * 7);
      const f = freq * (1 + 0.6 * Math.exp(-x * 18)); // tiny pitch drop = punch
      const s = Math.sin(2 * Math.PI * f * x) * env * gain;
      add(start + k, s, s);
    }
  }

  // --- confirm pop: pitched blip gliding up (CTA button) ---
  function pop(t, f0 = 520, f1 = 1040, dur = 0.16, gain = 0.3) {
    const start = idx(t), len = Math.floor(dur * SR);
    let ph = 0;
    for (let k = 0; k < len; k++) {
      const x = k / len;
      const f = f0 + (f1 - f0) * x;
      ph += 2 * Math.PI * f / SR;
      const env = Math.exp(-x * 5) * Math.sin(Math.PI * Math.min(1, x * 2.2));
      const s = (Math.sin(ph) * 0.8 + Math.sin(ph * 2) * 0.2) * env * gain;
      add(start + k, s, s);
    }
  }

  // --- very soft ambient pad so the gaps don't feel dead (kept low + clean) ---
  function pad() {
    const freqs = [146.83, 220.0, 277.18, 329.63]; // Dm-ish, airy
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const fade = Math.min(1, t / 1.5) * Math.min(1, (duration - t) / 1.5);
      let s = 0;
      for (let f = 0; f < freqs.length; f++) {
        const det = 1 + 0.0015 * Math.sin(t * (0.2 + f * 0.07));
        s += Math.sin(2 * Math.PI * freqs[f] * det * t) * (1 - f * 0.18);
      }
      const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.12 * t);
      s *= 0.012 * fade * trem;
      L[i] += s; R[i] += s * 0.98;
    }
  }

  // ===== Event timeline — mirrors the seek() windows in hero-9x16.html =====
  pad();
  whoosh(0.40, 0.5, 0.26);  sub(0.55, 70, 0.55, 0.42);   // brand reveal
  click(0.32, 0.18);                                     // kicker tick
  whoosh(1.05, 0.28, 0.16);                              // underline draw
  click(1.55, 0.30);                                     // tagline
  click(3.20, 0.5);                                      // point 1  (mouse click)
  click(3.75, 0.5);                                      // point 2
  click(4.30, 0.5);                                      // point 3
  whoosh(9.05, 0.45, 0.26); sub(9.25, 64, 0.5, 0.4);     // statement
  whoosh(14.0, 0.5, 0.28);                               // transition → CTA
  pop(15.0, 520, 1100, 0.18, 0.34); click(15.0, 0.42);   // CTA button "click"
  click(15.45, 0.2);                                     // handle tick

  // ===== soft-clip limiter + peak normalize =====
  let peak = 0;
  for (let i = 0; i < N; i++) {
    L[i] = Math.tanh(L[i] * 1.1);
    R[i] = Math.tanh(R[i] * 1.1);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = peak > 0 ? 0.89 / peak : 1;

  // ===== encode 16-bit PCM stereo WAV =====
  const bytesPerSample = 2, channels = 2;
  const dataLen = N * channels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  let o = 44;
  for (let i = 0; i < N; i++) {
    const l = Math.max(-1, Math.min(1, L[i] * norm)) * 32767;
    const r = Math.max(-1, Math.min(1, R[i] * norm)) * 32767;
    buf.writeInt16LE(l | 0, o); buf.writeInt16LE(r | 0, o + 2); o += 4;
  }
  return writeFile(outPath, buf).then(() => outPath);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || path.join(__dirname, '..', 'output', 'valori-audio.wav');
  const dur = Number(process.argv[3] || 18);
  generateAudio(dur, out).then(p => console.log('audio →', p));
}
