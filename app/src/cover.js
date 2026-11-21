// Vice Keyart Studio — GTA-style multi-panel cover renderer.
// Written fresh for gta6-cover-art-01-r3. Pure canvas, no dependencies.
// Layouts, presets, per-panel crops and the full cover painter live here;
// main.js owns the DOM editor, shots.js the query protocol.

export const LAYOUTS = [
  { id: 'collage', label: 'Key Art Collage' },
  { id: 'strip', label: 'Sunset Strip' },
  { id: 'polaroid', label: 'Polaroid Vice' },
];

export const PRESETS = [
  { id: 'sunset', label: 'Vice Sunset' },
  { id: 'neon', label: 'Neon Coast' },
  { id: 'gold', label: 'Malibu Gold' },
  { id: 'afterdark', label: 'After Dark' },
];

export const EXPORT_SIZES = [
  { id: 'square', label: 'Square · 1080 × 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait · 1080 × 1350', w: 1080, h: 1350 },
  { id: 'wide', label: 'Wide · 1920 × 1080', w: 1920, h: 1080 },
  { id: 'story', label: 'Story · 1080 × 1920', w: 1080, h: 1920 },
];

// ---------------------------------------------------------------- presets
// band: title-band background (top, bottom). title / stroke / glow: caption.
// pill: [bg, fg]. accent: stripes, halftone, stars. sun: [top, mid, bottom].
// grade: colour wash over the photos. skyline: silhouette colour.
const PRESET_DEFS = {
  sunset: {
    band: ['#42106a', '#1e0536'], title: '#ffffff', stroke: '#2b0540',
    glow: '#ff2e88', pill: ['#ff9f1c', '#2a0a00'], accent: '#ffc93c',
    sun: ['#ffd23f', '#ff7a18', '#ff2e88'], grade: '#ff7a18',
    skyline: '#1e0536', sub: '#ffd9a0', foot: '#e8c9ff', name: '#f4e8ff',
  },
  neon: {
    band: ['#0d1030', '#040312'], title: '#ffffff', stroke: '#03021a',
    glow: '#00e5ff', pill: ['#00e5ff', '#03252c'], accent: '#ff2ea6',
    sun: ['#8ef6ff', '#00b3ff', '#ff2ea6'], grade: '#2a1aff',
    skyline: '#08042a', sub: '#9beaff', foot: '#c9b8ff', name: '#e6f9ff',
  },
  gold: {
    band: ['#0e3a2a', '#04190f'], title: '#fff3d6', stroke: '#0a2e18',
    glow: '#ffb300', pill: ['#ffd23f', '#3a2500'], accent: '#ffd23f',
    sun: ['#fff3b0', '#ffb300', '#ff7a18'], grade: '#ffb300',
    skyline: '#04190f', sub: '#ffe9a8', foot: '#d8f0c8', name: '#fff6d8',
  },
  afterdark: {
    band: ['#120a2e', '#03020c'], title: '#e9e4ff', stroke: '#02010a',
    glow: '#8b5cf6', pill: ['#b7a5ff', '#12082e'], accent: '#c4b5fd',
    sun: ['#e9d5ff', '#8b5cf6', '#4c1d95'], grade: '#4c1d95',
    skyline: '#03020c', sub: '#c4b5fd', foot: '#b9c8ef', name: '#e9e4ff',
  },
};

export function presetDef(id) {
  return PRESET_DEFS[id] || PRESET_DEFS.sunset;
}

// Face anchor of each bundled sample photo, as [x, y] fractions of the
// photo: where the face sits. The kit photos' faces sit high (0.20); the
// two generated portraits are framed looser, faces near 0.28.
export const FACE_ANCHOR = {
  boulevard: [0.50, 0.20],
  pier: [0.50, 0.20],
  rooftop: [0.55, 0.28],
  neon: [0.50, 0.28],
  beach: [0.55, 0.28],
};

