import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toQuery, fromQuery } from '../assets/lib/urlstate.js';
import { emptyState } from '../assets/lib/filters.js';

const state = (patch) => ({ ...emptyState(), ...patch });
const roundTrip = (s, lang = 'mk', view = null) => fromQuery('?' + toQuery({ state: s, lang, view }));
const plain = (s) => ({ ...s, regions: [...s.regions].sort(), municipalities: [...s.municipalities].sort(), types: [...s.types].sort(),
  materials: [...s.materials].sort(), severity: [...s.severity].sort() });

test('the default view has an empty query string', () => {
  assert.equal(toQuery({ state: emptyState(), lang: 'mk' }), '');
  assert.equal(toQuery({ state: emptyState(), lang: 'mk', view: null }), '');
  assert.deepEqual(plain(fromQuery('').state), plain(emptyState()));
  assert.equal(fromQuery('').view, null);
  assert.equal(fromQuery('').lang, 'mk');
});

test('every parameter survives a round trip on its own', () => {
  const cases = [
    [{ q: 'Охрид' }, 'q'],
    [{ regions: new Set(['skopski', 'vardarski']) }, 'r'],
    [{ municipalities: new Set(['mak-brod', 'kicevo']) }, 'm'],
    [{ types: new Set(['dumpsite', 'active']) }, 't'],
    [{ materials: new Set(['unknown', 'construction', 'other']) }, 'w'],
    [{ severity: new Set(['4', '1']) }, 'd'],
    [{ areaMin: 100 }, 'amin'],
    [{ areaMax: 5000.5 }, 'amax'],
    [{ areaMin: 0 }, 'amin'],
    [{ bounds: [21.3, 41.9, 21.6, 42.1] }, 'b'],
    [{ sort: 'volume' }, 's'],
  ];
  for (const [patch, param] of cases) {
    const s = state(patch);
    const q = toQuery({ state: s, lang: 'mk' });
    assert.deepEqual([...new URLSearchParams(q).keys()], [param], param);
    assert.deepEqual(plain(fromQuery('?' + q).state), plain(s), param);
  }
  assert.equal(roundTrip(emptyState(), 'en').lang, 'en');
  assert.deepEqual(roundTrip(emptyState(), 'mk', { lng: 21.4, lat: 41.6, zoom: 8.5 }).view, { lng: 21.4, lat: 41.6, zoom: 8.5 });
});

test('all parameters together round-trip, with language and map view', () => {
  const s = state({
    q: 'Охрид', regions: new Set(['skopski']), municipalities: new Set(['mak-brod', 'kicevo']),
    types: new Set(['dumpsite']), materials: new Set(['unknown', 'construction']), severity: new Set(['3', '4']),
    areaMin: 100, areaMax: 5000, bounds: [21.3, 41.9, 21.6, 42.1], sort: 'volume',
  });
  const back = roundTrip(s, 'en', { lng: 21.4, lat: 41.6, zoom: 8.5 });
  assert.equal(back.lang, 'en');
  assert.deepEqual(plain(back.state), plain(s));
  assert.deepEqual(back.view, { lng: 21.4, lat: 41.6, zoom: 8.5 });
});

test('links are short and stable: defaults left out, lists sorted, numbers rounded, search trimmed', () => {
  assert.equal(toQuery({ state: state({ sort: 'area' }), lang: 'mk' }), '');
  assert.equal(toQuery({ state: state({ severity: new Set(['4', '1', '3']) }), lang: 'mk' }), 'd=1%2C3%2C4');
  assert.equal(new URLSearchParams(toQuery({ state: state({ q: '  veles  ' }), lang: 'mk' })).get('q'), 'veles');
  assert.equal(toQuery({ state: state({ q: '   ' }), lang: 'mk' }), '');
  const q = new URLSearchParams(toQuery({ state: state({ bounds: [21.1234567, 41.1, 21.2, 41.2] }), lang: 'mk',
    view: { lng: 21.123456789, lat: 41.987654321, zoom: 7.123456 } }));
  assert.equal(q.get('b'), '21.12346,41.1,21.2,41.2');
  assert.equal(q.get('v'), '21.12346,41.98765,7.12');
});

test('junk values are dropped, so a broken link shows more, never an empty map', () => {
  const { state: s, view, lang } = fromQuery('?r=Bad Code,a--b,-x,ok-code&m=,,&t=Буниште&w=plutonium,unknown,Mixed&d=9,x,0,4,&amin=abc&amax=-5&b=1,2,3&s=sideways&v=a,b,c&lang=xx');
  assert.deepEqual([...s.regions], ['ok-code']);
  assert.equal(s.municipalities.size, 0);
  assert.equal(s.types.size, 0, 'codes are Latin slugs, not source wording');
  assert.deepEqual([...s.materials], ['unknown']);
  assert.deepEqual([...s.severity], ['4']);
  assert.equal(s.areaMin, null);
  assert.equal(s.areaMax, null, 'no negative areas');
  assert.equal(s.bounds, null);
  assert.equal(s.sort, 'area');
  assert.equal(view, null);
  assert.equal(lang, 'mk');
});

test('impossible map areas and views are dropped', () => {
  const bounds = (b) => fromQuery(`?b=${b}`).state.bounds;
  assert.deepEqual(bounds('21.3,41.9,21.6,42.1'), [21.3, 41.9, 21.6, 42.1]);
  assert.equal(bounds('21.6,41.9,21.3,42.1'), null, 'west of east');
  assert.equal(bounds('21.3,42.1,21.6,41.9'), null, 'south of north');
  assert.equal(bounds('-200,41.9,21.6,42.1'), null);
  assert.equal(bounds('21.3,-95,21.6,42.1'), null);
  assert.equal(bounds('21.3,,21.6,42.1'), null);
  assert.equal(bounds('21.3,41.9,21.6,42.1,5'), null);
  assert.equal(bounds('Infinity,41.9,21.6,42.1'), null);
  const view = (v) => fromQuery(`?v=${v}`).view;
  assert.deepEqual(view('21.4,41.6,8'), { lng: 21.4, lat: 41.6, zoom: 8 });
  assert.equal(view('21.4,41.6'), null);
  assert.equal(view('21.4,41.6,99'), null);
  assert.equal(view('21.4,41.6,-1'), null);
  assert.equal(view('500,41.6,8'), null);
  assert.equal(view('21.4,100,8'), null);
  assert.equal(view(',41.6,8'), null);
});

test('area bounds accept 0 and decimals, and nothing that is not a number', () => {
  assert.equal(fromQuery('?amin=0').state.areaMin, 0);
  assert.equal(fromQuery('?amax=12.5').state.areaMax, 12.5);
  assert.equal(fromQuery('?amin=').state.areaMin, null);
  assert.equal(fromQuery('?amin=%20').state.areaMin, null);
  assert.equal(fromQuery('?amin=1e3').state.areaMin, 1000);
  assert.equal(fromQuery('?amin=Infinity').state.areaMin, null);
  assert.equal(fromQuery('?amin=NaN').state.areaMin, null);
});

test('an over-long search is cut, not refused', () => {
  assert.equal(fromQuery(`?q=${'a'.repeat(500)}`).state.q.length, 200);
});
