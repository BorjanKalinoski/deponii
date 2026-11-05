import { test, expect, openSite, showList } from './fixtures.mjs';

test.describe('first visit', () => {
  test('shows the counts, the list largest-first and the last check time', async ({ page }, info) => {
    await openSite(page);
    await expect(page.locator('#counts')).toHaveText('10 евидентирани локации · 9 на мапата · 1 без локација');
    await showList(page, info);
    const items = page.locator('#list button[data-id]');
    await expect(items).toHaveCount(10);
    await expect(items.first()).toContainText('Велес · Бунар Дере');
    await expect(items.first()).toContainText('80 000 m²');
    // Unknown areas are listed last and say so; they are never shown as 0.
    await expect(items.last()).toContainText('непознато');
    await expect(page.locator('#last-update')).toContainText('5 ноември 2026');
    await expect(page).toHaveTitle('Депонии во Македонија');
  });

  test('the record without coordinates is listed but marked, and not on the map', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    const item = page.locator('#list button[data-id="5"]');
    await expect(item).toContainText('Немањици');
    await expect(item.locator('.tag-warn')).toBeVisible();
    const onMap = await page.evaluate(() => window.__deponii.map.getSource('sites')._data.features.map((f) => f.properties.id));
    expect(onMap).toHaveLength(9);
    expect(onMap).not.toContain(5);
  });

  test('says so when the data cannot be loaded', async ({ page }) => {
    await page.route('**/data/map-data.csv', (r) => r.fulfill({ status: 500, body: 'oops' }));
    await page.goto('index.html');
    await expect(page.locator('#status')).toHaveText('Податоците моментално не се достапни. Обидете се повторно подоцна.');
    await expect(page.locator('#list button[data-id]')).toHaveCount(0);
  });

  test('a sign-in page in place of the CSV is rejected, not shown as data', async ({ page }) => {
    await page.route('**/data/map-data.csv', (r) => r.fulfill({ body: '<!DOCTYPE html><html><body>Sign in</body></html>', contentType: 'text/html' }));
    await page.goto('index.html');
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#list button[data-id]')).toHaveCount(0);
  });

  test('the page never scrolls sideways', async ({ page }) => {
    await openSite(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