// ---------------------------------------------------------------- state
export function createState() {
  return {
    layout: 'collage',
    preset: 'sunset',
    size: 'square',
    title: 'SUNSET HEIST',
    tagline: 'ONE LAST SCORE',
    subline: 'VICE CITY • EST. 2026',
    billing: 'A VICE CITY STORY • IN THEATRES 2026',
    name: 'LEONIDA',
    stars: 5,
    effects: { grain: true, halftone: true, palms: true, sun: true },
    // photos[i] is a sample key ('boulevard' | 'rooftop' | 'neon' | 'pier'
    // | 'beach') or a data/object URL the user uploaded.
    photos: ['boulevard', 'rooftop', 'neon', 'pier', 'beach'],
    // crops[i] = { zoom, ax, ay } — ax/ay are the drawn image offset as a
    // fraction of the panel size. One entry per PANEL, built lazily.
    crops: {},
  };
}

// ---------------------------------------------------------------- helpers
// Small deterministic RNG (Numerical Recipes LCG) for grain / skyline.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- geometry
// panelsFor returns one entry per panel: { poly, rect, photo, rot } where
// poly is the clip polygon (rect panels: 4 corners), rect the bounding box,
// photo the index into state.photos, rot the rotation in radians for the
// polaroid cards (0 for straight panels).
export function panelsFor(layout, W, H) {
  const gap = Math.max(4, Math.round(W * 0.006));
  const ph = Math.round(H * 0.62); // photo zone height (collage / strip)
  const rect = (x, y, w, h, photo, rot = 0) => ({
    poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
    rect: { x, y, w, h }, photo, rot,
  });
  switch (layout) {
    case 'strip': {
      // Five tall frames in a row, like a film strip of the heist.
      const w = Math.floor((W - 4 * gap) / 5);
      const photos = [0, 1, 2, 3, 4];
      return photos.map((p, i) =>
        rect(i * (w + gap), 0, i === 4 ? W - 4 * (w + gap) : w, ph, p));
    }
    case 'polaroid': {
      // Three tilted snapshot cards over a sunset scene. The card is the
      // panel: photo square on top, caption strip below, white border.
      // Card width is capped both ways: at most 30% of the width and at
      // most 52% of the height (tall), so the trio fits every post size.
      const cw = Math.round(Math.min(W * 0.30, (H * 0.52) / 1.24));
      const ch = Math.round(cw * 1.24);
      const gapX = Math.round(W * 0.035);
      const startX = Math.round((W - (3 * cw + 2 * gapX)) / 2);
      const cy = Math.round(H * 0.10);
      const cards = [
        { x: startX, y: cy, rot: -0.105, photo: 0 },
        { x: startX + cw + gapX, y: cy + Math.round(H * 0.055), rot: 0.045, photo: 2 },
        { x: startX + 2 * (cw + gapX), y: cy - Math.round(H * 0.01), rot: -0.05, photo: 1 },
      ];
      return cards.map((c) => rect(c.x, c.y, cw, ch, c.photo, c.rot));
    }
    case 'collage':
    default: {
      // Big hero on the left, a 2x2 grid of vignettes on the right: the
      // dense key-art look of a GTA loading screen.
      const heroW = Math.round(W * 0.52);
      const rx = heroW + gap;
      const rw = W - rx;
      const cw = Math.floor((rw - gap) / 2);
      const ch = Math.floor((ph - gap) / 2);
      return [
        rect(0, 0, heroW, ph, 0),
        rect(rx, 0, cw, ch, 1),
        rect(rx + cw + gap, 0, rw - cw - gap, ch, 2),
        rect(rx, ch + gap, cw, ph - ch - gap, 3),
        rect(rx + cw + gap, ch + gap, rw - cw - gap, ph - ch - gap, 4),
      ];
    }
  }
}

export function photoZoneH(layout, H) {
  // Polaroid paints the whole canvas as one scene; the others split
  // photo zone (top) / title band (bottom).
  return layout === 'polaroid' ? H : Math.round(H * 0.62);
}

