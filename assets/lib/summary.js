// The summary above the list: the totals of the recorded area and volume for
// the sites in the list, and how few of the largest sites hold more than half
// of each total. Only stated values are added up; unknown ones are counted
// apart and never treated as 0 (CONTEXT.md: recorded area, recorded volume).
import { sortRecords } from './filters.js';

/** With fewer stated values than this, "the N largest hold more than half" says nothing. */
export const MIN_FOR_SHARE = 3;
/** The largest sites are named only when this many or fewer hold more than half. */
export const MAX_NAMED = 3;

/**
 * One measure ('area' or 'volume') over a set of recorded sites:
 * - known: how many of the sites state it (a stated 0 counts)
 * - total: the sum of the stated values, or null when none is stated
 * - overHalf: the fewest of the largest sites that together hold more than all
 *   the others (exactly half is not more); null with fewer than MIN_FOR_SHARE
 *   stated values or a total of 0
 * - leaders: those sites, largest first and in the list's order, when there
 *   are at most MAX_NAMED of them; otherwise none
 */
export function measureSummary(records, key) {
  const known = sortRecords(records.filter((r) => r[key] != null), key);
  const total = known.reduce((sum, r) => sum + r[key], 0);
  let overHalf = null;
  if (known.length >= MIN_FOR_SHARE && total > 0) {
    let top = 0;
    for (let i = 0; i < known.length; i++) {
      top += known[i][key];
      // The tolerance keeps rounding noise in decimal sums from turning an exact tie into a majority.
      if (top - (total - top) > total * 1e-12) { overHalf = i + 1; break; }
    }
  }
  return {
    known: known.length,
    total: known.length ? total : null,
    overHalf,
    leaders: overHalf != null && overHalf <= MAX_NAMED ? known.slice(0, overHalf) : [],
  };
}

/** The summary of the sites in the list: how many, and both measures. */
export function summarize(records) {
  return {
    count: records.length,
    area: measureSummary(records, 'area'),
    volume: measureSummary(records, 'volume'),
  };
}
