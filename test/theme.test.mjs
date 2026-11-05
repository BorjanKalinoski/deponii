import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, basemapPaint, MAP_THEMES, THEMES, THEME_COLOR, THEME_KEY } from '../assets/lib/theme.js';
import { colourLiterals, isGreenish } from '../e2e/colour.mjs';

test('a remembered choice wins; otherwise the system setting decides', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme(undefined, undefined), 'light');
  assert.equal(resolveTheme('', true), 'dark');
  assert.equal(resolveTheme('sepia', true), 'dark', 'an unknown stored value is ignored');
  assert.equal(resolveTheme('sepia', false), 'light');
  assert.equal(resolveTheme('DARK', false), 'light', 'stored values are exact');
  assert.equal(THEME_KEY, 'deponii-theme');
});

test('both themes have a basemap, a browser bar colour and map colours', () => {
  assert.deepEqual(THEMES, ['light', 'dark']);
  for (const theme of THEMES) {
    const c = MAP_THEMES[theme];
    assert.match(c.style, /^https:\/\/tiles\.openfreemap\.org\/styles\/[a-z]+$/);
    for (const key of ['clusterStroke', 'selected', 'selectedCasing']) assert.match(c[key], /^#[0-9a-f]{6}$/i, `${theme}.${key}`);
    assert.ok(c.clusterGlowOpacity > 0 && c.clusterGlowOpacity < 1, `${theme}.clusterGlowOpacity`);
    assert.notEqual(c.selected, c.selectedCasing, 'the selection ring is two-tone');
    assert.match(THEME_COLOR[theme], /^#[0-9a-f]{6}$/i);
    // Cluster fills and numbers come from the severity scale, never a theme colour.
    assert.equal(c.cluster, undefined, `${theme}.cluster`);
    assert.equal(c.clusterText, undefined, `${theme}.clusterText`);
  }
  assert.notEqual(MAP_THEMES.light.style, MAP_THEMES.dark.style);
});

test('no map colour in either theme is green', () => {
  for (const theme of THEMES) {
    for (const c of colourLiterals(JSON.stringify(MAP_THEMES[theme]))) assert.equal(isGreenish(c), false, `${theme}: ${c}`);
  }
});

test('basemap tweaks touch only water, borders and place names', () => {
  const props = (layer, theme = 'light') => basemapPaint(layer, theme).map(([p]) => p);
  assert.deepEqual(props({ id: 'water', type: 'fill', 'source-layer': 'water' }), ['fill-color']);
  assert.deepEqual(props({ id: 'waterway', type: 'line', 'source-layer': 'water' }), [], 'only water areas');
  assert.deepEqual(props({ id: 'boundary_2', type: 'line', 'source-layer': 'boundary' }), ['line-color']);
  assert.deepEqual(props({ id: 'label_city', type: 'symbol', 'source-layer': 'place' }), ['text-color', 'text-halo-color', 'text-halo-width']);
  assert.deepEqual(props({ id: 'road', type: 'line', 'source-layer': 'transportation' }), []);
  assert.deepEqual(props({ id: 'park', type: 'fill', 'source-layer': 'park' }), []);
  assert.deepEqual(props({ id: 'background', type: 'background' }), []);
  assert.deepEqual(props({ id: 'points', type: 'symbol', source: 'sites' }), [], 'never our own layers');
  assert.deepEqual(basemapPaint({ type: 'fill', 'source-layer': 'water' }, 'sepia'), []);
  assert.deepEqual(basemapPaint(null, 'light'), []);
});

test('each theme tunes the basemap with its own colours', () => {
  const water = (theme) => basemapPaint({ type: 'fill', 'source-layer': 'water' }, theme)[0][1];
  assert.notEqual(water('light'), water('dark'));
  const border = basemapPaint({ type: 'line', 'source-layer': 'boundary' }, 'dark')[0][1];
  assert.equal(border[0], 'case', 'country borders differ from other borders');
  const halo = basemapPaint({ type: 'symbol', 'source-layer': 'place' }, 'dark').find(([p]) => p === 'text-halo-color')[1];
  assert.match(halo, /^rgba\(10, 12, 12/);
});
