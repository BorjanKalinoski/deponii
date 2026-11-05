// One filtered record set drives the map, the list and the counts.
import { searchKey } from './translit.js';

export function emptyState() {
  return {
    q: '',
    regions: new Set(),
    municipalities: new Set(),
    types: new Set(),
    materials: new Set(), // material codes plus 'unknown' and 'other'
    severity: new Set(), // '1'..'4'
    areaMin: null,
    areaMax: null,
    bounds: null, // [west, south, east, north] from "Search this area"
    sort: 'area', // 'area' | 'volume'
  };
}

export function isAreaRangeActive(s) {
  return s.areaMin != null || s.areaMax != null;
}

export function hasActiveFilters(s) {
  return Boolean(
    s.q.trim() || s.regions.size || s.municipalities.size || s.types.size ||
    s.materials.size || s.severity.size || isAreaRangeActive(s) || s.bounds,
  );
}

function matchesMaterials(rec, wanted) {
  if (wanted.has('unknown') && rec.waste.unknown) return true;
  if (wanted.has('other') && rec.waste.other) return true;
  return rec.waste.materials.some((m) => wanted.has(m));
}

function matchesQuery(rec, tokens) {
  return tokens.every((t) => rec.searchKeys.includes(t));
}

export function queryTokens(q) {
  return String(q || '').split(/\s+/).map(searchKey).filter(Boolean);
}

/** Categories combine with AND; choices within a category combine with OR. */
export function applyFilters(records, s) {
  const tokens = queryTokens(s.q);
  const rangeOn = isAreaRangeActive(s);
  return records.filter((r) => {
    if (s.regions.size && !s.regions.has(r.regionCode)) return false;
    if (s.municipalities.size && !s.municipalities.has(r.municipalityCode)) return false;
    if (s.types.size && !s.types.has(r.typeCode)) return false;
    if (s.materials.size && !matchesMaterials(r, s.materials)) return false;
    if (s.severity.size && !s.severity.has(String(r.severity))) return false;
    if (rangeOn) {
      if (r.area == null) return false;
      if (s.areaMin != null && r.area < s.areaMin) return false;
      if (s.areaMax != null && r.area > s.areaMax) return false;
    }
    if (s.bounds) {
      if (!r.located) return false;
      const [w, so, e, n] = s.bounds;
      if (r.lon < w || r.lon > e || r.lat < so || r.lat > n) return false;
    }
    if (tokens.length && !matchesQuery(r, tokens)) return false;
    return true;
  });
}

/** Largest first; unknown values always after known ones, never treated as 0. */
export function sortRecords(records, by = 'area') {
  const other = by === 'area' ? 'volume' : 'area';
  const desc = (a, b, key) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  };
  return [...records].sort((a, b) => desc(a, b, by) || desc(a, b, other) || a.id - b.id);
}

export function countRecords(records) {
  const located = records.filter((r) => r.located).length;
  return { total: records.length, located, unlocated: records.length - located };
}
