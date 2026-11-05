import { test, expect, openSite, openDetails, showList, isPhone } from './fixtures.mjs';

// Everything drawn on or over the map that must never show through the list.
// (The attribution is empty, so hidden, with the stubbed basemap.)
const MAP_THINGS = ['#map canvas', '.maplibregl-ctrl-zoom-in', '.maplibregl-ctrl-zoom-out', '#legend', '#legend-toggle'];

test.describe('phone layout', () => {
  test.beforeEach(({}, info) => test.skip(!isPhone(info), 'phone only'));

  test('map and list are separate tabs, and only one is visible', async ({ page }) => {
    await openSite(page);
    const mapBtn = page.locator('.view-switch button[data-view="map"]');
    const listBtn = page.locator('.view-switch button[data-view="list"]');
    await expect(mapBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(listBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#list')).toBeHidden();
    await expect(page.locator('#q')).toBeHidden();
    for (const sel of MAP_THINGS) await expect(page.locator(sel).first(), sel).toBeVisible();

    await listBtn.click();
    await expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(mapBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#list button[data-id]').first()).toBeVisible();
    await expect(page.locator('#q')).toBeVisible();
    for (const sel of MAP_THINGS) await expect(page.locator(sel).first(), sel).toBeHidden();

    await mapBtn.click();
    for (const sel of MAP_THINGS) await expect(page.locator(sel).first(), sel).toBeVisible();
    await expect(page.locator('#list')).toBeHidden();
  });

  test('nothing from the map shows through the list, even with the legend open', async ({ page }) => {
    await openSite(page);
    await page.locator('#legend-toggle').click();
    await expect(page.locator('#legend-body')).toBeVisible();
    await page.locator('.view-switch button[data-view="list"]').click();
    await expect(page.locator('#legend-body')).toBeHidden();
    // What is actually on top in the middle of the screen is the list, not the map.
    const top = await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return { inList: Boolean(el.closest('#sidebar')), inMap: Boolean(el.closest('#map-wrap')) };
    });
    expect(top).toEqual({ inList: true, inMap: false });
  });

  test('the details open as a sheet over the list, with Show on map near its top', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 2);
    const sheet = await page.locator('#details').boundingBox();
    const viewport = page.viewportSize();
    expect(sheet.width).toBe(viewport.width);
    expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(sheet.height).toBeLessThanOrEqual(viewport.height * 0.75);
    await expect(page.locator('#details [data-action="show-on-map"]')).toBeInViewport({ ratio: 1 });
  });

  test('buttons are big enough to tap', async ({ page }, info) => {
    await openSite(page);
    const big = async (sel, min = 40) => {
      const boxes = await page.locator(sel).evaluateAll((els) => els.filter((e) => e.offsetParent || getComputedStyle(e).position === 'fixed')
        .map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, t: e.textContent.trim().slice(0, 20) }; }));
      expect(boxes.length, sel).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.h, `${sel} ${b.t} height`).toBeGreaterThanOrEqual(min);
        expect(b.w, `${sel} ${b.t} width`).toBeGreaterThanOrEqual(min);
      }
    };
    // On the map tab.
    for (const sel of ['.view-switch button', '#lang-toggle', '#theme-toggle', '#copy-link', '#legend-toggle',
      '.maplibregl-ctrl-zoom-in', '.maplibregl-ctrl-zoom-out']) await big(sel);
    // On the list tab.
    await showList(page, info);
    for (const sel of ['#filters-toggle', '#list button[data-id]']) await big(sel);
    await big('#sort', 32);
    // In the filters, every choice is at least 24px (WCAG 2.5.8), the main buttons 40px.
    await page.locator('#filters-toggle').click();
    for (const sel of ['#filters [data-action="close-filters"].icon-btn', '#filters-done', '#filters .panel-head [data-action="reset"]', '[data-action="skopje"]']) await big(sel);
    await big('#filters-body fieldset:first-of-type .opt', 24);
    await page.locator('#filters-done').click();
    // In the details.
    await page.locator('#list button[data-id="2"]').click();
    await big('#details [data-action="close-details"]');
    await big('#details [data-action="show-on-map"]', 44);
    // Chips.
    await page.locator('#details [data-action="close-details"]').click();
    await page.locator('#q').fill('veles');
    await page.locator('#filters-toggle').click();
    await page.locator('label[for="f-severity-4"]').click();
    await page.locator('#filters-done').click();
    await big('#chips .chip', 32);
  });

  for (const width of [412, 360]) {
    test(`the top bar fits at ${width}px: the title is never cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openSite(page);
      for (const lang of ['mk', 'en']) {
        const fit = await page.evaluate(() => {
          const h1 = document.querySelector('#title');
          const bar = document.querySelector('.topbar').getBoundingClientRect();
          const title = h1.getBoundingClientRect();
          const actions = document.querySelector('.top-actions').getBoundingClientRect();
          // Where the text really ends, clamped or not.
          const range = document.createRange();
          range.selectNodeContents(h1);
          const textBottom = Math.max(...[...range.getClientRects()].map((r) => r.bottom));
          return {
            cut: h1.scrollWidth > h1.clientWidth + 0.5 || textBottom > title.bottom + 2,
            inside: actions.right <= bar.right + 0.5 && title.top >= bar.top && title.bottom <= bar.bottom,
            apart: title.right <= actions.left,
          };
        });
        expect(fit, lang).toEqual({ cut: false, inside: true, apart: true });
        await page.locator('#lang-toggle').click();
      }
    });
  }
});
