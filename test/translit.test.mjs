import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLatin, searchKey, slug } from '../assets/lib/translit.js';

test('Latin script uses the official Macedonian romanisation', () => {
  const pairs = {
    ѓ: 'ǵ', ж: 'ž', ѕ: 'dz', ј: 'j', љ: 'lj', њ: 'nj', ќ: 'ḱ', ц: 'c', ч: 'č', џ: 'dž', ш: 'š', х: 'h',
  };
  for (const [cyr, lat] of Object.entries(pairs)) assert.equal(toLatin(cyr), lat, cyr);
  assert.equal(toLatin('Кичево'), 'Kičevo');
  assert.equal(toLatin('Ѓорче Петров'), 'Ǵorče Petrov');
  assert.equal(toLatin('Џепчиште'), 'Džepčište');
  assert.equal(toLatin('Шуто Оризари'), 'Šuto Orizari');
  assert.equal(toLatin('Ќафа'), 'Ḱafa');
});

test('capitals stay capitals, digraphs only capitalise their first letter', () => {
  assert.equal(toLatin('Љубанци'), 'Ljubanci');
  assert.equal(toLatin('Њивиште'), 'Njivište');
  assert.equal(toLatin('Џ'), 'Dž');
  assert.equal(toLatin('Ѕ'), 'Dz');
  assert.equal(toLatin('ЖДАНЕЦ'), 'ŽDANEC');
});

test('everything that is not Cyrillic passes through', () => {
  assert.equal(toLatin('Мак. Брод / 12,5 m²'), 'Mak. Brod / 12,5 m²');
  assert.equal(toLatin('Skopje'), 'Skopje');
  assert.equal(toLatin(null), null);
  assert.equal(toLatin(undefined), undefined);
});

test('search folds case, script and diacritics, so every spelling matches', () => {
  const same = (cyr, ...latin) => {
    const k = searchKey(cyr);
    for (const l of latin) assert.equal(searchKey(l), k, `${l} vs ${cyr}`);
  };
  same('Кичево', 'Kičevo', 'Kichevo', 'Kicevo', 'KICEVO', 'кичево');
  same('Шуто Оризари', 'Šuto Orizari', 'Shuto Orizari', 'Suto Orizari');
  same('Жданец', 'Ždanec', 'Zhdanec', 'Zdanec');
  same('Чашка', 'Čaška', 'Chashka', 'Caska');
  same('Ѓорче Петров', 'Ǵorče Petrov', 'Gjorche Petrov', 'Gorce Petrov', 'Đorče Petrov');
  same('Ќафа', 'Ḱafa', 'Kjafa', 'Kafa', 'Ćafa');
  same('Џепчиште', 'Džepčište', 'Dzhepchishte', 'Dzepciste');
  same('Љубанци', 'Ljubanci', 'Lubanci');
  same('Њивиште', 'Njivište', 'Nivishte', 'Niviste');
  same('Ѕвегор', 'Dzvegor');
});

test('search ignores spaces and punctuation, and handles decomposed accents', () => {
  assert.equal(searchKey('Мак. Брод'), 'makbrod');
  assert.equal(searchKey('Kisela voda'), searchKey('Кисела  вода'));
  assert.equal(searchKey('Kiselavoda'), searchKey('Кисела вода'));
  assert.equal(searchKey('Kičevo'), 'kicevo');
  assert.equal(searchKey('Трнодол/Жданец'), 'trnodolzdanec');
});

test('search keys of nothing are empty', () => {
  assert.equal(searchKey(''), '');
  assert.equal(searchKey(null), '');
  assert.equal(searchKey(undefined), '');
  assert.equal(searchKey('...  /'), '');
});

test('slugs are stable URL-safe codes', () => {
  assert.equal(slug('Мак. Брод'), 'mak-brod');
  assert.equal(slug('Свети Николе'), 'sveti-nikole');
  assert.equal(slug('Маврово/Р.'), 'mavrovo-r');
  assert.equal(slug('Ѓорче Петров'), 'gorce-petrov');
  assert.equal(slug('Џепчиште'), 'dzepciste');
  assert.equal(slug('Активна нестандардна'), 'aktivna-nestandardna');
  assert.equal(slug(''), '');
  assert.equal(slug(null), '');
  assert.match(slug('  Кисела   вода!! '), /^[a-z0-9]+(-[a-z0-9]+)*$/);
});
