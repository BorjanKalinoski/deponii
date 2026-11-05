import { test, expect, openSite, showList, mapFeatures, results, isPhone } from './fixtures.mjs';
import { EXPECTED_HEADER } from '../assets/lib/feed.js';

test.describe('first visit', () => {
  test('shows the counts, the list largest-first and the last check time', async ({ page }, info) => {
    await openSite(page);
    await expect(page).toHaveTitle('Депонии во Македонија');
    await expect(page.locator('#title')).toHaveText('Депонии во Македонија');
    await showList(page, info);
    await expect(page.locator('#counts')).toHaveText('10 евидентирани локации · 9 на мапата · 1 без локација');
    await expect(page.locator('#counts strong')).toHaveText('10');
    await expect(results(page)).toHaveCount(10);
    await expect(results(page).first()).toContainText('Велес · Бунар Дере');
    await expect(results(page).first()).toContainText('80 000 m²');
    // Sorted by area; unknown areas are listed last and say so, never as 0.
    const order = await results(page).evaluateAll((els) => els.map((e) => Number(e.dataset.id)));
    expect(order).toEqual([2, 0, 1, 6, 8, 9, 7, 3, 4, 5]);
    await expect(results(page).last()).toContainText('непознато');
    await expect(page.locator('#list button[data-id="9"]')).toContainText('0 m²');
    await expect(page.locator('#last-update')).toHaveText('Податоците последно ажурирани: 5 ноември 2026, 09:00');
    await expect(page.locator('#status')).toBeHidden();
  });

  test('opens on the map on phones and with both side by side on wider screens', async ({ page }, info) => {
    await openSite(page);
    await expect(page.locator('#map canvas')).toBeVisible();
    if (isPhone(info)) {
      await expect(page.locator('.view-switch')).toBeVisible();
      await expect(page.locator('#list')).toBeHidden();
    } else {
      await expect(page.locator('.view-switch')).toBeHidden();
      await expect(page.locator('#list')).toBeVisible();
    }
  });

  test('the record without coordinates is listed but marked, and not on the map', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    const item = page.locator('#list button[data-id="5"]');
    await expect(item).toContainText('Немањици');
    await expect(item.locator('.tag-warn')).toHaveText('Локацијата не е позната');
    await expect(page.locator('#list .tag-warn')).toHaveCount(1);
    const onMap = (await mapFeatures(page)).map((f) => f.id).sort((a, b) => a - b);
    expect(onMap).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9]);
  });

  test('the page never scrolls sideways', async ({ page }, info) => {
    const overflow = () => page.evaluate(() => Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - document.body.clientWidth,
    ));
    await openSite(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.locator('#legend-toggle').click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await showList(page, info);
    await page.locator('#filters-toggle').click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.locator('#filters-done').click();
    await page.locator('#list button[data-id="4"]').click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.locator('#lang-toggle').click();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});

test.describe('without the check-time file', () => {
  test.use({ meta: null });
  test('the data still shows, just without a time', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await expect(results(page)).toHaveCount(10);
    await expect(page.locator('#last-update')).toHaveText('');
  });
});

test.describe('when the data is not usable', () => {
  test('says so when the data cannot be loaded, in the list and on the map', async ({ page }, info) => {
    await page.route('**/data/map-data.csv', (r) => r.fulfill({ status: 500, body: 'oops' }));
    await page.goto('index.html');
    const message = 'Податоците моментално не се достапни. Обидете се повторно подоцна.';
    if (isPhone(info)) {
      // Phones open on the map, so the message must be there too.
      await expect(page.locator('#data-error')).toBeVisible();
      await expect(page.locator('#data-error')).toHaveText(message);
    } else {
      await expect(page.locator('#data-error')).toBeHidden(); // the list beside the map says it
    }
    await showList(page, info);
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#status')).toHaveText(message);
    await expect(page.locator('#counts')).toHaveText('Нема податоци');
    await expect(results(page)).toHaveCount(0);
    await expect(page.locator('#empty')).toBeHidden();
  });

  test('a sign-in page in place of the CSV is rejected, not shown as data', async ({ page }, info) => {
    await page.route('**/data/map-data.csv', (r) => r.fulfill({ body: '<!DOCTYPE html><html><body>Sign in</body></html>', contentType: 'text/html' }));
    await page.goto('index.html');
    await page.waitForFunction(() => window.__deponii?.dataStatus === 'unavailable');
    await showList(page, info);
    await expect(page.locator('#status')).toBeVisible();
    await expect(results(page)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Sign in');
  });

  test('a feed with an unexpected column is rejected, so it can never be published', async ({ page }, info) => {
    const csv = `${[...EXPECTED_HEADER, 'Интерна белешка'].join(',')}\n${'a,'.repeat(13)}тајна`;
    await page.route('**/data/map-data.csv', (r) => r.fulfill({ body: csv, contentType: 'text/csv' }));
    await page.goto('index.html');
    await page.waitForFunction(() => window.__deponii?.dataStatus === 'unavailable');
    await showList(page, info);
    await expect(page.locator('#status')).toBeVisible();
    await expect(results(page)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('тајна');
  });
});
