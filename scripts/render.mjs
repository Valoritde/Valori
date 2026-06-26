// Render an HTML animation scene to an Instagram-ready MP4 (H.264).
// Usage: node scripts/render.mjs [scene.html] [out.mp4]
//   env: FPS, WIDTH, HEIGHT, DURATION (override scene's __duration)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpegPkg from '@ffmpeg-installer/ffmpeg';
import { generateAudio } from './audio.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const scene = process.argv[2] || path.join(root, 'scene', 'hero-9x16.html');
const outFile = process.argv[3] || path.join(root, 'output', 'valori-hero-9x16.mp4');

const FPS = Number(process.env.FPS || 30);
const WIDTH = Number(process.env.WIDTH || 1080);
const HEIGHT = Number(process.env.HEIGHT || 1920);

const ffmpeg = ffmpegPkg.path;

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', rej);
    p.on('close', code => code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`)));
  });
}

(async () => {
  const t0 = Date.now();
  const framesDir = await mkdtemp(path.join(tmpdir(), 'valori-frames-'));
  await mkdir(path.dirname(outFile), { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb', '--disable-lcd-text'],
  });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(scene).href, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__ready === true');

  const duration = Number(process.env.DURATION || await page.evaluate('window.__duration') || 15);
  const totalFrames = Math.round(duration * FPS);
  console.log(`Rendering ${totalFrames} frames @ ${FPS}fps  (${WIDTH}x${HEIGHT}, ${duration}s) ...`);

  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    await page.evaluate(tt => window.__seek(tt), t);
    const file = path.join(framesDir, `f_${String(i).padStart(5, '0')}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    if (i % 30 === 0) process.stdout.write(`  frame ${i}/${totalFrames}\r`);
  }
  await browser.close();
  console.log(`\nFrames done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

  // Generate the synced SFX soundtrack (skip with NO_AUDIO=1).
  let audioPath = null;
  if (process.env.NO_AUDIO !== '1') {
    audioPath = path.join(framesDir, 'audio.wav');
    await generateAudio(duration, audioPath);
    console.log('Soundtrack generated.');
  }
  console.log('Encoding...');

  // Encode H.264 yuv420p + AAC, faststart for streaming.
  const audioIn = audioPath
    ? ['-i', audioPath]
    : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
  await run(ffmpeg, [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(framesDir, 'f_%05d.png'),
    ...audioIn,
    '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-level', '4.0',
    '-x264-params', 'keyint=60:min-keyint=30',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outFile,
  ]);

  await rm(framesDir, { recursive: true, force: true });
  console.log(`\n✅ Done: ${outFile}  (total ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
})().catch(e => { console.error(e); process.exit(1); });
