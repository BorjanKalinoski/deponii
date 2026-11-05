// Interface text and translations of the source's recurring values.
// The country is "Macedonia" / "Македонија" in every language.
import { toLatin } from './translit.js';
import { isUnstated } from './materials.js';

export const UI = {
  mk: {
    title: 'Депонии во Македонија',
    tagline: 'Евидентирани диви депонии од инвентарот. Не е целосен попис ниту теренски потврдени локации.',
    search: 'Барај населено место, локалитет или општина',
    searchLabel: 'Пребарување',
    filters: 'Филтри',
    region: 'Регион',
    regionSuffix: 'регион',
    skopjeShortcut: 'Пошироко Скопје (Скопски регион)',
    municipality: 'Општина',
    municipalitySearch: 'Најди општина',
    type: 'Вид на депонија',
    material: 'Тип на отпад',
    area: 'Површина (m²)',
    min: 'од',
    max: 'до',
    areaNote: 'Со опсег се прикажуваат само локации со позната површина.',
    any: 'Сите',
    sortBy: 'Подреди',
    sortArea: 'Најголема површина прво',
    sortVolume: 'Најголем волумен прво',
    counts: (t, l, u) => `${fmtInt(t, 'mk')} ${t === 1 ? 'евидентирана локација' : 'евидентирани локации'} · ${fmtInt(l, 'mk')} на мапата · ${fmtInt(u, 'mk')} без локација`,
    reset: 'Ресетирај',
    empty: 'Нема евидентирани локации што одговараат на избраните филтри.',
    searchArea: 'Барај во ова подрачје',
    areaActive: 'Само во видливото подрачје на мапата',
    clear: 'Отстрани',
    map: 'Мапа',
    list: 'Листа',
    details: 'Детали',
    close: 'Затвори',
    unknown: 'непознато',
    regionL: 'Регион',
    municipalityL: 'Општина',
    settlementL: 'Населено место',
    localityL: 'Локалитет',
    coordinatesL: 'Координати',
    areaL: 'Површина',
    volumeL: 'Волумен',
    typeL: 'Вид на депонија',
    wasteL: 'Доминантен отпад (според изворот)',
    sourceL: 'Извор на информацијата',
    dateL: 'Датум на информацијата',
    noteL: 'Забелешка за локацијата',
    noLocation: 'Локацијата не е позната, па записот не е прикажан на мапата.',
    coordAsRecorded: 'Координатите се прикажани како што се евидентирани; не се независно проверени.',
    googleMaps: 'Отвори ја локацијата во Google Maps',
    lastUpdate: (t) => `Податоците последно ажурирани: ${t}`,
    snapshot: (t) => `Снимка на податоците од ${t}; автоматското ажурирање уште не е потврдено.`,
    dateNote: 'Датумот на информацијата за секој запис е посебен и не значи дека локацијата е проверена тогаш.',
    unavailable: 'Податоците моментално не се достапни. Обидете се повторно подоцна.',
    loading: 'Се вчитуваат податоците…',
    legend: 'Легенда',
    legendSize: 'Големината ја покажува евидентираната површина',
    unknownSize: 'Непозната површина',
    clusterNote: 'Бројот во кругот е број на евидентирани локации',
    symbolNote: 'Маркерите се симболи, не граници на депонијата.',
    copyLink: 'Копирај линк',
    copied: 'Линкот е копиран',
    here: (n) => `${n} записи на ова место`,
    lang: 'English',
    langCode: 'en',
    m2: 'm²',
    m3: 'm³',
    hideLegend: 'Скриј легенда',
    showLegend: 'Легенда',
    skipToList: 'Прескокни до листата',
    showResults: (n) => `Прикажи ${fmtInt(n, 'mk')} ${n === 1 ? 'локација' : 'локации'}`,
    mapLabel: 'Мапа на евидентираните локации',
    viewSwitch: 'Мапа или листа',
    areaRange: (a, b) => `Површина ${a ?? '…'}–${b ?? '…'} m²`,
    noData: 'Нема податоци',
    mapFailed: 'Мапата не можеше да се вчита. Листата и пребарувањето работат.',
  },
  en: {
    title: 'Wild landfills in Macedonia',
    tagline: 'Recorded wild landfills from the inventory. Not a complete census or field-verified locations.',
    search: 'Search settlement, locality or municipality',
    searchLabel: 'Search',
    filters: 'Filters',
    region: 'Region',
    regionSuffix: 'region',
    skopjeShortcut: 'Wider Skopje (Skopje region)',
    municipality: 'Municipality',
    municipalitySearch: 'Find a municipality',
    type: 'Landfill type',
    material: 'Waste material',
    area: 'Area (m²)',
    min: 'min',
    max: 'max',
    areaNote: 'A range shows only sites with a known area.',
    any: 'All',
    sortBy: 'Sort',
    sortArea: 'Largest area first',
    sortVolume: 'Largest volume first',
    counts: (t, l, u) => `${fmtInt(t, 'en')} recorded ${t === 1 ? 'site' : 'sites'} · ${fmtInt(l, 'en')} on the map · ${fmtInt(u, 'en')} without location`,
    reset: 'Reset',
    empty: 'No recorded sites match these filters.',
    searchArea: 'Search this area',
    areaActive: 'Only within the visible map area',
    clear: 'Remove',
    map: 'Map',
    list: 'List',
    details: 'Details',
    close: 'Close',
    unknown: 'unknown',
    regionL: 'Region',
    municipalityL: 'Municipality',
    settlementL: 'Settlement',
    localityL: 'Locality',
    coordinatesL: 'Coordinates',
    areaL: 'Area',
    volumeL: 'Volume',
    typeL: 'Landfill type',
    wasteL: 'Dominant waste (as recorded)',
    sourceL: 'Information source',
    dateL: 'Information date',
    noteL: 'Location note',
    noLocation: 'Location unknown, so this record is not shown on the map.',
    coordAsRecorded: 'Coordinates are shown as recorded; they have not been independently verified.',
    googleMaps: 'Open the location in Google Maps',
    lastUpdate: (t) => `Data last updated: ${t}`,
    snapshot: (t) => `Data snapshot from ${t}; automatic updates are not yet confirmed.`,
    dateNote: 'Each record has its own information date; it does not mean the site was inspected then.',
    unavailable: 'The data is not available right now. Please try again later.',
    loading: 'Loading the data…',
    legend: 'Legend',
    legendSize: 'Size shows the recorded area',
    unknownSize: 'Unknown area',
    clusterNote: 'The number in a circle counts recorded sites',
    symbolNote: 'Markers are symbols, not landfill boundaries.',
    copyLink: 'Copy link',
    copied: 'Link copied',
    here: (n) => `${n} records at this spot`,
    lang: 'Македонски',
    langCode: 'mk',
    m2: 'm²',
    m3: 'm³',
    hideLegend: 'Hide legend',
    showLegend: 'Legend',
    skipToList: 'Skip to the list',
    showResults: (n) => `Show ${fmtInt(n, 'en')} ${n === 1 ? 'site' : 'sites'}`,
    mapLabel: 'Map of recorded sites',
    viewSwitch: 'Map or list',
    areaRange: (a, b) => `Area ${a ?? '…'}–${b ?? '…'} m²`,
    noData: 'No data',
    mapFailed: 'The map could not load. The list and search still work.',
  },
};