export function panelAt(layout, W, H, x, y) {
  const panels = panelsFor(layout, W, H);
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    if (!p.rot) {
      if (pointInPoly(x, y, p.poly)) return i;
    } else {
      // Inverse-rotate the point around the card centre, then test the rect.
      const cx = p.rect.x + p.rect.w / 2, cy = p.rect.y + p.rect.h / 2;
      const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
      const dx = x - cx, dy = y - cy;
      const lx = dx * c - dy * s + cx, ly = dx * s + dy * c + cy;
      if (lx >= p.rect.x && lx <= p.rect.x + p.rect.w &&
          ly >= p.rect.y && ly <= p.rect.y + p.rect.h) return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------- crops
// Face-safe default crop: aim the photo's face anchor at 40% down the
// panel and centred horizontally, so faces survive tall, narrow and
// wide, short panels alike. Guarded: only panels that exist get a crop.
export function defaultCropsFor(layout, W, H, images, photos) {
  const panels = panelsFor(layout, W, H);
  const crops = [];
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const img = images[p.photo];
    if (!img || !img.naturalWidth) { crops.push({ zoom: 1, ax: 0, ay: 0 }); continue; }
    const s0 = Math.max(p.rect.w / img.naturalWidth, p.rect.h / img.naturalHeight);
    const dw = img.naturalWidth * s0, dh = img.naturalHeight * s0;
    const key = photos ? photos[p.photo] : null;
    const anchor = (key && FACE_ANCHOR[key]) || [0.5, 0.25];
    // Anchor point of the photo -> (anchor x, 0.40) of the panel.
    let dx = p.rect.w * anchor[0] - anchor[0] * dw;
    let dy = p.rect.h * 0.40 - anchor[1] * dh;
    dx = Math.min(0, Math.max(p.rect.w - dw, dx));
    dy = Math.min(0, Math.max(p.rect.h - dh, dy));
    crops.push({ zoom: 1, ax: dx / p.rect.w, ay: dy / p.rect.h });
  }
  return crops;
}

export function ensureCrops(state, W, H, images) {
  // Crops are stored normalised (fractions of panel size), so they survive
  // a change of render resolution; only the layout + aspect shape the
  // defaults. Keying on raw pixels would silently reset a user's pan/zoom
  // on every export.
  const key = `${state.layout}|${(W / H).toFixed(3)}`;
  if (state.crops._key === key && Array.isArray(state.crops.list)) return state.crops.list;
  const list = defaultCropsFor(state.layout, W, H, images, state.photos);
  state.crops = { _key: key, list };
  return list;
}

function clampCrop(crop, panel, img) {
  const s0 = Math.max(panel.w / img.naturalWidth, panel.h / img.naturalHeight);
  const s = s0 * crop.zoom;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const minAx = (panel.w - dw) / panel.w, minAy = (panel.h - dh) / panel.h;
  crop.ax = Math.min(0, Math.max(minAx, crop.ax));
  crop.ay = Math.min(0, Math.max(minAy, crop.ay));
  return { s, dw, dh };
}

// ---------------------------------------------------------------- drawing
function drawPhoto(ctx, img, panel, crop) {
  const { x, y, w, h } = panel.rect;
  if (!img || !img.naturalWidth) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#3a2b52'); g.addColorStop(1, '#17102a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `700 ${Math.max(14, w * 0.05)}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PHOTO', x + w / 2, y + h / 2);
    return;
  }
  const { s } = clampCrop(crop, panel.rect, img);
  const dx = x + crop.ax * w, dy = y + crop.ay * h;
  ctx.drawImage(img, dx, dy, img.naturalWidth * s, img.naturalHeight * s);
}

function drawSkyline(ctx, zone, W, preset, seed) {
  // LOW strip only: buildings 3–9% of the photo-zone height, hugging its
  // bottom edge, clipped to the photo zone by the caller.
  const rnd = lcg(seed);
  const base = zone.y + zone.h;
  const maxH = zone.h * 0.09;
  let x = -12;
  ctx.fillStyle = preset.skyline;
  while (x < W + 12) {
    const bw = 24 + rnd() * 46;
    const bh = zone.h * 0.03 + rnd() * maxH * 0.7;
    ctx.fillRect(x, base - bh, bw, bh);
    if (rnd() > 0.5) { // antenna on some towers
      ctx.fillRect(x + bw * 0.45, base - bh - 12 - rnd() * 8, 3, 12 + rnd() * 8);
    }
    if (rnd() > 0.6) { // lit window
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x + bw * 0.2, base - bh + 6, 4, 3);
      ctx.fillStyle = preset.skyline;
    }
    x += bw + 2 + rnd() * 16;
  }
}

