// Severity: how alarming a recorded site looks on the map. A display scale
// derived only from the recorded area and the landfill type; it is not a
// measured environmental or health risk, and the legend says so.

export const SEVERITY_LEVELS = [1, 2, 3, 4];

// Area bands in m², upper bounds exclusive: <100, <1 000, <10 000, ≥10 000.
export const AREA_BANDS = [100, 1000, 10000];

// Amber → deep red. Readable with a white pictogram on top, in both themes.
export const SEVERITY_COLORS = {
  1: '#c98a00',
  2: '#e0620d',
  3: '#cc2f1f',
  4: '#8e0f22',
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
