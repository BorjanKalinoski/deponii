// Marker symbols. The fill colour shows severity (see severity.js); the
// pictogram inside shows the waste material, so the two never depend on
// colour alone.

export const ICON_KINDS = [
  'municipal', 'construction', 'bulky', 'industrial', 'bio', 'agricultural',
  'packaging', 'mixed', 'other', 'unknown',
];

// Neutral fill for symbols shown without a severity (legend, filters).
export const NEUTRAL = '#46545a';

const RIM = '#111a1c';

// Pictograms on a 24×24 grid, drawn with a round 2-unit stroke.
const GLYPHS = {
  // Waste bin with lid.
  municipal: '<path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12M10.5 10v6M13.5 10v6"/>',
  // Brick courses.
  construction: '<path d="M4 7h16v10H4zM4 12h16M10 7v5M15 12v5M8 12v5"/>',
  // Armchair.
  bulky: '<path d="M6 11V7h12v4M4 11h3v3h10v-3h3v6H4zM6 17v2M18 17v2"/>',
  // Factory with chimney.
  industrial: '<path d="M4 19V10l5 3v-3l5 3V5h3v14zM4 19h16"/>',
  // Leaf.
  bio: '<path d="M6 18c0-8 5-12 13-12 0 8-4 13-12 13M6 18l6-6"/>',
  // Ear of wheat.
  agricultural: '<path d="M12 20V6M12 9l-3-2M12 9l3-2M12 13l-3-2M12 13l3-2M12 17l-3-2M12 17l3-2M12 6V4"/>',
  // Box.
  packaging: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>',
  // Stacked layers.
  mixed: '<path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>',
  // Three dots.
  other: '<path d="M6.5 12h.01M12 12h.01M17.5 12h.01" stroke-width="3.2"/>',
  // Question mark.
  unknown: '<path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.5V14M12 18h.01"/>',
};

export const WHITE = '#ffffff';

// 14 equal dashes around the r=13.3 ring (circumference 83.57), so the dash
// pattern closes without a doubled dash.
const DASHES = '3.5 2.469';

/**
 * Marker as an SVG string: a disc in `color` with a white ring and the
 * material pictogram drawn in `ink`. `unknownSize` dashes the white ring, so a
 * site of unknown area keeps its colour but can't be mistaken for a small one.
 * A soft dark rim outside the white ring keeps every marker's edge visible on
 * a pale basemap; on a dark basemap the white ring does that job. A white
 * pictogram sits on a faint dark outline so it stays legible on pale fills.
 */
export function markerSvg(kind, { unknownSize = false, px = 64, color = NEUTRAL, ink = WHITE } = {}) {
  const glyph = GLYPHS[kind] || GLYPHS.unknown;
  const pictogram = (attrs) => `<g transform="translate(5.6 5.6) scale(0.867)" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${glyph}</g>`;
  const rim = `<circle cx="16" cy="16" r="15.8" fill="${RIM}" fill-opacity="0.55"/>`;
  const disc = unknownSize
    ? `<circle cx="16" cy="16" r="14.6" fill="${color}"/><circle cx="16" cy="16" r="13.3" fill="none" stroke="${WHITE}" stroke-width="2.6" stroke-dasharray="${DASHES}"/>`
    : `<circle cx="16" cy="16" r="13.3" fill="${color}" stroke="${WHITE}" stroke-width="2.4"/>`;
  const outline = ink.toLowerCase() === WHITE ? pictogram(`stroke="${RIM}" stroke-opacity="0.35" stroke-width="3.8"`) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${rim}${disc}${outline}${pictogram(`stroke="${ink}" stroke-width="2.2"`)}</svg>`;
}

export const MIN_AREA = 10;
export const MAX_AREA = 100000;
export const MIN_PX = 18;
export const MAX_PX = 48;
export const UNKNOWN_PX = 24;

/**
 * Marker diameter in CSS pixels for a recorded area. A fixed logarithmic
 * scale (not fitted to the current results) keeps sizes comparable as
 * filters change.
 */
export function markerPx(area) {
  if (area == null) return UNKNOWN_PX;
  const a = Math.min(MAX_AREA, Math.max(MIN_AREA, area));
  const t = (Math.log10(a) - Math.log10(MIN_AREA)) / (Math.log10(MAX_AREA) - Math.log10(MIN_AREA));
  return Math.round((MIN_PX + t * (MAX_PX - MIN_PX)) * 10) / 10;
}

export const imageName = (kind, unknownSize, level = 0) => `m-${kind}-${level}${unknownSize ? '-u' : ''}`;
