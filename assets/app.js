// Deponii: map and list of recorded wild landfills in Macedonia.
import { validateFeed } from './lib/feed.js';
import { buildRecords, TYPE_ORDER } from './lib/records.js';
import { MATERIALS } from './lib/materials.js';
import {
  applyFilters, sortRecords, countRecords, hasActiveFilters, isAreaRangeActive, emptyState,
  dropUnknownChoices, activeFilterCount, boundsForView,
} from './lib/filters.js';
import { toQuery, fromQuery } from './lib/urlstate.js';
import { summarize } from './lib/summary.js';
import {
  UI, MATERIAL_LABELS, TYPE_LABELS, placeName, regionName, phrase, fmtNumber, fmtDateTime,
} from './lib/i18n.js';
import { searchKey } from './lib/translit.js';
import { ICON_KINDS, markerSvg, markerPx, imageName, MIN_PX, MAX_PX, UNKNOWN_PX, NEUTRAL } from './lib/icons.js';
import { SEVERITY_COLORS, SEVERITY_INK, SEVERITY_HALO, SEVERITY_LEVELS } from './lib/severity.js';
import { THEME_KEY, THEME_COLOR, MAP_THEMES, resolveTheme, basemapPaint } from './lib/theme.js';

const MK_BOUNDS = [[20.45, 40.84], [23.04, 42.38]];
const FOLLOW_DELAY = 1000; // ms after the map stops before the list follows it
const SKOPJE_REGION = 'skopski';
const CLUSTER_MAX_ZOOM = 11;
const SELECT_ZOOM = 13;
const PIN_ZOOM = 15; // close enough that the site is never inside a cluster

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;
// Phones show either the map or the list; wider screens always show both.
const mapVisible = () => !isPhone() || $('.layout').dataset.view === 'map';

const initial = fromQuery(location.search);
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}
function storeTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: the choice lasts this visit */ }
}
const app = {
  theme: resolveTheme(storedTheme(), darkQuery?.matches),
  lang: initial.lang,
  state: initial.state,
  records: [],
  byId: new Map(),
  filtered: [],
  onMap: [], // the filtered records before the map-area limit: what the map draws
  meta: null,
  dataStatus: 'loading', // loading | ready | unavailable
  selectedId: null,
  map: null,
  mapReady: false,
  mapLoadedOnce: false,
  styleGen: 0, // counts basemap loads, so a superseded one stops adding layers
  popup: null,
  pulse: null, // the temporary pulsing ring from pinpoint()
  followTimer: null, // pending list-follows-map update after the visitor moves the map
  // Open only where the map is wide enough that the legend won't cover the country.
  legendOpen: window.innerWidth - 400 >= 900,
  muniFilter: '',
  lastFocus: null,
};
const t = () => UI[app.lang];
const iconUrl = new Map();
// `level` is the site's severity (1–4); 0 draws the neutral symbol used where
// only the waste material matters (filters, the legend's material list).
function iconSrc(kind, unknownSize = false, level = 0) {
  const key = imageName(kind, unknownSize, level);
  if (!iconUrl.has(key)) {
    const style = level ? { color: SEVERITY_COLORS[level], ink: SEVERITY_INK[level] } : { color: NEUTRAL };
    iconUrl.set(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markerSvg(kind, { unknownSize, ...style })));
  }
  return iconUrl.get(key);
}

/* ---------- Data ---------- */

async function loadData() {
  try {
    const [csvRes, metaRes] = await Promise.all([
      fetch('data/map-data.csv', { cache: 'no-cache' }),
      fetch('data/meta.json', { cache: 'no-cache' }),
    ]);
    if (!csvRes.ok) throw new Error(`data HTTP ${csvRes.status}`);
    const text = await csvRes.text();
    const feed = validateFeed(text, csvRes.headers.get('content-type') || 'text/csv');
    if (!feed.ok) throw new Error(feed.reason);
    app.meta = metaRes.ok ? await metaRes.json() : null;
    app.records = buildRecords(feed.rows);
    app.byId = new Map(app.records.map((r) => [r.id, r]));
    app.state = dropUnknownChoices(app.state, app.records);
    app.dataStatus = 'ready';
  } catch (err) {
    console.error('Data unavailable:', err);
    app.dataStatus = 'unavailable';
  }
  renderFilters();
  update({ fit: hasActiveFilters(app.state) && !initial.view ? 'results' : null });
}

/* ---------- State changes ---------- */

function update({ fit = null } = {}) {
  app.onMap = applyFilters(app.records, { ...app.state, bounds: null });
  app.filtered = sortRecords(applyFilters(app.records, app.state), app.state.sort);
  // Panning away from the open site doesn't close it; changing the filters does.
  if (app.selectedId != null && !app.onMap.some((r) => r.id === app.selectedId)) closeDetails();
  renderChips();
  renderList();
  renderSummary();
  renderStatus();
  syncFilterInputs();
  updateMap();
  if (fit === 'results') fitToResults();
  writeUrl();
}

