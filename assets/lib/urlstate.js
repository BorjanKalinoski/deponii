// Filters, search, sort, map-area limit, map view and language live in the
// URL query string, so any view can be shared as a link.
//
// Links get edited, truncated and pasted from old versions, so reading one is
// forgiving: a value that can't be right is dropped rather than applied, and
// a broken link shows more, never an empty map. (Codes that are well formed
// but absent from the data are dropped by dropUnknownChoices in filters.js,
// once the data is loaded.)
import { emptyState } from './filters.js';
import { MATERIALS } from './materials.js';

const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // as made by slug() in translit.js
const WASTE_CHOICES = new Set([...MATERIALS, 'other', 'unknown']);
const MAX_QUERY = 200;

const list = (set) => [...set].sort().join(',');
const codes = (v, ok = (x) => CODE.test(x)) =>
  new Set((v || '').split(',').map((x) => x.trim()).filter((x) => x && ok(x)));
const round = (n, d) => Number(n.toFixed(d));

/** Comma-separated numbers; null unless there are exactly `n` finite ones. */
function numbers(v, n) {
  const parts = (v || '').split(',');
  if (parts.length !== n || parts.some((x) => x.trim() === '')) return null;
  const out = parts.map(Number);
  return out.every(Number.isFinite) ? out : null;
}

/** A stated area bound: a finite number, not negative. */
function amount(v) {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const lonOk = (x) => x >= -180 && x <= 180;
const latOk = (x) => x >= -90 && x <= 90;

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
  state.q = (p.get('q') || '').slice(0, MAX_QUERY);
  state.regions = codes(p.get('r'));
  state.municipalities = codes(p.get('m'));
  state.types = codes(p.get('t'));
  state.materials = codes(p.get('w'), (x) => WASTE_CHOICES.has(x));
  state.severity = codes(p.get('d'), (x) => /^[1-4]$/.test(x));
  state.areaMin = amount(p.get('amin'));
  state.areaMax = amount(p.get('amax'));
  const b = numbers(p.get('b'), 4);
  state.bounds = b && lonOk(b[0]) && lonOk(b[2]) && latOk(b[1]) && latOk(b[3]) && b[0] < b[2] && b[1] < b[3] ? b : null;
  state.sort = p.get('s') === 'volume' ? 'volume' : 'area';
  const v = numbers(p.get('v'), 3);
  const view = v && lonOk(v[0]) && latOk(v[1]) && v[2] >= 0 && v[2] <= 24 ? { lng: v[0], lat: v[1], zoom: v[2] } : null;
  const lang = p.get('lang') === 'en' ? 'en' : 'mk';
  return { state, view, lang };
}
