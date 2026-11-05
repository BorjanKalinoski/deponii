import { test, expect, openSite, showList, results, param, mapFeatures } from './fixtures.mjs';

const ids = (page) => results(page).evaluateAll((els) => els.map((e) => Number(e.dataset.id)).sort((a, b) => a - b));

test.describe('search', () => {
  for (const q of ['Штип', 'штип', 'stip', 'shtip', 'Štip', 'ŠTIP']) {
    test(`"${q}" finds both Štip records, in Cyrillic or Latin`, async ({ page }, info) => {
      await openSite(page);
      await showList(page, info);
      await page.locator('#q').fill(q);
      await expect(results(page)).toHaveCount(2);
      expect(await ids(page)).toEqual([6, 7]);
      await expect(page.locator('#counts')).toContainText('2 евидентирани локации · 2 на мапата · 0 без локација');
      await expect.poll(() => param(page, 'q')).toBe(q);
    });
  }

  test('the map shows only what the search found', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#q').fill('stip');
    await expect(results(page)).toHaveCount(2);
    await expect.poll(async () => (await mapFeatures(page)).map((f) => f.id).sort()).toEqual([6, 7]);
  });

  for (const q of ['Македонски Брод', 'Makedonski Brod', 'Мак. Брод', 'mak brod']) {
    test(`"${q}" finds the abbreviated municipality`, async ({ page }, info) => {
      await openSite(page);
      await showList(page, info);
      await page.locator('#q').fill(q);
      await expect(results(page)).toHaveCount(1);
      await expect(results(page).first()).toContainText('Барбарас');
    });
  }

  test('a locality, a municipality and a full region alias all match', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#q').fill('Осломеј');
    await expect(results(page)).toHaveCount(1);
    await page.locator('#q').fill('karpos');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Трнодол/Жданец');
    await page.locator('#q').fill('Mavrovo i Rostuše');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Ростуше');
  });

  test('several words must all match', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#q').fill('штип ново');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Ново Село');
    await page.locator('#q').fill('shtip   veles');
    await expect(results(page)).toHaveCount(0);
  });

  test('no match shows the empty state, and its reset brings everything back', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#q').fill('нема-такво-место');
    await expect(results(page)).toHaveCount(0);
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#empty-text')).toHaveText('Нема евидентирани локации што одговараат на избраните филтри.');
    await expect(page.locator('#counts')).toContainText('0 евидентирани локации');
    await page.locator('#empty [data-action="reset"]').click();
    await expect(results(page)).toHaveCount(10);
    await expect(page.locator('#q')).toHaveValue('');
    await expect(page.locator('#empty')).toBeHidden();
    await expect.poll(() => param(page, 'q')).toBeNull();
  });

  test('clearing the search shows everything again and takes it out of the link', async ({ page }, info) => {
    await openSite(page, '?q=veles');
    await showList(page, info);
    await expect(results(page)).toHaveCount(1);
    await page.locator('#q').fill('');
    await expect(results(page)).toHaveCount(10);
    await expect.poll(() => param(page, 'q')).toBeNull();
  });

  test('the search survives a reload through the link', async ({ page }, info) => {
    await openSite(page, '?q=veles');
    await showList(page, info);
    await expect(page.locator('#q')).toHaveValue('veles');
    await expect(results(page)).toHaveCount(1);
    await page.reload();
    await page.waitForFunction(() => window.__deponii?.dataStatus === 'ready');
    await showList(page, info);
    await expect(page.locator('#q')).toHaveValue('veles');
    await expect(results(page)).toHaveCount(1);
  });

  test('in English, results show Latin names and Cyrillic searches still work', async ({ page }, info) => {
    await openSite(page, '?lang=en');
    await showList(page, info);
    await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Search settlement, locality or municipality');
    await page.locator('#q').fill('Кичево');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Kičevo · Oslomej');
  });
});
