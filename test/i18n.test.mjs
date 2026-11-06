import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UI, MATERIAL_LABELS, TYPE_LABELS, phrase, placeName, regionName, fmtNumber, fmtInt, fmtDateTime,
} from '../assets/lib/i18n.js';
import { ICON_KINDS } from '../assets/lib/icons.js';
import { TYPE_ORDER } from '../assets/lib/records.js';
import { SEVERITY_LEVELS } from '../assets/lib/severity.js';

// Sample arguments for the text functions, by key.
const ARGS = {
  counts: [[1, 1, 0], [10, 9, 1]],
  lastUpdate: [['5 ноември 2026, 09:00']],
  snapshot: [['5 ноември 2026, 09:00']],
  here: [[2]],
  showResults: [[1], [10]],
  areaRange: [[10, 100], [null, 100], [10, null]],
  areaKnown: [[6, 10], [10, 10], [0, 5]],
  volumeKnown: [[6, 10], [10, 10], [0, 5]],
  areaHalf: [[1, 10, 10], [12, 431, 431], [1, 6, 10], [12, 398, 431]],
  volumeHalf: [[1, 10, 10], [3, 431, 431], [1, 6, 10], [3, 395, 431]],
};

test('every Macedonian text has an English one of the same kind, and nothing extra', () => {
  assert.deepEqual(Object.keys(UI.en).sort(), Object.keys(UI.mk).sort());
  for (const [key, mk] of Object.entries(UI.mk)) {
    const en = UI.en[key];
    assert.equal(typeof en, typeof mk, key);
    if (typeof mk === 'function') assert.equal(en.length, mk.length, `${key} takes the same arguments`);
    if (typeof mk === 'string') {
      assert.ok(mk.trim() && en.trim(), `${key} is not empty`);
    }
  }
});

