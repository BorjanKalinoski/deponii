import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  severity, areaBand, AREA_BANDS, SEVERITY_COLORS, SEVERITY_INK, SEVERITY_HALO, SEVERITY_LEVELS,
} from '../assets/lib/severity.js';
import { validateFeed } from '../assets/lib/feed.js';
import { buildRecords } from '../assets/lib/records.js';
import { applyFilters, emptyState } from '../assets/lib/filters.js';
import { toQuery, fromQuery } from '../assets/lib/urlstate.js';
import { contrast, isGreenish, luminance } from '../e2e/colour.mjs';

const site = (area, typeCode = 'dumpsite') => ({ area, typeCode });

test('area bands: <100, <1 000, <10 000 and ≥10 000 m²', () => {
  assert.deepEqual(AREA_BANDS, [100, 1000, 10000]);
  const cases = [[0, 1], [12.5, 1], [99.99, 1], [100, 2], [999, 2], [1000, 3], [9999.9, 3], [10000, 4], [1e9, 4]];
  for (const [area, band] of cases) assert.equal(areaBand(area), band, String(area));
  assert.equal(areaBand(null), null);
  assert.equal(areaBand(undefined), null);
});

test('bigger recorded areas are more severe', () => {
  assert.equal(severity(site(10)), 1);
  assert.equal(severity(site(99)), 1);
  assert.equal(severity(site(100)), 2);
  assert.equal(severity(site(1000)), 3);
  assert.equal(severity(site(10000)), 4);
  assert.equal(severity(site(150000)), 4);
  let last = 0;
  for (let a = 1; a <= 1e6; a *= 3) {
    const s = severity(site(a));
    assert.ok(s >= last, `never less severe for a bigger area (${a} m²)`);
    last = s;
  }
});

test('an active non-compliant landfill is one level higher, capped at 4; other types are not', () => {
  assert.equal(severity(site(0, 'active')), 2);
  assert.equal(severity(site(50, 'active')), 2);
  assert.equal(severity(site(500, 'active')), 3);
  assert.equal(severity(site(5000, 'active')), 4);
  assert.equal(severity(site(80000, 'active')), 4, 'capped');
  for (const type of ['dumpsite', 'closed', 'unknown', 'sanirana']) {
    assert.equal(severity(site(5000, type)), 3, type);
    assert.equal(severity(site(50000, type)), 4, type);
  }
});

test('an unknown area never reads as harmless', () => {
  assert.equal(severity(site(null)), 1);
  assert.equal(severity(site(null, 'closed')), 1);
  assert.equal(severity(site(null, 'active')), 3);
  assert.ok(severity(site(0)) >= 1, 'a stated 0 is still on the scale');
});

test('the fixture sites get the expected severities', () => {
  const rows = validateFeed(readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8')).rows;
  const recs = buildRecords(rows);
  assert.deepEqual(recs.map((r) => r.severity), [4, 4, 4, 1, 1, 3, 2, 1, 1, 1]);
  const state = { ...emptyState(), severity: new Set(['4']) };
  assert.ok(applyFilters(recs, state).every((r) => r.severity === 4));
  assert.deepEqual([...fromQuery('?' + toQuery({ state, lang: 'mk' })).state.severity], ['4']);
});

test('one colour per level, none of them green or blue', () => {
  assert.deepEqual(SEVERITY_LEVELS, [1, 2, 3, 4]);
  const colours = SEVERITY_LEVELS.map((l) => SEVERITY_COLORS[l]);
  for (const c of colours) {
    assert.match(c, /^#[0-9a-f]{6}$/i);
    assert.equal(isGreenish(c), false, `${c} must not be green`);
  }
  assert.equal(new Set(colours).size, 4);
});

test('the colours rank: each level is darker than the one below it', () => {
  for (const l of [2, 3, 4]) {
    assert.ok(luminance(SEVERITY_COLORS[l]) < luminance(SEVERITY_COLORS[l - 1]), `level ${l} darker than ${l - 1}`);
  }
});

test('pictograms and cluster numbers keep at least 4.5:1 contrast on every level', () => {
  for (const l of SEVERITY_LEVELS) {
    const ratio = contrast(SEVERITY_INK[l], SEVERITY_COLORS[l]);
    assert.ok(ratio >= 4.5, `level ${l}: ${ratio.toFixed(2)}:1`);
    assert.ok(SEVERITY_HALO[l], `level ${l} has a halo`);
  }
  assert.equal(SEVERITY_INK[4], '#ffffff', 'white on the darkest red');
});
