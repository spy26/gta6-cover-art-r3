// Vice Keyart Studio — editor wiring. Loads the bundled sample photos (or
// the user's uploads), renders the live canvas preview through cover.js,
// and exports the cover as a PNG at the chosen post size.
import {
  createState, renderCover, panelsFor, panelAt, ensureCrops,
  LAYOUTS, PRESETS, EXPORT_SIZES,
} from './cover.js';
import { applyShotQuery } from './shots.js';

const state = createState();
const shot = applyShotQuery(state);

const canvas = document.getElementById('preview');
const images = [null, null, null, null, null]; // HTMLImageElement per photo slot
let selectedPanel = 0;
let lastPaint = null; // { panels, crops, w, h } from the last render

const SAMPLE_URL = {
  boulevard: 'samples/boulevard.jpg',
  rooftop: 'samples/rooftop.jpg',
  neon: 'samples/neon.jpg',
  pier: 'samples/pier.jpg',
  beach: 'samples/beach.jpg',
};

const $ = (id) => document.getElementById(id);

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadSlot(i) {
  const key = state.photos[i];
  images[i] = await loadImage(SAMPLE_URL[key] || key);
}

async function loadAllPhotos() {
  await Promise.all([0, 1, 2, 3, 4].map(loadSlot));
}

function sizeDef() {
  return EXPORT_SIZES.find((s) => s.id === state.size) || EXPORT_SIZES[0];
}

function paint() {
  const { w, h } = sizeDef();
  // Preview resolution: keep the aspect, cap the long edge at 920px.
  const scale = Math.min(1, 920 / Math.max(w, h));
  const pw = Math.round(w * scale), ph = Math.round(h * scale);
  canvas.style.aspectRatio = `${w} / ${h}`;
  lastPaint = renderCover(state, canvas, pw, ph, images);
  lastPaint.w = pw; lastPaint.h = ph;
  window.__keyartReady = true;
}

function repaint() {
  // Changing layout/size invalidates stored crops (new geometry).
  state.crops = {};
  paint();
}

// ------------------------------------------------------------ controls
function chipRow(el, items, current, onPick) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (it.id === current ? ' on' : '');
    b.textContent = it.label;
    b.addEventListener('click', () => {
      onPick(it.id);
      chipRow(el, items, it.id, onPick);
      paint();
    });
    el.appendChild(b);
  }
}