export const MATERIAL_LABELS = {
  mk: {
    municipal: 'Комунален', construction: 'Градежен', bulky: 'Кабаст', industrial: 'Индустриски',
    bio: 'Био-отпад', agricultural: 'Земјоделски', packaging: 'Пакување',
    mixed: 'Мешан', other: 'Друг (некласифициран)', unknown: 'Непознат отпад',
  },
  en: {
    municipal: 'Municipal', construction: 'Construction', bulky: 'Bulky', industrial: 'Industrial',
    bio: 'Bio-waste', agricultural: 'Agricultural', packaging: 'Packaging',
    mixed: 'Mixed', other: 'Other (unclassified)', unknown: 'Unknown waste',
  },
};

export const TYPE_LABELS = {
  mk: { dumpsite: 'Буниште', active: 'Активна нестандардна', closed: 'Затворена нестандардна' },
  en: { dumpsite: 'Dumpsite', active: 'Active non-compliant landfill', closed: 'Closed non-compliant landfill' },
};

const REGIONS_EN = {
  'Вардарски': 'Vardar', 'Источен': 'Eastern', 'Југозападен': 'Southwestern',
  'Југоисточен': 'Southeastern', 'Пелагониски': 'Pelagonia', 'Полошки': 'Polog',
  'Североисточен': 'Northeastern', 'Скопски': 'Skopje',
};