function drawPalm(ctx, x, baseY, h, lean, color) {
  // One palm: a curved trunk and seven drooping fronds.
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineCap = 'round';
  const topX = x + lean, topY = baseY - h;
  ctx.lineWidth = Math.max(4, h * 0.055);
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * 0.35, baseY - h * 0.6, topX, topY);
  ctx.stroke();
  ctx.lineWidth = Math.max(3, h * 0.04);
  for (let i = 0; i < 7; i++) {
    const a = (-170 + i * 52) * Math.PI / 180;
    const len = h * (0.5 + (i % 2) * 0.1);
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.5 + len * 0.3;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.55, topY - len * 0.12, ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSunEmblem(ctx, cx, cy, r, preset) {
  // The studio's mark: a retro sun with a palm silhouette growing out of
  // its lower half — original art, no borrowed logo. Small by design:
  // radius ~5% of cover width, tucked in a panel corner, never over a face.
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, preset.sun[0]); g.addColorStop(0.55, preset.sun[1]); g.addColorStop(1, preset.sun[2]);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Slats across the lower half.
  ctx.fillStyle = preset.skyline;
  const gaps = [0.10, 0.32, 0.56, 0.78];
  gaps.forEach((t, i) => {
    const y = cy + r * t;
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
    ctx.fillRect(cx - half, y, half * 2, 2 + i * 1.6);
  });
  // Palm silhouette inside the sun.
  ctx.strokeStyle = preset.skyline;
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.lineCap = 'round';
  const bx = cx - r * 0.12, by = cy + r * 0.72;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(bx + r * 0.05, cy + r * 0.1, bx + r * 0.18, cy - r * 0.05);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (-160 + i * 55) * Math.PI / 180;
    const len = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(bx + r * 0.18, cy - r * 0.05);
    ctx.quadraticCurveTo(
      bx + r * 0.18 + Math.cos(a) * len * 0.6, cy - r * 0.05 - len * 0.15,
      bx + r * 0.18 + Math.cos(a) * len, cy - r * 0.05 + Math.sin(a) * len * 0.6 + len * 0.25);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(2, r * 0.05); ctx.stroke();
}

function drawHalftone(ctx, x, y, cols, rows, step, preset) {
  ctx.save();
  ctx.fillStyle = preset.accent;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rad = 2 + (c + r) * 0.8;
      ctx.globalAlpha = 0.5 + 0.5 * ((c + r) / (cols + rows));
      ctx.beginPath();
      ctx.arc(x + c * step, y + r * step, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGrain(ctx, W, H, seed) {
  const rnd = lcg(seed);
  const n = Math.floor((W * H) / 420);
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) ctx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4);
  ctx.fillStyle = '#000000';
  for (let i = 0; i < n; i++) ctx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4);
  ctx.restore();
}

function drawTape(ctx, x, y, w, h, rot) {
  // A strip of semi-transparent tape across the top of a polaroid card.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff8d6';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function fitTitleLines(ctx, title, maxW, startPx) {
  // Single line if it fits; otherwise split into two balanced lines.
  let px = startPx;
  ctx.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
  while (px > startPx * 0.5 && ctx.measureText(title).width > maxW) {
    px -= 2;
    ctx.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
  }
  if (ctx.measureText(title).width <= maxW) return { lines: [title], px };
  const words = title.split(/\s+/);
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!best || w < best.w) best = { lines: [a, b], w };
  }
  let px2 = Math.round(startPx * 0.82);
  ctx.font = `900 ${px2}px "Arial Black", Arial, sans-serif`;
  while (px2 > startPx * 0.45 && Math.max(...best.lines.map((l) => ctx.measureText(l).width)) > maxW) {
    px2 -= 2;
    ctx.font = `900 ${px2}px "Arial Black", Arial, sans-serif`;
  }
  return { lines: best.lines, px: px2 };
}

