// Shared set-up for the end-to-end tests.
//
// Every test runs against fixed data (test/fixtures/sample.csv, 10 records)
// instead of the live feed copy in data/, so results don't change with the
// daily data check. The OpenFreeMap basemap is replaced by a one-layer style,
// so tests need no network and the markers are the only thing on the map.
// Glyphs are stubbed too, so cluster numbers are laid out but not drawn.
//
// Fixture records (id: settlement · locality, area m², type → severity):
//   0 Мак. Брод · Барбарас  22 500 active → 4     5 Немањици (no coordinates), unknown, active → 3
//   1 Кичево · Осломеј       3 000 active → 4     6 Штип                  500 dumpsite → 2
//   2 Велес · Бунар Дере    80 000 active → 4     7 Ново Село (same point as 6), unknown → 1
//   3 Трнодол/Жданец      unknown dumpsite → 1    8 Ростуше               12.5 closed → 1
//   4 Аеродром · Горно Лисиче…  unknown → 1       9 Лисиче                   0 dumpsite → 1
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hsv } from './colour.mjs';

export const SAMPLE = readFileSync(new URL('../test/fixtures/sample.csv', import.meta.url), 'utf8');
const META = {
  source: 'feed',
  checkedAt: '2026-11-05T08:00:00.000Z',
  dataChangedAt: '2026-11-04T08:00:00.000Z',
  records: 10,
  located: 9,
};
export const BASEMAP = { light: '#eef1ee', dark: '#1b1f20' };
const styleFor = (bg) => ({
  version: 8,
  name: 'test',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': bg } }],
});

export const SEVERITY_RGB = { 1: [201, 138, 0], 2: [224, 98, 13], 3: [204, 47, 31], 4: [142, 15, 34] };
export const VELES = { id: 2, lngLat: [21.805417, 41.740972] };

