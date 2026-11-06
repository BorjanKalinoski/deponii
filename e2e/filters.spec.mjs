import {
  test, expect, openSite, showList, openFilters, closeFilters, results, param, mapFeatures, mapIdle, isPhone,
  openDetails, appState,
} from './fixtures.mjs';

const ids = (page) => results(page).evaluateAll((els) => els.map((e) => Number(e.dataset.id)).sort((a, b) => a - b));
const counts = (page) => page.locator('#counts');
const chips = (page) => page.locator('#chips [data-chip]');
const badge = (page) => page.locator('#filters-badge');

test.describe('filters', () => {
  test('the panel lists severity first, with a count and a colour for each level', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    const first = page.locator('#filters-body fieldset').first();
    await expect(first.locator('legend')).toHaveText('Сериозност');
    await expect(first).toContainText('Не е измерен ризик');
    const levels = await first.locator('.opt').evaluateAll((els) => els.map((el) => ({
      value: el.querySelector('input').value,
      label: el.querySelector('span:not(.n):not(.sev-swatch)').textContent,
      n: el.querySelector('.n').textContent,
      colour: getComputedStyle(el.querySelector('.sev-swatch')).backgroundColor,
    })));
    expect(levels).toEqual([
      { value: '4', label: 'Многу висока', n: '3', colour: 'rgb(142, 15, 34)' },
      { value: '3', label: 'Висока', n: '1', colour: 'rgb(204, 47, 31)' },
      { value: '2', label: 'Средна', n: '1', colour: 'rgb(224, 98, 13)' },
      { value: '1', label: 'Ниска', n: '5', colour: 'rgb(201, 138, 0)' },
    ]);
  });

  test('severity: only the most severe sites, with a chip, a badge and a shareable link', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    await page.locator('label[for="f-severity-4"]').click();
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 3 локации');
    await closeFilters(page);
    await expect(counts(page)).toContainText('3 евидентирани локации');
    expect(await ids(page)).toEqual([0, 1, 2]);
    await expect.poll(() => param(page, 'd')).toBe('4');
    await expect(badge(page)).toHaveText('1');
    const chip = page.locator('#chips [data-chip="severity"]');
    await expect(chip).toContainText('Многу висока');
    await expect.poll(async () => (await mapFeatures(page)).map((f) => f.sev)).toEqual([4, 4, 4]);
    await chip.click();
    await expect(results(page)).toHaveCount(10);
    await expect.poll(() => param(page, 'd')).toBeNull();
    await expect(badge(page)).toBeHidden();
    await expect(chips(page)).toHaveCount(0);
  });

  test('severity choices combine with OR, other categories with AND', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    await page.locator('label[for="f-severity-4"]').click();
    await page.locator('label[for="f-severity-2"]').click();
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 4 локации');
    await page.locator('label[for="f-type-dumpsite"]').click();
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 1 локација');
    await closeFilters(page);
    expect(await ids(page)).toEqual([6]);
    await expect(badge(page)).toHaveText('2');
    await expect(chips(page)).toHaveCount(3);
    await expect(page.locator('#chips [data-action="reset"]')).toBeVisible();
  });

  test('region filter and the Skopje shortcut', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    await page.locator('label[for="f-region-vardarski"]').click();
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 2 локации');
    await page.locator('label[for="f-region-vardarski"]').click();
    await page.locator('[data-action="skopje"]').click();
    await expect(page.locator('#f-region-skopski')).toBeChecked();
    await closeFilters(page);
    expect(await ids(page)).toEqual([3, 4, 9]);
    await expect(page.locator('#chips [data-chip="region"]')).toHaveText(/Скопски регион/);
    await expect(badge(page)).toHaveText('1');
    await expect.poll(() => param(page, 'r')).toBe('skopski');
  });

  test('municipality filter, with its own search box', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    await page.locator('#muni-search').fill('stip');
    const visible = page.locator('#muni-list .opt:visible');
    await expect(visible).toHaveCount(1);
    await expect(visible).toContainText('Штип');
    await expect(page.locator('#muni-list [data-region-group]:visible')).toHaveText(['Источен']);
    await visible.click();
    await closeFilters(page);
    expect(await ids(page)).toEqual([6, 7]);
    await expect(page.locator('#chips [data-chip="municipality"]')).toContainText('Штип');
    await expect.poll(() => param(page, 'm')).toBe('stip');
  });

  test('type filter', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    await page.locator('label[for="f-type-closed"]').click();
    await closeFilters(page);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText('Ростуше');
    await expect(page.locator('#chips [data-chip="type"]')).toHaveText(/Затворена нестандардна/);
    await expect.poll(() => param(page, 't')).toBe('closed');
  });

  test('material filter, including unknown and unclassified waste', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    const done = page.locator('#filters-done');
    // Five records state no dominant waste: 0, 1, 4, 5 ("/") and 9 (empty).
    await page.locator('label[for="f-material-unknown"]').click();
    await expect(done).toHaveText('Прикажи 5 локации');
    await page.locator('label[for="f-material-unknown"]').click();
    await page.locator('label[for="f-material-other"]').click();
    await expect(done).toHaveText('Прикажи 1 локација');
    await page.locator('label[for="f-material-other"]').click();
    await page.locator('label[for="f-material-municipal"]').click();
    await expect(done).toHaveText('Прикажи 4 локации');
    await page.locator('label[for="f-material-construction"]').click();
    await expect(done).toHaveText('Прикажи 4 локации', { timeout: 2000 });
    await closeFilters(page);
    expect(await ids(page)).toEqual([2, 3, 6, 7]);
    await expect.poll(() => param(page, 'w')).toBe('construction,municipal');
  });

  test('area range leaves out sites with unknown area', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    await expect(page.locator('#filters-body')).toContainText('Со опсег се прикажуваат само локации со позната површина.');
    await page.locator('#area-min').fill('1000');
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 3 локации');
    await page.locator('#area-max').fill('25000');
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 2 локации');
    await closeFilters(page);
    expect(await ids(page)).toEqual([0, 1]);
    await expect(page.locator('#chips [data-chip="area"]')).toHaveText(/Површина 1\s000–25\s000 m²/);
    await expect.poll(() => [param(page, 'amin'), param(page, 'amax')]).toEqual(['1000', '25000']);
    await page.locator('#chips [data-chip="area"]').click();
    await expect(results(page)).toHaveCount(10);
  });

  test('a range from 0 keeps a stated 0 m² but not unknown areas', async ({ page }, info) => {
    await openSite(page, '?amin=0&amax=600');
    await showList(page, info);
    expect(await ids(page)).toEqual([6, 8, 9]);
  });

  /** Drag the map a little, the way a visitor pans it. */
  async function dragMap(page, dx = 20, dy = 20) {
    const box = await page.locator('#map').boundingBox();
    const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx, c.y + dy, { steps: 4 });
    await page.mouse.up();
  }

  test('after the visitor moves the map, the list follows the visible area', async ({ page }, info) => {
    await openSite(page);
    // Zoom to Skopje, then let the visitor pan: the list narrows a second later, without a click.
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.44, 41.975], zoom: 11 }));
    await mapIdle(page);
    expect(param(page, 'b'), 'a move made by the app does not limit the list').toBeNull();
    await dragMap(page);
    await expect.poll(() => param(page, 'b'), { timeout: 5_000 }).toMatch(/^[\d.]+,[\d.]+,[\d.]+,[\d.]+$/);
    await showList(page, info);
    await expect(page.locator('#chips [data-chip="bounds"]')).toHaveText(/Само во видливото подрачје на мапата/);
    expect(await ids(page)).toEqual([3, 4, 9]);
    // The map still draws every site, so nothing vanishes while panning.
    expect((await mapFeatures(page)).length).toBe(9);
    await page.locator('#chips [data-chip="bounds"]').click();
    await expect(results(page)).toHaveCount(10);
  });

  test('the list waits until the map has been still for a moment', async ({ page }) => {
    await openSite(page);
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.44, 41.975], zoom: 11 }));
    await mapIdle(page);
    await dragMap(page);
    await page.waitForTimeout(400);
    expect(param(page, 'b'), 'not yet after 0.4 s').toBeNull();
    await dragMap(page, -20, -20);
    await page.waitForTimeout(700);
    expect(param(page, 'b'), 'moving again restarts the wait').toBeNull();
    await expect.poll(() => param(page, 'b'), { timeout: 5_000 }).not.toBeNull();
  });

  test('zoomed out to every site, moving the map adds no limit', async ({ page }) => {
    await openSite(page);
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.7, 41.6], zoom: 6 }));
    await mapIdle(page);
    await dragMap(page);
    await page.waitForTimeout(1_600);
    expect(param(page, 'b')).toBeNull();
    await expect(page.locator('#chips [data-chip="bounds"]')).toHaveCount(0);
  });

  test('typing a search looks everywhere, not just in the visible area', async ({ page }, info) => {
    await openSite(page, '?b=21.3,41.9,21.6,42.1');
    await showList(page, info);
    expect(await ids(page)).toEqual([3, 4, 9]);
    await page.locator('#q').fill('Велес');
    await expect(results(page)).toHaveCount(1);
    expect(param(page, 'b')).toBeNull();
  });

  test('panning away from an open site keeps its details open', async ({ page }, info) => {
    test.skip(isPhone(info), 'on phones the details sheet covers the map; the rule is the same');
    await openSite(page);
    await openDetails(page, info, 2);
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.44, 41.975], zoom: 11 }));
    await mapIdle(page);
    await dragMap(page);
    await expect.poll(() => param(page, 'b'), { timeout: 5_000 }).not.toBeNull();
    await expect(page.locator('#details')).toBeVisible();
    expect((await appState(page)).selectedId).toBe(2);
  });

  test('a shared link restores every filter, the sort and the language', async ({ page }, info) => {
    await openSite(page, '?d=4,1&t=active&s=volume');
    await showList(page, info);
    await expect(results(page)).toHaveCount(3);
    await expect(page.locator('#sort')).toHaveValue('volume');
    await expect(results(page).first()).toContainText('Бунар Дере');
    await expect(page.locator('#chips [data-chip="severity"]')).toHaveCount(2);
    await expect(page.locator('#chips [data-chip="type"]')).toHaveCount(1);
    await expect(badge(page)).toHaveText('2');
  });

  test('a link with every kind of filter', async ({ page }, info) => {
    await openSite(page, '?lang=en&q=lisice&r=skopski&m=kisela-voda,aerodrom&t=dumpsite&w=unknown&d=1&amin=0&amax=100&b=21.3,41.9,21.6,42.1');
    await showList(page, info);
    expect(await ids(page)).toEqual([9]);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(chips(page)).toHaveCount(8);
    await expect(page.locator('#q')).toHaveValue('lisice');
    await openFilters(page, info);
    for (const id of ['f-region-skopski', 'f-municipality-kisela-voda', 'f-municipality-aerodrom', 'f-type-dumpsite', 'f-material-unknown', 'f-severity-1']) {
      await expect(page.locator(`#${id}`)).toBeChecked();
    }
    await expect(page.locator('#area-min')).toHaveValue('0');
    await expect(page.locator('#area-max')).toHaveValue('100');
  });

  test('broken link values are ignored instead of hiding everything', async ({ page }, info) => {
    await openSite(page, '?d=9,x&amin=abc&amax=-5&r=atlantis&m=nowhere&t=spaceship&w=plutonium&b=1,2,3&s=sideways&v=a,b,c&lang=xx');
    await showList(page, info);
    await expect(counts(page)).toContainText('10 евидентирани локации');
    await expect(chips(page)).toHaveCount(0);
    await expect(badge(page)).toBeHidden();
    await expect(page.locator('#sort')).toHaveValue('area');
    await expect(page.locator('html')).toHaveAttribute('lang', 'mk');
    // The cleaned-up link no longer carries the junk.
    await expect.poll(() => [...new URL(page.url()).searchParams.keys()].filter((k) => k !== 'v')).toEqual([]);
  });

  test('a stale code next to a good one keeps the good one', async ({ page }, info) => {
    await openSite(page, '?r=atlantis,istocen');
    await showList(page, info);
    expect(await ids(page)).toEqual([6, 7]);
    await expect(page.locator('#chips [data-chip="region"]')).toHaveCount(1);
    await expect.poll(() => param(page, 'r')).toBe('istocen');
  });

  test('Reset clears every filter and the search, from the chips or the panel', async ({ page }, info) => {
    await openSite(page, '?d=4&t=active&q=veles');
    await showList(page, info);
    await expect(results(page)).toHaveCount(1);
    await page.locator('#chips [data-action="reset"]').click();
    await expect(counts(page)).toContainText('10 евидентирани локации');
    await expect(chips(page)).toHaveCount(0);
    await expect(page.locator('#q')).toHaveValue('');
    await expect.poll(() => [param(page, 'd'), param(page, 't'), param(page, 'q')]).toEqual([null, null, null]);

    await openFilters(page, info);
    await page.locator('label[for="f-severity-3"]').click();
    await page.locator('#area-min').fill('5');
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 0 локации');
    await page.locator('#filters .panel-head [data-action="reset"]').click();
    await expect(page.locator('#f-severity-3')).not.toBeChecked();
    await expect(page.locator('#area-min')).toHaveValue('');
    await expect(page.locator('#filters-done')).toHaveText('Прикажи 10 локации');
  });

  test('Reset keeps the chosen sort', async ({ page }, info) => {
    await openSite(page, '?d=4&s=volume');
    await showList(page, info);
    await page.locator('#chips [data-chip="severity"]').click();
    await expect(page.locator('#sort')).toHaveValue('volume');
  });

  test('Escape closes the filters panel', async ({ page }, info) => {
    await openSite(page);
    await openFilters(page, info);
    await page.keyboard.press('Escape');
    await expect(page.locator('#filters')).toBeHidden();
    await expect(page.locator('#filters-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('sort', () => {
  test('by volume puts the largest first and unknown volumes last', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#sort').selectOption('volume');
    const order = () => results(page).evaluateAll((els) => els.map((e) => Number(e.dataset.id)));
    await expect.poll(order).toEqual([2, 0, 1, 7, 9, 8, 6, 3, 4, 5]);
    await expect(results(page).last()).toContainText('непознато');
    await expect.poll(() => param(page, 's')).toBe('volume');
    await page.locator('#sort').selectOption('area');
    await expect.poll(order).toEqual([2, 0, 1, 6, 8, 9, 7, 3, 4, 5]);
    await expect.poll(() => param(page, 's')).toBeNull();
  });

  test('sorting applies to filtered results too', async ({ page }, info) => {
    await openSite(page, '?d=1&s=volume');
    await showList(page, info);
    const order = await results(page).evaluateAll((els) => els.map((e) => Number(e.dataset.id)));
    expect(order).toEqual([7, 9, 8, 3, 4]);
  });
});

test('the filters panel on phones covers the screen and its button returns to the list', async ({ page }, info) => {
  test.skip(!isPhone(info), 'phone layout');
  await openSite(page);
  await openFilters(page, info);
  const panel = await page.locator('#filters').boundingBox();
  const viewport = page.viewportSize();
  expect(panel.width).toBe(viewport.width);
  expect(panel.y + panel.height).toBeGreaterThanOrEqual(viewport.height - 1);
  await closeFilters(page);
  await expect(page.locator('#list')).toBeVisible();
});
