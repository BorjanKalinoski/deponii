// Colour checks shared by the unit tests (test/) and the end-to-end tests.
// Kept out of test/ because `node --test` runs every file in that folder.

/** '#rrggbb', '#rgb', 'rgb(…)' or 'rgba(…)' → [r, g, b, a] (0–255, alpha 0–1); null if not a colour. */
export function parseColour(text) {
  const s = String(text).trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  return null;
}

/** Hue (0–360), saturation and value (0–1) of an RGB colour. */
export function hsv([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}

/**
 * True for a colour a visitor would call green (or teal): a green hue with
 * real saturation and some brightness, and not almost transparent. Near-greys
 * with a faint green cast (like a pale basemap) don't count.
 */
export function isGreenish(colour) {
  const c = typeof colour === 'string' ? parseColour(colour) : colour;
  if (!c || (c[3] ?? 1) < 0.1) return false;
  const { h, s, v } = hsv(c);
  return h >= 75 && h <= 185 && s >= 0.25 && v >= 0.2;
}

/** Every colour literal (#hex, rgb(), rgba()) inside a string, e.g. a JSON paint spec. */
export function colourLiterals(text) {
  return String(text).match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)/gi) || [];
}

/** WCAG relative luminance. */
export function luminance(colour) {
  const c = typeof colour === 'string' ? parseColour(colour) : colour;
  const lin = (x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio between two opaque colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
