import {
  test, expect, openSite, showList, openDetails, appState, isPhone, mapIdle, rendered, screenPoint, mapPixels,
  param, SEVERITY_RGB, VELES,
} from './fixtures.mjs';

const showOnMap = (page) => page.locator('#details [data-action="show-on-map"]');

async function landed(page) {
  await page.waitForFunction(() => !window.__deponii.map.isMoving());
  await mapIdle(page);
  return appState(page);
}

/** The site is drawn inside the part of the map a visitor can see (above the phone sheet, clear of the legend). */
async function expectInView(page, lngLat) {
  const p = await screenPoint(page, lngLat);
  const margin = 20;
  expect(p.x).toBeGreaterThan(p.visible.left + margin);
  expect(p.x).toBeLessThan(p.visible.right - margin);
  expect(p.y).toBeGreaterThan(p.visible.top + margin);
  expect(p.y).toBeLessThan(p.visible.bottom - margin);
  const legend = p.legend;
  const underLegend = p.x > legend.left && p.x < legend.right && p.y > legend.top && p.y < legend.bottom;
  expect(underLegend, 'not hidden under the legend').toBe(false);
  return p;
}

test.describe('Show on map', () => {
  test('the button is in view as soon as the details open', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 2);
    await expect(showOnMap(page)).toBeInViewport({ ratio: 1 });
    await expect(showOnMap(page)).toHaveText('Покажи на мапата');
    const box = await showOnMap(page).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('flies to the site, zooms in close and marks it with a pulse that goes away', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, VELES.id);
    await showOnMap(page).click();
    await expect(page.locator('.pin-pulse')).toBeVisible();

    const s = await landed(page);
    // The pulse is centred on the site (checked first: it only lasts a few seconds).
    const centred = await page.evaluate((ll) => {
      const m = window.__deponii.map;
      const p = m.project(ll);
      const c = m.getCanvas().getBoundingClientRect();
      const r = document.querySelector('.pin-pulse')?.getBoundingClientRect();
      return r && { dx: r.left + r.width / 2 - (c.left + p.x), dy: r.top + r.height / 2 - (c.top + p.y) };
    }, VELES.lngLat);
    expect(centred, 'the pulse is still showing after the flight').not.toBeUndefined();
    expect(Math.abs(centred.dx)).toBeLessThan(2);
    expect(Math.abs(centred.dy)).toBeLessThan(2);
    expect(s.view).toBe('map');
    expect(s.selectedId).toBe(VELES.id);
    expect(s.zoom).toBeGreaterThanOrEqual(15);
    await expect(page.locator('#map-wrap')).toBeVisible();

    // The site is a single marker on screen, in its severity image, and selected.
    const r = await rendered(page);
    expect(r.clusters).toEqual([]);
    expect(r.points).toEqual([{ id: VELES.id, img: 'm-mixed-4' }]);
    const ring = await page.evaluate(async () => (await window.__deponii.map.getSource('selected').getData()).features.length);
    expect(ring).toBe(1);

    // It sits in the visible part of the map, drawn in the very-high colour.
    const p = await expectInView(page, VELES.lngLat);
    const canvas = await page.locator('#map canvas').boundingBox();
    const px = await mapPixels(page, { colours: { sev4: SEVERITY_RGB[4] }, around: { x: p.x - canvas.x, y: p.y - canvas.y, r: 24 } });
    expect(px.counts.sev4).toBeGreaterThan(200);

    // The pulse goes away on its own; the selection stays.
    await expect(page.locator('.pin-pulse')).toHaveCount(0, { timeout: 7000 });
    expect((await appState(page)).selectedId).toBe(VELES.id);
  });

  test('the pulse ring is drawn in the site\'s severity colour', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 6);
    await showOnMap(page).click();
    const colour = await page.locator('.pin-pulse span').first().evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(colour).toBe(`rgb(${SEVERITY_RGB[2].join(', ')})`);
  });

  test('works with filters on, and keeps them in the link', async ({ page }, info) => {
    await openSite(page, '?d=1&q=lisice');
    await openDetails(page, info, 9);
    await showOnMap(page).click();
    await expect(page.locator('.pin-pulse')).toBeVisible();
    const s = await landed(page);
    expect(s.zoom).toBeGreaterThanOrEqual(15);
    expect(s.filtered.sort()).toEqual([4, 9]);
    expect(param(page, 'd')).toBe('1');
    expect(param(page, 'q')).toBe('lisice');
    const r = await rendered(page);
    expect(r.points.map((x) => x.id)).toContain(9);
    expect(r.points.find((x) => x.id === 9).img).toBe('m-unknown-1');
    await expectInView(page, [21.492444, 41.956583]);
  });

  test('a site with an unknown area shows in its dashed severity image', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 3);
    await showOnMap(page).click();
    await landed(page);
    const r = await rendered(page);
    expect(r.points.find((x) => x.id === 3)?.img).toBe('m-mixed-1-u');
  });

  test('from a site already on screen, it still zooms in close', async ({ page }) => {
    await openSite(page);
    await page.evaluate((ll) => window.__deponii.map.jumpTo({ center: ll, zoom: 14 }), VELES.lngLat);
    await mapIdle(page);
    const p = await screenPoint(page, VELES.lngLat);
    await page.mouse.click(p.x, p.y);
    await showOnMap(page).click();
    const s = await landed(page);
    expect(s.zoom).toBeGreaterThanOrEqual(15);
    await expectInView(page, VELES.lngLat);
  });

  test('an open legend never hides the site', async ({ page }, info) => {
    await openSite(page);
    await page.locator('#legend-toggle').click();
    await expect(page.locator('#legend-body')).toBeVisible();
    await openDetails(page, info, 1);
    await showOnMap(page).click();
    await landed(page);
    await expectInView(page, [20.994028, 41.572972]);
  });

  test('choosing a site in the list on a wide screen moves the map there too', async ({ page }, info) => {
    test.skip(isPhone(info), 'phones keep the list and map on separate tabs');
    await openSite(page);
    await page.locator('#list button[data-id="1"]').click();
    await expect(page.locator('.pin-pulse')).toBeVisible();
    const s = await landed(page);
    expect(s.zoom).toBeGreaterThanOrEqual(13);
    expect(Math.abs(s.center[0] - 20.994028)).toBeLessThan(0.01);
    expect(Math.abs(s.center[1] - 41.572972)).toBeLessThan(0.01);
  });
});

