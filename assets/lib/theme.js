// Light and dark themes: which one applies, and how the map is coloured in each.
// The page's own colours live in CSS tokens (assets/styles.css); this holds only
// what the map needs, because MapLibre paints with colour values, not CSS.

export const THEMES = ['light', 'dark'];
export const THEME_KEY = 'deponii-theme';

/** The visitor's own choice when they made one, otherwise their system setting. */
export function resolveTheme(stored, systemDark) {
  return THEMES.includes(stored) ? stored : systemDark ? 'dark' : 'light';
}

// Browser UI colour (<meta name="theme-color">): the top bar's surface.
export const THEME_COLOR = { light: '#ffffff', dark: '#161c1e' };

const OPENFREEMAP_STYLES = 'https://tiles.openfreemap.org/styles/';

// Colours of the map's own layers (clusters, selection ring) per theme. The
// selection ring is a neutral two-tone (dark on light casing, or the reverse)
// so it reads against any marker fill, whatever the fill encodes.
// `positron` keeps the light map quiet so the waste colours carry; `dark` is
// neutral near-black, so every marker hue keeps its contrast (the blue-grey
// `fiord` would swallow the blue and teal markers).
export const MAP_THEMES = {
  light: {
    style: `${OPENFREEMAP_STYLES}positron`,
    cluster: '#0e6655',
    clusterStroke: '#ffffff',
    clusterText: '#ffffff',
    clusterGlow: 'rgba(14, 102, 85, 0.22)',
    selected: '#172022',
    selectedCasing: '#ffffff',
  },
  dark: {
    style: `${OPENFREEMAP_STYLES}dark`,
    cluster: '#13715e',
    clusterStroke: '#e8eeec',
    clusterText: '#ffffff',
    clusterGlow: 'rgba(84, 201, 173, 0.28)',
    selected: '#ffffff',
    selectedCasing: '#0c0c0c',
  },
};

// Basemap adjustments, matched by what a layer draws (OpenMapTiles source
// layers), not by layer id, so they hold across styles and style updates.
const BASEMAP = {
  light: {
    water: '#b9cfd9',
    borderCountry: '#7b8682',
    borderOther: '#a7b0ac',
    placeMajor: '#222c2f',
    placeTown: '#364245',
    placeMinor: '#515d61',
    placeHalo: 'rgba(255, 255, 255, 0.92)',
  },
  dark: {
    water: '#15242d',
    borderCountry: '#7d8884',
    borderOther: '#495350',
    placeMajor: '#e6ecea',
    placeTown: '#c8d0cd',
    placeMinor: '#a2adaa',
    placeHalo: 'rgba(10, 12, 12, 0.9)',
  },
};

/**
 * Paint properties to set on one basemap layer for a theme, as [property, value]
 * pairs; empty when the layer is left as the style draws it.
 */
export function basemapPaint(layer, theme) {
  const c = BASEMAP[theme];
  if (!c || !layer || !layer['source-layer']) return [];
  const src = layer['source-layer'];
  if (src === 'water' && layer.type === 'fill') return [['fill-color', c.water]];
  if (src === 'boundary' && layer.type === 'line') {
    return [['line-color', ['case', ['<=', ['to-number', ['get', 'admin_level'], 10], 2], c.borderCountry, c.borderOther]]];
  }
  if (src === 'place' && layer.type === 'symbol') {
    return [
      ['text-color', ['match', ['get', 'class'], ['country', 'state', 'city'], c.placeMajor, 'town', c.placeTown, c.placeMinor]],
      ['text-halo-color', c.placeHalo],
      ['text-halo-width', 1.4],
    ];
  }
  return [];
}
