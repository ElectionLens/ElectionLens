/**
 * Data-based navigation: rank, filter, and jump to a place.
 *
 * This is the half we under-built. Everything here is computed from the same
 * real result files the map uses - no separate data path.
 */

import {
  state,
  currentYearData,
  rankedCandidates,
  acMargin,
  acMarginPct,
  notaVotes,
} from './store.js';

export const SORTS = {
  'margin-asc': { label: 'Closest contests', metric: 'marginPct', dir: 1 },
  'margin-desc': { label: 'Biggest margins', metric: 'marginPct', dir: -1 },
  'turnout-desc': { label: 'Highest turnout', metric: 'turnout', dir: -1 },
  'turnout-asc': { label: 'Lowest turnout', metric: 'turnout', dir: 1 },
  'nota-desc': { label: 'Highest NOTA', metric: 'notaPct', dir: -1 },
  'electors-desc': { label: 'Most electors', metric: 'electors', dir: -1 },
  'name-asc': { label: 'Name (A-Z)', metric: 'name', dir: 1 },
};

/** Derive every metric the sorts need, once. */
export function buildRows() {
  const data = currentYearData();
  return Object.entries(data).map(([id, ac]) => {
    const ranked = rankedCandidates(ac);
    const winner = ranked[0] ?? null;
    const runner = ranked[1] ?? null;
    const nota = notaVotes(ac);
    return {
      id,
      ac,
      name: ac.name ?? id,
      no: ac.no,
      district: ac.district,
      type: ac.type,
      winner,
      runner,
      margin: acMargin(ac),
      marginPct: acMarginPct(ac),
      turnout: ac.turnout,
      electors: ac.electors,
      valid: ac.valid,
      nota,
      notaPct: ac.valid ? (nota / ac.valid) * 100 : 0,
    };
  });
}

export function applySort(rows) {
  const cfg = SORTS[state.sort] ?? SORTS['margin-asc'];
  const { metric, dir } = cfg;
  return rows.slice().sort((a, b) => {
    const av = a[metric];
    const bv = b[metric];
    if (metric === 'name') return dir * String(av).localeCompare(String(bv));
    // Nulls always sort last regardless of direction
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir * (av - bv);
  });
}

export function applyFilter(rows) {
  if (!state.party) return rows;
  return rows.filter((r) => r.winner?.party === state.party);
}

export function visibleRows() {
  return applySort(applyFilter(buildRows()));
}

/** Value shown on the right of each ranked row, matching the active sort. */
export function metricDisplay(row) {
  switch (state.sort) {
    case 'turnout-desc':
    case 'turnout-asc':
      return { main: row.turnout != null ? `${row.turnout.toFixed(1)}%` : '—', sub: 'turnout' };
    case 'nota-desc':
      return { main: `${row.notaPct.toFixed(2)}%`, sub: `${row.nota} NOTA` };
    case 'electors-desc':
      return { main: row.electors ? row.electors.toLocaleString('en-IN') : '—', sub: 'electors' };
    case 'name-asc':
      return { main: row.no != null ? `AC ${row.no}` : '—', sub: row.type ?? '' };
    default:
      return {
        main: row.marginPct != null ? `${row.marginPct.toFixed(1)}%` : '—',
        sub: row.margin != null ? `${row.margin.toLocaleString('en-IN')} votes` : '',
      };
  }
}
