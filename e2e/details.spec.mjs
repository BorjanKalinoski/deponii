import { test, expect, openSite, showList, appState, isPhone } from './fixtures.mjs';

const item = (page, id) => page.locator(`#list button[data-id="${id}"]`);

test.describe('site details', () => {
  test('opening a site shows its recorded facts', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await item(page, 2).click();
    const details = page.locator('#details');
    await expect(details).toBeVisible();
    await expect(page.locator('#details-title')).toHaveText('Велес · Бунар Дере');
    await expect(details).toContainText('80 000 m²');
    await expect(details).toContainText('2 800 000 m³');
    await expect(details).toContainText('41.740972, 21.805417');
    await expect(details.locator('a[href*="google.com/maps"]')).toHaveAttribute('href', /41\.740972,21\.805417/);
    await expect(item(page, 2)).toHaveAttribute('aria-current', 'true');
    expect(new URL(page.url()).searchParams.get('q')).toBeNull();
  });

  test('unknown values say "unknown", never 0', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await item(page, 3).click();
    await expect(page.locator('#details .dl')).toContainText('непознато');
  });

  test('a site without coordinates explains why and offers no map button', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await item(page, 5).click();
    await expect(page.locator('#details .callout-warn')).toBeVisible();
    await expect(page.locator('[data-action="show-on-map"]')).toHaveCount(0);
    await expect(page.locator('#details a[href*="google.com/maps"]')).toHaveCount(0);
  });

  test('Escape and the close button close the details', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await item(page, 0).click();
    await expect(page.locator('#details')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#details')).toBeHidden();
    expect((await appState(page)).selectedId).toBeNull();
    await item(page, 0).click();
    await page.locator('#details [data-action="close-details"]').click();
    await expect(page.locator('#details')).toBeHidden();
  });

  test('clicking a marker on the map opens that site', async ({ page }, info) => {
    test.skip(isPhone(info), 'tap targets are covered by the phone test of Show on map');
    await openSite(page);
    // Zoom to the site first so it is a single marker, not part of a cluster.
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.805417, 41.740972], zoom: 14 }));
    await page.waitForFunction(() => window.__deponii.map.loaded());
    const box = await page.evaluate(() => {
      const m = window.__deponii.map;
      const p = m.project([21.805417, 41.740972]);
      const r = m.getCanvas().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await page.mouse.click(box.x, box.y);
    await expect(page.locator('#details-title')).toHaveText('Велес · Бунар Дере');
  });
});
