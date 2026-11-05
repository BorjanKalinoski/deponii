// Macedonian Cyrillic → Latin, and the folding used for search.

// Official Macedonian romanisation (with diacritics), used for display.
const TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ѓ: 'ǵ', е: 'e', ж: 'ž', з: 'z', ѕ: 'dz',
  и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', ќ: 'ḱ', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž',
  ш: 'š',
  // Letters from neighbouring Cyrillic alphabets that occasionally appear.
  ђ: 'đ', ћ: 'ć', й: 'j', ы: 'y', э: 'e', ю: 'ju', я: 'ja', щ: 'št', ъ: '', ь: '',
};

/** Transliterate Macedonian Cyrillic to Latin, keeping capitalisation. */
export function toLatin(text) {
  if (text == null) return text;
  let out = '';
  for (const ch of String(text)) {
    const lower = ch.toLowerCase();
    const mapped = TO_LATIN[lower];
    if (mapped === undefined) { out += ch; continue; }
    if (ch !== lower && mapped.length) {
      out += mapped[0].toUpperCase() + mapped.slice(1);
    } else out += mapped;
  }
  return out;
}

// Search folding: every way of writing a sound collapses to one plain letter,
// so "Кичево", "Kičevo", "Kichevo" and "Kicevo" all fold to "kicevo".
const CYR_TO_KEY = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ѓ: 'g', е: 'e', ж: 'z', з: 'z', ѕ: 'dz',
  и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'l', м: 'm', н: 'n', њ: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', ќ: 'k', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz',
  ш: 's', ђ: 'g', ћ: 'k', й: 'j',
};
const LATIN_DIGRAPHS = [
  ['dzh', 'dz'], ['zh', 'z'], ['sh', 's'], ['ch', 'c'], ['gj', 'g'], ['kj', 'k'],
  ['lj', 'l'], ['nj', 'n'], ['đ', 'g'], ['ć', 'k'],
];

/** Fold text for matching: case, script, diacritics, spaces and punctuation. */
export function searchKey(text) {
  if (text == null) return '';
  let s = String(text).toLowerCase();
  s = [...s].map((ch) => CYR_TO_KEY[ch] ?? ch).join('');
  for (const [from, to] of LATIN_DIGRAPHS) s = s.split(from).join(to);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s.replace(/[^a-z0-9]+/g, '');
}

/** A stable URL-safe code for a name, e.g. "Мак. Брод" → "mak-brod". */
export function slug(text) {
  return toLatin(String(text ?? ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