// Verified translations of the source's recurring wording.
const PHRASES_EN = {
  'Комунален и градежен': 'Municipal and construction',
  'Градежен и комунален': 'Construction and municipal',
  'Градежен шут': 'Construction rubble',
  'Комунален и кабаст': 'Municipal and bulky',
  'Градежен и кабаст': 'Construction and bulky',
  'Комунален отпад': 'Municipal waste',
  'Комунален и пакување': 'Municipal and packaging',
  'Комунален и земјоделски': 'Municipal and agricultural',
  'Комунален и био-отпад': 'Municipal and bio-waste',
  'Градежен и индустриски': 'Construction and industrial',
  'Мешан комунален': 'Mixed municipal',
  'координатите се апроксимирани од описот на локацијата':
    'Coordinates approximated from the location description',
  'непроверено и непознати координати': 'Unverified; coordinates unknown',
  'МЖСПП': 'Ministry of Environment and Physical Planning',
  'Интернет': 'Internet',
  'Граѓани': 'Citizens',
};

const caseless = Object.fromEntries(Object.entries(PHRASES_EN).map(([k, v]) => [k.toLowerCase(), v]));

/** A source place name in the visitor's language: Cyrillic, or Latin script. */
export function placeName(raw, lang) {
  if (raw == null) return null;
  return lang === 'en' ? toLatin(raw) : raw;
}

export function regionName(raw, lang) {
  if (raw == null) return null;
  if (lang === 'en') return REGIONS_EN[raw] || toLatin(raw);
  return raw;
}

/**
 * A source phrase (waste description, note, source) in the visitor's language.
 * English uses a verified translation when one exists; otherwise the
 * transliterated original, flagged so the details can show the Cyrillic too.
 */
export function phrase(raw, lang) {
  if (raw == null || isUnstated(raw)) return { text: null, translated: false };
  if (lang !== 'en') return { text: raw, translated: true };
  const exact = caseless[raw.trim().toLowerCase()];
  if (exact) return { text: exact, translated: true };
  // Composite sources such as "Интернет, Призма" or "Општина Аеродром".
  const parts = raw.split(/\s*,\s*/).map((part) => {
    const known = caseless[part.toLowerCase()];
    if (known) return { text: known, ok: true };
    const m = part.match(/^Општина\s+(.+)$/);
    if (m) return { text: `Municipality of ${toLatin(m[1])}`, ok: true };
    return { text: toLatin(part), ok: false };
  });
  return { text: parts.map((p) => p.text).join(', '), translated: parts.every((p) => p.ok) };
}

// Numbers and dates are formatted here rather than with the browser's locale
// data, which is missing for Macedonian in some browsers.
function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}

export function fmtInt(n, lang) {
  return fmtNumber(Math.round(n), lang);
}

export function fmtNumber(n, lang) {
  const neg = n < 0;
  const [i, f] = String(Math.round(Math.abs(n) * 100) / 100).split('.');
  const dec = lang === 'en' ? '.' : ',';
  return (neg ? '-' : '') + group(i) + (f ? dec + f : '');
}

const MONTHS = {
  mk: ['јануари', 'февруари', 'март', 'април', 'мај', 'јуни', 'јули', 'август', 'септември', 'октомври', 'ноември', 'декември'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** Date and time in Skopje, e.g. "5 ноември 2026, 20:24". */
export function fmtDateTime(iso, lang) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Skopje', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const month = MONTHS[lang === 'en' ? 'en' : 'mk'][Number(parts.month) - 1];
  return `${Number(parts.day)} ${month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}
