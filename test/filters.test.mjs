import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFeed } from '../assets/lib/feed.js';
import { buildRecords } from '../assets/lib/records.js';
import {
  applyFilters, sortRecords, emptyState, hasActiveFilters, isAreaRangeActive, queryTokens,
  dropUnknownChoices, activeFilterCount,
} from '../assets/lib/filters.js';

const sample = readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8');
const records = buildRecords(validateFeed(sample).rows);
const state = (patch) => ({ ...emptyState(), ...patch });
const ids = (list) => list.map((r) => r.id);
const find = (patch) => ids(applyFilters(records, state(patch))).sort((a, b) => a - b);
const set = (...xs) => new Set(xs);

test('no filters keep every record, in their original order', () => {
  assert.deepEqual(ids(applyFilters(records, emptyState())), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('each empty state is fresh, so changing one never leaks into another', () => {
  const a = emptyState();
  a.regions.add('skopski');
  assert.equal(emptyState().regions.size, 0);
});

test('region and municipality filters', () => {
  assert.deepEqual(find({ regions: set('skopski') }), [3, 4, 9]);
  assert.deepEqual(find({ regions: set('istocen') }), [6, 7]);
  assert.deepEqual(find({ municipalities: set('stip') }), [6, 7]);
  assert.deepEqual(find({ municipalities: set('mak-brod', 'kicevo') }), [0, 1]);
});

test('type filter', () => {
  assert.deepEqual(find({ types: set('active') }), [0, 1, 2, 5]);
  assert.deepEqual(find({ types: set('dumpsite') }), [3, 4, 6, 7, 9]);
  assert.deepEqual(find({ types: set('closed') }), [8]);
});

test('material filter: a mixed site matches each material it names; unknown and other are choices too', () => {
  assert.deepEqual(find({ materials: set('municipal') }), [2, 3, 6, 7]);
  assert.deepEqual(find({ materials: set('construction') }), [2, 3]);
  assert.deepEqual(find({ materials: set('bulky') }), [7]);
  assert.deepEqual(find({ materials: set('industrial') }), []);
  assert.deepEqual(find({ materials: set('unknown') }), [0, 1, 4, 5, 9]);
  assert.deepEqual(find({ materials: set('other') }), [8]);
  assert.deepEqual(find({ materials: set('other', 'unknown') }), [0, 1, 4, 5, 8, 9]);
});

test('severity filter', () => {
  assert.deepEqual(find({ severity: set('4') }), [0, 1, 2]);
  assert.deepEqual(find({ severity: set('3') }), [5]);
  assert.deepEqual(find({ severity: set('2') }), [6]);
  assert.deepEqual(find({ severity: set('1') }), [3, 4, 7, 8, 9]);
});

test('choices within a category combine with OR; categories combine with AND', () => {
  assert.deepEqual(find({ regions: set('skopski', 'vardarski') }), [2, 3, 4, 5, 9]);
  assert.deepEqual(find({ regions: set('skopski', 'vardarski'), types: set('active') }), [2, 5]);
  assert.deepEqual(find({ severity: set('4', '2') }), [0, 1, 2, 6]);
  assert.deepEqual(find({ severity: set('4', '2'), types: set('dumpsite') }), [6]);
  assert.deepEqual(find({ severity: set('1'), materials: set('unknown'), regions: set('skopski') }), [4, 9]);
  assert.deepEqual(find({ severity: set('4'), regions: set('skopski') }), []);
});

test('an area range shows only known areas inside it; clearing it restores the unknown ones', () => {
  assert.deepEqual(find({ areaMin: 0, areaMax: 1000 }), [6, 8, 9], 'a stated 0 is inside [0, 1000]');
  assert.deepEqual(find({ areaMin: 1000 }), [0, 1, 2]);
  assert.deepEqual(find({ areaMax: 500 }), [6, 8, 9], 'the bounds are inclusive');
  assert.deepEqual(find({ areaMin: 500, areaMax: 500 }), [6]);
  assert.deepEqual(find({ areaMin: 50000 }), [2]);
  assert.deepEqual(find({ areaMin: 1, areaMax: 10 }), []);
  for (const r of applyFilters(records, state({ areaMin: 0 }))) assert.notEqual(r.area, null);
  assert.equal(find({ areaMin: null, areaMax: null }).length, 10);
});

test('a map-area limit keeps only located records inside the bounds, edges included', () => {
  assert.deepEqual(find({ bounds: [21.3, 41.9, 21.6, 42.1] }), [3, 4, 9]);
  assert.deepEqual(find({ bounds: [21.805417, 41.740972, 21.9, 41.8] }), [2], 'a site on the edge is inside');
  assert.deepEqual(find({ bounds: [-180, -90, 180, 90] }), [0, 1, 2, 3, 4, 6, 7, 8, 9], 'never the unlocated one');
  assert.deepEqual(find({ bounds: [0, 0, 1, 1] }), []);
});

test('search matches settlement, locality and municipality, in either script', () => {
  assert.deepEqual(find({ q: 'oslomej' }), [1]);
  assert.deepEqual(find({ q: 'Осломеј' }), [1]);
  assert.deepEqual(find({ q: 'Makedonski Brod' }), [0]);
  assert.deepEqual(find({ q: 'Мак. Брод' }), [0]);
  assert.deepEqual(find({ q: 'Rostuše' }), [8]);
  assert.deepEqual(find({ q: 'Mavrovo i Rostuse' }), [8]);
  assert.deepEqual(find({ q: 'stip' }), [6, 7]);
  assert.deepEqual(find({ q: 'shtip novo' }), [7], 'every word must match');
  assert.deepEqual(find({ q: 'veles bunar' }), [2]);
  assert.deepEqual(find({ q: 'lisice' }), [4, 9], 'matches inside longer names too');
  assert.deepEqual(find({ q: 'nowhere' }), []);
  assert.deepEqual(find({ q: '   ' }).length, 10, 'blank search shows everything');
});

test('query tokens split on whitespace and fold each word', () => {
  assert.deepEqual(queryTokens('  Штип   Ново '), ['stip', 'novo']);
  assert.deepEqual(queryTokens(''), []);
  assert.deepEqual(queryTokens(null), []);
  assert.deepEqual(queryTokens('. /'), []);
});

test('which filters count as active', () => {
  assert.equal(hasActiveFilters(emptyState()), false);
  assert.equal(hasActiveFilters(state({ q: '   ' })), false);
  for (const patch of [{ q: 'x' }, { regions: set('a') }, { municipalities: set('a') }, { types: set('a') },
    { materials: set('a') }, { severity: set('1') }, { areaMin: 0 }, { areaMax: 10 }, { bounds: [0, 0, 1, 1] }]) {
    assert.equal(hasActiveFilters(state(patch)), true, JSON.stringify(Object.keys(patch)));
  }
  assert.equal(hasActiveFilters(state({ sort: 'volume' })), false, 'sorting is not filtering');
  assert.equal(isAreaRangeActive(state({ areaMin: 0 })), true, 'a 0 minimum still counts');
  assert.equal(isAreaRangeActive(emptyState()), false);
});

test('the Filters badge counts categories in use, not choices', () => {
  assert.equal(activeFilterCount(emptyState()), 0);
  assert.equal(activeFilterCount(state({ severity: set('4', '3') })), 1);
  assert.equal(activeFilterCount(state({ regions: set('a', 'b'), municipalities: set('c'), types: set('d'),
    materials: set('e'), severity: set('1'), areaMin: 5, areaMax: 9 })), 6);
  assert.equal(activeFilterCount(state({ q: 'x', bounds: [0, 0, 1, 1] })), 0, 'search and map area have their own chips');
});

test('choices no record has are dropped, so an old link never hides everything', () => {
  const s = dropUnknownChoices(state({
    regions: set('skopski', 'atlantis'), municipalities: set('stip', 'nowhere'), types: set('active', 'spaceship'),
    materials: set('industrial'), severity: set('3'), q: 'x', areaMin: 5,
  }), records);
  assert.deepEqual([...s.regions], ['skopski']);
  assert.deepEqual([...s.municipalities], ['stip']);
  assert.deepEqual([...s.types], ['active']);
  assert.deepEqual([...s.materials], ['industrial'], 'a valid material with no sites is a real (empty) filter');
  assert.deepEqual([...s.severity], ['3']);
  assert.equal(s.q, 'x');
  assert.equal(s.areaMin, 5);
});

test('sorting: largest first, unknown values last, never as 0', () => {
  const byArea = sortRecords(records, 'area');
  assert.deepEqual(ids(byArea), [2, 0, 1, 6, 8, 9, 7, 3, 4, 5]);
  const firstUnknown = byArea.findIndex((r) => r.area == null);
  assert.ok(byArea.slice(firstUnknown).every((r) => r.area == null));
  assert.equal(byArea[firstUnknown - 1].area, 0, 'a stated 0 comes before unknown');
  // Among unknown areas, a known volume comes first (7 has 700 m³).
  assert.equal(byArea[firstUnknown].id, 7);
  assert.deepEqual(ids(sortRecords(records, 'volume')), [2, 0, 1, 7, 9, 8, 6, 3, 4, 5]);
  assert.deepEqual(ids(sortRecords(records)), ids(byArea), 'area is the default');
});

test('sorting breaks ties by the other measure, then by row order, and never changes its input', () => {
  const r = (id, area, volume) => ({ id, area, volume });
  const list = [r(3, 10, null), r(1, 10, 5), r(2, 10, 5), r(0, null, null)];
  const copy = [...list];
  assert.deepEqual(ids(sortRecords(list, 'area')), [1, 2, 3, 0]);
  assert.deepEqual(list, copy);
});