test.describe('Show on map on phones', () => {
  test.beforeEach(({}, info) => test.skip(!isPhone(info), 'phone layout'));

  test('switches to the map and shrinks the details to a bar above the tabs', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, VELES.id);
    const full = await page.locator('#details').boundingBox();
    await showOnMap(page).click();
    await landed(page);
    await expect(page.locator('.view-switch button[data-view="map"]')).toHaveAttribute('aria-pressed', 'true');
    const bar = await page.locator('#details').boundingBox();
    expect(bar.height).toBeLessThan(90);
    expect(bar.height).toBeLessThan(full.height / 3);
    await expect(page.locator('#details-title')).toHaveText('Велес · Бунар Дере');
    await expect(page.locator('#details-body')).toBeHidden();
    await expect(page.locator('.view-switch')).toBeVisible();
    const tabs = await page.locator('.view-switch').boundingBox();
    expect(bar.y + bar.height).toBeLessThanOrEqual(tabs.y + 1);
    await expect(page.locator('#details-expand')).toBeFocused();
    await expectInView(page, VELES.lngLat);

    // "Details" opens the sheet again; closing it clears the selection.
    await page.locator('#details-expand').click();
    await expect(page.locator('#details-body')).toBeVisible();
    await expect(page.locator('#details-expand')).toBeHidden();
    await page.locator('#details [data-action="close-details"]').click();
    await expect(page.locator('#details')).toBeHidden();
    expect((await appState(page)).selectedId).toBeNull();
  });

  test('going back to the list shows the full details again', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, VELES.id);
    await showOnMap(page).click();
    await landed(page);
    await page.locator('.view-switch button[data-view="list"]').click();
    await expect(page.locator('#details-body')).toBeVisible();
    await expect(page.locator('#details')).not.toHaveClass(/peek/);
  });

  test('leaves no camera padding behind for later moves', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, VELES.id);
    await showOnMap(page).click();
    const s = await landed(page);
    expect(s.padding).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  test('the pulse never shows through the list', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, VELES.id);
    await showOnMap(page).click();
    await expect(page.locator('.pin-pulse')).toBeVisible();
    await page.locator('.view-switch button[data-view="list"]').click();
    await expect(page.locator('.pin-pulse')).toBeHidden();
  });

  test('choosing a site from the list moves the hidden map without a pulse', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 1);
    await expect(page.locator('.pin-pulse')).toHaveCount(0);
    await page.locator('#details [data-action="close-details"]').click();
    await page.locator('.view-switch button[data-view="map"]').click();
    const s = await landed(page);
    expect(Math.abs(s.center[0] - 20.994028)).toBeLessThan(0.01);
  });
});
