/**
 * Party seat / vote totals for state map summary panel (assembly + parliament).
 */
import type {
  ACElectionResult,
  AssemblyProperties,
  ConstituencyProperties,
  ElectionResultsByConstituency,
  ElectionResultsFileMeta,
  Feature,
  PCElectionResult,
  PCElectionResultsByConstituency,
} from '../types';
import { isAssemblyResultEntry, skipAssemblyWinnerColoring } from './electionResults';
import { normalizeName } from './helpers';
import { normalizeAssemblyPolygonNames, normalizePcPolygonNames } from './mapPolygonWinners';

export type PartySeatRow = { party: string; seats: number };

export type PartyVoteRow = { party: string; votes: number; pct: number };

const PC_KEY_PATTERN = /^[A-Z]{2}-\d+$/;

function normalizedNamesForAssemblyResult(r: ACElectionResult): string[] {
  const raw = [r.constituencyNameOriginal, r.constituencyName, r.name, r.schemaId].filter(
    (s): s is string => Boolean(s && typeof s === 'string')
  );
  const out = new Set<string>();
  for (const s of raw) {
    const norm = normalizeName(s)
      .toUpperCase()
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
      .trim();
    if (norm) out.add(norm);
    const fuzzy = norm.replace(/[^A-Z0-9]/g, '');
    if (fuzzy && fuzzy !== norm) out.add(fuzzy);
    out.add(s.toUpperCase().trim());
  }
  return [...out];
}

function findAssemblyElectionRowForProps(
  props: AssemblyProperties,
  results: ElectionResultsByConstituency,
  fileMeta?: ElectionResultsFileMeta
): ACElectionResult | null {
  const sid = props.schemaId;
  if (sid && isAssemblyResultEntry(sid, results[sid])) {
    const r = results[sid];
    if (!skipAssemblyWinnerColoring(r, fileMeta)) return r;
  }

  const { normalizedConstituencyName } = normalizeAssemblyPolygonNames(props);
  if (!normalizedConstituencyName) return null;

  for (const [key, val] of Object.entries(results)) {
    if (!isAssemblyResultEntry(key, val)) continue;
    const r = val;
    if (skipAssemblyWinnerColoring(r, fileMeta)) continue;
    const names = normalizedNamesForAssemblyResult(r);
    if (names.includes(normalizedConstituencyName)) return r;

    const nameFuzzy = normalizedConstituencyName.replace(/[^A-Z0-9]/g, '');
    if (names.some((n) => n.replace(/[^A-Z0-9]/g, '') === nameFuzzy && nameFuzzy.length > 0)) {
      return r;
    }
  }

  const collapseRepeated = (s: string): string => s.replace(/(.)\1+/g, '$1');
  const collapsedFeat = collapseRepeated(normalizedConstituencyName);

  for (const [key, val] of Object.entries(results)) {
    if (!isAssemblyResultEntry(key, val)) continue;
    const r = val;
    if (skipAssemblyWinnerColoring(r, fileMeta)) continue;
    for (const n of normalizedNamesForAssemblyResult(r)) {
      if (collapseRepeated(n) === collapsedFeat && collapsedFeat.length > 0) return r;
    }
  }

  return null;
}

function normalizedNamesForPcResult(r: PCElectionResult): string[] {
  const raw = [r.constituencyNameOriginal, r.constituencyName, r.name, r.schemaId].filter(
    (s): s is string => Boolean(s && typeof s === 'string')
  );
  const out = new Set<string>();
  for (const s of raw) {
    const norm = normalizeName(s)
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
      .trim();
    if (norm) out.add(norm);
    const fuzzy = norm.replace(/[^A-Z0-9]/g, '');
    if (fuzzy && fuzzy !== norm) out.add(fuzzy);
    out.add(s.toUpperCase().trim());
  }
  return [...out];
}