// ---------------------------------------------------------------- main paint
// One caption block: pill + auto-fit title + subline, painted as a group.
// The title is fitted first; if the group does not fit the band (wide
// canvases, short polaroid bands) it shrinks until it does; the group is
// then centred vertically in the band above the footer, so no aspect
// leaves a void or a collision at the bottom.
function paintCaption(ctx, state, preset, W, H, padX, bandTop, bandH, gap1) {
  const maxTextW = W - padX * 2;
  const pillH = Math.round(H * 0.042);
  const gap2 = Math.round(H * 0.045);
  const footerH = Math.round(H * 0.075);
  let startPx = Math.round(W * 0.135);
  let fit = fitTitleLines(ctx, state.title.toUpperCase(), maxTextW, startPx);
  // The billing line only fits bands at least 30% of the height; shorter
  // bands (Polaroid) skip it so the title keeps its size.
  const showBilling = Boolean(state.billing) && bandH >= Math.round(H * 0.30);
  const billH = showBilling ? Math.round(H * 0.038) + Math.round(W * 0.015) : 0;
  const blockH = () => pillH + gap1 + (fit.px * 0.86 + (fit.lines.length - 1) * fit.px * 1.02) + gap2 + billH + 12;
  let guard = 0;
  while (blockH() > bandH - footerH && fit.px > 40 && guard++ < 12) {
    startPx = Math.round(startPx * 0.85);
    fit = fitTitleLines(ctx, state.title.toUpperCase(), maxTextW, startPx);
  }
  const pillY = bandTop + Math.max(Math.round(H * 0.015),
    Math.round((bandH - footerH - blockH()) / 2));

  // Tagline pill — width measured from the text, so it can never clip.
  ctx.font = `800 ${Math.round(pillH * 0.42)}px Arial, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(pillH * 0.10)}px`; } catch { /* older canvas */ }
  const tagW = ctx.measureText(state.tagline).width;
  const pillW = tagW + pillH * 1.5;
  ctx.fillStyle = preset.pill[0];
  ctx.shadowColor = preset.pill[0]; ctx.shadowBlur = pillH * 0.55;
  roundRect(ctx, padX, pillY, pillW, pillH, pillH / 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = preset.pill[1];
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(state.tagline, padX + pillH * 0.75, pillY + pillH / 2 + 1);
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }

  // Title, with glow + outline.
  const titleTop = pillY + pillH + gap1;
  const { lines, px } = fit;
  ctx.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = preset.glow; ctx.shadowBlur = px * 0.28;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, px * 0.055);
  ctx.strokeStyle = preset.stroke;
  const lineH = px * 1.02;
  lines.forEach((line, i) => {
    const y = titleTop + px * 0.86 + i * lineH;
    ctx.strokeText(line, padX, y);
    ctx.fillStyle = preset.title;
    ctx.fillText(line, padX, y);
  });
  ctx.shadowBlur = 0;

  // Subline under the title.
  const subY = titleTop + px * 0.86 + (lines.length - 1) * lineH + gap2;
  ctx.font = `700 ${Math.round(W * 0.024)}px Arial, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(W * 0.006)}px`; } catch { /* noop */ }
  ctx.fillStyle = preset.sub;
  ctx.fillText(state.subline.toUpperCase(), padX, subY);
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }

  // Billing line: small movie-poster print under the subline.
  if (showBilling) {
    const billY = subY + Math.round(H * 0.038);
    ctx.font = `600 ${Math.round(W * 0.015)}px Arial, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(W * 0.004)}px`; } catch { /* noop */ }
    ctx.fillStyle = preset.foot;
    ctx.globalAlpha = 0.85;
    ctx.fillText(state.billing.toUpperCase(), padX, billY);
    ctx.globalAlpha = 1;
    try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
  }
  return { pillY, subY };
}

function paintFooter(ctx, state, preset, W, H, padX) {
  // Footer: stars left, name right.
  const footY = H - Math.round(H * 0.028);
  ctx.font = `${Math.round(W * 0.026)}px Arial, sans-serif`;
  ctx.fillStyle = preset.accent;
  ctx.textAlign = 'left';
  ctx.fillText('★'.repeat(Math.max(0, Math.min(5, state.stars))), padX, footY);
  ctx.font = `700 ${Math.round(W * 0.020)}px Arial, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(W * 0.006)}px`; } catch { /* noop */ }
  ctx.fillStyle = preset.name;
  ctx.textAlign = 'right';
  ctx.fillText(state.name.toUpperCase(), W - padX, footY);
  ctx.textAlign = 'left';
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
}

