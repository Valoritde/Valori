// Render die Bewerbungsmappe (A4) als druckfertiges PDF + Seiten-Vorschau (PNG).
// Usage: node scripts/bewerbung.mjs [scene.html] [out-basename]
//   env: DPI (PNG-Vorschau, Standard 200)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const scene = process.argv[2] || path.join(root, 'scene', 'bewerbung-edeka.html');
const base = process.argv[3] || path.join(root, 'output', 'edeka-bewerbung');
const DPI = Number(process.env.DPI || 200);

(async () => {
  await mkdir(path.dirname(base), { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb'],
  });

  // --- PDF (Druck): A4, mehrseitig, Vektortext ---
  const pdfPage = await browser.newPage();
  await pdfPage.goto(pathToFileURL(scene).href, { waitUntil: 'networkidle' });
  await pdfPage.evaluate(() => document.fonts && document.fonts.ready);
  await pdfPage.pdf({
    path: `${base}.pdf`,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  // --- PNG-Vorschau je Seite (zum schnellen Prüfen) ---
  const scale = DPI / 96;
  const imgPage = await browser.newPage({ deviceScaleFactor: scale });
  await imgPage.goto(pathToFileURL(scene).href, { waitUntil: 'networkidle' });
  await imgPage.evaluate(() => document.fonts && document.fonts.ready);
  const names = ['1-deckblatt', '2-anschreiben', '3-lebenslauf'];
  const sheets = await imgPage.$$('.sheet');
  for (let i = 0; i < sheets.length; i++) {
    const suffix = (await sheets[i].getAttribute('data-name')) || (sheets.length > 1 ? names[i] : null) || `seite-${i + 1}`;
    await sheets[i].screenshot({ path: `${base}-${suffix}.png` });
    console.log(`✅ ${base}-${suffix}.png`);
  }

  await browser.close();
  console.log(`✅ ${base}.pdf  (${sheets.length} Seiten, A4)`);
})().catch(e => { console.error(e); process.exit(1); });
