import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFeed } from '../assets/lib/feed.js';
import { buildRecords, coincidentGroups, parseNumber, TYPE_CODES } from '../assets/lib/records.js';
import { countRecords } from '../assets/lib/filters.js';

const sample = readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8');
const records = buildRecords(validateFeed(sample).rows);

// One feed row, with any column overridden by name.
const COLS = ['region', 'municipality', 'settlement', 'locality', 'lat', 'lon', 'area', 'volume', 'type', 'waste', 'source', 'date', 'note'];
const BASE = { region: 'Скопски', municipality: 'Карпош', settlement: 'Скопје', locality: 'Тест', lat: '42', lon: '21.4', area: '100', volume: '50', type: 'Буниште', waste: 'Комунален', source: 'МЖСПП', date: '01.01.2026', note: '/' };
const rowOf = (patch = {}) => COLS.map((c) => ({ ...BASE, ...patch })[c]);
const one = (patch) => buildRecords([rowOf(patch)])[0];

test('stated numbers are read with a comma or point decimal and spaces as grouping', () => {
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber('1 000'), 1000);
  assert.equal(parseNumber('1 000'), 1000);
  assert.equal(parseNumber(' 80000 '), 80000);
  assert.equal(parseNumber('0'), 0);
  assert.equal(parseNumber('-3'), -3);
});

test('unstated or unreadable numbers are unknown (null), never 0', () => {
  for (const v of ['', '/', '-', '—', '?', 'abc', '12m2', '1,000.5', '1.2.3', null, undefined]) {
    assert.equal(parseNumber(v), null, JSON.stringify(v));
  }
});

test('unstated values in a record are null, never 0 or an empty string', () => {
  const r = one({ area: '/', volume: '', settlement: '/', locality: '-', waste: '', source: '', date: '', note: '/' });
  for (const key of ['area', 'volume', 'settlement', 'locality', 'wasteRaw', 'source', 'infoDate', 'note']) {
    assert.equal(r[key], null, key);
  }
  assert.equal(r.waste.unknown, true);
  const karpos = records[3];
  assert.equal(karpos.locality, 'Трнодол/Жданец');
  assert.equal(karpos.area, null);
  assert.equal(karpos.volume, null);
  assert.equal(karpos.settlement, null);
  assert.equal(records[9].area, 0, 'a stated 0 stays 0');
});

test('a record is located only with a full, valid coordinate pair', () => {
  assert.deepEqual([one({}).lat, one({}).lon, one({}).located], [42, 21.4, true]);
  assert.equal(one({ lat: '41,5', lon: '21,25' }).lat, 41.5, 'comma decimals');
  for (const bad of [{ lat: '' }, { lon: '/' }, { lat: '', lon: '' }, { lat: '91' }, { lat: '-90.5' }, { lon: '181' }, { lon: 'east' }]) {
    const r = one(bad);
    assert.equal(r.located, false, JSON.stringify(bad));
    assert.equal(r.lat, null, JSON.stringify(bad));
    assert.equal(r.lon, null, JSON.stringify(bad));
  }
});

test('the fixture has one unlocated record, with no substitute position', () => {
  const r = records.find((x) => x.settlement === 'Немањици');
  assert.equal(r.located, false);
  assert.equal(r.lat, null);
  assert.equal(r.lon, null);
  assert.deepEqual(countRecords(records), { total: 10, located: 9, unlocated: 1 });
  assert.deepEqual(countRecords([]), { total: 0, located: 0, unlocated: 0 });
});

test('records keep their row order as ids, their raw row and a code for each name', () => {
  assert.deepEqual(records.map((r) => r.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(records[0].raw.length, 13);
  assert.equal(records[0].regionCode, 'jugozapaden');
  assert.equal(records[0].municipalityCode, 'mak-brod');
  assert.equal(records[8].municipalityCode, 'mavrovo-r');
});

test('landfill types map to fixed codes; anything else keeps a code of its own', () => {
  assert.deepEqual(TYPE_CODES, { 'Буниште': 'dumpsite', 'Активна нестандардна': 'active', 'Затворена нестандардна': 'closed' });
  assert.deepEqual(records.map((r) => r.typeCode), ['active', 'active', 'active', 'dumpsite', 'dumpsite', 'active', 'dumpsite', 'dumpsite', 'closed', 'dumpsite']);
  assert.equal(one({ type: 'Санирана депонија' }).typeCode, 'sanirana-deponija');
  assert.equal(one({ type: '/' }).typeCode, 'unknown');
  assert.equal(one({ type: '/' }).type, null);
});

test('abbreviated municipality names are also searchable by their full names', () => {
  const keys = (municipality) => one({ municipality, settlement: '/', locality: '/' }).searchKeys.split('|');
  assert.deepEqual(keys('Мак. Брод'), ['makbrod', 'makedonskibrod']);
  assert.deepEqual(keys('Маврово/Р.'), ['mavrovor', 'mavrovoirostuse', 'mavrovo', 'rostuse']);
  assert.deepEqual(keys('Д. Хисар'), ['dhisar', 'demirhisar']);
  assert.deepEqual(keys('Карпош'), ['karpos']);
});

test('search keys cover settlement, locality and municipality', () => {
  assert.deepEqual(records[2].searchKeys.split('|'), ['veles', 'bunardere', 'veles']);
  assert.ok(records[4].searchKeys.includes('gornolisiceparkbanovina'));
});

test('every record carries its severity', () => {
  assert.deepEqual(records.map((r) => r.severity), [4, 4, 4, 1, 1, 3, 2, 1, 1, 1]);
});

test('coincident records stay separate and are found as a group', () => {
  assert.deepEqual(coincidentGroups(records), [[6, 7]]);
  assert.deepEqual(coincidentGroups(records.filter((r) => r.id !== 7)), []);
  const unlocatedPair = buildRecords([rowOf({ lat: '', lon: '' }), rowOf({ lat: '', lon: '' })]);
  assert.deepEqual(coincidentGroups(unlocatedPair), [], 'unlocated records never coincide');
});
