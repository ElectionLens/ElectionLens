/**
 * Resolve winning party for map polygon styling — keep in sync with MapView colour logic.
 */
import { normalizeName } from './helpers';
import type { AssemblyProperties, ConstituencyProperties, DistrictProperties } from '../types';

/** AC name spelling variants for style lookup (GeoJSON vs election data) */
export const AC_STYLE_VARIANTS: Record<string, string[]> = {
  TADPATRI: ['TADPATRI', 'TADIPATRI'],
  TADIPATRI: ['TADIPATRI', 'TADPATRI'],
  PAPPIREDDIPPATTI: ['PAPPIREDDIPPATTI', 'PAPPIREDDIPATTI'],
  PAPPIREDDIPATTI: ['PAPPIREDDIPATTI', 'PAPPIREDDIPPATTI'],
  MANGALDOI: ['MANGALDOI', 'MANGALDAI'],
  MANGALDAI: ['MANGALDAI', 'MANGALDOI'],
};

export type MapPolygonWinner = { party: string; candidate?: string };

export type ConstituencyWinnersMap = Record<string, { party: string; candidate: string }>;

/**
 * How a raw constituency name is folded into its canonical lookup key.
 *
 * - `assembly`      strips any parenthetical, e.g. "Arani (SC)" -> "ARANI"
 * - `pc`            whitespace-collapse only, parentheses preserved
 * - `pcSeatSuffix`  strips only a trailing "(SC)"/"(ST)" reservation marker
 */
export type WinnerNameKeyStyle = 'assembly' | 'pc' | 'pcSeatSuffix';

