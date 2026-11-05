// Filters, search, sort, map-area limit, map view and language live in the
// URL query string, so any view can be shared as a link.
import { emptyState } from './filters.js';

const list = (set) => [...set].sort().join(',');
const toSet = (v) => new Set((v || '').split(',').map((x) => x.trim()).filter(Boolean));
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (n, d) => Number(n.toFixed(d));

/** @returns {string} query string without the leading "?" */
export function toQuery({ state, lang, view }) {
  const p = new URLSearchParams();
  if (lang && lang !== 'mk') p.set('lang', lang);
  if (state.q.trim()) p.set('q', state.q.trim());
  if (state.regions.size) p.set('r', list(state.regions));
  if (state.municipalities.size) p.set('m', list(state.municipalities));
  if (state.types.size) p.set('t', list(state.types));
  if (state.materials.size) p.set('w', list(state.materials));
  if (state.severity.size) p.set('d', list(state.severity));
  if (state.areaMin != null) p.set('amin', String(state.areaMin));
  if (state.areaMax != null) p.set('amax', String(state.areaMax));
  if (state.bounds) p.set('b', state.bounds.map((x) => round(x, 5)).join(','));
  if (state.sort !== 'area') p.set('s', state.sort);
  if (view) p.set('v', [round(view.lng, 5), round(view.lat, 5), round(view.zoom, 2)].join(','));
  return p.toString();
}

export function fromQuery(search) {
  const p = new URLSearchParams(search);
  const state = emptyState();
  state.q = p.get('q') || '';
  state.regions = toSet(p.get('r'));
  state.municipalities = toSet(p.get('m'));
  state.types = toSet(p.get('t'));
  state.materials = toSet(p.get('w'));
  state.severity = new Set([...toSet(p.get('d'))].filter((x) => /^[1-4]$/.test(x)));
  state.areaMin = num(p.get('amin'));
  state.areaMax = num(p.get('amax'));
  const b = (p.get('b') || '').split(',').map(Number);
  state.bounds = b.length === 4 && b.every(Number.isFinite) ? b : null;
  state.sort = p.get('s') === 'volume' ? 'volume' : 'area';
  const v = (p.get('v') || '').split(',').map(Number);
  const view = v.length === 3 && v.every(Number.isFinite) ? { lng: v[0], lat: v[1], zoom: v[2] } : null;
  const lang = p.get('lang') === 'en' ? 'en' : 'mk';
  return { state, view, lang };
}
