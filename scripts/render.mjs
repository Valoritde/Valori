// Render an HTML animation scene to a social-ready MP4 (H.264).
// Usage: node scripts/render.mjs [scene.html] [out.mp4]
//   env: FPS, WIDTH, HEIGHT, SCALE (deviceScaleFactor → e.g. 2 for 4K),
//        DURATION (override scene's __duration),
//        AUDIO_FILE (use an existing .wav instead of generating SFX),
//        NO_AUDIO=1 (silent)
// Frames are streamed straight into ffmpeg (no temp files) so 4K renders
// don't fill the disk.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import ffmpegPkg from '@ffmpeg-installer/ffmpeg';
import { generateAudio } from './audio.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const scene = process.argv[2] || path.join(root, 'scene', 'hero-9x16.html');
const outFile = process.argv[3] || path.join(root, 'output', 'valori-hero-9x16.mp4');

const FPS = Number(process.env.FPS || 30);
const WIDTH = Number(process.env.WIDTH || 1080);
const HEIGHT = Number(process.env.HEIGHT || 1920);
const SCALE = Number(process.env.SCALE || 1);

const ffmpeg = ffmpegPkg.path;

(async () => {
  const t0 = Date.now();
  await mkdir(path.dirname(outFile), { recursive: true });
  const tmp = await mkdtemp(path.join(tmpdir(), 'valori-'));

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb', '--disable-lcd-text'],
  });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
  });
  await page.goto(pathToFileURL(scene).href, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__ready === true');

  const duration = Number(process.env.DURATION || await page.evaluate('window.__duration') || 15);
  const totalFrames = Math.round(duration * FPS);

  // Resolve the audio track first (ffmpeg needs it as an input).
  let audioPath = null;
  if (process.env.AUDIO_FILE) {
    audioPath = path.resolve(process.env.AUDIO_FILE);
    if (!existsSync(audioPath)) throw new Error(`AUDIO_FILE not found: ${audioPath}`);
  } else if (process.env.NO_AUDIO !== '1') {
    audioPath = path.join(tmp, 'audio.wav');
    await generateAudio(duration, audioPath);
  }

  console.log(`Rendering ${totalFrames} frames @ ${FPS}fps  (${WIDTH * SCALE}x${HEIGHT * SCALE}, ${duration}s) → streaming to ffmpeg ...`);

  const audioIn = audioPath ? ['-i', audioPath]
    : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
  const ff = spawn(ffmpeg, [
    '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    ...audioIn,
    '-map', '0:v:0', '-map', '1:a:0', '-shortest',
    '-c:v', 'libx264', '-preset', process.env.PRESET || 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-x264-params', 'keyint=60:min-keyint=30',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', code => code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)));
  });

  const clip = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
  for (let i = 0; i < totalFrames; i++) {
    await page.evaluate(tt => window.__seek(tt), i / FPS);
    const buf = await page.screenshot({ type: 'png', clip });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 30 === 0) process.stdout.write(`  frame ${i}/${totalFrames}\r`);
  }
  ff.stdin.end();
  await browser.close();
  console.log(`\nFrames done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Finishing encode...`);
  await done;

  await rm(tmp, { recursive: true, force: true });
  console.log(`\n✅ Done: ${outFile}  (total ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
})().catch(e => { console.error(e); process.exit(1); });