function writeUrl() {
  const view = app.mapLoadedOnce
    ? { lng: app.map.getCenter().lng, lat: app.map.getCenter().lat, zoom: app.map.getZoom() }
    : initial.view;
  const q = toQuery({ state: app.state, lang: app.lang, view });
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

function toggleInSet(set, value, on) {
  if (on) set.add(value); else set.delete(value);
}

function resetAll() {
  const sort = app.state.sort;
  app.state = emptyState();
  app.state.sort = sort;
  $('#q').value = '';
  app.muniFilter = '';
  renderFilters();
  update();
  if (app.mapReady) app.map.fitBounds(MK_BOUNDS, { padding: 24, duration: 600 });
}

/* ---------- Static text ---------- */

function renderStaticText() {
  const s = t();
  document.documentElement.lang = app.lang;
  document.title = s.title;
  $('#title').textContent = s.title;
  $('#tagline').textContent = s.tagline;
  $('#copy-link-label').textContent = s.copyLink;
  $('#copy-link').setAttribute('aria-label', s.copyLink);
  // The button names the other language; phones show its short form.
  const lt = $('#lang-toggle');
  lt.innerHTML = `<span class="lang-long">${esc(s.lang)}</span><span class="lang-short" aria-hidden="true">${esc(s.langShort)}</span>`;
  lt.setAttribute('aria-label', s.lang);
  lt.lang = s.langCode;
  renderThemeToggle();
  $('#q-label').textContent = s.searchLabel;
  $('#q').placeholder = s.search;
  $('#filters-label').textContent = s.filters;
  $('#filters-title').textContent = s.filters;
  $('#sort-label').textContent = s.sortBy;
  $('#sort').options[0].textContent = s.sortArea;
  $('#sort').options[1].textContent = s.sortVolume;
  $('#empty-text').textContent = s.empty;
  document.querySelectorAll('[data-action="reset"]').forEach((b) => { b.textContent = s.reset; });
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = s[el.dataset.t]; });
  $('#map-wrap').setAttribute('aria-label', s.mapLabel);
  $('.view-switch').setAttribute('aria-label', s.viewSwitch);
  $('#date-note').textContent = s.dateNote;
  renderLegend();
}

/* ---------- Theme ---------- */

// The button names the theme it switches to.
function renderThemeToggle() {
  const label = app.theme === 'dark' ? t().themeLight : t().themeDark;
  const btn = $('#theme-toggle');
  $('#theme-toggle-label').textContent = label;
  btn.title = label;
}

function applyTheme(theme, { remember = false } = {}) {
  const changed = theme !== app.theme;
  app.theme = theme;
  document.documentElement.dataset.theme = theme;
  if (remember) storeTheme(theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = THEME_COLOR[theme]; });
  renderThemeToggle();
  if (changed) restyleMap();
}

/* ---------- Status / counts ---------- */

function renderStatus() {
  const s = t();
  const c = countRecords(app.filtered);
  const counts = $('#counts');
  const status = $('#status');
  if (app.dataStatus === 'loading') {
    counts.textContent = s.loading;
  } else if (app.dataStatus === 'unavailable') {
    counts.textContent = s.noData;
  } else {
    // Lines break only between the three counts, never inside one.
    const text = s.counts(c.total, c.located, c.unlocated).split(' · ').map((part) => part.replace(/ /g, '\u00a0')).join(' · ');
    counts.innerHTML = esc(text).replace(/^([\d\u202f.,]+)/, '<strong>$1</strong>');
  }
  status.hidden = app.dataStatus !== 'unavailable';
  status.textContent = s.unavailable;
  // Phones open on the map, where the list's message can't be seen.
  $('#data-error').hidden = app.dataStatus !== 'unavailable';
  $('#data-error').textContent = s.unavailable;

  const last = $('#last-update');
  if (app.meta?.checkedAt) {
    const when = fmtDateTime(app.meta.checkedAt, app.lang);
    last.textContent = app.meta.source === 'snapshot' ? s.snapshot(when) : s.lastUpdate(when);
  } else last.textContent = '';

  $('#empty').hidden = !(app.dataStatus === 'ready' && app.filtered.length === 0);
  $('#filters-done').textContent = s.showResults(c.total);

  const active = activeFilterCount(app.state);
  const badge = $('#filters-badge');
  badge.hidden = active === 0;
  badge.textContent = String(active);
}

/* ---------- List ---------- */

function recordTitle(r) {
  const parts = [placeName(r.settlement, app.lang), placeName(r.locality, app.lang)].filter(Boolean);
  return parts.length ? parts.join(' · ') : placeName(r.municipality, app.lang) || t().unknown;
}

function measure(v, unit) {
  return v == null ? `<span class="unk">${esc(t().unknown)}</span>` : `${esc(fmtNumber(v, app.lang))} ${unit}`;
}

function renderList() {
  const s = t();
  const html = app.filtered.map((r) => {
    const place = [placeName(r.municipality, app.lang), regionName(r.region, app.lang)].filter(Boolean).join(', ');
    const type = TYPE_LABELS[app.lang][r.typeCode] || placeName(r.type, app.lang) || s.unknown;
    const kind = MATERIAL_LABELS[app.lang][r.waste.icon];
    const tags = [`<span class="tag">${esc(type)}</span>`, `<span class="tag">${esc(kind)}</span>`];
    if (!r.located) tags.push(`<span class="tag tag-warn">${esc(s.noLocation.split(/[,.]/)[0])}</span>`);
    return `<li class="item"><button type="button" data-id="${r.id}" aria-current="${r.id === app.selectedId}">
      <img src="${iconSrc(r.waste.icon, r.area == null, r.severity)}" alt="">
      <span class="item-name">${esc(recordTitle(r))}<span class="item-place">${esc(place)}</span></span>
      <span class="item-nums">${measure(r.area, s.m2)}<br>${measure(r.volume, s.m3)}</span>
      <span class="item-tags">${tags.join('')}</span>
    </button></li>`;
  }).join('');
  $('#list').innerHTML = html;
}

/* ---------- Summary ---------- */