function findPcElectionRowForProps(
  props: ConstituencyProperties,
  results: PCElectionResultsByConstituency,
  resolvePCName: (name: string, stateId: string) => string | null,
  stateId: string
): PCElectionResult | null {
  const sid = props.schemaId;
  if (sid && PC_KEY_PATTERN.test(sid) && results[sid]?.candidates?.length) {
    return results[sid];
  }

  const { constituencyName, normalizedConstituencyName } = normalizePcPolygonNames(props);
  const nameCandidates: string[] = [];
  if (constituencyName) nameCandidates.push(constituencyName);
  if (normalizedConstituencyName) {
    nameCandidates.push(normalizedConstituencyName);
    nameCandidates.push(normalizedConstituencyName.replace(/[^A-Z0-9]/g, ''));
  }

  for (const nm of nameCandidates) {
    const resolved = nm ? resolvePCName(nm, stateId) : null;
    if (resolved && results[resolved]?.candidates?.length) {
      return results[resolved];
    }
  }

  if (normalizedConstituencyName) {
    for (const [key, val] of Object.entries(results)) {
      if (!val?.candidates?.length || key.startsWith('_')) continue;
      const names = normalizedNamesForPcResult(val);
      if (names.includes(normalizedConstituencyName)) return val;

      const nameFuzzy = normalizedConstituencyName.replace(/[^A-Z0-9]/g, '');
      if (names.some((n) => n.replace(/[^A-Z0-9]/g, '') === nameFuzzy && nameFuzzy.length > 0)) {
        return val;
      }
    }

    const collapseRepeated = (s: string): string => s.replace(/(.)\1+/g, '$1');
    const collapsedFeat = collapseRepeated(normalizedConstituencyName);
    if (collapsedFeat.length > 0) {
      for (const [, val] of Object.entries(results)) {
        if (!val?.candidates?.length) continue;
        for (const n of normalizedNamesForPcResult(val)) {
          if (collapseRepeated(n) === collapsedFeat) return val;
        }
      }
    }
  }

  return null;
}

function sortSeatRows(rows: PartySeatRow[]): PartySeatRow[] {
  return [...rows].sort((a, b) =>
    b.seats !== a.seats ? b.seats - a.seats : a.party.localeCompare(b.party)
  );
}

function rowsFromCounts(partyVotes: Record<string, number>, totalValid: number): PartyVoteRow[] {
  const rows: PartyVoteRow[] = [];
  const denom = totalValid > 0 ? totalValid : 0;
  for (const [party, votes] of Object.entries(partyVotes)) {
    if (votes <= 0) continue;
    rows.push({
      party,
      votes,
      pct: denom > 0 ? (100 * votes) / denom : 0,
    });
  }
  return rows.sort((a, b) =>
    b.votes !== a.votes ? b.votes - a.votes : a.party.localeCompare(b.party)
  );
}

export function aggregateSeatsFromPartyList(
  parties: (string | null | undefined)[]
): PartySeatRow[] {
  const counts: Record<string, number> = {};
  for (const p of parties) {
    const party = p?.trim();
    if (!party) continue;
    counts[party] = (counts[party] ?? 0) + 1;
  }
  return sortSeatRows(Object.entries(counts).map(([party, seats]) => ({ party, seats })));
}

