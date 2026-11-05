// Severity: how alarming a recorded site looks on the map. A display scale
// derived only from the recorded area and the landfill type; it is not a
// measured environmental or health risk, and the legend says so.

export const SEVERITY_LEVELS = [1, 2, 3, 4];

// Area bands in m², upper bounds exclusive: <100, <1 000, <10 000, ≥10 000.
export const AREA_BANDS = [100, 1000, 10000];

// Amber → deep red, in both themes. No level is green or blue: every recorded
// site should read as a problem, the bigger and the active ones more so.
export const SEVERITY_COLORS = {
  1: '#c98a00',
  2: '#e0620d',
  3: '#cc2f1f',
  4: '#8e0f22',
};

// What is drawn on top of each fill (marker pictograms, cluster numbers):
// near-black on amber and orange, like a warning sign, and white on the reds.
// Each pair keeps at least 4.5:1 contrast (white on amber would be under 3:1).
const DARK_INK = '#1d1300';
export const SEVERITY_INK = {
  1: DARK_INK,
  2: DARK_INK,
  3: '#ffffff',
  4: '#ffffff',
};

// A thin halo behind cluster numbers, the opposite of the ink.
export const SEVERITY_HALO = {
  1: 'rgba(255, 255, 255, 0.45)',
  2: 'rgba(255, 255, 255, 0.4)',
  3: 'rgba(40, 6, 6, 0.55)',
  4: 'rgba(40, 6, 6, 0.55)',
};

export function areaBand(area) {
  if (area == null) return null;
  let band = 1;
  for (const limit of AREA_BANDS) if (area >= limit) band++;
  return band;
}

/**
 * 1 (lowest) to 4 (highest). Bigger recorded areas score higher; an active
 * non-compliant landfill (a site still receiving waste) scores one level up.
 * With no recorded area, active sites start at 3 and all others at 1, so an
 * unknown size never reads as "harmless".
 */
export function severity(rec) {
  const active = rec.typeCode === 'active';
  const band = areaBand(rec.area);
  if (band == null) return active ? 3 : 1;
  return Math.min(4, band + (active ? 1 : 0));
}
