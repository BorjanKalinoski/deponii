import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, basemapPaint, MAP_THEMES, THEMES } from '../assets/lib/theme.js';
import { UI } from '../assets/lib/i18n.js';
import { markerPx, MIN_PX, MAX_PX, UNKNOWN_PX } from '../assets/lib/icons.js';

test('a remembered choice wins; otherwise the system setting decides', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('sepia', true), 'dark');
  assert.equal(resolveTheme(undefined, undefined), 'light');
});

test('every theme has a basemap and map colours', () => {
  for (const theme of THEMES) {
    const c = MAP_THEMES[theme];
    assert.match(c.style, /^https:\/\/tiles\.openfreemap\.org\/styles\//);
    for (const key of ['cluster', 'clusterStroke', 'clusterText', 'clusterGlow', 'selected', 'selectedCasing']) assert.ok(c[key], `${theme}.${key}`);
  }
});

test('basemap tweaks touch only water, borders and place names', () => {
  const props = (layer) => basemapPaint(layer, 'light').map(([p]) => p);
  assert.deepEqual(props({ id: 'water', type: 'fill', 'source-layer': 'water' }), ['fill-color']);
  assert.deepEqual(props({ id: 'boundary_2', type: 'line', 'source-layer': 'boundary' }), ['line-color']);
  assert.deepEqual(props({ id: 'label_city', type: 'symbol', 'source-layer': 'place' }), ['text-color', 'text-halo-color', 'text-halo-width']);
  assert.deepEqual(props({ id: 'road', type: 'line', 'source-layer': 'transportation' }), []);
  assert.deepEqual(props({ id: 'background', type: 'background' }), []);
  assert.deepEqual(props({ id: 'points', type: 'symbol', source: 'sites' }), []);
  assert.deepEqual(basemapPaint({ type: 'fill', 'source-layer': 'water' }, 'sepia'), []);
});

test('the theme button is labelled in both languages', () => {
  for (const lang of ['mk', 'en']) {
    assert.ok(UI[lang].themeDark && UI[lang].themeLight, lang);
    assert.notEqual(UI[lang].themeDark, UI[lang].themeLight);
  }
});

test('marker sizes stay on a fixed log scale', () => {
  assert.equal(markerPx(10), MIN_PX);
  assert.equal(markerPx(1), MIN_PX);
  assert.equal(markerPx(100000), MAX_PX);
  assert.equal(markerPx(1e9), MAX_PX);
  assert.equal(markerPx(null), UNKNOWN_PX);
  assert.equal(markerPx(1000), (MIN_PX + MAX_PX) / 2);
});
