import { test } from 'node:test';
import assert from 'node:assert/strict';
import { severity, areaBand, SEVERITY_COLORS, SEVERITY_LEVELS } from '../assets/lib/severity.js';

const site = (area, typeCode = 'dumpsite') => ({ area, typeCode });

test('bigger recorded areas are more severe', () => {
  assert.equal(severity(site(10)), 1);
  assert.equal(severity(site(99)), 1);
  assert.equal(severity(site(100)), 2);
  assert.equal(severity(site(1000)), 3);
  assert.equal(severity(site(10000)), 4);
  assert.equal(severity(site(150000)), 4);
});

test('active non-compliant landfills score one level higher, capped at 4', () => {
  assert.equal(severity(site(50, 'active')), 2);
  assert.equal(severity(site(5000, 'active')), 4);
  assert.equal(severity(site(80000, 'active')), 4);
  assert.equal(severity(site(5000, 'closed')), 3);
});

test('an unknown area never reads as harmless', () => {
  assert.equal(areaBand(null), null);
  assert.equal(severity(site(null)), 1);
  assert.equal(severity(site(null, 'active')), 3);
  assert.ok(severity(site(0)) >= 1);
});

test('every level has a colour', () => {
  for (const l of SEVERITY_LEVELS) assert.match(SEVERITY_COLORS[l], /^#[0-9a-f]{6}$/i);
});

test('records carry a severity and can be filtered and shared by it', async () => {
  const { readFileSync } = await import('node:fs');
  const { validateFeed } = await import('../assets/lib/feed.js');
  const { buildRecords } = await import('../assets/lib/records.js');
  const { applyFilters, emptyState } = await import('../assets/lib/filters.js');
  const { toQuery, fromQuery } = await import('../assets/lib/urlstate.js');
  const rows = validateFeed(readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8')).rows;
  const recs = buildRecords(rows);
  assert.ok(recs.every((r) => r.severity >= 1 && r.severity <= 4));
  const veles = recs.find((r) => r.locality === 'Бунар Дере');
  assert.equal(veles.severity, 4, '80 000 m² active landfill');
  const state = { ...emptyState(), severity: new Set(['4']) };
  assert.ok(applyFilters(recs, state).every((r) => r.severity === 4));
  const back = fromQuery('?' + toQuery({ state, lang: 'mk' }));
  assert.deepEqual([...back.state.severity], ['4']);
  assert.equal(fromQuery('?d=9,x').state.severity.size, 0);
});
