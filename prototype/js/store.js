/**
 * Shared state + data loading.
 *
 * The important bit: selectLocation() is the SINGLE async commit point that
 * both navigation modes call. Production today has map clicks going one way
 * and BlogSection guessing with setTimeout(..., 300) - that is bug B9.
 */

export const state = {
  year: '2021',
  mode: 'map', // 'map' | 'data'
  selectedId: null,
  hoveredId: null,
  sort: 'margin-asc',
  party: '',
  results: {},
  parties: {},
  geo: null,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  listeners.forEach((fn) => fn(reason));
}

export async function loadData() {
  const [results, parties, geo] = await Promise.all([
    fetch('./data/tn-results.json').then((r) => r.json()),
    fetch('./data/parties.json').then((r) => r.json()),
    fetch('./data/tn-ac.geojson').then((r) => r.json()),
  ]);
  state.results = results;
  state.parties = parties;
  state.geo = geo;
  emit('data');
}

/** Party colour with a sane fallback for the long tail of independents. */
export function partyColor(party) {
  if (!party) return '#9b9285';
  return state.parties[party]?.color ?? '#9b9285';
}

/** en-IN grouping, in ONE place. Production has 3 copies + 18 locale-less calls (B3/B4). */
export function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

export function currentYearData() {
  return state.results[state.year] ?? {};
}

export function getAC(id) {
  return currentYearData()[id] ?? null;
}

/**
 * Real candidates only, ranked, NOTA excluded from the podium ranking.
 * Production ranks BEFORE filtering NOTA, which is why its list shows
 * 1,2,3,4,6,7... with rank 5 missing (bug B5).
 */
export function rankedCandidates(ac) {
  if (!ac?.candidates) return [];
  return ac.candidates
    .filter((c) => c.party !== 'NOTA' && c.name !== 'NOTA')
    .slice()
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

export function notaVotes(ac) {
  const n = ac?.candidates?.find((c) => c.party === 'NOTA' || c.name === 'NOTA');
  return n?.votes ?? 0;
}

export function acMargin(ac) {
  const r = rankedCandidates(ac);
  if (r.length < 2) return null;
  return (r[0].votes ?? 0) - (r[1].votes ?? 0);
}

export function acMarginPct(ac) {
  const m = acMargin(ac);
  if (m == null || !ac?.valid) return null;
  return (m / ac.valid) * 100;
}

/**
 * THE shared selection entry point.
 *
 * Both map clicks and data-nav rows call this. It is async so that a caller
 * which needs geography loaded can await it, rather than guessing with a
 * timeout. Same function, same result, no race - that is the fix for B9.
 */
export async function selectLocation(id, { source = 'map' } = {}) {
  if (!id || !getAC(id)) {
    state.selectedId = null;
    emit('select');
    return null;
  }
  state.selectedId = id;
  // Selecting always widens to Analyse - the question changed from
  // "what's around here" to "what happened in this seat".
  if (state.mode === 'map') emit('mode');
  emit('select', source);
  return id;
}

export function setHover(id) {
  if (state.hoveredId === id) return;
  state.hoveredId = id;
  emit('hover');
}

export function setMode(mode) {
  state.mode = mode;
  emit('mode');
}

export function setYear(year) {
  state.year = year;
  emit('year');
}

export function setSort(sort) {
  state.sort = sort;
  emit('filter');
}

export function setParty(party) {
  state.party = party;
  emit('filter');
}

/** Distinct parties that won at least one seat this year - for the filter. */
export function winningParties() {
  const set = new Set();
  Object.values(currentYearData()).forEach((ac) => {
    const w = rankedCandidates(ac)[0];
    if (w?.party) set.add(w.party);
  });
  return [...set].sort();
}
