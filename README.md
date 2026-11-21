[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/spy26/gta6-cover-art-r3/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/spy26/gta6-cover-art-r3/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

# Vice Keyart Studio — GTA-style cover maker

Turn your photos into a Vice City key-art poster: pick a layout, pick a
grade, type a caption, export a PNG ready to post. Runs fully offline in a
desktop browser — nothing uploads, your photos never leave your machine.

## What it does

- **3 layouts** — Key Art Collage (big hero + 2×2 vignette grid, the dense
  loading-screen look), Sunset Strip (five tall frames, film-strip
  perforations), Polaroid Vice (three tilted snapshot cards over a sunset
  scene, tape and handwritten captions).
- **4 style presets** — Vice Sunset, Neon Coast, Malibu Gold, After Dark.
  Each re-grades the photos, the title band, the pill, the retro sun
  emblem and the skyline.
- **5 photo slots** — upload your own or use the bundled samples
  (Boulevard, Rooftop, Neon Street, Pier, Beach). Drag to pan, scroll to zoom,
  per panel; crops are face-safe by default, so a portrait photo keeps
  its face in frame even in a tall, narrow strip frame.
- **Editable caption** — title auto-fits (shrinks, then wraps to two
  lines), tagline pill measured from its text so it can never clip.
- **Effects** — film grain, halftone dots (kept clear of the title),
  palm silhouettes clipped to the photo zone, and a retro sun emblem
  with a palm growing out of it (original art). A low skyline strip
  hugs the bottom of the photo zone, and a five-star footer signs the
  poster.
- **Export PNG** at exact post sizes: 1080 × 1080, 1080 × 1350,
  1920 × 1080, 1080 × 1920.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies, no network. `main.ts` (Node 22,
standard library only) builds the submission dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Files

- `app/index.html`, `app/style.css` — editor shell and styling.
- `app/src/cover.js` — the cover renderer: layouts, presets, crops,
  skyline, palms, sun emblem, halftone, grain, auto-fit title.
- `app/src/main.js` — editor wiring: uploads, chips, drag-pan/zoom,
  PNG export.
- `app/src/shots.js` — URL shot protocol (`?shot=cover&layout=…`).
- `app/samples/` — bundled sample photos. Boulevard & Pier are make.fun's
  kit photos, free to use; Rooftop, Neon Street & Beach were made with an
  image model for this entry, free to use.
- `shots.json` — the four screenshots in `screenshots/`.

## License

MIT — see `LICENSE`.
