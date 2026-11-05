import { test, expect, openSite } from './fixtures.mjs';

test.describe('phone layout', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'phone only'));

  test('map and list are separate tabs, and only one is visible', async ({ page }) => {
    await openSite(page);
    const mapBtn = page.locator('.view-switch button[data-view="map"]');
    const listBtn = page.locator('.view-switch button[data-view="list"]');
    await expect(mapBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#list')).toBeHidden();
    await listBtn.click();
    await expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#list button[data-id]').first()).toBeVisible();
    // Map controls must not show through the list.
    await expect(page.locator('.maplibregl-ctrl-zoom-in')).toBeHidden();
    await mapBtn.click();
    await expect(page.locator('.maplibregl-ctrl-zoom-in')).toBeVisible();
  });

  test('buttons are big enough to tap', async ({ page }) => {
    await openSite(page);
    for (const sel of ['.view-switch button[data-view="list"]', '#filters-toggle', '#lang-toggle', '#theme-toggle']) {
      const box = await page.locator(sel).boundingBox();
      expect(box.height, sel).toBeGreaterThanOrEqual(40);
    }
  });
});
