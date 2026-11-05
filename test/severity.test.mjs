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
