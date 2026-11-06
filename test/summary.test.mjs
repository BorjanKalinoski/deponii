import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFeed } from '../assets/lib/feed.js';
import { buildRecords } from '../assets/lib/records.js';
import { applyFilters, emptyState, sortRecords } from '../assets/lib/filters.js';
import { summarize, measureSummary, MIN_FOR_SHARE, MAX_NAMED } from '../assets/lib/summary.js';

const sample = readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8');
const records = buildRecords(validateFeed(sample).rows);
const ids = (list) => list.map((r) => r.id);
const pick = (...wanted) => records.filter((r) => wanted.includes(r.id));
// Bare sites with only an area, for exact cases; null is an unknown area.
const sites = (...areas) => areas.map((area, id) => ({ id, area, volume: null }));
const share = (...areas) => measureSummary(sites(...areas), 'area').overHalf;
const NONE = { known: 0, total: null, overHalf: null, leaders: [] };

test('totals add up stated values only, and say how many sites state them', () => {
  const s = summarize(records);
  assert.equal(s.count, 10);
  assert.equal(s.area.known, 6, 'four sample sites state no area');
  assert.equal(s.area.total, 22500 + 3000 + 80000 + 500 + 12.5 + 0);
  assert.equal(s.volume.known, 6, 'four sample sites state no volume');
  assert.equal(s.volume.total, 22500 + 15000 + 2800000 + 700 + 7.5 + 35);
});

test('a stated 0 is a known value; no stated value at all is unknown, never 0', () => {
  assert.deepEqual(measureSummary(pick(9), 'area'), { known: 1, total: 0, overHalf: null, leaders: [] });
  assert.deepEqual(measureSummary(pick(3, 4, 5), 'area'), NONE);
  assert.deepEqual(measureSummary([], 'volume'), NONE);
  assert.deepEqual(summarize([]), { count: 0, area: NONE, volume: NONE });
});

test('the fewest largest sites that hold more than all the others together', () => {
  assert.equal(share(100, 1, 1), 1);
  assert.equal(share(1, 1, 100), 1, 'the order of the input does not matter');
  assert.equal(share(5, 4, 3, 2, 1), 2, '9 of 15');
  assert.equal(share(10, 10, 10, 10), 3, 'exactly half is not more than half');
  assert.equal(share(0.5, 0.25, 0.25), 2, 'decimals: 0.5 of 1 is exactly half');
  assert.equal(share(0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.1, 0.1), 4, 'rounding noise never decides a tie: 0.6 of 1.0');
  assert.equal(share(...Array(1000).fill(1)), 501);
});

test('unknown values take no part in the share, and are not counted as known', () => {
  const m = measureSummary(sites(10, null, null, 1, 1), 'area');
  assert.equal(m.known, 3);
  assert.equal(m.total, 12);
  assert.equal(m.overHalf, 1);
});

test('no share from fewer than three stated values, or from a total of 0', () => {
  assert.equal(MIN_FOR_SHARE, 3);
  assert.equal(share(100, 1), null);
  assert.equal(share(100, 1, null, null), null, 'two stated values among four sites');
  assert.equal(share(0, 0, 0), null);
  assert.equal(measureSummary(sites(0, 0, 0), 'area').total, 0, 'the total is still a known 0');
});

test('the largest sites are named only when three or fewer hold more than half, largest first', () => {
  assert.equal(MAX_NAMED, 3);
  assert.deepEqual(ids(measureSummary(sites(1, 40, 30, 5, 5, 5), 'area').leaders), [1, 2]);
  assert.deepEqual(ids(measureSummary(sites(10, 10, 10, 10), 'area').leaders), [0, 1, 2], 'ties in row order');
  assert.deepEqual(measureSummary(sites(10, 10, 10, 10, 10, 10), 'area').leaders, [], 'four would be needed, so none is named');
  assert.deepEqual(measureSummary(sites(100, 1), 'area').leaders, [], 'no share, no names');
});

test('ties are broken the way the list sorts: by the other measure, then row order', () => {
  const list = [
    { id: 0, area: 10, volume: 1 },
    { id: 1, area: 10, volume: 5 },
    { id: 2, area: 10, volume: null },
    { id: 3, area: 1, volume: null },
  ];
  // 31 m² in all: the two largest (20) hold more than the other two (11).
  assert.deepEqual(ids(measureSummary(list, 'area').leaders), [1, 0]);
  assert.deepEqual(ids(measureSummary([...list].reverse(), 'area').leaders), [1, 0], 'not by input order');
  assert.deepEqual(ids(measureSummary(sites(10, 10, 10, 10).reverse(), 'area').leaders), [0, 1, 2]);
});

test('the list sort never changes the summary', () => {
  for (const by of ['area', 'volume']) {
    assert.deepEqual(summarize(sortRecords(records, by)), summarize(records), by);
    assert.deepEqual(summarize(sortRecords(records, by).reverse()), summarize(records), `${by}, reversed`);
  }
});

test('in the sample, one site holds more than half of both totals', () => {
  const s = summarize(records);
  assert.equal(s.area.overHalf, 1);
  assert.deepEqual(ids(s.area.leaders), [2], 'Бунар Дере: 80 000 of 106 012,5 m²');
  assert.equal(s.volume.overHalf, 1);
  assert.deepEqual(ids(s.volume.leaders), [2], 'Бунар Дере: 2 800 000 of 2 838 242,5 m³');
});

test('the summary describes whatever set it is given, such as the list within the visible map area', () => {
  const skopje = applyFilters(records, { ...emptyState(), bounds: [21.3, 41.9, 21.6, 42.1] });
  const s = summarize(skopje);
  assert.equal(s.count, 3);
  assert.deepEqual([s.area.known, s.area.total, s.volume.known, s.volume.total], [1, 0, 1, 35]);
  assert.equal(s.area.overHalf, null);
  assert.equal(s.volume.overHalf, null);
});

test('never changes its input', () => {
  const list = sites(1, 3, 2);
  const copy = structuredClone(list);
  summarize(list);
  assert.deepEqual(list, copy);
});