test('text functions return text in both languages', () => {
  for (const lang of ['mk', 'en']) {
    for (const [key, fn] of Object.entries(UI[lang])) {
      if (typeof fn !== 'function') continue;
      assert.ok(ARGS[key], `sample arguments for ${key}`);
      for (const args of ARGS[key]) {
        const out = fn(...args);
        assert.equal(typeof out, 'string', `${lang}.${key}`);
        assert.ok(out.trim() && !/undefined|NaN|\[object/.test(out), `${lang}.${key}(${args}) → ${out}`);
      }
    }
  }
});

test('severity levels 1–4 are named in both languages', () => {
  for (const lang of ['mk', 'en']) {
    const levels = UI[lang].severityLevels;
    assert.deepEqual(Object.keys(levels).map(Number).sort(), SEVERITY_LEVELS, lang);
    for (const l of SEVERITY_LEVELS) assert.ok(levels[l]?.trim(), `${lang} level ${l}`);
    assert.equal(new Set(Object.values(levels)).size, 4, `${lang} names are distinct`);
  }
  assert.match(UI.mk.severityNote, /Не е измерен ризик/);
  assert.match(UI.en.severityNote, /Not a measured risk/);
});

test('every material, symbol and landfill type is labelled in both languages', () => {
  for (const lang of ['mk', 'en']) {
    assert.deepEqual(Object.keys(MATERIAL_LABELS[lang]).sort(), [...ICON_KINDS].sort(), lang);
    for (const code of TYPE_ORDER) assert.ok(TYPE_LABELS[lang][code], `${lang} ${code}`);
  }
});

test('the country is always "Macedonia", never "North Macedonia"', () => {
  const all = JSON.stringify({ UI, MATERIAL_LABELS, TYPE_LABELS }) +
    Object.values(UI).flatMap((s) => Object.entries(s)).filter(([, v]) => typeof v === 'function')
      .map(([k, fn]) => (ARGS[k] || [[]]).map((a) => fn(...a)).join(' ')).join(' ');
  assert.doesNotMatch(all, /north\s+macedonia|северна\s+македонија|sjeverna|severna\s+makedonija/i);
  assert.match(UI.en.title, /in Macedonia$/);
  assert.match(UI.mk.title, /во Македонија$/);
});

test('counts read naturally in the singular and plural', () => {
  assert.equal(UI.mk.counts(1, 1, 0), '1 евидентирана локација · 1 на мапата · 0 без локација');
  assert.equal(UI.mk.counts(10, 9, 1), '10 евидентирани локации · 9 на мапата · 1 без локација');
  assert.equal(UI.en.counts(1, 1, 0), '1 recorded site · 1 on the map · 0 without location');
  assert.equal(UI.en.counts(1200, 1100, 100), '1 200 recorded sites · 1 100 on the map · 100 without location');
  assert.equal(UI.mk.showResults(1), 'Прикажи 1 локација');
  assert.equal(UI.en.showResults(3), 'Show 3 sites');
});

test('the summary says how many sites state each total, and how few of the largest hold more than half', () => {
  assert.equal(UI.mk.areaKnown(398, 431), 'позната за 398 од 431 локации');
  assert.equal(UI.mk.volumeKnown(395, 431), 'познат за 395 од 431 локации');
  assert.equal(UI.mk.areaKnown(10, 10), 'позната за сите 10');
  assert.equal(UI.en.areaKnown(398, 431), 'known for 398 of 431 sites');
  assert.equal(UI.en.volumeKnown(1200, 1200), 'known for all 1 200');
  // Every site states the value: the claim is about the whole list.
  assert.equal(UI.mk.areaHalf(1, 10, 10), 'Најголемата локација има повеќе од половина од површината');
  assert.equal(UI.mk.areaHalf(12, 431, 431), '12-те најголеми локации имаат повеќе од половина од површината');
  assert.equal(UI.mk.volumeHalf(3, 431, 431), '3-те најголеми локации имаат повеќе од половина од волуменот');
  assert.equal(UI.en.areaHalf(12, 431, 431), 'The 12 largest sites have more than half the area');
  assert.equal(UI.en.volumeHalf(1, 10, 10), 'The largest site has more than half the volume');
  // Some values unknown: the claim says it covers only the known ones.
  assert.equal(UI.mk.areaHalf(12, 398, 431), '12-те најголеми локации со позната површина имаат повеќе од половина од збирот');
  assert.equal(UI.mk.volumeHalf(1, 6, 10), 'Од локациите со познат волумен, најголемата има повеќе од половина од збирот');
  assert.equal(UI.en.areaHalf(1, 6, 10), 'Of the sites with a known area, the largest has more than half the sum');
  assert.equal(UI.en.volumeHalf(3, 395, 431), 'The 3 largest sites with a known volume have more than half the sum');
});

test('English shows Latin place names and verified translations', () => {
  assert.equal(placeName('Охрид', 'en'), 'Ohrid');
  assert.equal(placeName('Охрид', 'mk'), 'Охрид');
  assert.equal(placeName(null, 'en'), null);
  assert.equal(regionName('Скопски', 'en'), 'Skopje');
  assert.equal(regionName('Пелагониски', 'en'), 'Pelagonia');
  assert.equal(regionName('Скопски', 'mk'), 'Скопски');
  assert.equal(regionName('Непознат', 'en'), 'Nepoznat', 'an unlisted region is transliterated');
  assert.equal(regionName(null, 'en'), null);
});

test('source phrases: verified translations, composites, and honest transliteration otherwise', () => {
  assert.deepEqual(phrase('Комунален и градежен', 'en'), { text: 'Municipal and construction', translated: true });
  assert.equal(phrase('комунален и градежен', 'en').text, 'Municipal and construction', 'case does not matter');
  assert.equal(phrase('Општина Аеродром', 'en').text, 'Municipality of Aerodrom');
  assert.deepEqual(phrase('Интернет, Граѓани', 'en'), { text: 'Internet, Citizens', translated: true });
  assert.deepEqual(phrase('Интернет, Призма', 'en'), { text: 'Internet, Prizma', translated: false });
  assert.deepEqual(phrase('Опасен отпад', 'en'), { text: 'Opasen otpad', translated: false });
  assert.deepEqual(phrase('Опасен отпад', 'mk'), { text: 'Опасен отпад', translated: true });
  assert.deepEqual(phrase('/', 'en'), { text: null, translated: false });
  assert.deepEqual(phrase(null, 'mk'), { text: null, translated: false });
});

test('numbers and dates format the same in every browser', () => {
  assert.equal(fmtNumber(2800000, 'mk'), '2 800 000');
  assert.equal(fmtNumber(12.5, 'mk'), '12,5');
  assert.equal(fmtNumber(12.5, 'en'), '12.5');
  assert.equal(fmtNumber(0, 'en'), '0');
  assert.equal(fmtNumber(-1500, 'en'), '-1 500');
  assert.equal(fmtNumber(1.005, 'en'), '1', 'two decimals at most');
  assert.equal(fmtNumber(999, 'mk'), '999');
  assert.equal(fmtInt(12.6, 'mk'), '13');
  assert.equal(fmtDateTime('2026-11-05T19:24:00Z', 'mk'), '5 ноември 2026, 20:24');
  assert.equal(fmtDateTime('2026-07-01T04:17:00Z', 'en'), '1 July 2026, 06:17', 'summer time in Skopje');
});
