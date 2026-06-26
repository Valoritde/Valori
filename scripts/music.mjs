// Synthesize a soft, motivational ambient score (royalty-free, generated) for the
// 30s cinematic ad. Pad chords + gentle arpeggio + sub bass + bells + riser/impact,
// arranged to the 4 scenes. Writes a 16-bit stereo WAV.
//
// Usage: node scripts/music.mjs [out.wav] [durationSec]
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SR = 44100;
let _s = 22222;
const noise = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return (_s / 0x40000000) - 1; };

export function generateMusic(duration = 30, outPath) {
  const N = Math.ceil(duration * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

  // soft oscillator with attack/release, gentle stereo detune + warm harmonics
  function tone(t, dur, freq, gain, { attack = 0.4, release = 0.6, h2 = 0.25, h3 = 0.1, pan = 0 } = {}) {
    const start = Math.floor(t * SR), len = Math.floor(dur * SR);
    const lg = gain * (1 - Math.max(0, pan)), rg = gain * (1 + Math.min(0, pan));
    for (let k = 0; k < len; k++) {
      const x = k / SR;
      const env = Math.min(1, x / attack) * Math.min(1, (dur - x) / release);
      const s = (Math.sin(2 * Math.PI * freq * x)
        + h2 * Math.sin(2 * Math.PI * freq * 2 * x)
        + h3 * Math.sin(2 * Math.PI * freq * 3 * x)) * env;
      const sl = s * (1 + 0.004 * Math.sin(x * 5));   // tiny chorus
      add(start + k, sl * lg, s * rg);
    }
  }

  // plucked note (arpeggio / bell): quick attack, exponential decay
  function pluck(t, freq, gain, decay = 6, pan = 0) {
    const start = Math.floor(t * SR), len = Math.floor((4 / decay) * SR);
    const lg = gain * (1 - Math.max(0, pan)), rg = gain * (1 + Math.min(0, pan));
    for (let k = 0; k < len; k++) {
      const x = k / SR;
      const env = Math.exp(-x * decay) * Math.min(1, x / 0.006);
      const s = (Math.sin(2 * Math.PI * freq * x) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * x)) * env;
      add(start + k, s * lg, s * rg);
    }
  }

  function subBass(t, dur, freq, gain) {
    const start = Math.floor(t * SR), len = Math.floor(dur * SR);
    for (let k = 0; k < len; k++) {
      const x = k / SR;
      const env = Math.min(1, x / 0.15) * Math.min(1, (dur - x) / 0.4);
      const s = Math.sin(2 * Math.PI * freq * x) * env;
      add(start + k, s * gain, s * gain);
    }
  }

  function whoosh(t, dur, gain) {
    const start = Math.floor(t * SR), len = Math.floor(dur * SR); let lp = 0;
    for (let k = 0; k < len; k++) {
      const x = k / len; const env = Math.sin(Math.PI * x);
      lp += (noise() - lp) * (0.02 + 0.5 * x);
      add(start + k, lp * env * gain, lp * env * gain * 0.95);
    }
  }

  function riser(t, dur, gain) {
    const start = Math.floor(t * SR), len = Math.floor(dur * SR); let lp = 0;
    for (let k = 0; k < len; k++) {
      const x = k / len; const env = x * x;            // accelerate
      lp += (noise() - lp) * (0.05 + 0.6 * x);
      const tn = 0.5 * Math.sin(2 * Math.PI * (200 + 1400 * x) * (k / SR)); // rising tone
      add(start + k, (lp + tn) * env * gain, (lp + tn) * env * gain);
    }
  }

  function impact(t, gain) {
    subBass(t, 1.4, 56, gain);                          // deep boom
    const start = Math.floor(t * SR), len = Math.floor(0.4 * SR);
    for (let k = 0; k < len; k++) { const x = k / SR; const e = Math.exp(-x * 12); add(start + k, noise() * e * gain * 0.4, noise() * e * gain * 0.4); }
  }

  // ---- note tables ----
  const A3 = 220, C4 = 261.63, E4 = 329.63, F3 = 174.61, G3 = 196.0, B3 = 246.94, D4 = 293.66, G4 = 392.0;
  const chords = {
    Am: { pad: [A3, C4, E4], bass: 110.0, arp: [A3, C4, E4, A3 * 2, C4 * 2] },
    F:  { pad: [F3, A3, C4], bass: 87.31, arp: [F3, A3, C4, F3 * 2, A3 * 2] },
    C:  { pad: [C4, E4, G4], bass: 130.81, arp: [C4, E4, G4, C4 * 2, E4 * 2] },
    G:  { pad: [G3, B3, D4], bass: 98.0, arp: [G3, B3, D4, G3 * 2, B3 * 2] },
  };
  // schedule: [start, end, chordName, padGain]
  const schedule = [
    [0, 3, 'Am', 0.05], [3, 6, 'F', 0.06],                 // scene 1: sparse, moody
    [6, 8, 'C', 0.075], [8, 10, 'G', 0.075], [10, 12, 'Am', 0.08], [12, 14, 'F', 0.08],   // scene 2
    [14, 16, 'C', 0.085], [16, 18, 'G', 0.085], [18, 20, 'Am', 0.09], [20, 22, 'F', 0.09], [22, 24, 'G', 0.1], // scene 3 (build)
    [24, 30, 'C', 0.12],                                   // scene 4: resolve home (C major)
  ];

  // ---- pad + bass ----
  for (const [a, b, name, g] of schedule) {
    const ch = chords[name]; const dur = b - a + 0.25;
    ch.pad.forEach((f, i) => tone(a, dur, f, g * (1 - i * 0.12), { attack: 0.5, release: 0.7, pan: (i - 1) * 0.3 }));
    subBass(a, dur, ch.bass, g * 1.6);
  }

  // ---- arpeggio (6s → 22s), gain ramps up for the build ----
  const stepT = 0.30;
  const chordAt = tt => { for (const s of schedule) if (tt >= s[0] && tt < s[1]) return chords[s[2]]; return chords.C; };
  let ai = 0;
  for (let t = 6; t < 22; t += stepT, ai++) {
    const ch = chordAt(t);
    const f = ch.arp[ai % ch.arp.length];
    const ramp = Math.min(1, (t - 6) / 9);              // build over ~9s
    const g = 0.05 * ramp;
    pluck(t, f, g, 5.5, ((ai % 3) - 1) * 0.35);
  }

  // ---- bells in the finale (24 → 30): gentle ascending C major sparkle ----
  const bellNotes = [C4 * 2, E4 * 2, G4 * 2, C4 * 4, G4 * 2, E4 * 2];
  for (let i = 0; i < bellNotes.length; i++) pluck(24.0 + i * 0.5, bellNotes[i], 0.06 * (1 - i * 0.08), 3.2, ((i % 2) ? 1 : -1) * 0.3);

  // ---- transitions + finale fx ----
  whoosh(5.7, 0.7, 0.10);   // → scene 2
  whoosh(13.7, 0.7, 0.10);  // → scene 3
  riser(22.2, 1.9, 0.10);   // build into logo
  whoosh(23.7, 0.6, 0.12);  // → scene 4
  impact(24.05, 0.5);       // logo landing

  // ---- master: gentle global swell + fade out, soft-clip, normalize ----
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const swell = 0.6 + 0.4 * Math.min(1, t / 10);        // grows through the spot
    const fadeOut = Math.min(1, (duration - t) / 1.6);
    const fadeIn = Math.min(1, t / 1.2);
    const m = swell * fadeOut * fadeIn;
    L[i] = Math.tanh(L[i] * m * 1.2);
    R[i] = Math.tanh(R[i] * m * 1.2);
  }
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0 ? 0.85 / peak : 1;

  // ---- encode WAV ----
  const dataLen = N * 4, buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  let o = 44;
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE((Math.max(-1, Math.min(1, L[i] * norm)) * 32767) | 0, o);
    buf.writeInt16LE((Math.max(-1, Math.min(1, R[i] * norm)) * 32767) | 0, o + 2); o += 4;
  }
  return writeFile(outPath, buf).then(() => outPath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || path.join(__dirname, '..', 'output', 'valorit-music.wav');
  generateMusic(Number(process.argv[3] || 30), out).then(p => console.log('music →', p));
}