function bindControls() {
  chipRow($('layouts'), LAYOUTS, state.layout, (id) => {
    state.layout = id; selectedPanel = 0; repaint();
    if (window.__rebuildPanels) window.__rebuildPanels();
  });
  chipRow($('presets'), PRESETS, state.preset, (id) => {
    state.preset = id; paint();
  });
  chipRow($('sizes'), EXPORT_SIZES, state.size, (id) => {
    state.size = id; repaint();
  });

  const bindText = (id, key) => {
    const el = $(id);
    el.value = state[key];
    el.addEventListener('input', () => { state[key] = el.value; paint(); });
  };
  bindText('in-title', 'title');
  bindText('in-tagline', 'tagline');
  bindText('in-subline', 'subline');
  bindText('in-name', 'name');

  for (const k of ['grain', 'halftone', 'palms', 'sun']) {
    const el = $('fx-' + k);
    el.checked = state.effects[k];
    el.addEventListener('change', () => { state.effects[k] = el.checked; paint(); });
  }

  const stars = $('in-stars');
  stars.value = String(state.stars);
  stars.addEventListener('input', () => { state.stars = Number(stars.value) || 0; paint(); });

  const SAMPLE_LABEL = { boulevard: 'Boulevard', rooftop: 'Rooftop', neon: 'Neon Street', pier: 'Pier', beach: 'Beach' };
  for (let i = 0; i < 5; i++) {
    const input = $('file-' + i);
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const img = await loadImage(url);
      if (img) { images[i] = img; state.photos[i] = url; paint(); }
      $('filelabel-' + i).textContent = f.name;
    });
    const swap = $('swap-' + i);
    const order = ['boulevard', 'rooftop', 'neon', 'pier', 'beach'];
    swap.addEventListener('click', async () => {
      const cur = order.indexOf(state.photos[i]);
      const next = order[(cur + 1) % order.length];
      state.photos[i] = next;
      await loadSlot(i);
      $('filelabel-' + i).textContent = 'Sample: ' + (SAMPLE_LABEL[next] || next);
      paint();
    });
  }

  // Crop: pick a panel, zoom it, reset it.
  const panelSel = $('in-panel');
  const rebuildPanelOptions = () => {
    const n = panelsFor(state.layout, 100, 100).length;
    panelSel.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = 'Panel ' + (i + 1);
      panelSel.appendChild(o);
    }
    panelSel.value = String(Math.min(selectedPanel, n - 1));
  };
  rebuildPanelOptions();
  window.__rebuildPanels = rebuildPanelOptions;
  panelSel.addEventListener('change', () => { selectedPanel = Number(panelSel.value); paint(); });

  const zoom = $('in-zoom');
  zoom.addEventListener('input', () => {
    const crops = ensureCrops(state, canvas.width, canvas.height, images);
    const crop = crops[selectedPanel];
    if (!crop) return;
    const panel = lastPaint.panels[selectedPanel];
    if (!panel) return;
    // Zoom around the panel centre: keep the image point under the centre.
    const img = images[panel.photo];
    if (!img || !img.naturalWidth) return;
    const s0 = Math.max(panel.rect.w / img.naturalWidth, panel.rect.h / img.naturalHeight);
    const sOld = s0 * crop.zoom;
    const cxImg = (panel.rect.w / 2 - crop.ax * panel.rect.w) / sOld;
    const cyImg = (panel.rect.h / 2 - crop.ay * panel.rect.h) / sOld;
    crop.zoom = Math.max(1, Math.min(3, Number(zoom.value)));
    const sNew = s0 * crop.zoom;
    crop.ax = (panel.rect.w / 2 - cxImg * sNew) / panel.rect.w;
    crop.ay = (panel.rect.h / 2 - cyImg * sNew) / panel.rect.h;
    paint();
  });
  $('btn-crop-reset').addEventListener('click', () => {
    state.crops = {};
    paint();
  });

  $('btn-export').addEventListener('click', () => {
    const { w, h } = sizeDef();
    const off = document.createElement('canvas');
    // Crops are normalised, so the export paints exactly what the preview
    // shows — no reset here.
    renderCover(state, off, w, h, images);
    off.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vice-keyart-${state.layout}-${w}x${h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });
}

// ------------------------------------------------------------ canvas pan/zoom
function bindCanvas() {
  let drag = null;
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    const idx = panelAt(state.layout, canvas.width, canvas.height, p.x, p.y);
    if (idx >= 0) {
      selectedPanel = idx;
      const sel = $('in-panel');
      if (sel) sel.value = String(idx);
    }
    drag = { x: p.x, y: p.y, panel: idx };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.panel < 0) return;
    const p = toCanvas(e);
    const crops = ensureCrops(state, canvas.width, canvas.height, images);
    const crop = crops[drag.panel];
    const panel = lastPaint && lastPaint.panels[drag.panel];
    if (!crop || !panel) return;
    crop.ax += (p.x - drag.x) / panel.rect.w;
    crop.ay += (p.y - drag.y) / panel.rect.h;
    drag = { x: p.x, y: p.y, panel: drag.panel };
    paint();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const crops = ensureCrops(state, canvas.width, canvas.height, images);
    const crop = crops[selectedPanel];
    if (!crop) return;
    crop.zoom = Math.max(1, Math.min(3, crop.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    $('in-zoom').value = String(crop.zoom.toFixed(2));
    paint();
  }, { passive: false });
}

// ------------------------------------------------------------ boot
(async () => {
  if (shot === 'cover') document.body.classList.add('cover-only');
  await loadAllPhotos();
  bindControls();
  bindCanvas();
  paint();
  window.__keyart = { state, renderCover, paint, images };
})();
