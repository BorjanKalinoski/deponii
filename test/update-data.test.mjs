import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../scripts/update-data.mjs';

const sample = fileURLToPath(new URL('./fixtures/sample.csv', import.meta.url));

test('a valid feed is saved with its check time', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deponii-'));
  const now = new Date('2026-11-05T04:17:00Z');
  const r = await run({ localFile: sample, dataDir: dir, now });
  assert.equal(r.ok, true);
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
  assert.equal(meta.records, 10);
  assert.equal(meta.located, 9);
  assert.equal(meta.checkedAt, now.toISOString());
  assert.equal(meta.source, 'feed');

  // Next day, same data: check time moves, change time stays.
  const later = new Date('2026-11-06T04:17:00Z');
  const r2 = await run({ localFile: sample, dataDir: dir, now: later });
  assert.equal(r2.changed, false);
  const meta2 = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
  assert.equal(meta2.checkedAt, later.toISOString());
  assert.equal(meta2.dataChangedAt, now.toISOString());
});

test('a bad feed leaves the last good copy untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deponii-'));
  await run({ localFile: sample, dataDir: dir, now: new Date('2026-11-05T04:17:00Z') });
  const before = await readFile(join(dir, 'map-data.csv'), 'utf8');
  const metaBefore = await readFile(join(dir, 'meta.json'), 'utf8');
  const bad = join(dir, 'signin.html');
  await writeFile(bad, '<!doctype html><html><title>Sign in</title></html>');
  const r = await run({ localFile: bad, dataDir: dir });
  assert.equal(r.ok, false);
  assert.equal(await readFile(join(dir, 'map-data.csv'), 'utf8'), before);
  assert.equal(await readFile(join(dir, 'meta.json'), 'utf8'), metaBefore);
});
