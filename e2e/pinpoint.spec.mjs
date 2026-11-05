import { test, expect, openSite, showList, appState, isPhone } from './fixtures.mjs';

const VELES = [21.805417, 41.740972];

async function renderedPoints(page) {
  await page.waitForFunction(() => window.__deponii.map.loaded() && !window.__deponii.map.isMoving());
  return page.evaluate(() => window.__deponii.map.queryRenderedFeatures({ layers: ['points'] }).map((f) => ({ id: f.properties.id, img: f.properties.img })));
}

test.describe('Show on map', () => {
  test('flies to the site, zooms in close and marks it with a pulse', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#list button[data-id="2"]').click();
    await page.locator('[data-action="show-on-map"]').click();

    const s = await (async () => { await page.waitForFunction(() => !window.__deponii.map.isMoving()); return appState(page); })();
    expect(s.view).toBe('map');
    expect(s.selectedId).toBe(2);
    expect(s.zoom).toBeGreaterThanOrEqual(15);
    await expect(page.locator('.pin-pulse')).toBeVisible();
    await expect(page.locator('#map-wrap')).toBeVisible();

    // The site is a single marker on screen, in its severity colour, and selected.
    const pts = await renderedPoints(page);
    expect(pts).toContainEqual({ id: 2, img: 'm-mixed-4' });
    const selected = await page.evaluate(() => window.__deponii.map.getSource('selected')._data.features.length);
    expect(selected).toBe(1);

    // It sits in the visible part of the map (above the details sheet on phones).
    const pos = await page.evaluate(([lng, lat]) => {
      const m = window.__deponii.map;
      const p = m.project([lng, lat]);
      const c = m.getCanvas().getBoundingClientRect();
      const sheet = document.querySelector('#details');
      const sheetTop = sheet.hidden ? Infinity : sheet.getBoundingClientRect().top;
      return { x: c.left + p.x, y: c.top + p.y, left: c.left, right: c.right, top: c.top, bottom: Math.min(c.bottom, sheetTop) };
    }, VELES);
    expect(pos.x).toBeGreaterThan(pos.left);
    expect(pos.x).toBeLessThan(pos.right);
    expect(pos.y).toBeGreaterThan(pos.top);
    expect(pos.y).toBeLessThan(pos.bottom);

    // The pulse goes away on its own.
    await expect(page.locator('.pin-pulse')).toHaveCount(0, { timeout: 7000 });
  });

  test('works with filters on, and keeps them', async ({ page }, info) => {
    await openSite(page, '?d=1');
    await showList(page, info);
    await page.locator('#list button[data-id="9"]').click();
    await page.locator('[data-action="show-on-map"]').click();
    await page.waitForFunction(() => !window.__deponii.map.isMoving());
    const s = await appState(page);
    expect(s.zoom).toBeGreaterThanOrEqual(15);
    expect(s.filtered.every((id) => [3, 4, 7, 8, 9].includes(id))).toBe(true);
    expect(new URL(page.url()).searchParams.get('d')).toBe('1');
    const pts = await renderedPoints(page);
    expect(pts.map((p) => p.id)).toContain(9);
  });

  test('choosing a site in the list on a wide screen moves the map there too', async ({ page }, info) => {
    test.skip(isPhone(info), 'phones keep the list and map on separate tabs');
    await openSite(page);
    await page.locator('#list button[data-id="1"]').click();
    await page.waitForFunction(() => !window.__deponii.map.isMoving());
    const s = await appState(page);
    expect(s.zoom).toBeGreaterThanOrEqual(13);
    expect(Math.abs(s.center[0] - 20.994028)).toBeLessThan(0.01);
    expect(Math.abs(s.center[1] - 41.572972)).toBeLessThan(0.01);
  });
});
