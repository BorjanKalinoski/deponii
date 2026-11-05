// Daily data check: fetch the published Map data CSV, validate it, and save it
// for the site only if it passes. On failure nothing is written, the last good
// copy stays, and the process exits non-zero so the workflow run shows as failed.
//
//   node scripts/update-data.mjs            fetch from FEED_URL
//   node scripts/update-data.mjs file.csv   use a local file instead (testing)
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFeed } from '../assets/lib/feed.js';

export const FEED_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSVw3tSY8dQrtjC6gQzYHz8miLR_19g0N_FEW8AZeSZTFFm29DlL1L6B5NWwxpbVDCq29G0Ik3JacWK/pub?gid=1631738777&single=true&output=csv';

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

async function fetchFeed(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'deponii-data-check' } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { text, contentType: res.headers.get('content-type') || '' };
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw lastError;
}

const isNum = (v) => /^-?\d+(\.\d+)?$/.test(String(v).trim());

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

export async function run({ localFile, now = new Date(), dataDir = DEFAULT_DATA_DIR } = {}) {
  const CSV_PATH = join(dataDir, 'map-data.csv');
  const META_PATH = join(dataDir, 'meta.json');
  const { text, contentType } = localFile
    ? { text: await readFile(localFile, 'utf8'), contentType: 'text/csv' }
    : await fetchFeed(FEED_URL);

  const result = validateFeed(text, contentType);
  if (!result.ok) {
    console.error(`Feed rejected, keeping the last good copy: ${result.reason}`);
    return { ok: false, reason: result.reason };
  }

  const sha256 = createHash('sha256').update(text).digest('hex');
  const previous = await readJson(META_PATH);
  const changed = !previous || previous.sha256 !== sha256;
  const located = result.rows.filter((r) => isNum(r[4]) && isNum(r[5])).length;

  const meta = {
    source: 'feed',
    checkedAt: now.toISOString(),
    dataChangedAt: changed ? now.toISOString() : previous.dataChangedAt,
    records: result.rows.length,
    located,
    sha256,
  };

  await mkdir(dirname(CSV_PATH), { recursive: true });
  if (changed) await writeFile(CSV_PATH, text);
  await writeFile(META_PATH, JSON.stringify(meta, null, 2) + '\n');
  console.log(
    `${changed ? 'Updated' : 'Unchanged'}: ${meta.records} records, ${located} located, sha256 ${sha256.slice(0, 12)}`,
  );
  return { ok: true, changed, meta };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({ localFile: process.argv[2] }).then(
    (r) => process.exit(r.ok ? 0 : 1),
    (err) => { console.error(`Fetch failed, keeping the last good copy: ${err.message}`); process.exit(1); },
  );
}
