import {
  test, expect, openSite, showList, openFilters, closeFilters, openDetails, mapIdle, mapFeatures, param, stubNetwork, isPhone,
  BASEMAP,
} from './fixtures.mjs';

/** Every piece of text a visitor or a screen reader could meet. */
const allText = (page) => page.evaluate(() => [
  document.title,
  document.body.innerText,
  ...[...document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')].flatMap((el) =>
    ['aria-label', 'placeholder', 'title', 'alt'].map((a) => el.getAttribute(a) || '')),
  ...[...document.querySelectorAll('meta[name="description"]')].map((m) => m.content),
].join('\n'));

test.describe('language', () => {
  test('switches everything to English and back, and the link keeps it', async ({ page }, info) => {
    await openSite(page);
    await expect(page.locator('#lang-toggle')).toHaveAccessibleName('English');
    await expect(page.locator('#lang-toggle .lang-long')).toBeVisible({ visible: !isPhone(info) });
    await expect(page.locator('#lang-toggle .lang-short')).toBeVisible({ visible: isPhone(info) });
    await expect(page.locator('#lang-toggle .lang-short')).toHaveText('EN');
    await page.locator('#lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Wild landfills in Macedonia');
    await expect(page.locator('#lang-toggle')).toHaveAccessibleName('Македонски');
    await expect(page.locator('#lang-toggle .lang-short')).toHaveText('МК');
    await expect(page.locator('#lang-toggle')).toHaveAttribute('lang', 'mk');
    await expect.poll(() => param(page, 'lang')).toBe('en');
    await expect(page.locator('#legend-toggle')).toContainText('Legend');
    await showList(page, info);
    await expect(page.locator('#counts')).toHaveText('10 recorded sites · 9 on the map · 1 without location');
    await expect(page.locator('#list button[data-id="2"]')).toContainText('Veles · Bunar Dere');
    await expect(page.locator('#list button[data-id="2"]')).toContainText('Active non-compliant landfill');
    await expect(page.locator('#sort option[value="volume"]')).toHaveText('Largest volume first');
    await expect(page.locator('#last-update')).toHaveText('Data last updated: 5 November 2026, 09:00');
    if (isPhone(info)) await expect(page.locator('.view-switch button[data-view="list"]')).toHaveText('List');

    await page.reload();
    await page.waitForFunction(() => window.__deponii?.dataStatus === 'ready');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.locator('#lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'mk');
    await expect(page).toHaveTitle('Депонии во Македонија');
    await expect.poll(() => param(page, 'lang')).toBeNull();
    await showList(page, info);
    await expect(page.locator('#counts')).toHaveText('10 евидентирани локации · 9 на мапата · 1 без локација');
  });

  test('switching language keeps the filters and the open details', async ({ page }, info) => {
    await openSite(page, '?d=4');
    await openDetails(page, info, 2);
    await page.locator('#lang-toggle').click();
    await expect(page.locator('#details-title')).toHaveText('Veles · Bunar Dere');
    await expect(page.locator('#chips [data-chip="severity"]')).toContainText('Very high');
    await expect.poll(() => [param(page, 'd'), param(page, 'lang')]).toEqual(['4', 'en']);
    await page.locator('#details [data-action="close-details"]').click();
    await openFilters(page, info);
    await expect(page.locator('#filters-body legend').first()).toHaveText('Severity');
    await expect(page.locator('label[for="f-severity-4"]')).toContainText('Very high');
    await expect(page.locator('#f-severity-4')).toBeChecked();
  });

  for (const lang of ['mk', 'en']) {
    test(`never says "North Macedonia" (${lang})`, async ({ page }, info) => {
      await openSite(page, lang === 'en' ? '?lang=en' : '');
      const seen = [];
      await page.locator('#legend-toggle').click();
      seen.push(await allText(page));
      await openFilters(page, info);
      seen.push(await allText(page));
      await closeFilters(page);
      await page.locator('#list button[data-id="5"]').click();
      seen.push(await allText(page));
      const text = seen.join('\n');
      expect(text).not.toMatch(/north\s+macedonia|северна\s+македонија|severna\s+makedonija/i);
      expect(text).toMatch(lang === 'en' ? /in Macedonia/ : /во Македонија/);
    });
  }

  test('the legend explains the severity colours in both languages', async ({ page }) => {
    await openSite(page);
    const legend = page.locator('#legend');
    await page.locator('#legend-toggle').click();
    await expect(page.locator('#legend-body')).toBeVisible();
    await expect(page.locator('#legend-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(legend.locator('h3').first()).toHaveText('Сериозност');
    await expect(legend.locator('li:has(.sev-swatch)')).toHaveText(['Многу висока', 'Висока', 'Средна', 'Ниска']);
    await expect(legend).toContainText('Не е измерен ризик');
    const swatches = await legend.locator('.sev-swatch').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect(swatches).toEqual(['rgb(142, 15, 34)', 'rgb(204, 47, 31)', 'rgb(224, 98, 13)', 'rgb(201, 138, 0)']);
    const fits = () => legend.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(await fits(), 'the whole legend shows without scrolling').toBe(true);
    await page.locator('#lang-toggle').click();
    await expect(legend.locator('h3').first()).toHaveText('Severity');
    expect(await fits(), 'in English too').toBe(true);
    await expect(legend.locator('li:has(.sev-swatch)')).toHaveText(['Very high', 'High', 'Medium', 'Low']);
    await expect(legend).toContainText('Not a measured risk');
    await page.locator('#legend-toggle').click();
    await expect(page.locator('#legend-body')).toBeHidden();
    await expect(page.locator('#legend-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('theme', () => {
  const background = (page) => page.evaluate(() => window.__deponii.map.getPaintProperty('background', 'background-color'));

  test('the toggle switches to dark, restyles the map and is remembered', async ({ page }, info) => {
    await openSite(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Темен режим');
    expect(await background(page)).toBe(BASEMAP.light);
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Светол режим');
    await page.waitForFunction(() => window.__deponii.mapReady);
    await mapIdle(page);
    expect(await background(page)).toBe(BASEMAP.dark);
    expect((await mapFeatures(page)).length).toBe(9);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 20, 21)');
    expect(await page.evaluate(() => localStorage.getItem('deponii-theme'))).toBe('dark');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#161c1e');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForFunction(() => window.__deponii?.mapReady);
    expect(await background(page)).toBe(BASEMAP.dark);
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('deponii-theme'))).toBe('light');
    if (isPhone(info)) await expect(page.locator('#theme-toggle-label')).toHaveText('Темен режим');
  });

  test('the map view stays where it was when the theme changes', async ({ page }) => {
    await openSite(page);
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.4, 41.99], zoom: 12 }));
    await mapIdle(page);
    await page.locator('#theme-toggle').click();
    await page.waitForFunction(() => window.__deponii.mapReady);
    await mapIdle(page);
    const view = await page.evaluate(() => ({ c: window.__deponii.map.getCenter().toArray(), z: window.__deponii.map.getZoom() }));
    expect(view.z).toBeCloseTo(12, 1);
    expect(view.c[0]).toBeCloseTo(21.4, 2);
    expect(view.c[1]).toBeCloseTo(41.99, 2);
  });

  test('follows the system setting until the visitor chooses', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await stubNetwork(page);
    await page.goto('http://127.0.0.1:4173/index.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForFunction(() => window.__deponii?.mapReady);
    // The system switching to light is followed live.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Once the visitor picks a theme, the system setting no longer changes it.
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await ctx.close();
  });
});

test.describe('sharing', () => {
  test('Copy link copies the current view with its filters', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.__copied = text; } }, configurable: true });
    });
    await openSite(page, '?d=4&lang=en');
    await page.locator('#copy-link').click();
    await expect(page.locator('#toast')).toHaveText('Link copied');
    const copied = new URL(await page.evaluate(() => window.__copied));
    expect(copied.pathname).toMatch(/\/index\.html$/);
    expect(copied.searchParams.get('d')).toBe('4');
    expect(copied.searchParams.get('lang')).toBe('en');
    expect(copied.searchParams.get('v')).toMatch(/^[\d.-]+,[\d.-]+,[\d.]+$/);
    await expect(page.locator('#toast')).toBeHidden({ timeout: 4000 });
  });

  test('a copied link opens the same view', async ({ page, context }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.__copied = text; } }, configurable: true });
    });
    await openSite(page, '?t=active&s=volume');
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.5, 41.7], zoom: 9.5 }));
    await mapIdle(page);
    await page.locator('#copy-link').click();
    const link = await page.evaluate(() => window.__copied);
    const other = await context.newPage();
    await stubNetwork(other);
    await other.goto(link);
    await other.waitForFunction(() => window.__deponii?.mapReady && window.__deponii.dataStatus === 'ready');
    const view = await other.evaluate(() => ({ z: window.__deponii.map.getZoom(), c: window.__deponii.map.getCenter().toArray(), n: window.__deponii.filtered.length, sort: window.__deponii.state.sort }));
    expect(view.z).toBeCloseTo(9.5, 1);
    expect(view.c[0]).toBeCloseTo(21.5, 2);
    expect(view.n).toBe(4);
    expect(view.sort).toBe('volume');
  });
});
