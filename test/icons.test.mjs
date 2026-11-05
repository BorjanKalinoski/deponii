import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  markerPx, markerSvg, imageName, ICON_KINDS, MIN_PX, MAX_PX, UNKNOWN_PX, MIN_AREA, MAX_AREA, NEUTRAL, WHITE,
} from '../assets/lib/icons.js';
import { SEVERITY_COLORS, SEVERITY_INK, SEVERITY_LEVELS } from '../assets/lib/severity.js';
import { colourLiterals, isGreenish } from '../e2e/colour.mjs';

test('marker sizes follow a fixed log scale between the smallest and largest', () => {
  assert.equal(markerPx(MIN_AREA), MIN_PX);
  assert.equal(markerPx(MAX_AREA), MAX_PX);
  assert.equal(markerPx(1000), (MIN_PX + MAX_PX) / 2, 'halfway on the log scale');
  assert.equal(markerPx(null), UNKNOWN_PX);
  assert.equal(markerPx(undefined), UNKNOWN_PX);
});

test('marker sizes never shrink as the area grows', () => {
  let last = -Infinity;
  for (let a = 0; a <= 1e7; a = a < 1 ? a + 0.5 : a * 1.7) {
    const px = markerPx(a);
    assert.ok(px >= last, `${a} m² → ${px}px`);
    last = px;
  }
  assert.ok(markerPx(500) < markerPx(5000));
  assert.ok(markerPx(5000) < markerPx(50000));
});

test('marker sizes are clamped, so tiny and huge sites stay readable', () => {
  for (const a of [0, 0.5, 1, 9.9, -5]) assert.equal(markerPx(a), MIN_PX, String(a));
  for (const a of [100000, 250000, 1e12]) assert.equal(markerPx(a), MAX_PX, String(a));
  for (let a = 0; a < 1e7; a = a * 3 + 1) {
    const px = markerPx(a);
    assert.ok(px >= MIN_PX && px <= MAX_PX, `${a} m² → ${px}px`);
  }
});

test('image names carry the kind, the severity level and the unknown-size flag', () => {
  assert.equal(imageName('mixed', false, 4), 'm-mixed-4');
  assert.equal(imageName('unknown', true, 1), 'm-unknown-1-u');
  assert.equal(imageName('bio', false), 'm-bio-0', 'level 0 is the neutral symbol');
  const names = new Set();
  for (const kind of ICON_KINDS) {
    for (const level of [0, ...SEVERITY_LEVELS]) {
      for (const unknownSize of [false, true]) {
        const name = imageName(kind, unknownSize, level);
        assert.match(name, /^m-[a-z]+-[0-4](-u)?$/);
        names.add(name);
      }
    }
  }
  assert.equal(names.size, ICON_KINDS.length * 5 * 2, 'every combination has its own image');
});

test('a marker is a disc in the severity colour with a white ring and the pictogram in its ink', () => {
  for (const level of SEVERITY_LEVELS) {
    const svg = markerSvg('municipal', { color: SEVERITY_COLORS[level], ink: SEVERITY_INK[level] });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64" height="64" viewBox="0 0 32 32">.*<\/svg>$/);
    assert.ok(svg.includes(`fill="${SEVERITY_COLORS[level]}"`), `level ${level} fill`);
    assert.ok(svg.includes(`stroke="${SEVERITY_INK[level]}" stroke-width="2.2"`), `level ${level} pictogram`);
    assert.ok(svg.includes(`stroke="${WHITE}" stroke-width="2.4"`), 'solid white ring');
    assert.ok(!svg.includes('stroke-dasharray'));
  }
  assert.ok(markerSvg('bio', { px: 40 }).includes('width="40" height="40"'));
});

test('an unknown-size marker keeps its colour and gets a dashed ring instead', () => {
  const svg = markerSvg('mixed', { unknownSize: true, color: SEVERITY_COLORS[3], ink: SEVERITY_INK[3] });
  assert.ok(svg.includes(`fill="${SEVERITY_COLORS[3]}"`));
  assert.match(svg, /stroke="#ffffff" stroke-width="2.6" stroke-dasharray="[\d.]+ [\d.]+"/);
  // The dashes divide the ring evenly, so no doubled dash where it closes.
  const [dash, gap] = svg.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const turns = (2 * Math.PI * 13.3) / (dash + gap);
  assert.ok(Math.abs(turns - Math.round(turns)) < 0.01, `${turns} dashes`);
});

test('white pictograms get a faint dark outline; dark ones need none', () => {
  const groups = (svg) => (svg.match(/<g /g) || []).length;
  assert.equal(groups(markerSvg('bio', { color: SEVERITY_COLORS[4], ink: '#ffffff' })), 2);
  assert.equal(groups(markerSvg('bio', { color: SEVERITY_COLORS[1], ink: SEVERITY_INK[1] })), 1);
  assert.equal(groups(markerSvg('bio')), 2, 'the neutral symbol is white on grey');
});

test('every kind has its own pictogram; an unknown kind falls back to the question mark', () => {
  const pictogram = (kind) => markerSvg(kind).match(/<g [^>]*>(.*?)<\/g>/)[1];
  assert.equal(new Set(ICON_KINDS.map(pictogram)).size, ICON_KINDS.length);
  assert.equal(pictogram('no-such-kind'), pictogram('unknown'));
});

test('no marker, at any level, contains green', () => {
  for (const kind of ICON_KINDS) {
    for (const level of SEVERITY_LEVELS) {
      for (const unknownSize of [false, true]) {
        const svg = markerSvg(kind, { unknownSize, color: SEVERITY_COLORS[level], ink: SEVERITY_INK[level] });
        for (const c of colourLiterals(svg)) assert.equal(isGreenish(c), false, `${kind}/${level}: ${c}`);
      }
    }
  }
  assert.equal(isGreenish(NEUTRAL), false);
});
