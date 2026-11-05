// Shared set-up for the end-to-end tests.
//
// Every test runs against fixed data (test/fixtures/sample.csv, 10 records)
// instead of the live feed copy in data/, so results don't change with the
// daily data check. The OpenFreeMap basemap is replaced by a one-layer style,
// so tests need no network and the markers are the only thing on the map.
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const SAMPLE = readFileSync(new URL('../test/fixtures/sample.csv', import.meta.url), 'utf8');
const META = {
  source: 'feed',
  checkedAt: '2026-11-05T08:00:00.000Z',
  dataChangedAt: '2026-11-04T08:00:00.000Z',
  records: 10,
  located: 9,
};
const styleFor = (bg) => ({
  version: 8,
  name: 'test',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': bg } }],
});

export const test = base.extend({
  // Options a test can override with test.use({ ... }).
  csv: [SAMPLE, { option: true }],
  meta: [META, { option: true }],

  page: async ({ page, csv, meta }, use) => {
    // Routes added later win, so the catch-all that blocks the network goes first.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.route(/tiles\.openfreemap\.org\/styles\/positron/, (r) => r.fulfill({ json: styleFor('#eef1ee') }));
    await page.route(/tiles\.openfreemap\.org\/styles\/dark/, (r) => r.fulfill({ json: styleFor('#1b1f20') }));
    // An empty glyph range is valid: cluster numbers just aren't drawn.
    await page.route(/tiles\.openfreemap\.org\/fonts\//, (r) => r.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
    await page.route('**/data/map-data.csv', (r) => r.fulfill({ body: csv, contentType: 'text/csv; charset=utf-8' }));
    await page.route('**/data/meta.json', (r) => r.fulfill({ json: meta }));
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(errors, 'uncaught page errors').toEqual([]);
  },
});

export { expect };

/** Open the site and wait until the list and the map's site layers are ready. */
export async function openSite(page, query = '') {
  await page.goto(`index.html${query}`);
  await page.waitForFunction(() => window.__deponii?.dataStatus === 'ready' && window.__deponii.mapReady === true, null, { timeout: 15_000 });
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
    view: document.querySelector('.layout').dataset.view,
    theme: document.documentElement.dataset.theme,
  };
});

export const isPhone = (testInfo) => testInfo.project.name === 'phone';

/** Show the list (phones keep it behind a tab). */
export async function showList(page, testInfo) {
  if (isPhone(testInfo)) await page.locator('.view-switch button[data-view="list"]').click();
}