// Totals for the sites in the list (filters and the map-area limit included),
// from stated values only, with how many sites state them. A single site needs
// no summary: its own numbers are right below.
function renderSummary() {
  const s = t();
  const box = $('#summary');
  const sum = summarize(app.filtered);
  box.hidden = app.dataStatus !== 'ready' || sum.count < 2;
  if (box.hidden) return;
  $('#summary-title').textContent = s.summary;
  const tile = (label, m, unit, known, half) => {
    const value = m.total == null ? `<span class="unk">${esc(s.unknown)}</span>` : `${esc(fmtNumber(m.total, app.lang))} ${unit}`;
    let share = '';
    if (m.overHalf != null) {
      // Named as in the list; each name keeps its comma or full stop on its line.
      const names = m.leaders.map((r, i) =>
        `<span class="sum-name"><button type="button" class="linkish" data-action="select-site" data-id="${r.id}">${esc(recordTitle(r))}</button>${i === m.leaders.length - 1 ? '.' : ','}</span>`).join(' ');
      share = `<p class="sum-share">${esc(half(m.overHalf, m.known, sum.count))}${names ? `: ${names}` : '.'}</p>`;
    }
    return `<div class="sum-tile"><dt>${esc(label)}</dt><dd><span class="sum-value">${value}</span><span class="sum-known">${esc(known(m.known, sum.count))}</span>${share}</dd></div>`;
  };
  $('#summary-body').innerHTML =
    tile(s.totalArea, sum.area, s.m2, s.areaKnown, s.areaHalf) +
    tile(s.totalVolume, sum.volume, s.m3, s.volumeKnown, s.volumeHalf);
}

function markListSelection() {
  document.querySelectorAll('#list button[data-id]').forEach((b) => {
    b.setAttribute('aria-current', String(Number(b.dataset.id) === app.selectedId));
  });
}

/* ---------- Chips ---------- */

function chip(label, action, value) {
  return `<button type="button" class="chip" data-chip="${action}" data-value="${esc(value)}"><span>${esc(label)}</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg><span class="sr-only">${esc(t().clear)}</span></button>`;
}

function renderChips() {
  const s = t();
  const st = app.state;
  const out = [];
  const regionLabel = (code) => {
    const r = app.records.find((x) => x.regionCode === code);
    return r ? `${regionName(r.region, app.lang)} ${s.regionSuffix}` : code;
  };
  const muniLabel = (code) => {
    const r = app.records.find((x) => x.municipalityCode === code);
    return r ? placeName(r.municipality, app.lang) : code;
  };
  st.regions.forEach((c) => out.push(chip(regionLabel(c), 'region', c)));
  st.municipalities.forEach((c) => out.push(chip(muniLabel(c), 'municipality', c)));
  st.types.forEach((c) => out.push(chip(TYPE_LABELS[app.lang][c] || c, 'type', c)));
  st.materials.forEach((c) => out.push(chip(MATERIAL_LABELS[app.lang][c] || c, 'material', c)));
  [...st.severity].sort().reverse().forEach((c) => out.push(chip(s.severityLevels[c], 'severity', c)));
  if (isAreaRangeActive(st)) {
    out.push(chip(s.areaRange(st.areaMin != null ? fmtNumber(st.areaMin, app.lang) : null,
      st.areaMax != null ? fmtNumber(st.areaMax, app.lang) : null), 'area', ''));
  }
  if (st.bounds) out.push(chip(s.areaActive, 'bounds', ''));
  if (out.length > 1 || (out.length && st.q)) {
    out.push(`<button type="button" class="chip chip-reset" data-action="reset">${esc(s.reset)}</button>`);
  }
  $('#chips').innerHTML = out.join('');
}

/* ---------- Filters panel ---------- */

// `mark` is optional HTML shown before the label: a symbol or a colour swatch.
function option(name, value, label, checked, count, mark = '') {
  const id = `f-${name}-${value}`;
  return `<label class="opt" for="${esc(id)}"><input type="checkbox" id="${esc(id)}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>${mark}<span>${esc(label)}</span><span class="n">${count}</span></label>`;
}
const symbol = (src) => `<img src="${src}" alt="">`;
const swatch = (level) => `<span class="sev-swatch" data-level="${level}" style="background:${SEVERITY_COLORS[level]}"></span>`;

