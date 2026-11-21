// Shot protocol: URL query drives a deterministic render for screenshots.
//   ?shot=cover|editor  — cover hides the editor chrome, editor shows it
//   ?layout=collage|strip|polaroid
//   ?preset=sunset|neon|gold|afterdark
//   ?title=...&tagline=...&subline=...&name=...
//   ?size=square|portrait|wide|story
//   ?photo0=boulevard|rooftop|neon|pier|beach&photo1=...&photo2=...&photo3=...&photo4=...
//   ?grain=0|1&halftone=0|1&palms=0|1&sun=0|1
import { LAYOUTS, PRESETS, EXPORT_SIZES } from './cover.js';

const SAMPLE_KEYS = ['boulevard', 'rooftop', 'neon', 'pier', 'beach'];

export function applyShotQuery(state) {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot') || 'editor';
  const pick = (name, list, cur) => {
    const v = q.get(name);
    return v && list.some((e) => e.id === v) ? v : cur;
  };
  state.layout = pick('layout', LAYOUTS, state.layout);
  state.preset = pick('preset', PRESETS, state.preset);
  state.size = pick('size', EXPORT_SIZES, state.size);
  for (const k of ['title', 'tagline', 'subline', 'billing', 'name']) {
    const v = q.get(k);
    if (v) state[k] = v;
  }
  for (let i = 0; i < 5; i++) {
    const v = q.get('photo' + i);
    if (v && SAMPLE_KEYS.includes(v)) state.photos[i] = v;
  }
  for (const k of ['grain', 'halftone', 'palms', 'sun']) {
    const v = q.get(k);
    if (v === '0' || v === '1') state.effects[k] = v === '1';
  }
  return shot;
}
