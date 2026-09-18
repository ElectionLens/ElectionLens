import type { ACElectionResult } from '../types';
import type { BoothResults, BoothWithResult } from '../hooks/useBoothData';
import { computeBoothwiseAnalysis } from '../components/election-result-panel/boothwiseAnalysisEngine';

/**
 * Headline numbers for the result panel (UI revamp S1/S2).
 *
 * `null` means "we do not know", which is deliberately distinct from `0` - an
 * election with zero NOTA votes and an election whose NOTA figure we never
 * loaded are different claims, and rendering a confident "0" for the latter
 * would be a lie about the data. Every consumer must handle null explicitly.
 */
export interface PodiumEntry {
  name: string;
  party: string;
  votes: number;
  voteShare: number | null;
}

export interface ResultSummary {
  winner: PodiumEntry | null;
  runnerUp: PodiumEntry | null;
  third: PodiumEntry | null;
  /** Winner's lead over the runner-up, in votes. */
  margin: number | null;
  /** Margin as a share of valid votes. */
  marginPct: number | null;
}

export interface KpiValues {
  electors: number | null;
  validVotes: number | null;
  turnout: number | null;
  nota: number | null;
  rejected: number | null;
  /** Booths where the official winner also led (S2). */
  winnerLedBooths: number | null;
  runnerLedBooths: number | null;
  totalBooths: number | null;
}

/** Treat non-finite and non-positive counts as unknown rather than real zeros. */
function positiveOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Below this fraction of a candidate's official total, their per-booth column
 * is treated as corrupt rather than merely incomplete.
 */
const BOOTH_COLUMN_TRUST_RATIO = 0.5;

/**
 * Do the per-booth candidate columns actually add up to the official result?
 *
 * Some booth files have a near-empty column for a major candidate: in TN 2021,
 * four ACs record the runner-up's booth votes as a few hundred against an
 * official total in the tens of thousands (e.g. Bargur, ADMK: 107 vs 84,642).
 * Summed booth leads then say the winner led *every* booth in a race they won
 * by six points, which is false.
 *
 * `dataQuality.acTotalsReconciled` does not catch these - it is absent on the
 * affected files - so the columns are checked directly against the official
 * totals we are about to display beside them.
 */
function boothColumnsAreTrustworthy(boothResults: BoothResults, summary: ResultSummary): boolean {
  const { winner, runnerUp } = summary;
  if (!winner || !runnerUp) return true;

  const candidates = boothResults.candidates;
  const rows = Object.values(boothResults.results ?? {});
  if (!candidates?.length || rows.length === 0) return false;

  const totals = new Map<string, number>();
  for (const row of rows) {
    row.votes?.forEach((votes, index) => {
      const party = candidates[index]?.party;
      if (!party || !Number.isFinite(votes)) return;
      totals.set(party, (totals.get(party) ?? 0) + votes);
    });
  }

  // Only the top two need checking: they decide every lead count we display.
  return [winner, runnerUp].every(
    (entry) => (totals.get(entry.party) ?? 0) >= entry.votes * BOOTH_COLUMN_TRUST_RATIO
  );
}

/**
 * Pick the top three candidates and the winning margin.
 *
 * Results are assumed to arrive ranked, but we sort defensively: a single
 * mis-ordered source file would otherwise crown the wrong candidate, which is
 * the most damaging error this app could make.
 */
export interface ResultCandidateLike {
  name: string;
  party: string;
  votes: number;
  voteShare?: number | null | undefined;
}

export interface ResultSummaryInput {
  candidates: ResultCandidateLike[];
  validVotes: number;
  resultsPending?: boolean | undefined;
}

export function selectResultSummary(result: ResultSummaryInput | null | undefined): ResultSummary {
  const empty: ResultSummary = {
    winner: null,
    runnerUp: null,
    third: null,
    margin: null,
    marginPct: null,
  };
  if (!result?.candidates?.length || result.resultsPending) return empty;

  const ranked = [...result.candidates]
    .filter((candidate) => Number.isFinite(candidate.votes))
    .sort((a, b) => b.votes - a.votes);
  if (ranked.length === 0) return empty;

  const toEntry = (index: number): PodiumEntry | null => {
    const candidate = ranked[index];
    if (!candidate) return null;
    return {
      name: candidate.name,
      party: candidate.party,
      votes: candidate.votes,
      voteShare:
        candidate.voteShare != null && Number.isFinite(candidate.voteShare)
          ? candidate.voteShare
          : null,
    };
  };

  const winner = toEntry(0);
  const runnerUp = toEntry(1);

  // Recomputed from the top two rather than trusting candidate.margin, which is
  // null on some sources and stale on others.
  const margin = winner && runnerUp ? winner.votes - runnerUp.votes : null;
  const validVotes = positiveOrNull(result.validVotes);
  const marginPct = margin != null && validVotes ? (margin / validVotes) * 100 : null;

  return { winner, runnerUp, third: toEntry(2), margin, marginPct };
}

export function selectBasicKpiValues(
  result:
    | (Pick<ResultSummaryInput, 'validVotes'> & {
        electors?: number | null | undefined;
        turnout?: number | null | undefined;
      })
    | null
    | undefined
): KpiValues {
  return {
    electors: positiveOrNull(result?.electors),
    validVotes: positiveOrNull(result?.validVotes),
    turnout: positiveOrNull(result?.turnout),
    nota: null,
    rejected: null,
    winnerLedBooths: null,
    runnerLedBooths: null,
    totalBooths: null,
  };
}

/**
 * Gather the KPI strip figures from the AC result plus, where available, booth
 * data.
 *
 * Booth-lead counts come from `computeBoothwiseAnalysis` rather than being
 * recounted here: that engine already resolves which booths have trustworthy
 * vote sources, and a second implementation would inevitably disagree with the
 * Analysis tab about the same number.
 */
export function selectKpiValues(
  result: Pick<ACElectionResult, 'electors' | 'validVotes' | 'turnout'> | null | undefined,
  boothResults: BoothResults | null | undefined,
  boothsWithResults: BoothWithResult[] | undefined,
  summary: ResultSummary
): KpiValues {
  // Booth-lead counts are only as good as the booth columns behind them.
  // Suppressing them beats publishing "winner led 350 of 350" for a race won
  // by six points.
  const boothsTrusted = boothResults ? boothColumnsAreTrustworthy(boothResults, summary) : false;

  const analysis =
    boothsTrusted && boothResults && boothsWithResults?.length
      ? computeBoothwiseAnalysis(boothResults, boothsWithResults, summary.winner?.party, false)
      : null;

  const postal = boothResults?.postal;
  const notaFromPostal = postal?.candidates?.find((c) => c.party === 'NOTA' || c.name === 'NOTA');

  return {
    electors: positiveOrNull(result?.electors),
    validVotes: positiveOrNull(result?.validVotes),
    turnout: positiveOrNull(result?.turnout),
    nota: positiveOrNull(notaFromPostal?.total ?? postal?.nota),
    rejected: positiveOrNull(postal?.rejected),
    winnerLedBooths: positiveOrNull(analysis?.winnerBoothCount),
    runnerLedBooths: positiveOrNull(analysis?.runnerUpBoothCount),
    // The booth *count* stays trustworthy even when the vote columns are not:
    // we know how many booths exist, we just cannot say who led them.
    totalBooths: positiveOrNull(analysis?.totalBooths ?? boothResults?.totalBooths),
  };
}
