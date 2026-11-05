// Turn validated feed rows into recorded sites.
import { classifyWaste, isUnstated } from './materials.js';
import { searchKey, slug } from './translit.js';
import { severity } from './severity.js';

export const TYPE_CODES = {
  'Буниште': 'dumpsite',
  'Активна нестандардна': 'active',
  'Затворена нестандардна': 'closed',
};
export const TYPE_ORDER = ['dumpsite', 'active', 'closed'];

// Source abbreviations, so searching the full name also finds them.
const ALIASES = {
  'Мак. Брод': ['Македонски Брод'],
  'Маврово/Р.': ['Маврово и Ростуше', 'Маврово', 'Ростуше'],
  'Д. Хисар': ['Демир Хисар'],
};

const text = (v) => (isUnstated(v) ? null : String(v).trim());

/** Parse a stated number; unstated or unreadable values are unknown (null), never 0. */
export function parseNumber(v) {
  if (isUnstated(v)) return null;
  const s = String(v).trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}

function coordinate(latRaw, lonRaw) {
  const lat = parseNumber(latRaw);
  const lon = parseNumber(lonRaw);
  if (lat == null || lon == null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** @param {string[][]} rows feed rows without the header */
export function buildRecords(rows) {
  return rows.map((r, id) => {
    const [region, municipality, settlement, locality, latRaw, lonRaw,
      areaRaw, volumeRaw, typeRaw, wasteRaw, source, infoDate, note] = r;
    const coord = coordinate(latRaw, lonRaw);
    const waste = classifyWaste(wasteRaw);
    const type = text(typeRaw);
    const names = [settlement, locality, municipality]
      .map(text)
      .filter(Boolean)
      .flatMap((n) => [n, ...(ALIASES[n] || [])]);
    return {
      id,
      raw: r,
      region: text(region),
      regionCode: slug(text(region) || ''),
      municipality: text(municipality),
      municipalityCode: slug(text(municipality) || ''),
      settlement: text(settlement),
      locality: text(locality),
      lat: coord ? coord.lat : null,
      lon: coord ? coord.lon : null,
      located: Boolean(coord),
      area: parseNumber(areaRaw),
      volume: parseNumber(volumeRaw),
      type,
      typeCode: type ? TYPE_CODES[type] || slug(type) : 'unknown',
      wasteRaw: text(wasteRaw),
      waste,
      source: text(source),
      infoDate: text(infoDate),
      note: text(note),
      searchKeys: names.map(searchKey).join('|'),
    };
  }).map((rec) => ({ ...rec, severity: severity(rec) }));
}

/** Records that share their exact coordinate pair with another record. */
export function coincidentGroups(records) {
  const byKey = new Map();
  for (const r of records) {
    if (!r.located) continue;
    const k = `${r.lat},${r.lon}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r.id);
  }
  return [...byKey.values()].filter((ids) => ids.length > 1);
}
