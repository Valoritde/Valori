// Render a print-ready flyer: A5 PDF (for printing) + high-res PNG (preview).
// Usage: node scripts/flyer.mjs [scene.html] [out-basename]
//   env: WMM, HMM (page size in mm), DPI (png preview)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const scene = process.argv[2] || path.join(root, 'scene', 'flyer-a5.html');
const base = process.argv[3] || path.join(root, 'output', 'valorit-flyer-a5');
const WMM = Number(process.env.WMM || 148);
const HMM = Number(process.env.HMM || 210);
const DPI = Number(process.env.DPI || 320);

const cssPx = mm => mm * 96 / 25.4;        // CSS px at 96dpi

(async () => {
  await mkdir(path.dirname(base), { recursive: true });
  const wPx = Math.round(cssPx(WMM)), hPx = Math.round(cssPx(HMM));
  const scale = DPI / 96;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb'],
  });

  // PDF (print) — uses print CSS / @page, vector text, crisp QR
  const pdfPage = await browser.newPage();
  await pdfPage.goto(pathToFileURL(scene).href, { waitUntil: 'networkidle' });
  await pdfPage.pdf({
    path: `${base}.pdf`,
    width: `${WMM}mm`, height: `${HMM}mm`,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  // PNG preview at high DPI
  const imgPage = await browser.newPage({ viewport: { width: wPx, height: hPx }, deviceScaleFactor: scale });
  await imgPage.goto(pathToFileURL(scene).href, { waitUntil: 'networkidle' });
  await imgPage.screenshot({ path: `${base}.png`, clip: { x: 0, y: 0, width: wPx, height: hPx } });

  await browser.close();
  console.log(`✅ ${base}.pdf  (${WMM}×${HMM}mm)`);
  console.log(`✅ ${base}.png  (${Math.round(wPx * scale)}×${Math.round(hPx * scale)}px, ~${DPI}dpi)`);
})().catch(e => { console.error(e); process.exit(1); });
