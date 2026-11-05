import {
  test, expect, openSite, showList, openDetails, appState, isPhone, mapIdle, screenPoint, VELES,
} from './fixtures.mjs';

const item = (page, id) => page.locator(`#list button[data-id="${id}"]`);
const dd = (page, label) => page.locator('#details .dl dt', { hasText: new RegExp(`^${label}`) }).locator('xpath=following-sibling::dd[1]');

test.describe('site details', () => {
  test('opening a site shows its recorded facts', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 2);
    const details = page.locator('#details');
    await expect(page.locator('#details-title')).toHaveText('Велес · Бунар Дере');
    await expect(details.locator('.detail-kind')).toHaveText('Мешан · Активна нестандарднаСериозност: Многу висока');
    await expect(dd(page, 'Регион')).toHaveText('Вардарски');
    await expect(dd(page, 'Општина')).toHaveText('Велес');
    await expect(dd(page, 'Локалитет')).toHaveText('Бунар Дере');
    await expect(dd(page, 'Координати')).toHaveText('41.740972, 21.805417');
    await expect(dd(page, 'Површина')).toHaveText('80 000 m²');
    await expect(dd(page, 'Волумен')).toHaveText('2 800 000 m³');
    await expect(dd(page, 'Доминантен отпад')).toHaveText('Комунален и градежен');
    await expect(dd(page, 'Извор')).toHaveText('МЖСПП');
    await expect(dd(page, 'Датум')).toHaveText('10.03.2026');
    await expect(details.locator('.callout')).toHaveText('Координатите се прикажани како што се евидентирани; не се независно проверени.');
    await expect(details.locator('a[href*="google.com/maps"]')).toHaveAttribute('href', /query=41\.740972,21\.805417$/);
    await expect(details.locator('a[href*="google.com/maps"]')).toHaveAttribute('rel', 'noopener');
    await expect(item(page, 2)).toHaveAttribute('aria-current', 'true');
    await expect(item(page, 0)).toHaveAttribute('aria-current', 'false');
    expect((await appState(page)).selectedId).toBe(2);
  });

  test('the marker in the details matches the site\'s severity and size', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 2);
    const src = await page.locator('#details .detail-kind img').getAttribute('src');
    const svg = decodeURIComponent(src.split(',')[1]);
    expect(svg).toContain('fill="#8e0f22"');
    expect(svg).not.toContain('stroke-dasharray');
  });

  test('unknown values say "unknown", never 0; a stated 0 stays 0', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 3);
    await expect(page.locator('#details-title')).toHaveText('Трнодол/Жданец');
    await expect(dd(page, 'Датум')).toHaveText('07.06.2026');
    for (const label of ['Населено место', 'Површина', 'Волумен', 'Забелешка']) {
      await expect(dd(page, label)).toHaveText('непознато');
      await expect(dd(page, label).locator('.unk')).toHaveCount(1);
    }
    await expect(page.locator('#details .dl')).not.toContainText('0 m²');
    const svg = decodeURIComponent((await page.locator('#details .detail-kind img').getAttribute('src')).split(',')[1]);
    expect(svg).toContain('stroke-dasharray'); // the unknown-size marker
    await page.locator('#details [data-action="close-details"]').click();
    await openDetails(page, info, 9);
    await expect(dd(page, 'Површина')).toHaveText('0 m²');
    await expect(dd(page, 'Волумен')).toHaveText('35 m³');
    await expect(dd(page, 'Доминантен отпад')).toHaveText('непознато');
  });

  test('a site without coordinates explains why and offers no map button', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 5);
    await expect(page.locator('#details-title')).toHaveText('Немањици');
    await expect(page.locator('#details .callout-warn')).toHaveText('Локацијата не е позната, па записот не е прикажан на мапата.');
    await expect(dd(page, 'Координати')).toHaveText('непознато');
    await expect(page.locator('#details .detail-sev')).toHaveText('Сериозност: Висока');
    await expect(page.locator('[data-action="show-on-map"]')).toHaveCount(0);
    await expect(page.locator('#details a[href*="google.com/maps"]')).toHaveCount(0);
    // Nothing is marked on the map for it.
    const ring = await page.evaluate(async () => (await window.__deponii.map.getSource('selected').getData()).features.length);
    expect(ring).toBe(0);
    await expect(page.locator('.pin-pulse')).toHaveCount(0);
  });

  test('choosing an unlocated site clears the pulse of the site before it', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 2);
    await page.locator('[data-action="show-on-map"]').click();
    await expect(page.locator('.pin-pulse')).toHaveCount(1);
    if (isPhone(info)) {
      await page.locator('#details [data-action="close-details"]').click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('.pin-pulse')).toHaveCount(0);
    await openDetails(page, info, 5);
    await expect(page.locator('.pin-pulse')).toHaveCount(0);
  });

  test('Escape and the close button close the details', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#details')).toBeHidden();
    expect((await appState(page)).selectedId).toBeNull();
    await expect(item(page, 0)).toHaveAttribute('aria-current', 'false');
    if (!isPhone(info)) await expect(item(page, 0)).toBeFocused(); // back where the visitor was
    await item(page, 0).click();
    await expect(page.locator('#details')).toBeVisible();
    await page.locator('#details [data-action="close-details"]').click();
    await expect(page.locator('#details')).toBeHidden();
    const ring = await page.evaluate(async () => (await window.__deponii.map.getSource('selected').getData()).features.length);
    expect(ring).toBe(0);
  });

  test('a filtered-out site closes its details', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 2);
    await page.locator('#details [data-action="close-details"]').click();
    await item(page, 8).click();
    await expect(page.locator('#details')).toBeVisible();
    await page.locator('#details [data-action="close-details"]').click();
    await page.locator('#q').fill('veles');
    await item(page, 2).click();
    await page.locator('#details [data-action="close-details"]').click();
    await page.locator('#q').fill('rostuse');
    await expect(page.locator('#details')).toBeHidden();
  });

  test('clicking a marker on the map opens that site', async ({ page }) => {
    await openSite(page);
    // Zoom in so the site is a single marker, not part of a cluster.
    await page.evaluate((ll) => window.__deponii.map.jumpTo({ center: ll, zoom: 14 }), VELES.lngLat);
    await mapIdle(page);
    const p = await screenPoint(page, VELES.lngLat);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('#details')).toBeVisible();
    await expect(page.locator('#details-title')).toHaveText('Велес · Бунар Дере');
    expect((await appState(page)).selectedId).toBe(VELES.id);
    const ring = await page.evaluate(async () => (await window.__deponii.map.getSource('selected').getData()).features.length);
    expect(ring).toBe(1);
  });

  test('clicking a cluster zooms in to split it', async ({ page }) => {
    await openSite(page);
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.44, 41.975], zoom: 8 }));
    await mapIdle(page);
    const cluster = await page.evaluate(() => {
      const m = window.__deponii.map;
      const f = m.queryRenderedFeatures({ layers: ['clusters'] })[0];
      const p = m.project(f.geometry.coordinates);
      const c = m.getCanvas().getBoundingClientRect();
      return { x: c.left + p.x, y: c.top + p.y, zoom: m.getZoom() };
    });
    await page.mouse.click(cluster.x, cluster.y);
    await expect.poll(async () => (await appState(page)).zoom).toBeGreaterThan(cluster.zoom + 0.5);
  });

  test('two records at the same spot are both offered, and either can be opened', async ({ page }) => {
    await openSite(page);
    const stip = [21.369953, 41.101094];
    await page.evaluate((ll) => window.__deponii.map.jumpTo({ center: ll, zoom: 15 }), stip);
    await mapIdle(page);
    const p = await screenPoint(page, stip);
    await page.mouse.click(p.x, p.y);
    const chooser = page.locator('.chooser');
    await expect(chooser).toBeVisible();
    await expect(chooser.locator('p')).toHaveText('2 записи на ова место');
    await expect(chooser.locator('button[data-id]')).toHaveCount(2);
    await chooser.locator('button[data-id="7"]').click();
    await expect(page.locator('#details-title')).toHaveText('Ново Село');
    await expect(chooser).toBeHidden();
  });

  test('in English, place names are in Latin script with the original beside them', async ({ page }, info) => {
    await openSite(page, '?lang=en');
    await openDetails(page, info, 2);
    await expect(page.locator('#details-title')).toHaveText('Veles · Bunar Dere');
    await expect(dd(page, 'Locality')).toHaveText('Bunar DereБунар Дере');
    await expect(dd(page, 'Dominant waste')).toHaveText('Municipal and constructionКомунален и градежен');
    await expect(dd(page, 'Information source')).toHaveText('Ministry of Environment and Physical PlanningМЖСПП');
    await expect(page.locator('#details .detail-sev')).toHaveText('Severity: Very high');
    await expect(page.locator('[data-action="show-on-map"]')).toHaveText('Show on map');
  });
});
