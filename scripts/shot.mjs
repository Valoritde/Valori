// Render an HTML scene to a high-resolution PNG (for ads/posters).
// Usage: node scripts/shot.mjs [scene.html] [out.png]
//   env: WIDTH, HEIGHT, SCALE (deviceScaleFactor)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const scene = process.argv[2] || path.join(root, 'scene', 'ad-portrait.html');
const outFile = process.argv[3] || path.join(root, 'output', 'valori-ad-1080x1350.png');

const WIDTH = Number(process.env.WIDTH || 1080);
const HEIGHT = Number(process.env.HEIGHT || 1350);
const SCALE = Number(process.env.SCALE || 2);

(async () => {
  await mkdir(path.dirname(outFile), { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb'],
  });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
  });
  await page.goto(pathToFileURL(scene).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  await browser.close();
  console.log(`✅ ${outFile}  (${WIDTH * SCALE}x${HEIGHT * SCALE}px)`);
})().catch(e => { console.error(e); process.exit(1); });
