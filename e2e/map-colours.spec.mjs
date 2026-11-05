import {
  test, expect, openSite, showList, openDetails, mapIdle, mapFeatures, mapPixels, rendered, SEVERITY_RGB,
} from './fixtures.mjs';
import { colourLiterals, isGreenish } from './colour.mjs';
import { SEVERITY_COLORS, SEVERITY_INK } from '../assets/lib/severity.js';

const SEVERITY = { 0: 4, 1: 4, 2: 4, 3: 1, 4: 1, 6: 2, 7: 1, 8: 1, 9: 1 };

/** Every colour in the paint and layout of the map layers this site adds. */
const ownLayerColours = (page) => page.evaluate(() => {
  const m = window.__deponii.map;
  return m.getStyle().layers.filter((l) => l.source === 'sites' || l.source === 'selected')
    .map((l) => ({ id: l.id, spec: JSON.stringify({ paint: l.paint, layout: l.layout }) }));
});

test.describe('danger colours on the map', () => {
  test('each marker uses its site\'s severity image', async ({ page }) => {
    await openSite(page);
    const byId = Object.fromEntries((await mapFeatures(page)).map((f) => [f.id, f]));
    for (const [id, sev] of Object.entries(SEVERITY)) expect(byId[id].sev, `site ${id}`).toBe(sev);
    expect(byId[2].img).toBe('m-mixed-4');   // 80 000 m², active
    expect(byId[0].img).toBe('m-unknown-4'); // 22 500 m², active, waste not stated
    expect(byId[6].img).toBe('m-mixed-2');   // 500 m² dumpsite
    expect(byId[3].img).toBe('m-mixed-1-u'); // unknown area: dashed ring, still coloured
    expect(byId[8].img).toBe('m-other-1');
    // The most severe draw on top where markers overlap.
    expect(byId[2].sortKey).toBeLessThan(byId[6].sortKey);
    expect(byId[6].sortKey).toBeLessThan(byId[9].sortKey);
    // Bigger recorded areas draw bigger markers.
    expect(byId[2].px).toBeGreaterThan(byId[1].px);
    expect(byId[1].px).toBeGreaterThan(byId[6].px);
    expect(byId[6].px).toBeGreaterThan(byId[9].px);
  });

  test('a cluster takes the colour of the most severe site inside it', async ({ page }) => {
    await openSite(page);
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.6, 41.6], zoom: 6.5 }));
    await mapIdle(page);
    const clusters = await page.evaluate(async () => {
      const m = window.__deponii.map;
      const src = m.getSource('sites');
      return Promise.all(m.queryRenderedFeatures({ layers: ['clusters'] }).map(async (f) => ({
        maxSev: f.properties.maxSev,
        leaves: (await src.getClusterLeaves(f.properties.cluster_id, 100, 0)).map((l) => l.properties.sev),
      })));
    });
    expect(clusters.length).toBeGreaterThan(0);
    for (const c of clusters) expect(c.maxSev).toBe(Math.max(...c.leaves));
    const fill = await page.evaluate(() => window.__deponii.map.getPaintProperty('clusters', 'circle-color'));
    expect(fill).toEqual(['match', ['get', 'maxSev'], 1, SEVERITY_COLORS[1], 2, SEVERITY_COLORS[2], 3, SEVERITY_COLORS[3], SEVERITY_COLORS[4]]);
  });

  test('cluster numbers are dark on amber and orange, white on red', async ({ page }) => {
    await openSite(page);
    const text = await page.evaluate(() => window.__deponii.map.getPaintProperty('cluster-count', 'text-color'));
    expect(text).toEqual(['match', ['get', 'maxSev'], 1, SEVERITY_INK[1], 2, SEVERITY_INK[2], 3, '#ffffff', '#ffffff']);
    expect(SEVERITY_INK[1]).not.toBe('#ffffff');
  });

  test('every severity colour is actually drawn, and ranked by size and colour', async ({ page }) => {
    await openSite(page);
    await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.35, 41.5], zoom: 8.6 }));
    const px = await mapPixels(page, { colours: SEVERITY_RGB });
    for (const l of [1, 2, 4]) expect(px.counts[l], `level ${l}`).toBeGreaterThan(50);
    expect(px.counts[4]).toBeGreaterThan(px.counts[1]);
  });

  for (const theme of ['light', 'dark']) {
    test(`no green anywhere on the map (${theme})`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await openSite(page);
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);

      // The paint and layout of every layer this site adds.
      const layers = await ownLayerColours(page);
      expect(layers.map((l) => l.id)).toEqual(['cluster-glow', 'clusters', 'cluster-count', 'points', 'selected-casing', 'selected-halo']);
      for (const l of layers) {
        for (const c of colourLiterals(l.spec)) expect(isGreenish(c), `${l.id}: ${c}`).toBe(false);
      }

      // What is drawn: clusters (country view), markers (closer), selection and pulse.
      expect((await mapPixels(page)).green, 'country view').toBe(0);
      await page.evaluate(() => window.__deponii.map.jumpTo({ center: [21.35, 41.5], zoom: 8.6 }));
      expect((await mapPixels(page)).green, 'markers').toBe(0);
      await openDetails(page, info, 2);
      await page.locator('[data-action="show-on-map"]').click();
      await expect(page.locator('.pin-pulse')).toBeVisible();
      const pulse = await page.locator('.pin-pulse span').first().evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.borderTopColor, s.boxShadow];
      });
      for (const c of colourLiterals(pulse.join(' '))) expect(isGreenish(c), `pulse: ${c}`).toBe(false);
      expect((await mapPixels(page)).green, 'selected site').toBe(0);

      // Marker images in the list, details and legend, and the legend's samples.
      const images = await page.evaluate(() => [...document.querySelectorAll('img[src^="data:image/svg"]')].map((i) => decodeURIComponent(i.src.split(',')[1])));
      expect(images.length).toBeGreaterThan(10);
      for (const svg of images) for (const c of colourLiterals(svg)) expect(isGreenish(c), c).toBe(false);
      await page.locator('#details [data-action="close-details"]').click();
      if (!(await page.locator('#legend-body').isVisible())) {
        if (info.project.name === 'phone') await page.locator('.view-switch button[data-view="map"]').click();
        await page.locator('#legend-toggle').click();
      }
      const samples = await page.evaluate(() => [...document.querySelectorAll('#legend .sev-swatch, #legend .disc, #legend .cluster-sample')]
        .map((el) => { const s = getComputedStyle(el); return `${s.backgroundColor} ${s.borderTopColor} ${s.boxShadow}`; }));
      expect(samples.length).toBe(4 + 4 + 1);
      for (const c of colourLiterals(samples.join(' '))) expect(isGreenish(c), `legend: ${c}`).toBe(false);
    });
  }

  test('the filters show each severity level as its map colour', async ({ page }, info) => {
    await openSite(page);
    await showList(page, info);
    await page.locator('#filters-toggle').click();
    const swatches = await page.locator('#filters-body .sev-swatch').evaluateAll((els) => els.map((e) => [e.dataset.level, getComputedStyle(e).backgroundColor]));
    expect(swatches).toEqual([['4', 'rgb(142, 15, 34)'], ['3', 'rgb(204, 47, 31)'], ['2', 'rgb(224, 98, 13)'], ['1', 'rgb(201, 138, 0)']]);
  });

  test('after Show on map only the chosen site is drawn there, as a marker, not a cluster', async ({ page }, info) => {
    await openSite(page);
    await openDetails(page, info, 1);
    await page.locator('[data-action="show-on-map"]').click();
    await page.waitForFunction(() => !window.__deponii.map.isMoving());
    await mapIdle(page);
    const r = await rendered(page);
    expect(r.clusters).toEqual([]);
    expect(r.points).toEqual([{ id: 1, img: 'm-unknown-4' }]);
  });
});
