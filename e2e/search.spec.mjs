import { test, expect, openSite, showList } from './fixtures.mjs';

const results = (page) => page.locator('#list button[data-id]');

test.describe('search', () => {
  for (const q of ['Штип', 'stip', 'shtip', 'Štip']) {
    test(`"${q}" finds both Štip records in Cyrillic or Latin`, async ({ page }, info) => {
      await openSite(page);
      await showList(page, info);
      await page.locator('#q').fill(q);
      await expect(results(page)).toHaveCount(2);
      await expect(page.locator('#counts')).toContainText('2 евидентирани локации');
      expect(new URL(page.url()).searchParams.get('q')).toBe(q);
    });
  }

  test('a full municipality name finds its abbreviation in the data', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#q').fill('Македонски Брод');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Барбарас');
  });

  test('several words must all match', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#q').fill('штип ново');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Ново Село');
  });

  test('no match shows the empty state, and reset brings everything back', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#q').fill('нема-такво-место');
    await expect(results(page)).toHaveCount(0);
    await expect(page.locator('#empty')).toBeVisible();
    await page.locator('#empty [data-action="reset"]').click();
    await expect(results(page)).toHaveCount(10);
    await expect(page.locator('#q')).toHaveValue('');
  });

  test('the search survives a reload through the link', async ({ page }, info) => {
    await openSite(page, '?q=veles');
    await showList(page, info);
    await expect(page.locator('#q')).toHaveValue('veles');
    await expect(results(page)).toHaveCount(1);
  });
});