function renderFilters() {
  const s = t();
  const recs = app.records;
  const st = app.state;
  const count = (fn) => recs.filter(fn).length;

  const regions = [...new Map(recs.filter((r) => r.region).map((r) => [r.regionCode, r.region])).entries()]
    .sort((a, b) => regionName(a[1], app.lang).localeCompare(regionName(b[1], app.lang), app.lang));
  const regionHtml = regions.map(([code, name]) =>
    option('region', code, regionName(name, app.lang), st.regions.has(code), count((r) => r.regionCode === code))).join('');

  const munis = new Map();
  for (const r of recs) {
    if (!r.municipality) continue;
    if (!munis.has(r.municipalityCode)) munis.set(r.municipalityCode, { name: r.municipality, region: r.region, regionCode: r.regionCode, n: 0 });
    munis.get(r.municipalityCode).n++;
  }
  let muniHtml = '';
  for (const [rcode, rname] of regions) {
    const items = [...munis.entries()].filter(([, m]) => m.regionCode === rcode)
      .sort((a, b) => placeName(a[1].name, app.lang).localeCompare(placeName(b[1].name, app.lang), app.lang));
    muniHtml += `<div class="opt-group" data-region-group>${esc(regionName(rname, app.lang))}</div>`;
    muniHtml += items.map(([code, m]) => option('municipality', code, placeName(m.name, app.lang), st.municipalities.has(code), m.n)).join('');
  }

  const typeCodes = [...TYPE_ORDER, ...new Set(recs.map((r) => r.typeCode).filter((c) => !TYPE_ORDER.includes(c)))];
  const typeHtml = typeCodes.filter((c) => count((r) => r.typeCode === c) > 0).map((c) => {
    const sample = recs.find((r) => r.typeCode === c);
    const label = TYPE_LABELS[app.lang][c] || placeName(sample?.type, app.lang) || s.unknown;
    return option('type', c, label, st.types.has(c), count((r) => r.typeCode === c));
  }).join('');

  const matCount = (m) => count((r) => r.waste.materials.includes(m));
  const materialOpts = MATERIALS.filter((m) => matCount(m) > 0)
    .map((m) => option('material', m, MATERIAL_LABELS[app.lang][m], st.materials.has(m), matCount(m), symbol(iconSrc(m))));
  const otherN = count((r) => r.waste.other);
  if (otherN) materialOpts.push(option('material', 'other', MATERIAL_LABELS[app.lang].other, st.materials.has('other'), otherN, symbol(iconSrc('other'))));
  materialOpts.push(option('material', 'unknown', MATERIAL_LABELS[app.lang].unknown, st.materials.has('unknown'), count((r) => r.waste.unknown), symbol(iconSrc('unknown'))));

  const sevHtml = [...SEVERITY_LEVELS].reverse()
    .filter((l) => count((r) => r.severity === l) > 0)
    .map((l) => option('severity', String(l), s.severityLevels[l], st.severity.has(String(l)), count((r) => r.severity === l), swatch(l)))
    .join('');

  $('#filters-body').innerHTML = `
    <fieldset><legend>${esc(s.severity)}</legend>${sevHtml}<p class="hint">${esc(s.severityNote)}</p></fieldset>
    <fieldset><legend>${esc(s.region)}</legend>
      <button type="button" class="btn btn-outline shortcut" data-action="skopje">${esc(s.skopjeShortcut)}</button>
      ${regionHtml}
    </fieldset>
    <fieldset><legend>${esc(s.municipality)}</legend>
      <label for="muni-search" class="sr-only">${esc(s.municipalitySearch)}</label>
      <input type="search" id="muni-search" class="muni-search" placeholder="${esc(s.municipalitySearch)}" value="${esc(app.muniFilter)}" autocomplete="off">
      <div class="muni-list" id="muni-list">${muniHtml}</div>
    </fieldset>
    <fieldset><legend>${esc(s.type)}</legend>${typeHtml}</fieldset>
    <fieldset><legend>${esc(s.material)}</legend>${materialOpts.join('')}</fieldset>
    <fieldset><legend>${esc(s.area)}</legend>
      <div class="range">
        <label for="area-min">${esc(s.min)}<input type="number" id="area-min" inputmode="numeric" min="0" step="1" value="${st.areaMin ?? ''}"></label>
        <label for="area-max">${esc(s.max)}<input type="number" id="area-max" inputmode="numeric" min="0" step="1" value="${st.areaMax ?? ''}"></label>
      </div>
      <p class="hint">${esc(s.areaNote)}</p>
    </fieldset>`;
  filterMunicipalityList();
}

function filterMunicipalityList() {
  const list = $('#muni-list');
  if (!list) return;
  const k = searchKey(app.muniFilter);
  let group = null;
  let groupVisible = false;
  const flush = () => { if (group) group.hidden = !groupVisible; };
  for (const el of list.children) {
    if (el.hasAttribute('data-region-group')) { flush(); group = el; groupVisible = false; continue; }
    const code = el.querySelector('input').value;
    const rec = app.records.find((r) => r.municipalityCode === code);
    const ok = !k || searchKey(rec?.municipality).includes(k);
    el.hidden = !ok;
    if (ok) groupVisible = true;
  }
  flush();
}

function syncFilterInputs() {
  const st = app.state;
  document.querySelectorAll('#filters-body input[type="checkbox"]').forEach((cb) => {
    const set = { region: st.regions, municipality: st.municipalities, type: st.types, material: st.materials, severity: st.severity }[cb.name];
    if (set) cb.checked = set.has(cb.value);
  });
  const min = $('#area-min');
  const max = $('#area-max');
  if (min && document.activeElement !== min) min.value = st.areaMin ?? '';
  if (max && document.activeElement !== max) max.value = st.areaMax ?? '';
  if (document.activeElement !== $('#q')) $('#q').value = st.q;
  $('#sort').value = st.sort;
}

function openFilters() {
  app.lastFocus = document.activeElement;
  $('#filters').hidden = false;
  $('#filters-toggle').setAttribute('aria-expanded', 'true');
  $('#filters-body').querySelector('input, button')?.focus();
}
function closeFilters() {
  if ($('#filters').hidden) return;
  $('#filters').hidden = true;
  $('#filters-toggle').setAttribute('aria-expanded', 'false');
  $('#filters-toggle').focus();
}

/* ---------- Details ---------- */