// images: array indexed like state.photos (HTMLImageElement | null).
export function renderCover(state, canvas, W, H, images) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const preset = presetDef(state.preset);
  const panels = panelsFor(state.layout, W, H);
  const zoneH = photoZoneH(state.layout, H);
  const crops = ensureCrops(state, W, H, images);
  const gap = Math.max(4, Math.round(W * 0.006));
  const padX = Math.round(W * 0.045);

  if (state.layout === 'polaroid') {
    // --- Sunset scene: full-canvas gradient, big sun, palms at the edges.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, preset.sun[0]);
    sky.addColorStop(0.45, preset.sun[1]);
    sky.addColorStop(0.75, preset.band[0]);
    sky.addColorStop(1, preset.band[1]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (state.effects.sun) {
      // Low in the open middle of the scene, between the cards and the
      // caption band: visible in every preset, never behind a card.
      const sr = Math.round(Math.min(W, H) * 0.10);
      drawSunEmblem(ctx, W * 0.5, H * 0.66, sr, preset);
    }
    if (state.effects.palms) {
      const ph2 = H * 0.34;
      drawPalm(ctx, W * 0.02, H * 0.98, ph2, W * 0.02, preset.skyline);
      drawPalm(ctx, W * 0.99, H * 0.98, ph2 * 0.8, -W * 0.018, preset.skyline);
    }
    // --- The three snapshot cards.
    const captions = ['VICE CITY', 'ONE LAST SCORE', 'EST. 2026'];
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const cx = p.rect.x + p.rect.w / 2, cy = p.rect.y + p.rect.h / 2;
      const m = Math.round(W * 0.014); // white border
      const photoRect = {
        x: -p.rect.w / 2 + m, y: -p.rect.h / 2 + m,
        w: p.rect.w - 2 * m, h: p.rect.w - 2 * m,
      };
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p.rot);
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.round(W * 0.02);
      ctx.shadowOffsetY = Math.round(H * 0.008);
      ctx.fillStyle = '#fdfbf3';
      ctx.fillRect(-p.rect.w / 2, -p.rect.h / 2, p.rect.w, p.rect.h);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(photoRect.x, photoRect.y, photoRect.w, photoRect.h); ctx.clip();
      drawPhoto(ctx, images[p.photo], { rect: photoRect }, crops[i] || { zoom: 1, ax: 0, ay: 0 });
      ctx.globalAlpha = 0.10; ctx.fillStyle = preset.grade;
      ctx.fillRect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
      ctx.globalAlpha = 1;
      ctx.restore();
      // Handwritten-style caption under the photo.
      ctx.fillStyle = '#2b2b3a';
      ctx.font = `italic 700 ${Math.round(p.rect.w * 0.062)}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(captions[i] || '', 0, p.rect.h / 2 - (p.rect.h - photoRect.h - m * 2) / 2 - m * 0.4);
      ctx.restore();
      // Tape across the top of the card.
      drawTape(ctx, cx, p.rect.y + Math.round(H * 0.004), Math.round(p.rect.w * 0.42), Math.round(H * 0.022), p.rot);
    }
    // --- Caption band: dark scrim over the scene's lower part.
    const bandTop = Math.round(H * 0.72);
    const scrim = ctx.createLinearGradient(0, bandTop - H * 0.06, 0, H);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(0.5, preset.band[0] + 'd9');
    scrim.addColorStop(1, preset.band[1]);
    ctx.fillStyle = scrim; ctx.fillRect(0, bandTop - H * 0.06, W, H - bandTop + H * 0.06);
    const { pillY } = paintCaption(ctx, state, preset, W, H, padX, bandTop, H - bandTop, Math.round(H * 0.022));
    if (state.effects.halftone) {
      drawHalftone(ctx, W - padX - 4 * Math.round(W * 0.016), pillY, 5, 3, Math.round(W * 0.016), preset);
    }
    paintFooter(ctx, state, preset, W, H, padX);
    if (state.effects.grain) drawGrain(ctx, W, H, 77);
    return { panels, crops };
  }

  // --- Band background.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, preset.band[0]); bg.addColorStop(1, preset.band[1]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // --- Photos, each clipped to its own polygon.
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    ctx.save();
    ctx.beginPath();
    p.poly.forEach(([px, py], j) => (j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath(); ctx.clip();
    drawPhoto(ctx, images[p.photo], p, crops[i] || { zoom: 1, ax: 0, ay: 0 });
    // Warm/cool grade wash, kept light so faces stay readable.
    ctx.globalAlpha = 0.10; ctx.fillStyle = preset.grade;
    ctx.fillRect(p.rect.x, p.rect.y, p.rect.w, p.rect.h);
    ctx.globalAlpha = 1;
    ctx.restore();
    // Panel separators.
    ctx.strokeStyle = preset.band[1]; ctx.lineWidth = gap;
    ctx.beginPath();
    p.poly.forEach(([px, py], j) => (j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath(); ctx.stroke();
  }

  if (state.layout === 'collage') {
    // Gold divider along the hero's right edge.
    ctx.save();
    ctx.strokeStyle = preset.accent; ctx.lineWidth = Math.max(5, W * 0.006);
    ctx.beginPath();
    ctx.moveTo(Math.round(W * 0.52), 0); ctx.lineTo(Math.round(W * 0.52), zoneH);
    ctx.stroke();
    ctx.restore();
  }

  if (state.layout === 'strip') {
    // Film-strip perforations along the top and bottom of each frame.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const holeW = Math.max(6, Math.round(W * 0.011));
    const holeH = Math.max(4, Math.round(H * 0.006));
    for (const p of panels) {
      const n = Math.max(2, Math.floor(p.rect.w / (holeW * 2.2)));
      for (let k = 0; k < n; k++) {
        const hx = p.rect.x + (k + 0.5) * (p.rect.w / n) - holeW / 2;
        roundRect(ctx, hx, p.rect.y + 5, holeW, holeH, 2); ctx.fill();
        roundRect(ctx, hx, p.rect.y + p.rect.h - 5 - holeH, holeW, holeH, 2); ctx.fill();
      }
    }
    ctx.restore();
    // Accent rule under the strip.
    ctx.fillStyle = preset.accent;
    ctx.fillRect(0, zoneH - 2, W, Math.max(3, W * 0.004));
  }

  // --- Skyline + palms, clipped to the photo zone only (never into the band).
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, zoneH); ctx.clip();
  drawSkyline(ctx, { y: 0, h: zoneH }, W, preset, 20261121);
  if (state.effects.palms) {
    const ph2 = zoneH * 0.20;
    drawPalm(ctx, W * 0.045, zoneH, ph2, W * 0.012, preset.skyline);
    drawPalm(ctx, W * 0.955, zoneH, ph2 * 0.85, -W * 0.010, preset.skyline);
  }
  ctx.restore();

  // --- Sun emblem: small, bottom-left corner of the last panel. Faces
  // sit high in every panel (face anchor 0.20–0.28 of the photo), so the
  // low corner is face-safe, and the sun sets over the skyline strip.
  if (state.effects.sun) {
    const host = panels[panels.length - 1];
    const r = Math.max(26, Math.min(W * 0.05, host.rect.h * 0.35));
    const cx = host.rect.x + r + Math.max(10, W * 0.012);
    const cy = host.rect.y + host.rect.h - r - Math.max(10, H * 0.012);
    drawSunEmblem(ctx, cx, cy, r, preset);
  }

  // --- Caption band.
  const bandTop = zoneH;
  const { pillY } = paintCaption(ctx, state, preset, W, H, padX, bandTop, H - bandTop, Math.round(H * 0.030));
  // Halftone — top-right of the band, clear of the title below it.
  if (state.effects.halftone) {
    drawHalftone(ctx, W - padX - 4 * Math.round(W * 0.016), pillY, 5, 3, Math.round(W * 0.016), preset);
  }
  paintFooter(ctx, state, preset, W, H, padX);

  if (state.effects.grain) drawGrain(ctx, W, H, 77);
  return { panels, crops };
}
