import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../assets/lib/csv.js';
import { validateFeed, EXPECTED_HEADER } from '../assets/lib/feed.js';
import { buildRecords, coincidentGroups, parseNumber } from '../assets/lib/records.js';
import { classifyWaste } from '../assets/lib/materials.js';
import { searchKey, toLatin, slug } from '../assets/lib/translit.js';
import { applyFilters, sortRecords, countRecords, emptyState } from '../assets/lib/filters.js';
import { toQuery, fromQuery } from '../assets/lib/urlstate.js';
import { phrase, placeName, regionName } from '../assets/lib/i18n.js';

const sample = readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8');
const feed = validateFeed(sample);
const records = buildRecords(feed.rows);
const byLocality = (name) => records.find((r) => r.locality === name || r.settlement === name);
const state = (patch) => ({ ...emptyState(), ...patch });
const ids = (list) => list.map((r) => r.id);

test('CSV parsing handles quotes, commas in fields and CRLF', () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('feed validation accepts the approved columns', () => {
  assert.equal(feed.ok, true);
  assert.equal(feed.rows.length, 10);
});

test('feed validation rejects sign-in pages, extra columns and short rows', () => {
  assert.equal(validateFeed('<!DOCTYPE html><html><body>Sign in</body></html>').ok, false);
  assert.equal(validateFeed('Регион\nX', 'text/html; charset=utf-8').ok, false);
  assert.equal(validateFeed('').ok, false);
  const extra = [...EXPECTED_HEADER, 'Интерна белешка'].join(',') + '\n' + 'a,'.repeat(13) + 'b';
  assert.match(validateFeed(extra).reason, /unexpected columns/);
  const short = EXPECTED_HEADER.join(',') + '\nа,б,в';
  assert.match(validateFeed(short).reason, /fields/);
  assert.match(validateFeed(EXPECTED_HEADER.join(',') + '\n').reason, /no records/);
});

test('unstated values are unknown, never zero', () => {
  assert.equal(parseNumber('/'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('abc'), null);
  const karpos = byLocality('Трнодол/Жданец');
  assert.equal(karpos.area, null);
  assert.equal(karpos.volume, null);
  assert.equal(karpos.settlement, null);
  assert.equal(byLocality('Лисиче').area, 0, 'a stated 0 stays 0');
});

test('records without coordinates are unlocated and get no substitute position', () => {
  const r = byLocality('Немањици');
  assert.equal(r.located, false);
  assert.equal(r.lat, null);
  assert.equal(r.lon, null);
  assert.deepEqual(countRecords(records), { total: 10, located: 9, unlocated: 1 });
});

test('coincident records stay separate', () => {
  const groups = coincidentGroups(records);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 2);
});

test('waste materials come only from stated wording', () => {
  const a = classifyWaste('Комунален и градежен');
  const b = classifyWaste('Градежен и комунален');
  assert.deepEqual([...a.materials].sort(), [...b.materials].sort());
  assert.equal(a.icon, 'mixed');
  assert.equal(classifyWaste('Градежен шут').icon, 'construction');
  const mixedMunicipal = classifyWaste('Мешан комунален');
  assert.equal(mixedMunicipal.icon, 'mixed');
  assert.deepEqual(mixedMunicipal.materials, ['municipal']);
  assert.equal(classifyWaste('/').icon, 'unknown');
  assert.equal(classifyWaste('').unknown, true);
  const unrecognised = classifyWaste('Опасен отпад');
  assert.equal(unrecognised.other, true);
  assert.deepEqual(unrecognised.materials, []);
  for (const [text, m] of [['Комунален и био-отпад', 'bio'], ['Комунален и земјоделски', 'agricultural'],
    ['Комунален и пакување', 'packaging'], ['Градежен и индустриски', 'industrial'], ['Градежен и кабаст', 'bulky']]) {
    assert.ok(classifyWaste(text).materials.includes(m), text);
  }
});

test('search folds script, case, diacritics and spacing', () => {
  const k = searchKey('Кичево');
  for (const q of ['Kičevo', 'kichevo', 'KICEVO', 'кичево']) assert.equal(searchKey(q), k, q);
  assert.equal(searchKey('Kisela voda'), searchKey('Кисела вода'));
  assert.equal(searchKey('Kiselavoda'), searchKey('Кисела  вода'));
  assert.equal(searchKey('Gjorce Petrov'), searchKey('Ѓорче Петров'));
  assert.equal(searchKey('Ǵorče Petrov'), searchKey('Ѓорче Петров'));
  assert.equal(searchKey('Suto Orizari'), searchKey('Шуто Оризари'));
});

test('search finds settlements, localities, municipalities and full names of abbreviations', () => {
  const find = (q) => ids(applyFilters(records, state({ q })));
  assert.deepEqual(find('oslomej'), [byLocality('Осломеј').id]);
  assert.deepEqual(find('Makedonski Brod'), [byLocality('Барбарас').id]);
  assert.deepEqual(find('Мак. Брод'), [byLocality('Барбарас').id]);
  assert.deepEqual(find('Rostuše'), [byLocality('Ростуше').id]);
  assert.deepEqual(find('Mavrovo i Rostuse'), [byLocality('Ростуше').id]);
  assert.deepEqual(find('veles bunar'), [byLocality('Бунар Дере').id]);
  assert.deepEqual(find('nowhere'), []);
});

test('filters: AND across categories, OR within a category', () => {
  const both = applyFilters(records, state({ regions: new Set(['skopski', 'vardarski']) }));
  assert.equal(both.length, 5);
  const andType = applyFilters(records, state({ regions: new Set(['skopski', 'vardarski']), types: new Set(['active']) }));
  assert.deepEqual(ids(andType).sort(), [byLocality('Бунар Дере').id, byLocality('Немањици').id].sort());
  const construction = applyFilters(records, state({ materials: new Set(['construction']) }));
  assert.equal(construction.length, 2, 'both word orders match');
  const unknownWaste = applyFilters(records, state({ materials: new Set(['unknown']) }));
  assert.equal(unknownWaste.length, 5);
  const municipal = applyFilters(records, state({ materials: new Set(['municipal']) }));
  assert.ok(ids(municipal).includes(byLocality('Штип').id), 'mixed municipal filters as municipal');
  const other = applyFilters(records, state({ materials: new Set(['other']) }));
  assert.deepEqual(ids(other), [byLocality('Ростуше').id]);
});

test('an area range excludes unknown areas; clearing it restores them', () => {
  const ranged = applyFilters(records, state({ areaMin: 0, areaMax: 1000 }));
  assert.ok(ranged.every((r) => r.area != null && r.area <= 1000));
  assert.equal(ranged.length, 3);
  assert.equal(applyFilters(records, state({})).length, 10);
  assert.deepEqual(ids(applyFilters(records, state({ areaMin: 50000 }))), [byLocality('Бунар Дере').id]);
});

test('map-area search keeps only located records inside the bounds', () => {
  const inSkopje = applyFilters(records, state({ bounds: [21.3, 41.9, 21.6, 42.1] }));
  assert.ok(inSkopje.every((r) => r.located));
  assert.equal(inSkopje.length, 3);
});

test('sorting puts unknown values last, never as zero', () => {
  const byArea = sortRecords(records, 'area');
  assert.equal(byArea[0].area, 80000);
  const firstUnknown = byArea.findIndex((r) => r.area == null);
  assert.ok(byArea.slice(firstUnknown).every((r) => r.area == null));
  assert.equal(byArea[firstUnknown - 1].area, 0);
  const byVolume = sortRecords(records, 'volume');
  assert.equal(byVolume[0].volume, 2800000);
  const vu = byVolume.findIndex((r) => r.volume == null);
  assert.ok(byVolume.slice(vu).every((r) => r.volume == null));
});

test('shared links round-trip filters, sort, bounds, view and language', () => {
  const s = state({
    q: 'Охрид', regions: new Set(['skopski']), municipalities: new Set(['mak-brod', 'kicevo']),
    types: new Set(['dumpsite']), materials: new Set(['unknown', 'construction']),
    areaMin: 100, areaMax: 5000, bounds: [21.3, 41.9, 21.6, 42.1], sort: 'volume',
  });
  const q = toQuery({ state: s, lang: 'en', view: { lng: 21.4, lat: 41.6, zoom: 8.5 } });
  const back = fromQuery('?' + q);
  assert.equal(back.lang, 'en');
  assert.equal(back.state.q, 'Охрид');
  assert.deepEqual([...back.state.municipalities].sort(), ['kicevo', 'mak-brod']);
  assert.deepEqual([...back.state.materials].sort(), ['construction', 'unknown']);
  assert.equal(back.state.areaMin, 100);
  assert.equal(back.state.areaMax, 5000);
  assert.deepEqual(back.state.bounds, [21.3, 41.9, 21.6, 42.1]);
  assert.equal(back.state.sort, 'volume');
  assert.deepEqual(back.view, { lng: 21.4, lat: 41.6, zoom: 8.5 });
  assert.equal(toQuery({ state: emptyState(), lang: 'mk' }), '');
});

test('English shows Latin place names and verified translations', () => {
  assert.equal(toLatin('Кичево'), 'Kičevo');
  assert.equal(toLatin('Ѓорче Петров'), 'Ǵorče Petrov');
  assert.equal(toLatin('Џепчиште'), 'Džepčište');
  assert.equal(placeName('Охрид', 'en'), 'Ohrid');
  assert.equal(placeName('Охрид', 'mk'), 'Охрид');
  assert.equal(regionName('Скопски', 'en'), 'Skopje');
  assert.equal(slug('Мак. Брод'), 'mak-brod');
  assert.equal(phrase('Комунален и градежен', 'en').text, 'Municipal and construction');
  assert.equal(phrase('Општина Аеродром', 'en').text, 'Municipality of Aerodrom');
  const unknownPhrase = phrase('Опасен отпад', 'en');
  assert.equal(unknownPhrase.text, 'Opasen otpad');
  assert.equal(unknownPhrase.translated, false);
  assert.equal(phrase('/', 'en').text, null);
});

test('numbers and dates format the same in every browser', async () => {
  const { fmtNumber, fmtDateTime } = await import('../assets/lib/i18n.js');
  assert.equal(fmtNumber(2800000, 'mk'), '2 800 000');
  assert.equal(fmtNumber(12.5, 'mk'), '12,5');
  assert.equal(fmtNumber(12.5, 'en'), '12.5');
  assert.equal(fmtNumber(0, 'en'), '0');
  assert.equal(fmtDateTime('2026-11-05T19:24:00Z', 'mk'), '5 ноември 2026, 20:24');
  assert.equal(fmtDateTime('2026-07-01T04:17:00Z', 'en'), '1 July 2026, 06:17');
});
