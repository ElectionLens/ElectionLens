/**
 * Pure metric/ranking functions for Phase 2.5 (filtering & ranking, see
 * docs/ui-revamp/10-phase-2.5-plan.md, sub-phase 2.5a).
 *
 * Deliberately thin wrappers where the real logic already exists elsewhere -
 * `selectResultSummary` already computes margin the same way the podium
 * does, and a second implementation here would eventually disagree with it
 * about the same number, exactly the failure mode `selectKpiValues`'s own
 * docstring warns against. The only genuinely new logic in this file is
 * `computeSwing`: nothing in the codebase currently joins two years of the
 * same state's results.
 */
import type { ACElectionResult, ElectionResultsByConstituency } from '../types';
import { isAssemblyResultEntry, skipAssemblyWinnerColoring } from './electionResults';
import { selectResultSummary, positiveOrNull } from './resultSummary';

export interface MarginMetric {
  margin: number | null;
  marginPct: number | null;
}

/** Winner-over-runner-up margin, in votes and as a share of valid votes. */
export function computeMargin(
  result: Pick<ACElectionResult, 'candidates' | 'validVotes' | 'resultsPending'>
): MarginMetric {
  const summary = selectResultSummary(result);
  return { margin: summary.margin, marginPct: summary.marginPct };
}

/** NOTA's share of the vote, or null when NOTA didn't contest or the result is pending. */
export function computeNotaSharePercent(
  result: Pick<ACElectionResult, 'candidates' | 'resultsPending'>
): number | null {
  if (result.resultsPending) return null;
  const nota = result.candidates?.find((c) => c.party === 'NOTA');
  const share = nota?.voteShare;
  return share != null && Number.isFinite(share) ? share : null;
}

/**
 * Turnout as already reported on the result. Routed through `positiveOrNull`
 * (shared with the podium/KPI strip) so a genuine 0%/missing turnout reads
 * as "unknown," never as a real last-place value in a ranking.
 */
export function computeTurnoutPercent(result: Pick<ACElectionResult, 'turnout'>): number | null {
  return positiveOrNull(result.turnout);
}

export interface SwingResult {
  currentSharePercent: number;
  priorSharePercent: number;
  /** Positive = the party gained share; negative = it lost share. */
  swingPercentPoints: number;
}

/**
 * Change in one party's vote share between two elections for "the same" AC.
 *
 * Matched by the shared object key both year files use for that
 * constituency (e.g. `"TN-001"`) - not by name, which can be spelled
 * differently across sourcing passes for the same seat.
 *
 * Returns `null` - not `0` - when: the prior year is missing entirely, the
 * prior file's rankable constituency count differs from the current one
 * (the cheapest available signal for mid-decade delimitation, which
 * invalidates a same-AC comparison outright), either year's result for this
 * AC is absent/pending, or the party didn't contest one of the two
 * elections. A missing swing must never be silently read as "no swing."
 */
export function computeSwing(
  acId: string,
  party: string,
  current: ElectionResultsByConstituency,
  prior: ElectionResultsByConstituency | null | undefined
): SwingResult | null {
  if (!prior) return null;

  // Delimitation guard: if the two files don't even agree on how many real
  // constituencies exist, per-AC identity across them can't be trusted.
  if (listRankableConstituencies(current).length !== listRankableConstituencies(prior).length) {
    return null;
  }

  const currentResult = current[acId];
  const priorResult = prior[acId];
  if (!isAssemblyResultEntry(acId, currentResult) || !isAssemblyResultEntry(acId, priorResult)) {
    return null;
  }
  if (currentResult.resultsPending || priorResult.resultsPending) return null;

  const currentShare = currentResult.candidates.find((c) => c.party === party)?.voteShare;
  const priorShare = priorResult.candidates.find((c) => c.party === party)?.voteShare;
  if (
    currentShare == null ||
    priorShare == null ||
    !Number.isFinite(currentShare) ||
    !Number.isFinite(priorShare)
  ) {
    return null;
  }

  return {
    currentSharePercent: currentShare,
    priorSharePercent: priorShare,
    swingPercentPoints: currentShare - priorShare,
  };
}

/** Convenience: swing for whoever currently holds the seat, not a caller-chosen party. */
export function computeWinnerSwing(
  acId: string,
  current: ElectionResultsByConstituency,
  prior: ElectionResultsByConstituency | null | undefined
): SwingResult | null {
  const currentResult = current[acId];
  if (!isAssemblyResultEntry(acId, currentResult)) return null;
  const winner = selectResultSummary(currentResult).winner;
  if (!winner) return null;
  return computeSwing(acId, winner.party, current, prior);
}

export interface RankableConstituency {
  id: string;
  result: ACElectionResult;
}

/**
 * Every real, countable AC in a state-year file: drops `_meta`, malformed
 * entries, and anything `skipAssemblyWinnerColoring` already knows isn't a
 * real result yet (pending elections, announced-candidates-only files).
 * Reused rather than re-deriving that determination, despite the name
 * referring to map coloring - "not safe to color a winner" and "not safe to
 * rank" are the same underlying fact about the data.
 */
export function listRankableConstituencies(
  byId: ElectionResultsByConstituency
): RankableConstituency[] {
  const fileMeta = byId._meta;
  const out: RankableConstituency[] = [];
  for (const [id, value] of Object.entries(byId)) {
    if (!isAssemblyResultEntry(id, value)) continue;
    if (skipAssemblyWinnerColoring(value, fileMeta)) continue;
    out.push({ id, result: value });
  }
  return out;
}

export type RankDirection = 'asc' | 'desc';

/**
 * Sort by a metric, generic over the item type so the same function ranks by
 * margin, turnout, NOTA share, or swing without duplication.
 *
 * Nulls always sort last regardless of direction - "unknown" must never look
 * like the best or worst result, which letting them fall to either end of an
 * asc/desc list would silently imply. Ties (including all-null groups) break
 * on `tieBreakerFn` for a stable, reproducible order, since a saved/shared
 * ranked run (Phase 2.5h) depends on the same input producing the same order
 * every time.
 */
export function rankConstituencies<T>(
  items: T[],
  metricFn: (item: T) => number | null,
  direction: RankDirection,
  tieBreakerFn: (item: T) => number
): T[] {
  const withMetric = items.map((item) => ({ item, value: metricFn(item) }));
  const sign = direction === 'asc' ? 1 : -1;

  withMetric.sort((a, b) => {
    if (a.value == null && b.value == null) return tieBreakerFn(a.item) - tieBreakerFn(b.item);
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    if (a.value !== b.value) return sign * (a.value - b.value);
    return tieBreakerFn(a.item) - tieBreakerFn(b.item);
  });

  return withMetric.map((w) => w.item);
}
