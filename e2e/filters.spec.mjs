import { test, expect, openSite, showList } from './fixtures.mjs';

const results = (page) => page.locator('#list button[data-id]');

async function openFilters(page) {
  await page.locator('#filters-toggle').click();
  await expect(page.locator('#filters')).toBeVisible();
}
async function closeFilters(page) {
  await page.locator('#filters-done').click();
  await expect(page.locator('#filters')).toBeHidden();
}

test.describe('filters', () => {
  test('severity: only the most severe sites, with a removable chip and a shareable link', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page);
    const opt = page.locator('label[for="f-severity-4"]');
    await expect(opt).toContainText('Многу висока');
    await expect(opt.locator('.n')).toHaveText('3');
    await opt.click();
    await closeFilters(page);
    await expect(page.locator('#counts')).toContainText('3 евидентирани локации');
    expect(new URL(page.url()).searchParams.get('d')).toBe('4');
    const chip = page.locator('#chips [data-chip="severity"]');
    await expect(chip).toContainText('Многу висока');
    await showList(page, info);
    await expect(results(page)).toHaveCount(3);
    await chip.click();
    await expect(results(page)).toHaveCount(10);
    expect(new URL(page.url()).searchParams.get('d')).toBeNull();
  });

  test('severity choices combine with OR, other categories with AND', async ({ page }) => {
    await openSite(page);
    await openFilters(page);
    await page.locator('label[for="f-severity-4"]').click();
    await page.locator('label[for="f-severity-2"]').click();
    await expect(page.locator('#counts')).toContainText('4 евидентирани локации');
    await page.locator('label[for="f-type-dumpsite"]').click();
    await expect(page.locator('#counts')).toContainText('1 евидентирана локација');
  });

  test('type filter', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page);
    await page.locator('label[for="f-type-closed"]').click();
    await closeFilters(page);
    await showList(page, info);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Ростуше');
  });

  test('material filter, including unknown waste', async ({ page }) => {
    await openSite(page);
    await openFilters(page);
    await page.locator('label[for="f-material-unknown"]').click();
    await expect(page.locator('#counts')).toContainText('4 евидентирани локации');
  });

  test('area range leaves out sites with unknown area', async ({ page }) => {
    await openSite(page);
    await openFilters(page);
    await page.locator('#area-min').fill('1000');
    await expect(page.locator('#counts')).toContainText('3 евидентирани локации');
    await page.locator('#area-max').fill('25000');
    await expect(page.locator('#counts')).toContainText('2 евидентирани локации');
    await expect(page.locator('#chips [data-chip="area"]')).toBeVisible();
  });

  test('region filter and the Skopje shortcut', async ({ page }) => {
    await openSite(page);
    await openFilters(page);
    await page.locator('[data-action="skopje"]').click();
    await expect(page.locator('#counts')).toContainText('3 евидентирани локации');
    await expect(page.locator('#filters-badge')).toBeVisible();
  });

  test('a shared link restores every filter', async ({ page }, info) => {
    await openSite(page, '?d=4,1&t=active&s=volume');
    await showList(page, info);
    await expect(results(page)).toHaveCount(3);
    await expect(page.locator('#sort')).toHaveValue('volume');
    await expect(results(page).first()).toContainText('Бунар Дере');
    await expect(page.locator('#chips [data-chip="severity"]')).toHaveCount(2);
  });

  test('a broken link value is ignored instead of hiding everything', async ({ page }) => {
    await openSite(page, '?d=9,x&amin=abc');
    await expect(page.locator('#counts')).toContainText('10 евидентирани локации');
  });

  test('Reset clears all filters', async ({ page }) => {
    await openSite(page, '?d=4&t=active&q=veles');
    await page.locator('#chips [data-action="reset"]').click();
    await expect(page.locator('#counts')).toContainText('10 евидентирани локации');
    await expect(page.locator('#chips [data-chip]')).toHaveCount(0);
  });

  test('sort by volume puts unknown volumes last', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#sort').selectOption('volume');
    await expect(results(page).first()).toContainText('Бунар Дере');
    expect(new URL(page.url()).searchParams.get('s')).toBe('volume');
  });
});
