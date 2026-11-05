// Waste-material marker symbols. Each kind has its own pictogram as well as
// its own colour, so markers stay distinguishable without relying on colour.

export const ICON_KINDS = [
  'municipal', 'construction', 'bulky', 'industrial', 'bio', 'agricultural',
  'packaging', 'mixed', 'other', 'unknown',
];

export const COLORS = {
  municipal: '#2f6db0',
  construction: '#b4532f',
  bulky: '#7b4ea6',
  industrial: '#4b5560',
  bio: '#2f8547',
  agricultural: '#9a7a12',
  packaging: '#16807f',
  mixed: '#a8326e',
  other: '#7d6248',
  unknown: '#80868c',
};

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

/**
 * Marker as an SVG string. `unknownSize` draws the neutral "unknown size"
 * variant: a dashed ring on white, so it can't be mistaken for a small site.
 */
export function markerSvg(kind, { unknownSize = false, px = 64 } = {}) {
  const color = COLORS[kind] || COLORS.unknown;
  const glyph = GLYPHS[kind] || GLYPHS.unknown;
  const disc = unknownSize
    ? `<circle cx="16" cy="16" r="13.5" fill="#ffffff" stroke="${color}" stroke-width="2.5" stroke-dasharray="4.2 2.6"/>`
    : `<circle cx="16" cy="16" r="14" fill="${color}" stroke="#ffffff" stroke-width="2.2"/>`;
  const stroke = unknownSize ? color : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${disc}<g transform="translate(5.6 5.6) scale(0.867)" fill="none" stroke="${stroke}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}

export const MIN_AREA = 10;
export const MAX_AREA = 100000;
export const MIN_PX = 16;
export const MAX_PX = 46;
export const UNKNOWN_PX = 22;

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

export const imageName = (kind, unknownSize) => `m-${kind}${unknownSize ? '-u' : ''}`;
