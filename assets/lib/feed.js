// What a usable Map data feed looks like. Used by the daily check before
// anything is saved to the site, and by the browser before rendering.
import { parseCsv } from './csv.js';

export const EXPECTED_HEADER = [
  'Регион',
  'Општина',
  'Населено место',
  'Локалитет',
  'Latitude',
  'Longitude',
  'Површина [m2]',
  'Волумен [m3]',
  'Вид на депонија',
  'Тип на отпад (доминантен)',
  'Извор на информацијата',
  'Датум на информацијата',
  'Коментар',
];

/**
 * Check a fetched feed. Rejects anything that is not a CSV with exactly the
 * approved columns, so a sign-in page, an error page or a feed that suddenly
 * carries an extra (possibly private) column never replaces the inventory.
 * @returns {{ok: true, header: string[], rows: string[][]} | {ok: false, reason: string}}
 */
export function validateFeed(text, contentType = 'text/csv') {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, reason: 'empty response' };
  }
  const head = text.slice(0, 512).toLowerCase();
  if (/<!doctype|<html|<head|<body/.test(head) || /html/.test(contentType)) {
    return { ok: false, reason: 'response is an HTML page, not CSV' };
  }
  const all = parseCsv(text).filter((r) => r.some((f) => f.trim() !== ''));
  if (all.length === 0) return { ok: false, reason: 'no rows' };
  const header = all[0].map((h) => h.trim());
  const same =
    header.length === EXPECTED_HEADER.length &&
    header.every((h, i) => h === EXPECTED_HEADER[i]);
  if (!same) {
    return {
      ok: false,
      reason: `unexpected columns: ${JSON.stringify(header)}`,
    };
  }
  const rows = all.slice(1);
  if (rows.length === 0) return { ok: false, reason: 'header only, no records' };
  const bad = rows.findIndex((r) => r.length !== EXPECTED_HEADER.length);
  if (bad !== -1) {
    return {
      ok: false,
      reason: `record ${bad + 1} has ${rows[bad].length} fields, expected ${EXPECTED_HEADER.length}`,
    };
  }
  return { ok: true, header, rows };
}