function select(id, { from = 'list', fly = true } = {}) {
  const r = app.byId.get(id);
  if (!r) return;
  app.selectedId = id;
  clearPulse();
  setDetailsPeek(false);
  markListSelection();
  renderDetails();
  if (app.popup) { app.popup.remove(); app.popup = null; }
  updateSelectedOnMap();
  // On phones the list hides the map: move it along quietly, without a pulse
  // nobody would see.
  if (fly && r.located) pinpoint(r, { zoom: SELECT_ZOOM, pulse: mapVisible() });
  if (from === 'map') {
    const btn = document.querySelector(`#list button[data-id="${id}"]`);
    btn?.scrollIntoView({ block: 'nearest' });
  }
  app.lastFocus = from === 'list' ? document.querySelector(`#list button[data-id="${id}"]`) : null;
  $('#details').hidden = false;
  $('#details').focus({ preventScroll: true });
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How much of the bottom of the map the phone details sheet covers, in px. */
function sheetCover() {
  const sheet = $('#details');
  if (!isPhone() || sheet.hidden || !app.map) return 0;
  const map = app.map.getContainer().getBoundingClientRect();
  const covered = map.bottom - sheet.getBoundingClientRect().top;
  return Math.max(0, Math.min(covered, map.height * 0.8));
}

// Fly the map to a site and mark it with a pulsing ring for a few seconds,
// on top of the lasting selection ring. On phones the details sheet covers
// the lower part of the map, so the site is centred in the part left visible.
// (An offset, not camera padding: MapLibre keeps padding for later moves.)
function pinpoint(r, { zoom = PIN_ZOOM, pulse = true } = {}) {
  const map = app.map;
  if (!map || !r?.located) return;
  const animate = pulse && !reducedMotion();
  map.flyTo({
    center: [r.lon, r.lat],
    zoom: Math.max(map.getZoom(), zoom),
    offset: [0, -sheetCover() / 2],
    duration: animate ? 900 : 0,
    essential: true,
  });
  clearPulse();
  if (!pulse) return;
  const el = document.createElement('div');
  el.className = 'pin-pulse';
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--d', `${markerPx(r.area) + 14}px`);
  el.style.setProperty('--c', SEVERITY_COLORS[r.severity]);
  el.innerHTML = '<span></span><span></span>';
  const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lon, r.lat]).addTo(map);
  app.pulse = { marker, timer: setTimeout(clearPulse, 4500) };
}

function clearPulse() {
  if (!app.pulse) return;
  clearTimeout(app.pulse.timer);
  app.pulse.marker.remove();
  app.pulse = null;
}

// Phones: after "Show on map" the details sheet shrinks to its title bar, so
// the map can be seen; the Details button opens it again.
function setDetailsPeek(on) {
  const sheet = $('#details');
  sheet.classList.toggle('peek', on);
  $('#details-expand').setAttribute('aria-expanded', String(!on));
}

function showOnMap(id) {
  const r = app.byId.get(id);
  if (!r?.located) return;
  if (app.selectedId !== id) select(id, { from: 'list', fly: false });
  if (isPhone()) {
    setDetailsPeek(true);
    $('#details-expand').focus({ preventScroll: true });
  }
  // On a narrow map an open legend would cover the middle, where the site lands.
  if (app.legendOpen && $('#map-wrap').clientWidth < 2 * ($('#legend').offsetWidth + 24)) {
    app.legendOpen = false;
    renderLegend();
  }
  setView('map');
  // Let the map become visible (phones) before measuring and flying.
  requestAnimationFrame(() => { app.map?.resize(); pinpoint(r); });
}

function closeDetails() {
  if ($('#details').hidden && app.selectedId == null) return;
  const id = app.selectedId;
  app.selectedId = null;
  $('#details').hidden = true;
  setDetailsPeek(false);
  clearPulse();
  markListSelection();
  updateSelectedOnMap();
  // The button that opened the details may have been redrawn since: find it again.
  const back = [app.lastFocus, document.querySelector(`#summary [data-action="select-site"][data-id="${id}"]`),
    document.querySelector(`#list button[data-id="${id}"]`)].find((b) => b?.isConnected);
  if (back && !isPhone()) back.focus({ preventScroll: true });
}

function row(label, value, extra = '') {
  const v = value == null || value === '' ? `<span class="unk">${esc(t().unknown)}</span>` : esc(value);
  return `<dt>${esc(label)}</dt><dd>${v}${extra}</dd>`;
}

function phraseRow(label, raw) {
  const p = phrase(raw, app.lang);
  const orig = app.lang === 'en' && p.text && raw !== p.text ? `<span class="orig" lang="mk">${esc(raw)}</span>` : '';
  return row(label, p.text, orig);
}

function renderDetails() {
  const s = t();
  const r = app.byId.get(app.selectedId);
  if (!r) return;
  $('#details-title').textContent = recordTitle(r);
  const latin = (v) => (app.lang === 'en' && v ? `<span class="orig" lang="mk">${esc(v)}</span>` : '');
  const coords = r.located ? `${r.lat}, ${r.lon}` : null;
  const kind = MATERIAL_LABELS[app.lang][r.waste.icon];
  const type = TYPE_LABELS[app.lang][r.typeCode] || placeName(r.type, app.lang);
  const notes = [];
  if (!r.located) notes.push(`<p class="callout callout-warn">${esc(s.noLocation)}</p>`);
  else notes.push(`<p class="callout">${esc(s.coordAsRecorded)}</p>`);
  // Near the top, so it is in view without scrolling the phone sheet.
  const showOnMapBtn = r.located
    ? `<p class="detail-actions"><button type="button" class="btn btn-primary" data-action="show-on-map" data-id="${r.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg><span>${esc(s.showOnMap)}</span></button></p>`
    : '';
  const maps = r.located
    ? `<p class="ext"><a href="https://www.google.com/maps/search/?api=1&amp;query=${r.lat},${r.lon}" target="_blank" rel="noopener">${esc(s.googleMaps)} ↗</a></p>`
    : '';
  $('#details-body').innerHTML = `
    <div class="detail-kind"><img src="${iconSrc(r.waste.icon, r.area == null, r.severity)}" alt=""><span>${esc(kind)} · ${esc(type || s.unknown)}<span class="detail-sev">${esc(s.severity)}: ${esc(s.severityLevels[r.severity])}</span></span></div>
    ${showOnMapBtn}
    <dl class="dl">
      ${row(s.regionL, regionName(r.region, app.lang))}
      ${row(s.municipalityL, placeName(r.municipality, app.lang), latin(r.municipality))}
      ${row(s.settlementL, placeName(r.settlement, app.lang), latin(r.settlement))}
      ${row(s.localityL, placeName(r.locality, app.lang), latin(r.locality))}
      ${row(s.coordinatesL, coords)}
      ${row(s.areaL, r.area == null ? null : `${fmtNumber(r.area, app.lang)} ${s.m2}`)}
      ${row(s.volumeL, r.volume == null ? null : `${fmtNumber(r.volume, app.lang)} ${s.m3}`)}
      ${row(s.typeL, type, app.lang === 'en' ? latin(r.type) : '')}
      ${phraseRow(s.wasteL, r.wasteRaw)}
      ${phraseRow(s.sourceL, r.source)}
      ${row(s.dateL, r.infoDate)}
      ${phraseRow(s.noteL, r.note)}
    </dl>
    ${notes.join('')}
    ${maps}`;
}

