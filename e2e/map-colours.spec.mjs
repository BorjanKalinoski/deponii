import { test, expect, openSite } from './fixtures.mjs';

test.describe('danger colours on the map', () => {
  test('each marker uses its site\'s severity colour, and clusters show their worst site', async ({ page }) => {
    await openSite(page);
    const imgs = await page.evaluate(() => Object.fromEntries(window.__deponii.map.getSource('sites')._data.features.map((f) => [f.properties.id, [f.properties.img, f.properties.sev]])));
    expect(imgs[2]).toEqual(['m-mixed-4', 4]);   // 80 000 m², active
    expect(imgs[6]).toEqual(['m-mixed-2', 2]);   // 500 m² dumpsite
    expect(imgs[3]).toEqual(['m-mixed-1-u', 1]); // unknown area: dashed, still coloured
    // Clusters are filled from the severity scale, not a theme colour.
    const fill = await page.evaluate(() => window.__deponii.map.getPaintProperty('clusters', 'circle-color'));
    expect(JSON.stringify(fill)).toContain('maxSev');
    expect(JSON.stringify(fill)).not.toMatch(/#0e6655|#13715e/i);
    const maxSevs = await page.evaluate(async () => {
      const m = window.__deponii.map;
      m.jumpTo({ center: [21.6, 41.6], zoom: 6 });
      await new Promise((r) => m.once('idle', r));
      return m.queryRenderedFeatures({ layers: ['clusters'] }).map((f) => f.properties.maxSev);
    });
    expect(maxSevs.length).toBeGreaterThan(0);
    for (const v of maxSevs) expect([1, 2, 3, 4]).toContain(v);
  });

  test('no green is left on the map layers', async ({ page }) => {
    await openSite(page);
    const paints = await page.evaluate(() => {
      const m = window.__deponii.map;
      return ['cluster-glow', 'clusters', 'cluster-count', 'selected-casing', 'selected-halo'].map((id) => JSON.stringify(m.getStyle().layers.find((l) => l.id === id)?.paint));
    });
    for (const p of paints) expect(p).not.toMatch(/#0e6655|#13715e|84, 201, 173|14, 102, 85/);
  });
});