/** Canonical lookup key for a constituency name. Mirrors the read-side lookup. */
export function normalizeWinnerNameKey(name: string, style: WinnerNameKeyStyle): string {
  const upper = normalizeName(name).toUpperCase();
  if (style === 'assembly') {
    return upper
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (style === 'pc') {
    return upper.replace(/\s+/g, ' ').trim();
  }
  return upper
    .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Register a winner under every key the map-style lookup might ask for:
 * the normalized name, its alphanumeric-only "fuzzy" form, and the raw
 * uppercased original (GeoJSON and election JSON disagree on spelling).
 *
 * Write-side counterpart of `lookupWinnerByNameKeyPath` - the same key
 * scheme viewed from the other end, so keep the two in sync.
 *
 * @param opts.applyVariants also seed known alternate spellings (AC layer
 *   only); variants never clobber an existing entry, they only fill gaps.
 * @returns the normalized key the winner was primarily stored under.
 */
export function assignWinnerNameKeys(
  winners: ConstituencyWinnersMap,
  rawName: string,
  entry: { party: string; candidate: string },
  opts: { style: WinnerNameKeyStyle; applyVariants?: boolean }
): string {
  const normalizedName = normalizeWinnerNameKey(rawName, opts.style);
  const fuzzyKey = normalizedName.replace(/[^A-Z0-9]/g, '');
  winners[normalizedName] = entry;
  if (fuzzyKey && fuzzyKey !== normalizedName) winners[fuzzyKey] = entry;
  const originalUpper = rawName.toUpperCase().trim();
  if (originalUpper !== normalizedName && originalUpper !== fuzzyKey) {
    winners[originalUpper] = entry;
  }
  if (opts.applyVariants) {
    for (const v of AC_STYLE_VARIANTS[normalizedName] ?? []) {
      if (v !== normalizedName && !winners[v]) winners[v] = entry;
    }
  }
  return normalizedName;
}

/** Minimal shape of a PC election row needed to derive its map winner. */
type PcResultRow = {
  candidates?: { party: string; name: string }[];
  constituencyNameOriginal?: string;
  constituencyName?: string;
  name?: string;
};

/** Schema IDs look like "TN-01" / "UP-1". */
const SCHEMA_ID_PATTERN = /^[A-Z]{2}-\d+$/;

/**
 * Build the PC winner lookup for a whole state's Lok Sabha result file.
 *
 * Candidates arrive pre-sorted by votes, so index 0 is the winner. Each winner
 * is registered under its schema ID (when the file is keyed that way), every
 * name-key variant, and the schema-resolved ID for the PC name.
 *
 * @param resolvePCName maps a PC name to its schema ID, or null if unknown.
 * @param style name-key flavour; PC files disagree on whether the "(SC)"
 *   reservation suffix is part of the name.
 */
export function buildPcWinnersFromResults(
  results: Record<string, PcResultRow>,
  stateId: string,
  resolvePCName: (pcName: string, stateId: string) => string | null,
  style: WinnerNameKeyStyle = 'pcSeatSuffix'
): ConstituencyWinnersMap {
  const winners: ConstituencyWinnersMap = {};
  for (const [key, result] of Object.entries(results)) {
    const winner = result.candidates?.[0];
    if (!winner) continue;
    const entry = { party: winner.party, candidate: winner.name };
    if (key && SCHEMA_ID_PATTERN.test(key)) winners[key] = entry;
    const pcName = result.constituencyNameOriginal || result.constituencyName || result.name || '';
    if (!pcName) continue;
    assignWinnerNameKeys(winners, pcName, entry, { style });
    const sid = resolvePCName(pcName, stateId);
    if (sid) winners[sid] = entry;
  }
  return winners;
}

export function normalizeAssemblyPolygonNames(props: Pick<AssemblyProperties, 'AC_NAME'>): {
  constituencyName: string | null;
  normalizedConstituencyName: string | null;
} {
  const raw = props.AC_NAME?.trim() ?? '';
  if (!raw) return { constituencyName: null, normalizedConstituencyName: null };
  let normalizedConstituencyName = normalizeName(raw)
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  normalizedConstituencyName =
    normalizedConstituencyName.replace(/\s*\(S[CT]\s*\)?\s*$/i, '').trim() ||
    normalizedConstituencyName;
  return { constituencyName: raw, normalizedConstituencyName };
}

export function normalizePcPolygonNames(
  props: Pick<ConstituencyProperties, 'ls_seat_name' | 'PC_NAME'>
): { constituencyName: string | null; normalizedConstituencyName: string | null } {
  const raw = (props.ls_seat_name ?? props.PC_NAME ?? '').trim();
  if (!raw) return { constituencyName: null, normalizedConstituencyName: null };
  let normalizedConstituencyName = normalizeName(raw).toUpperCase().replace(/\s+/g, ' ').trim();
  normalizedConstituencyName =
    normalizedConstituencyName.replace(/\s*\(S[CT]\s*\)?\s*$/i, '').trim() ||
    normalizedConstituencyName;
  return { constituencyName: raw, normalizedConstituencyName };
}

function trySchemaWinner(
  winners: ConstituencyWinnersMap,
  schemaId: string | undefined,
  blockSchema: boolean
): MapPolygonWinner | null {
  if (blockSchema || !schemaId) return null;
  const w = winners[schemaId];
  return w ? { party: w.party, candidate: w.candidate } : null;
}

function lookupWinnerByNameKeyPath(
  winners: ConstituencyWinnersMap,
  normalizedConstituencyName: string,
  constituencyName: string | null,
  assemblyVariantLookup: boolean
): MapPolygonWinner | null {
  let winner = winners[normalizedConstituencyName];
  if (!winner) {
    const fuzzyKey = normalizedConstituencyName.replace(/[^A-Z0-9]/g, '');
    winner = winners[fuzzyKey];
  }
  if (!winner && constituencyName) {
    winner = winners[constituencyName.toUpperCase().trim()];
  }
  if (!winner && assemblyVariantLookup) {
    const variants = AC_STYLE_VARIANTS[normalizedConstituencyName];
    if (variants) {
      for (const v of variants) {
        winner = winners[v];
        if (winner) break;
      }
    }
  }
  if (!winner) {
    for (const [key, value] of Object.entries(winners)) {
      const normalizedKey = normalizeName(key)
        .toUpperCase()
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalizedKey === normalizedConstituencyName) {
        winner = value;
        break;
      }
      const keyFuzzy = normalizedKey.replace(/[^A-Z0-9]/g, '');
      const nameFuzzy = normalizedConstituencyName.replace(/[^A-Z0-9]/g, '');
      if (keyFuzzy === nameFuzzy && keyFuzzy.length > 0) {
        winner = value;
        break;
      }
    }
  }
  if (!winner) {
    const collapseRepeated = (s: string): string => s.replace(/(.)\1+/g, '$1');
    const nameCollapsed = collapseRepeated(normalizedConstituencyName);
    for (const [key, value] of Object.entries(winners)) {
      const normalizedKey = normalizeName(key)
        .toUpperCase()
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (collapseRepeated(normalizedKey) === nameCollapsed && nameCollapsed.length > 0) {
        winner = value;
        break;
      }
    }
  }
  return winner ? { party: winner.party, candidate: winner.candidate } : null;
}

export function resolveAssemblyMapPolygonWinner(params: {
  props: Pick<AssemblyProperties, 'AC_NAME' | 'DIST_NAME' | 'schemaId'>;
  winners: ConstituencyWinnersMap;
  suppressAssemblyPartyMapColors: boolean;
  currentPC: string | null;
  currentDistrict: string | null;
  currentState: string | null;
  getStateId: (stateName: string) => string;
  districtWinners: Record<string, string>;
  resolveDistrictName: (districtName: string, stateId: string) => string | null;
}): MapPolygonWinner | null {
  const {
    props,
    winners,
    suppressAssemblyPartyMapColors,
    currentPC,
    currentDistrict,
    currentState,
    getStateId,
    districtWinners,
    resolveDistrictName,
  } = params;

  const schemaId = props.schemaId;
  const schemaWinner = trySchemaWinner(winners, schemaId, suppressAssemblyPartyMapColors);
  if (schemaWinner) return schemaWinner;

  const { constituencyName, normalizedConstituencyName } = normalizeAssemblyPolygonNames(props);
  if (!normalizedConstituencyName || suppressAssemblyPartyMapColors) return null;

  let winner =
    lookupWinnerByNameKeyPath(winners, normalizedConstituencyName, constituencyName, true) ?? null;

  if (!winner && currentPC && Object.keys(winners).length > 0) {
    const pcWinner =
      winners[currentPC.toUpperCase().trim()] ??
      winners[normalizeName(currentPC).toUpperCase().replace(/\s+/g, ' ').trim()];
    if (pcWinner) winner = { party: pcWinner.party, candidate: pcWinner.candidate };
  }

  if (!winner && currentDistrict && currentState && Object.keys(districtWinners).length > 0) {
    const distName = props.DIST_NAME ?? '';
    const stateId = getStateId(currentState);
    const districtId = distName ? resolveDistrictName(distName, stateId) : null;
    const districtParty = districtId ? districtWinners[districtId] : undefined;
    if (districtParty) winner = { party: districtParty, candidate: '' };
  }

  return winner;
}

/**
 * Dominant party string for a district feature (same lookup as MapView district layers).
 */
export function resolveDistrictPolygonParty(
  props: Pick<DistrictProperties, 'district' | 'NAME' | 'DISTRICT' | 'schemaId'>,
  opts: {
    districtWinners: Record<string, string>;
    currentState: string | null;
    getStateId: (stateName: string) => string;
    resolveDistrictName: (districtName: string, stateId: string) => string | null;
    getDistrict?: (districtId: string) => { name?: string } | null | undefined;
    /** Mirrors {@link suppressAssemblyFilePartyMapColors} on district map layers. */
    suppressPartyColors: boolean;
  }
): string | undefined {
  const {
    districtWinners,
    currentState,
    getStateId,
    resolveDistrictName,
    getDistrict,
    suppressPartyColors,
  } = opts;

  if (suppressPartyColors) return undefined;
  if (!currentState || Object.keys(districtWinners).length === 0) return undefined;

  const districtNameRaw = props.district ?? props.NAME ?? props.DISTRICT ?? '';
  const districtName = String(districtNameRaw).trim();
  if (!districtName) return undefined;

  const stateId = getStateId(currentState);
  const districtId = resolveDistrictName(String(districtName), stateId);
  let party: string | undefined = districtId ? districtWinners[districtId] : undefined;

  if (!party && getDistrict) {
    const districtNorm = normalizeName(String(districtName)).toLowerCase().replace(/\s+/g, ' ');
    for (const [did, p] of Object.entries(districtWinners)) {
      const dist = getDistrict(did);
      const name = dist?.name?.trim();
      if (!name) continue;
      const schemaNorm = normalizeName(name).toLowerCase().replace(/\s+/g, ' ');
      if (
        schemaNorm === districtNorm ||
        schemaNorm === districtNorm.replace(/e$/, '') ||
        schemaNorm === districtNorm + 'e'
      ) {
        party = p;
        break;
      }
    }
  }

  return party;
}

export function resolvePcMapPolygonWinner(params: {
  props: Pick<ConstituencyProperties, 'ls_seat_name' | 'PC_NAME' | 'schemaId'>;
  winners: ConstituencyWinnersMap;
  dominantPCParty: string | null;
}): MapPolygonWinner | null {
  const { props, winners, dominantPCParty } = params;

  const schemaWinner = trySchemaWinner(winners, props.schemaId, false);
  if (schemaWinner) return schemaWinner;

  const { constituencyName, normalizedConstituencyName } = normalizePcPolygonNames(props);
  if (!normalizedConstituencyName) return null;

  let winner =
    lookupWinnerByNameKeyPath(winners, normalizedConstituencyName, constituencyName, false) ?? null;

  if (!winner && dominantPCParty) {
    winner = { party: dominantPCParty, candidate: '' };
  }

  return winner;
}