/* ---------- Legend ---------- */

function renderLegend() {
  const s = t();
  const toggle = $('#legend-toggle');
  toggle.innerHTML = `<span>${esc(s.legend)}</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="${app.legendOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;
  toggle.setAttribute('aria-expanded', String(app.legendOpen));
  const legend = $('#legend');
  legend.classList.toggle('open', app.legendOpen);
  legend.classList.toggle('closed', !app.legendOpen);
  const kinds = ICON_KINDS.filter((k) => k !== 'other' || app.records.some((r) => r.waste.other));
  const sizes = [[10, '10'], [1000, '1 000'], [100000, '100 000']]
    .map(([a, label]) => { const px = markerPx(a); return `<figure><span class="disc" style="width:${px}px;height:${px}px"></span><figcaption>${label} m²</figcaption></figure>`; })
    .join('');
  const sevRows = [...SEVERITY_LEVELS].reverse().map((l) =>
    `<li>${swatch(l)}<span>${esc(s.severityLevels[l])}</span></li>`).join('');
  $('#legend-body').innerHTML = `
    <h3>${esc(s.severity)}</h3>
    <ul>${sevRows}</ul>
    <p class="legend-note">${esc(s.severityNote)}</p>
    <h3>${esc(s.material)}</h3>
    <ul class="kinds">${kinds.map((k) => `<li><img src="${iconSrc(k)}" alt=""><span>${esc(MATERIAL_LABELS[app.lang][k])}</span></li>`).join('')}</ul>
    <h3>${esc(s.legendSize)}</h3>
    <div class="sizes">${sizes}<figure><span class="disc disc-u" style="width:${UNKNOWN_PX}px;height:${UNKNOWN_PX}px"></span><figcaption>${esc(s.unknownSize)}</figcaption></figure></div>
    <ul style="margin-top:10px"><li><span class="cluster-sample">12</span><span>${esc(s.clusterNote)}</span></li></ul>
    <p>${esc(s.symbolNote)}</p>`;
}

/* ---------- Map ---------- */

function featureCollection() {
  return {
    type: 'FeatureCollection',
    features: app.onMap.filter((r) => r.located).map((r) => {
      const px = markerPx(r.area);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: { id: r.id, img: imageName(r.waste.icon, r.area == null, r.severity), sev: r.severity, scale: px / 32, px, sortKey: -(r.severity * 1000 + px) },
      };
    }),
  };
}

function updateMap() {
  if (!app.mapReady) return;
  app.map.getSource('sites').setData(featureCollection());
  updateSelectedOnMap();
}

function updateSelectedOnMap() {
  if (!app.mapReady) return;
  const r = app.byId.get(app.selectedId);
  app.map.getSource('selected').setData({
    type: 'FeatureCollection',
    features: r && r.located ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { px: markerPx(r.area) } }] : [],
  });
}

function fitToResults() {
  if (!app.mapReady) return;
  if (app.state.bounds) { // a shared link with a map area: show that area
    const [w, so, e, n] = app.state.bounds;
    app.map.fitBounds([[w, so], [e, n]], { padding: 0, duration: 0 });
    return;
  }
  const pts = app.onMap.filter((r) => r.located);
  if (!pts.length) return;
  let w = 180, so = 90, e = -180, n = -90;
  for (const r of pts) { w = Math.min(w, r.lon); e = Math.max(e, r.lon); so = Math.min(so, r.lat); n = Math.max(n, r.lat); }
  const pad = 0.01;
  app.map.fitBounds([[w - pad, so - pad], [e + pad, n + pad]], { padding: 48, maxZoom: 14, duration: 700 });
}

// Marker bitmaps are decoded once and re-added whenever the basemap changes,
// because a new style starts without the previous one's images.
let markerImages = null;
function decodeMarkerImages() {
  if (!markerImages) {
    const jobs = [];
    for (const level of SEVERITY_LEVELS) {
      for (const kind of ICON_KINDS) {
        for (const unknownSize of [false, true]) {
          const img = new Image(64, 64);
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markerSvg(kind, { unknownSize, px: 64, color: SEVERITY_COLORS[level], ink: SEVERITY_INK[level] }));
          jobs.push(img.decode().then(() => [imageName(kind, unknownSize, level), img]));
        }
      }
    }
    markerImages = Promise.all(jobs);
  }
  return markerImages;
}

// Make the basemap easier to read under the markers: clearer water, borders and
// place names. Layers are matched by what they draw; anything missing is skipped.
function tuneBasemap(map, theme) {
  for (const layer of map.getStyle()?.layers || []) {
    for (const [prop, value] of basemapPaint(layer, theme)) {
      try { map.setPaintProperty(layer.id, prop, value); } catch (err) { console.warn('Basemap tweak skipped', layer.id, prop, err); }
    }
  }
}

// Sources, images and layers for the recorded sites, coloured for the current
// theme. Runs on every basemap load, since setStyle() removes all of them.
async function addSiteLayers(map) {
  const gen = ++app.styleGen;
  const theme = app.theme;
  const c = MAP_THEMES[theme];
  app.mapReady = false;
  tuneBasemap(map, theme);
  const images = await decodeMarkerImages();
  if (gen !== app.styleGen || map.getSource('sites')) return; // a newer basemap took over
  for (const [name, img] of images) if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
  map.addSource('sites', { type: 'geojson', data: featureCollection(), cluster: true, clusterMaxZoom: CLUSTER_MAX_ZOOM, clusterRadius: 44,
    clusterProperties: { maxSev: ['max', ['get', 'sev']] } });
  map.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const clusterRadius = ['step', ['get', 'point_count'], 15, 10, 18, 30, 22, 80, 26];
  // A cluster takes the colour of the most severe site inside it, and the
  // number on it the matching ink (dark on amber and orange, white on red).
  const byMaxSev = (colours) => ['match', ['get', 'maxSev'], 1, colours[1], 2, colours[2], 3, colours[3], colours[4]];
  const clusterColor = byMaxSev(SEVERITY_COLORS);
  map.addLayer({
    id: 'cluster-glow', type: 'circle', source: 'sites', filter: ['has', 'point_count'],
    paint: { 'circle-radius': ['+', clusterRadius, 6], 'circle-color': clusterColor, 'circle-opacity': c.clusterGlowOpacity },
  });
  map.addLayer({
    id: 'clusters', type: 'circle', source: 'sites', filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColor,
      'circle-stroke-color': c.clusterStroke,
      'circle-stroke-width': 2.5,
      'circle-radius': clusterRadius,
    },
  });
  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'sites', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': byMaxSev(SEVERITY_INK), 'text-halo-color': byMaxSev(SEVERITY_HALO), 'text-halo-width': 1 },
  });
  map.addLayer({
    id: 'points', type: 'symbol', source: 'sites', filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'img'], 'icon-size': ['get', 'scale'], 'icon-allow-overlap': true,
      'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sortKey'],
    },
  });
  // The selection ring sits above markers so a selected small site stays
  // visible: a contrasting casing under a solid ring, so it reads on any fill.
  const ringRadius = ['+', ['/', ['get', 'px'], 2], 7];
  map.addLayer({
    id: 'selected-casing', type: 'circle', source: 'selected',
    paint: { 'circle-radius': ringRadius, 'circle-opacity': 0, 'circle-stroke-color': c.selectedCasing, 'circle-stroke-width': 6 },
  });
  map.addLayer({
    id: 'selected-halo', type: 'circle', source: 'selected',
    paint: { 'circle-radius': ringRadius, 'circle-opacity': 0, 'circle-stroke-color': c.selected, 'circle-stroke-width': 3 },
  });
  app.mapReady = true;
  updateMap();
  if (!app.mapLoadedOnce) {
    app.mapLoadedOnce = true;
    if (app.dataStatus === 'ready' && hasActiveFilters(app.state) && !initial.view) fitToResults();
  }
}

// Switch the basemap for the current theme, keeping the view where it is.
function restyleMap() {
  const map = app.map;
  if (!map) return;
  const view = { center: map.getCenter(), zoom: map.getZoom() };
  app.mapReady = false;
  map.once('style.load', () => map.jumpTo(view));
  map.setStyle(MAP_THEMES[app.theme].style, { diff: false });
}

function initMap() {
  if (!window.maplibregl) { showMapError(); return; }
  const opts = {
    container: 'map',
    style: MAP_THEMES[app.theme].style,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    maxZoom: 18,
  };
  if (initial.view) Object.assign(opts, { center: [initial.view.lng, initial.view.lat], zoom: initial.view.zoom });
  else opts.bounds = MK_BOUNDS;
  let map;
  try { map = new maplibregl.Map(opts); } catch (err) { console.error(err); showMapError(); return; }
  app.map = map;
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('error', (e) => console.warn('Map error', e?.error?.message || e));
  map.on('style.load', () => { addSiteLayers(map).catch((err) => console.error('Map layers failed', err)); });

  map.on('click', 'clusters', async (e) => {
    const f = e.features[0];
    const zoom = await map.getSource('sites').getClusterExpansionZoom(f.properties.cluster_id);
    map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom + 0.3, 18), duration: 500 });
  });
  map.on('click', 'points', (e) => {
    const box = [[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]];
    const ids = [...new Set(map.queryRenderedFeatures(box, { layers: ['points'] }).map((f) => f.properties.id))];
    if (ids.length <= 1) { select(ids[0] ?? e.features[0].properties.id, { from: 'map', fly: false }); return; }
    openChooser(ids, e.lngLat);
  });
  for (const layer of ['clusters', 'points']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
  // The list follows the map: a second after the visitor stops panning or
  // zooming, it narrows to the visible area. Moves the app makes itself
  // (flying to a site, fitting to results) leave the list as it is.
  map.on('movestart', () => clearTimeout(app.followTimer));
  map.on('moveend', (e) => {
    writeUrl();
    if (e.originalEvent) app.followTimer = setTimeout(followView, FOLLOW_DELAY);
  });
}

function followView() {
  const b = app.map.getBounds();
  const next = boundsForView(app.onMap, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  if (JSON.stringify(next) === JSON.stringify(app.state.bounds)) return;
  app.state.bounds = next;
  update();
}

function openChooser(ids, lngLat) {
  if (app.popup) app.popup.remove();
  const recs = ids.map((id) => app.byId.get(id)).filter(Boolean);
  const el = document.createElement('div');
  el.className = 'chooser';
  el.innerHTML = `<p>${esc(t().here(recs.length))}</p>` + recs.map((r) =>
    `<button type="button" data-id="${r.id}"><img src="${iconSrc(r.waste.icon, r.area == null, r.severity)}" alt=""><span>${esc(recordTitle(r))}${r.area != null ? ` · ${esc(fmtNumber(r.area, app.lang))} m²` : ''}</span></button>`).join('');
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-id]');
    if (b) select(Number(b.dataset.id), { from: 'map', fly: false });
  });
  app.popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', focusAfterOpen: true })
    .setLngLat(lngLat).setDOMContent(el).addTo(app.map);
}

function showMapError() {
  const el = $('#map-error');
  el.textContent = t().mapFailed;
  el.hidden = false;
}

/* ---------- Events ---------- */

function bindEvents() {
  let qTimer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    // A search looks everywhere, not just in the area the map shows.
    qTimer = setTimeout(() => { app.state.q = e.target.value; app.state.bounds = null; update(); }, 150);
  });
  $('#sort').addEventListener('change', (e) => { app.state.sort = e.target.value; update(); });
  $('#filters-toggle').addEventListener('click', () => ($('#filters').hidden ? openFilters() : closeFilters()));

  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'reset') { resetAll(); return; }
    if (action === 'close-filters') { closeFilters(); return; }
    if (action === 'close-details') { closeDetails(); return; }
    if (action === 'expand-details') { setDetailsPeek(false); $('#details').focus({ preventScroll: true }); return; }
    if (action === 'show-on-map') { showOnMap(Number(e.target.closest('[data-id]').dataset.id)); return; }
    if (action === 'select-site') {
      const btn = e.target.closest('[data-id]');
      select(Number(btn.dataset.id), { from: 'list' });
      app.lastFocus = btn; // closing the details returns here, not to the list
      return;
    }
    if (action === 'skopje') {
      app.state.regions = new Set([SKOPJE_REGION]);
      app.state.bounds = null; // the map moves to the region, so the list stops following the old area
      update({ fit: 'results' });
      return;
    }
    const chipEl = e.target.closest('[data-chip]');
    if (chipEl) {
      const v = chipEl.dataset.value;
      const st = app.state;
      ({
        region: () => st.regions.delete(v),
        municipality: () => st.municipalities.delete(v),
        type: () => st.types.delete(v),
        material: () => st.materials.delete(v),
        severity: () => st.severity.delete(v),
        area: () => { st.areaMin = null; st.areaMax = null; },
        bounds: () => { st.bounds = null; },
      })[chipEl.dataset.chip]?.();
      update();
      return;
    }
    const item = e.target.closest('#list button[data-id]');
    if (item) select(Number(item.dataset.id), { from: 'list' });
  });

  $('#filters-body').addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.type !== 'checkbox') return;
    const st = app.state;
    const set = { region: st.regions, municipality: st.municipalities, type: st.types, material: st.materials, severity: st.severity }[cb.name];
    if (!set) return;
    toggleInSet(set, cb.value, cb.checked);
    const focusMap = (cb.name === 'municipality' || cb.name === 'region') && cb.checked;
    if (focusMap) st.bounds = null; // the map moves to the place, so the list stops following the old area
    update({ fit: focusMap ? 'results' : null });
  });
  let areaTimer;
  $('#filters-body').addEventListener('input', (e) => {
    if (e.target.id === 'muni-search') { app.muniFilter = e.target.value; filterMunicipalityList(); return; }
    if (e.target.id !== 'area-min' && e.target.id !== 'area-max') return;
    clearTimeout(areaTimer);
    areaTimer = setTimeout(() => {
      const val = (id) => { const v = $(id).value.trim(); const n = Number(v); return v === '' || !Number.isFinite(n) ? null : n; };
      app.state.areaMin = val('#area-min');
      app.state.areaMax = val('#area-max');
      update();
    }, 250);
  });

  $('#lang-toggle').addEventListener('click', () => {
    app.lang = app.lang === 'mk' ? 'en' : 'mk';
    renderStaticText();
    renderFilters();
    update();
    if (app.selectedId != null) renderDetails();
  });

  $('#theme-toggle').addEventListener('click', () => {
    applyTheme(app.theme === 'dark' ? 'light' : 'dark', { remember: true });
  });
  // Follow the system setting live, unless the visitor picked a theme here.
  darkQuery?.addEventListener?.('change', (e) => {
    if (!['light', 'dark'].includes(storedTheme())) applyTheme(e.matches ? 'dark' : 'light');
  });

  $('#copy-link').addEventListener('click', async () => {
    writeUrl();
    try { await navigator.clipboard.writeText(location.href); toast(t().copied); } catch { prompt('', location.href); }
  });

  $('#legend-toggle').addEventListener('click', () => { app.legendOpen = !app.legendOpen; renderLegend(); });

  document.querySelectorAll('.view-switch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (app.popup) { app.popup.remove(); app.popup = null; return; }
    if (!$('#filters').hidden) { closeFilters(); return; }
    if (!$('#details').hidden) closeDetails();
  });
}

function setView(view) {
  $('.layout').dataset.view = view;
  if (view === 'list') setDetailsPeek(false); // back to the details being read
  document.querySelectorAll('.view-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  if (view === 'map' && app.mapReady) requestAnimationFrame(() => app.map.resize());
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------- Start ---------- */

// Read-only handle for the end-to-end tests (e2e/fixtures.mjs).
window.__deponii = app;

// MapLibre GL JS is vendored as an ES module. Load it without holding up the list;
// the map starts when it arrives. If it fails, initMap shows the map error and the list still works.
const mapLibReady = import('./vendor/maplibre-gl.mjs')
  .then((lib) => { window.maplibregl = lib; }, (err) => { console.error('MapLibre failed to load', err); });

applyTheme(app.theme);
renderStaticText();
bindEvents();
setView('map');
renderStatus();
mapLibReady.then(initMap);
loadData();
