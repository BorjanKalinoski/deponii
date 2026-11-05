import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFeed, EXPECTED_HEADER } from '../assets/lib/feed.js';

const sample = readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8');
const header = EXPECTED_HEADER.join(',');
const record = Array.from({ length: EXPECTED_HEADER.length }, (_, i) => `v${i}`).join(',');

test('the fixture feed has the approved columns and 10 records', () => {
  const feed = validateFeed(sample);
  assert.equal(feed.ok, true);
  assert.deepEqual(feed.header, EXPECTED_HEADER);
  assert.equal(feed.rows.length, 10);
  assert.ok(feed.rows.every((r) => r.length === EXPECTED_HEADER.length));
});

test('a byte-order mark, CRLF endings, padded headers and blank lines are accepted', () => {
  const text = `﻿${EXPECTED_HEADER.map((h) => ` ${h} `).join(',')}\r\n${record}\r\n\r\n,,,,,,,,,,,,\r\n${record}\r\n`;
  const feed = validateFeed(text);
  assert.equal(feed.ok, true);
  assert.equal(feed.rows.length, 2, 'rows with only empty fields are skipped');
});

test('a sign-in or error page is rejected, whatever it claims to be', () => {
  assert.match(validateFeed('<!DOCTYPE html><html><body>Sign in</body></html>').reason, /HTML/);
  assert.match(validateFeed('<html><head><title>Error</title></head></html>').reason, /HTML/);
  assert.match(validateFeed(`${header}\n${record}`, 'text/html; charset=utf-8').reason, /HTML/);
});

test('empty responses are rejected', () => {
  assert.equal(validateFeed('').ok, false);
  assert.equal(validateFeed('   \n  ').ok, false);
  assert.equal(validateFeed(undefined).ok, false);
  assert.equal(validateFeed(null).ok, false);
  assert.match(validateFeed(`${header}\n`).reason, /no records/);
});

test('any change to the columns is rejected, so a private column never goes public', () => {
  const extra = `${header},Интерна белешка\n${record},x`;
  assert.match(validateFeed(extra).reason, /unexpected columns/);
  const missing = `${EXPECTED_HEADER.slice(0, -1).join(',')}\n${record}`;
  assert.match(validateFeed(missing).reason, /unexpected columns/);
  const swapped = [...EXPECTED_HEADER];
  [swapped[4], swapped[5]] = [swapped[5], swapped[4]];
  assert.match(validateFeed(`${swapped.join(',')}\n${record}`).reason, /unexpected columns/);
  const renamed = EXPECTED_HEADER.map((h) => (h === 'Коментар' ? 'Коментари' : h));
  assert.match(validateFeed(`${renamed.join(',')}\n${record}`).reason, /unexpected columns/);
});

test('a record with too few or too many fields is rejected and named', () => {
  assert.match(validateFeed(`${header}\n${record}\nа,б,в`).reason, /record 2 has 3 fields/);
  assert.match(validateFeed(`${header}\n${record},extra`).reason, /record 1 has 14 fields/);
});