/** Route the basemap, glyphs and data to local stand-ins and block everything else off-site. */
export async function stubNetwork(page, { csv = SAMPLE, meta = META } = {}) {
  // Routes added later win, so the catch-all that blocks the network goes first.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.route(/tiles\.openfreemap\.org\/styles\/positron/, (r) => r.fulfill({ json: styleFor(BASEMAP.light) }));
  await page.route(/tiles\.openfreemap\.org\/styles\/dark/, (r) => r.fulfill({ json: styleFor(BASEMAP.dark) }));
  // An empty glyph range is valid: cluster numbers just aren't drawn.
  await page.route(/tiles\.openfreemap\.org\/fonts\//, (r) => r.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await page.route('**/data/map-data.csv', (r) => r.fulfill({ body: csv, contentType: 'text/csv; charset=utf-8' }));
  await page.route('**/data/meta.json', (r) => (meta ? r.fulfill({ json: meta }) : r.fulfill({ status: 404, body: '' })));
}

export const test = base.extend({
  // Options a test can override with test.use({ ... }).
  csv: [SAMPLE, { option: true }],
  meta: [META, { option: true }],

  page: async ({ page, csv, meta }, use) => {
    await stubNetwork(page, { csv, meta });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(errors, 'uncaught page errors').toEqual([]);
  },
});

export { expect };

export const isPhone = (testInfo) => testInfo.project.name === 'phone';

/** Open the site and wait until the list and the map's site layers are ready. */
export async function openSite(page, query = '') {
  await page.goto(`index.html${query}`);
  await page.waitForFunction(() => window.__deponii?.dataStatus === 'ready' && window.__deponii.mapReady === true, null, { timeout: 15_000 });
  await mapIdle(page);
}

/** Wait until the map has stopped moving and has drawn everything it is going to draw. */
export async function mapIdle(page) {
  await page.waitForFunction(() => {
    const m = window.__deponii?.map;
    return m && window.__deponii.mapReady && m.loaded() && !m.isMoving();
  }, null, { timeout: 15_000 });
  await page.evaluate(() => new Promise((resolve) => {
    const m = window.__deponii.map;
    m.once('idle', resolve);
    m.triggerRepaint();
  }));
}

/** Read the app's state through the small test hook exposed in app.js. */
export const appState = (page) => page.evaluate(() => {
  const a = window.__deponii;
  const map = a.map;
  return {
    selectedId: a.selectedId,
    filtered: a.filtered.map((r) => r.id),
    zoom: map?.getZoom(),
    center: map ? map.getCenter().toArray() : null,
    padding: map?.getPadding(),
    view: document.querySelector('.layout').dataset.view,
    theme: document.documentElement.dataset.theme,
    lang: a.lang,
  };
});

/** The features currently in the map's site source (what the map would draw). */
export const mapFeatures = (page) => page.evaluate(async () =>
  (await window.__deponii.map.getSource('sites').getData()).features.map((f) => f.properties));

/** Single markers and clusters actually rendered in the visible map. */
export const rendered = (page) => page.evaluate(() => {
  const m = window.__deponii.map;
  return {
    points: m.queryRenderedFeatures({ layers: ['points'] }).map((f) => ({ id: f.properties.id, img: f.properties.img })),
    clusters: m.queryRenderedFeatures({ layers: ['clusters'] }).map((f) => ({ id: f.properties.cluster_id, count: f.properties.point_count, maxSev: f.properties.maxSev })),
  };
});

/** Where a coordinate is on the page, and the part of the map a visitor can see. */
export const screenPoint = (page, lngLat) => page.evaluate((ll) => {
  const m = window.__deponii.map;
  const p = m.project(ll);
  const c = m.getCanvas().getBoundingClientRect();
  const sheet = document.querySelector('#details');
  const legend = document.querySelector('#legend');
  const sheetTop = sheet.hidden || getComputedStyle(sheet).position !== 'fixed' ? Infinity : sheet.getBoundingClientRect().top;
  return {
    x: c.left + p.x, y: c.top + p.y,
    visible: { left: c.left, right: c.right, top: c.top, bottom: Math.min(c.bottom, sheetTop) },
    legend: legend.getBoundingClientRect().toJSON(),
  };
}, lngLat);

/**
 * Pixels of the map canvas as drawn, analysed in the page: the number of
 * green pixels, and of pixels within `tolerance` of each named colour.
 * `around` limits the count to a circle (CSS px, relative to the canvas).
 */
export async function mapPixels(page, { colours = {}, around = null, tolerance = 6 } = {}) {
  await mapIdle(page);
  return page.evaluate(async ({ hsvSrc, colours, around, tolerance }) => {
    const hsv = new Function(`return (${hsvSrc})`)();
    const m = window.__deponii.map;
    const url = await new Promise((resolve) => {
      m.once('render', () => resolve(m.getCanvas().toDataURL('image/png')));
      m.triggerRepaint();
    });
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width } = ctx.getImageData(0, 0, img.width, img.height);
    const ratio = img.width / m.getCanvas().getBoundingClientRect().width;
    const counts = Object.fromEntries(Object.keys(colours).map((k) => [k, 0]));
    let green = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (around) {
        const x = (i / 4) % width / ratio;
        const y = Math.floor(i / 4 / width) / ratio;
        if ((x - around.x) ** 2 + (y - around.y) ** 2 > around.r ** 2) continue;
      }
      total++;
      const px = [data[i], data[i + 1], data[i + 2]];
      const { h, s, v } = hsv(px);
      if (h >= 75 && h <= 185 && s >= 0.25 && v >= 0.2) green++;
      for (const [name, c] of Object.entries(colours)) {
        if (Math.abs(px[0] - c[0]) <= tolerance && Math.abs(px[1] - c[1]) <= tolerance && Math.abs(px[2] - c[2]) <= tolerance) counts[name]++;
      }
    }
    return { green, total, counts };
  }, { hsvSrc: hsv.toString(), colours, around, tolerance });
}

/** Show the list (phones keep it behind a tab). */
export async function showList(page, testInfo) {
  if (isPhone(testInfo)) {
    await page.locator('.view-switch button[data-view="list"]').click();
    await expect(page.locator('#list')).toBeVisible();
  }
}

/** Open the filters panel (on phones it is reached from the list tab). */
export async function openFilters(page, testInfo) {
  await showList(page, testInfo);
  await page.locator('#filters-toggle').click();
  await expect(page.locator('#filters')).toBeVisible();
}

export async function closeFilters(page) {
  await page.locator('#filters-done').click();
  await expect(page.locator('#filters')).toBeHidden();
}

/** Open one record's details from the list. */
export async function openDetails(page, testInfo, id) {
  await showList(page, testInfo);
  await page.locator(`#list button[data-id="${id}"]`).click();
  await expect(page.locator('#details')).toBeVisible();
}

export const param = (page, name) => new URL(page.url()).searchParams.get(name);
export const results = (page) => page.locator('#list button[data-id]');