export function aggregateAssemblyVotesForMappedFeatures(params: {
  results: ElectionResultsByConstituency | null;
  features: Feature[] | undefined | null;
}): {
  voteRows: PartyVoteRow[];
  totalValidVotes: number;
  mappedConstituencies: number;
  unmappedConstituencies: number;
} | null {
  const { results, features } = params;
  if (!results || !features?.length) return null;

  const fileMeta = results._meta;
  const partyVotes: Record<string, number> = {};
  let totalValidVotes = 0;
  let mapped = 0;
  let unmapped = 0;

  for (const f of features) {
    const props = f.properties as AssemblyProperties;
    if (!props.AC_NAME?.trim()) continue;
    const row = findAssemblyElectionRowForProps(props, results, fileMeta);
    if (!row) {
      unmapped++;
      continue;
    }
    mapped++;
    const vv = typeof row.validVotes === 'number' ? row.validVotes : 0;
    if (vv > 0) totalValidVotes += vv;
    for (const c of row.candidates) {
      const party = c.party?.trim() ?? 'Unknown';
      partyVotes[party] = (partyVotes[party] ?? 0) + (typeof c.votes === 'number' ? c.votes : 0);
    }
  }

  if (totalValidVotes <= 0 && mapped > 0) {
    totalValidVotes = Object.values(partyVotes).reduce((a, b) => a + b, 0);
  }

  return {
    voteRows: rowsFromCounts(partyVotes, totalValidVotes),
    totalValidVotes,
    mappedConstituencies: mapped,
    unmappedConstituencies: unmapped,
  };
}

export function aggregatePcVotesForMappedFeatures(params: {
  results: PCElectionResultsByConstituency | null;
  features: Feature[] | undefined | null;
  stateId: string;
  resolvePCName: (name: string, stateId: string) => string | null;
}): {
  voteRows: PartyVoteRow[];
  totalValidVotes: number;
  mappedConstituencies: number;
  unmappedConstituencies: number;
} | null {
  const { results, features, stateId, resolvePCName } = params;
  if (!results || !features?.length) return null;

  const partyVotes: Record<string, number> = {};
  let totalValidVotes = 0;
  let mapped = 0;
  let unmapped = 0;

  for (const f of features) {
    const props = f.properties as ConstituencyProperties;
    const hasName = (props.ls_seat_name ?? props.PC_NAME ?? '').trim();
    if (!hasName && !props.schemaId) continue;
    const row = findPcElectionRowForProps(props, results, resolvePCName, stateId);
    if (!row) {
      unmapped++;
      continue;
    }
    mapped++;
    const vv = typeof row.validVotes === 'number' ? row.validVotes : 0;
    if (vv > 0) totalValidVotes += vv;
    for (const c of row.candidates) {
      const party = c.party?.trim() ?? 'Unknown';
      partyVotes[party] = (partyVotes[party] ?? 0) + (typeof c.votes === 'number' ? c.votes : 0);
    }
  }

  if (totalValidVotes <= 0 && mapped > 0) {
    totalValidVotes = Object.values(partyVotes).reduce((a, b) => a + b, 0);
  }

  return {
    voteRows: rowsFromCounts(partyVotes, totalValidVotes),
    totalValidVotes,
    mappedConstituencies: mapped,
    unmappedConstituencies: unmapped,
  };
}

/** Full-state parliament vote rollup (every PC row in bundle for that state subset on map optional). Same as mapped version when features list all PCs. */

export function aggregateParliamentVotesStatewide(
  results: PCElectionResultsByConstituency | null
): {
  voteRows: PartyVoteRow[];
  totalValidVotes: number;
  pcsIncluded: number;
} | null {
  if (!results) return null;
  const partyVotes: Record<string, number> = {};
  let totalValidVotes = 0;
  let n = 0;
  for (const [key, val] of Object.entries(results)) {
    if (!val?.candidates?.length || key.startsWith('_')) continue;
    n++;
    const vv = typeof val.validVotes === 'number' ? val.validVotes : 0;
    if (vv > 0) totalValidVotes += vv;
    for (const c of val.candidates) {
      const party = c.party?.trim() ?? 'Unknown';
      partyVotes[party] = (partyVotes[party] ?? 0) + (typeof c.votes === 'number' ? c.votes : 0);
    }
  }
  if (totalValidVotes <= 0 && n > 0) {
    totalValidVotes = Object.values(partyVotes).reduce((a, b) => a + b, 0);
  }
  return {
    voteRows: rowsFromCounts(partyVotes, totalValidVotes),
    totalValidVotes,
    pcsIncluded: n,
  };
}

export { PC_KEY_PATTERN };
