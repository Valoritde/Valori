# Valori — Instagram-Videos

Generator für **Instagram-Reels (9:16, 1080×1920)** für [valorit.de](https://valorit.de).
Animierte HTML/CSS-Szenen werden mit **Playwright** Frame für Frame gerendert und mit
**ffmpeg** zu einem Instagram-tauglichen **H.264-MP4** encodiert.

## Voraussetzungen

- Node.js 18+
- `npm install` (lädt Playwright + ein statisches ffmpeg)
- Chromium: In dieser Cloud-Umgebung vorinstalliert unter
  `/opt/pw-browsers/chromium-1194/...`. Lokal ggf. `npx playwright install chromium`
  ausführen und `CHROMIUM_PATH` setzen oder die Zeile in `scripts/render.mjs` anpassen.

## Rendern

```bash
npm run render
# Ergebnis: output/valori-hero-9x16.mp4
```

Optionen über Umgebungsvariablen:

```bash
FPS=30 WIDTH=1080 HEIGHT=1920 DURATION=18 node scripts/render.mjs scene/hero-9x16.html output/mein-video.mp4
```

## Texte & Farben anpassen

Alle Inhalte stehen im `CONFIG`-Block oben in **`scene/hero-9x16.html`**:

- `accent` / `accent2` — Markenfarben (Verlauf, Glow)
- `kicker`, `brandLine1/2`, `tagline`, `points[]`, `statement…`, `cta…`, `handle`
- `durationSec` — Videolänge

Nach Änderungen einfach erneut `npm run render` ausführen.

## Technische Eckdaten des Outputs

- 1080×1920, 30 fps, H.264 (High Profile), `yuv420p`, CRF 18
- Stummer AAC-Audiotrack (max. Plattform-Kompatibilität)
- `+faststart` für schnelles Streaming/Upload

## Weitere Formate

Für Feed (1:1 / 4:5) oder Stories die Szene kopieren und `WIDTH`/`HEIGHT` setzen,
z. B. `WIDTH=1080 HEIGHT=1080` (Layout der Szene ggf. anpassen).

## Bewerbung (EDEKA) — A4-PDF

Druckfertige Bewerbungsmappe (3 Seiten: **Deckblatt · Anschreiben · Lebenslauf**)
als A4-PDF. Vorlage: [`scene/bewerbung-edeka.html`](scene/bewerbung-edeka.html).

```bash
npm run bewerbung
# Ergebnis:
#   output/edeka-bewerbung.pdf           (3 Seiten, A4, Vektortext)
#   output/edeka-bewerbung-1-deckblatt.png … -3-lebenslauf.png  (Vorschau)
```

**Ausfüllen:** Alle persönlichen Angaben stehen als rot markierte `[Platzhalter]`
direkt im HTML (z. B. `[Vorname Nachname]`, `[Straße Hausnr.]`, `[zu besetzende
Stelle]`). Platzhalter im HTML ersetzen und erneut `npm run bewerbung` ausführen —
die farbige Markierung verschwindet automatisch, sobald der Text kein Platzhalter
mehr ist (einfach das `<span class="ph">…</span>` entfernen bzw. den Text darin
überschreiben). Das Bewerbungsfoto lässt sich als Bild in die dafür vorgesehenen
Rahmen einsetzen.
