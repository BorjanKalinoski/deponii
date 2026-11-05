// Waste materials, derived only from what a dominant-waste description states.

export const MATERIALS = [
  'municipal',
  'construction',
  'bulky',
  'industrial',
  'bio',
  'agricultural',
  'packaging',
];

// Word stems in the source's Macedonian wording. Matching on stems handles
// word order ("Комунален и градежен" = "Градежен и комунален") and endings.
const STEMS = {
  municipal: /комунал/,
  construction: /градеж|шут/,
  bulky: /кабаст/,
  industrial: /индустри/,
  bio: /био/,
  agricultural: /земјодел/,
  packaging: /пакув|амбалаж/,
};
const MIXED_WORD = /мешан/;

/** True when the source left the value unstated ("", "/", "-"). */
export function isUnstated(value) {
  if (value == null) return true;
  const v = String(value).trim();
  return v === '' || /^[\/\-–—?]+$/.test(v);
}

/**
 * Classify a dominant-waste description.
 * - unknown: nothing stated
 * - other: stated, but no recognised material (kept honest, never guessed)
 * - mixed: names two or more materials, or calls itself mixed
 * `icon` is what the marker shows: 'unknown' | 'other' | 'mixed' | a material.
 */
export function classifyWaste(raw) {
  if (isUnstated(raw)) {
    return { unknown: true, other: false, mixed: false, materials: [], icon: 'unknown' };
  }
  const text = String(raw).toLowerCase();
  const materials = MATERIALS.filter((m) => STEMS[m].test(text));
  const mixed = materials.length >= 2 || MIXED_WORD.test(text);
  const other = materials.length === 0;
  const icon = mixed ? 'mixed' : other ? 'other' : materials[0];
  return { unknown: false, other, mixed, materials, icon };
}
