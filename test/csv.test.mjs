import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../assets/lib/csv.js';

test('plain rows and fields', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('quoted fields keep commas, doubled quotes and line breaks', () => {
  assert.deepEqual(parseCsv('"x, y","say ""hi"""\n'), [['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('"two\nlines",b\n'), [['two\nlines', 'b']]);
  assert.deepEqual(parseCsv('"two\r\nlines",b\r\n'), [['two\r\nlines', 'b']]);
  assert.deepEqual(parseCsv('"",b'), [['', 'b']]);
  assert.deepEqual(parseCsv('"""",b'), [['"', 'b']]);
});

test('CRLF, LF and lone CR line endings all end a row', () => {
  const want = [['a', 'b'], ['c', 'd']];
  assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), want);
  assert.deepEqual(parseCsv('a,b\nc,d\n'), want);
  assert.deepEqual(parseCsv('a,b\rc,d\r'), want);
  assert.deepEqual(parseCsv('a,b\r\nc,d'), want);
});

test('empty fields stay empty strings, in any position', () => {
  assert.deepEqual(parseCsv('a,,c\n'), [['a', '', 'c']]);
  assert.deepEqual(parseCsv(',b,\n'), [['', 'b', '']]);
  assert.deepEqual(parseCsv(',,\n'), [['', '', '']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
});

test('a trailing newline adds no extra row; a blank line in the middle is kept', () => {
  assert.deepEqual(parseCsv('a,b\n'), parseCsv('a,b'));
  assert.equal(parseCsv('a,b\n').length, 1);
  assert.deepEqual(parseCsv('a\n\nb\n'), [['a'], [''], ['b']]);
});

test('a byte-order mark is dropped; whitespace inside fields is kept', () => {
  assert.deepEqual(parseCsv('﻿Регион,Општина\n'), [['Регион', 'Општина']]);
  assert.deepEqual(parseCsv(' a , b \n'), [[' a ', ' b ']]);
});

test('empty input has no rows', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('﻿'), []);
});

test('Cyrillic text passes through unchanged', () => {
  assert.deepEqual(parseCsv('Скопски,"Горно Лисиче, парк Бановина"\n'), [['Скопски', 'Горно Лисиче, парк Бановина']]);
});
