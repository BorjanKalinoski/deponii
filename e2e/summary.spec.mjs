import { test, expect, openSite, showList, isPhone, appState, SAMPLE } from './fixtures.mjs';

// Sample totals (fixtures.mjs): areas are stated for 6 of the 10 sites
// (22 500 + 3 000 + 80 000 + 500 + 12,5 + 0), volumes for 6 of 10; Бунар Дере
// (id 2) alone holds more than half of both known sums.
const summary = (page) => page.locator('#summary');
const tile = (page, n) => page.locator('#summary .sum-tile').nth(n);
const names = (page, n) => tile(page, n).locator('[data-action="select-site"]');

/** The sample's header with made-up located sites, one per area (m²). */
const csvWithAreas = (...areas) => [
  SAMPLE.split('\n')[0],
  ...areas.map((a, i) => `Скопски,Карпош,${['Алфа', 'Бета', 'Гама', 'Делта', 'Епсилон', 'Зета'][i]},/,41.99,${21.39 + i / 100},${a},,Буниште,/,МЖСПП,10.03.2026,/`),
].join('\n') + '\n';

test.describe('summary', () => {
  test('sums of the stated values, how many sites state them, and the site holding over half', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await expect(summary(page)).toBeVisible();
    await expect(page.locator('#summary-title')).toHaveText('Преглед');
    await expect(tile(page, 0).locator('dt')).toHaveText('Збир на познатата површина');
    await expect(tile(page, 0).locator('.sum-value')).toHaveText(/^106\s012,5 m²$/);
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('позната за 6 од 10 локации');
    // Four areas are unknown, so the claim is only about the known ones.
    await expect(tile(page, 0).locator('.sum-share')).toHaveText('Од локациите со позната површина, најголемата има повеќе од половина од збирот: Велес · Бунар Дере.');
    await expect(tile(page, 1).locator('dt')).toHaveText('Збир на познатиот волумен');
    await expect(tile(page, 1).locator('.sum-value')).toHaveText(/^2\s838\s242,5 m³$/);
    await expect(tile(page, 1).locator('.sum-known')).toHaveText('познат за 6 од 10 локации');
    await expect(tile(page, 1).locator('.sum-share')).toHaveText('Од локациите со познат волумен, најголемата има повеќе од половина од збирот: Велес · Бунар Дере.');
  });

  test('it follows the filters: a region with one stated area of 0 m² and no share', async ({ page }, info) => {
    await openSite(page, '?r=skopski');
    await showList(page, info);
    await expect(tile(page, 0).locator('.sum-value')).toHaveText('0 m²');
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('позната за 1 од 3 локации');
    await expect(tile(page, 1).locator('.sum-value')).toHaveText('35 m³');
    await expect(page.locator('#summary .sum-share')).toHaveCount(0);
  });

  test('when no site in the list states a value, the sum is unknown, not 0', async ({ page }, info) => {
    await openSite(page, '?m=karpos,aerodrom');
    await showList(page, info);
    await expect(tile(page, 0).locator('.sum-value')).toHaveText('непознато');
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('позната за 0 од 2 локации');
    await expect(tile(page, 1).locator('.sum-value')).toHaveText('непознато');
  });

  test('it follows the visible map area like the list does', async ({ page }, info) => {
    await openSite(page, '?b=21.3,41.9,21.6,42.1');
    await showList(page, info);
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('позната за 1 од 3 локации');
    await page.locator('#chips [data-chip="bounds"]').click();
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('позната за 6 од 10 локации');
  });

  test('a list of one site, or none, has no summary', async ({ page }, info) => {
    await openSite(page, '?q=veles');
    await showList(page, info);
    await expect(page.locator('#list button[data-id]')).toHaveCount(1);
    await expect(summary(page)).toBeHidden();
    await page.locator('#q').fill('nowhere');
    await expect(page.locator('#empty')).toBeVisible();
    await expect(summary(page)).toBeHidden();
    await page.locator('#q').fill('');
    await expect(summary(page)).toBeVisible();
  });

  test('in English, and back to Macedonian', async ({ page }, info) => {
    await openSite(page, '?lang=en');
    await showList(page, info);
    await expect(page.locator('#summary-title')).toHaveText('Summary');
    await expect(tile(page, 0).locator('dt')).toHaveText('Sum of known areas');
    await expect(tile(page, 0).locator('.sum-value')).toHaveText(/^106\s012\.5 m²$/);
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('known for 6 of 10 sites');
    await expect(tile(page, 0).locator('.sum-share')).toHaveText('Of the sites with a known area, the largest has more than half the sum: Veles · Bunar Dere.');
    await page.locator('#lang-toggle').click();
    await expect(page.locator('#summary-title')).toHaveText('Преглед');
    await expect(tile(page, 0).locator('.sum-value')).toHaveText(/^106\s012,5 m²$/);
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('позната за 6 од 10 локации');
    await expect(names(page, 0)).toHaveText('Велес · Бунар Дере');
  });

  test('a named site opens its details, and closing them returns to the summary', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await names(page, 1).click();
    await expect(page.locator('#details')).toBeVisible();
    await expect(page.locator('#details-title')).toHaveText('Велес · Бунар Дере');
    expect((await appState(page)).selectedId).toBe(2);
    await page.locator('#details [data-action="close-details"]').click();
    await expect(page.locator('#details')).toBeHidden();
    if (isPhone(info)) {
      expect((await appState(page)).view).toBe('list');
      await expect(summary(page)).toBeVisible();
    } else {
      await expect(names(page, 1)).toBeFocused();
    }
  });

  test('closing the details still returns to the summary after it was redrawn', async ({ page }, info) => {
    test.skip(isPhone(info), 'phones do not move the focus back');
    await openSite(page);
    await names(page, 0).click();
    await expect(page.locator('#details')).toBeVisible();
    await page.locator('#lang-toggle').click(); // redraws the summary
    await page.keyboard.press('Escape');
    await expect(page.locator('#details')).toBeHidden();
    await expect(names(page, 0)).toBeFocused();
  });

  test('the summary scrolls away with the list', async ({ page }, info) => {
    await page.setViewportSize(isPhone(info) ? { width: 412, height: 500 } : { width: 1280, height: 520 });
    await openSite(page);
    await showList(page, info);
    await expect(summary(page)).toBeInViewport();
    await page.locator('.results').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(summary(page)).not.toBeInViewport();
    await expect(page.locator('#list button[data-id]').last()).toBeInViewport();
  });

  test('on phones the summary is on the list tab, not over the map', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone layout');
    await openSite(page);
    await expect(summary(page)).toBeHidden();
    await showList(page, info);
    await expect(summary(page)).toBeVisible();
  });
});

test.describe('summary: when every area is known', () => {
  test.use({ csv: csvWithAreas(400, 300, 200, 100) });

  test('two sites are named, the claim covers the whole list, and each name opens its site', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await expect(tile(page, 0).locator('.sum-known')).toHaveText('позната за сите 4');
    await expect(tile(page, 0).locator('.sum-share')).toHaveText('2-те најголеми локации имаат повеќе од половина од површината: Алфа, Бета.');
    await expect(names(page, 0)).toHaveText(['Алфа', 'Бета']);
    await names(page, 0).nth(1).click();
    expect((await appState(page)).selectedId).toBe(1);
  });
});

test.describe('summary: when more than three sites are needed', () => {
  test.use({ csv: csvWithAreas(100, 100, 100, 100, 100, 100) });

  test('no site is named', async ({ page }, info) => {
    await openSite(page, '?lang=en');
    await showList(page, info);
    await expect(tile(page, 0).locator('.sum-share')).toHaveText('The 4 largest sites have more than half the area.');
    await expect(names(page, 0)).toHaveCount(0);
  });
});
