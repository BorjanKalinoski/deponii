import { test, expect, openSite, showList } from './fixtures.mjs';

test.describe('language', () => {
  test('switches everything to English and back, and the link keeps it', async ({ page }, info) => {
    await openSite(page);
    await page.locator('#lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#counts')).toHaveText('10 recorded sites · 9 on the map · 1 without location');
    expect(new URL(page.url()).searchParams.get('lang')).toBe('en');
    await showList(page, info);
    await expect(page.locator('#list button[data-id="2"]')).toContainText('Veles');
    await page.reload();
    await page.waitForFunction(() => window.__deponii?.dataStatus === 'ready');
    await expect(page.locator('#counts')).toContainText('recorded sites');
    await page.locator('#lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'mk');
  });

  test('never says "North Macedonia"', async ({ page }) => {
    await openSite(page, '?lang=en');
    await page.locator('#legend-toggle').click().catch(() => {});
    await page.locator('#filters-toggle').click();
    const text = await page.evaluate(() => document.body.innerText + document.title);
    expect(text).not.toMatch(/North Macedonia|Северна Македонија/i);
  });

  test('legend explains the severity colours in both languages', async ({ page }) => {
    await openSite(page);
    const legend = page.locator('#legend');
    if (!(await page.locator('#legend-body').isVisible())) await page.locator('#legend-toggle').click();
    await expect(legend).toContainText('Сериозност');
    await expect(legend).toContainText('Многу висока');
    await expect(legend).toContainText('Не е измерен ризик');
    await expect(legend.locator('.sev-swatch')).toHaveCount(4);
    await page.locator('#lang-toggle').click();
    await expect(legend).toContainText('Severity');
    await expect(legend).toContainText('Not a measured risk');
  });
});

test.describe('theme', () => {
  test('the toggle switches to dark and the choice is remembered', async ({ page }) => {
    await openSite(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForFunction(() => window.__deponii.mapReady);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('follows the system setting when no choice was made', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.goto('http://127.0.0.1:4173/index.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await ctx.close();
  });
});

test.describe('sharing', () => {
  test('Copy link copies the current view with its filters', async ({ page, context }, info) => {
    test.skip(info.project.name === 'phone', 'clipboard permission is a desktop-browser feature here');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSite(page, '?d=4');
    await page.locator('#copy-link').click();
    await expect(page.locator('#toast')).toHaveText('Линкот е копиран');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(copied).searchParams.get('d')).toBe('4');
  });
});
