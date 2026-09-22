import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { ACElectionResult, ElectionResultsByConstituency } from '../types';
import {
  computeMargin,
  computeNotaSharePercent,
  computeTurnoutPercent,
  computeWinnerSwing,
  listRankableConstituencies,
  rankConstituencies,
  type RankDirection,
} from '../utils/constituencyMetrics';
import { getPartyColor, getPartyShortName } from '../utils/partyData';
import {
  formatIn,
  rowHoverProps,
  sidebarListRowKeyDown,
  type ExtendedCSSProperties,
  type RowHoverHandlers,
} from './sidebar-panels/shared';

/**
 * Metrics this list knows how to rank by. Deliberately a closed set (not a
 * free-text "field name") so every option always has an explicit label and a
 * matching formatter - see docs/ui-revamp/09-filtering-and-ranking.md's rule
 * that a ranked list must never present a bare, unlabelled "Top N."
 */
export type RankMetricKind = 'margin' | 'turnout' | 'nota' | 'winnerSwing';

interface RankedRow {
  id: string;
  result: ACElectionResult;
  value: number | null;
}

const METRIC_LABELS: Record<RankMetricKind, (direction: RankDirection) => string> = {
  margin: (dir) =>
    dir === 'asc' ? 'Closest contests - smallest winning margin' : 'Largest winning margins',
  turnout: (dir) => (dir === 'asc' ? 'Lowest turnout' : 'Highest turnout'),
  nota: (dir) => (dir === 'asc' ? 'Lowest NOTA share' : 'Highest NOTA share'),
  winnerSwing: (dir) =>
    dir === 'asc'
      ? "Winner's party lost the most vote share since last time"
      : "Winner's party gained the most vote share since last time",
};

function metricValue(
  metric: 'margin' | 'turnout' | 'nota',
  result: ACElectionResult
): number | null {
  switch (metric) {
    case 'margin':
      return computeMargin(result).margin;
    case 'turnout':
      return computeTurnoutPercent(result);
    case 'nota':
      return computeNotaSharePercent(result);
  }
}

function formatMetricValue(
  metric: RankMetricKind,
  result: ACElectionResult,
  value: number | null
): string {
  if (value == null) return 'Data unavailable';
  switch (metric) {
    case 'margin': {
      const { marginPct } = computeMargin(result);
      return marginPct != null
        ? `${formatIn(value)} votes (${marginPct.toFixed(1)}%)`
        : `${formatIn(value)} votes`;
    }
    case 'turnout':
    case 'nota':
      return `${value.toFixed(1)}%`;
    case 'winnerSwing':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)} pp`;
  }
}

function acDisplayName(result: ACElectionResult): string {
  return result.name ?? result.constituencyName ?? result.constituencyNameOriginal ?? '';
}

function winnerOf(result: ACElectionResult): { name: string; party: string } | null {
  const top = result.candidates?.[0];
  if (!top) return null;
  return { name: top.name, party: top.party };
}

export interface RankedConstituencyListProps extends RowHoverHandlers {
  /** All constituencies for the currently selected state + year - already loaded by the caller. */
  results: ElectionResultsByConstituency;
  /** Same shape for the prior election in this state; only read when `metric` is `winnerSwing`. */
  priorResults?: ElectionResultsByConstituency | null | undefined;
  metric: RankMetricKind;
  direction: RankDirection;
  /** Defaults to 20, matching the worked example in 09-filtering-and-ranking.md. */
  limit?: number;
  onSelect: (id: string, result: ACElectionResult) => void;
  emptyState?: ReactNode;
}

/**
 * Ranked list of constituencies by a named, explicit metric (never a bare
 * "Top N"). Generalizes the one-off ranked lists that used to live only in
 * `BlogSection`'s hardcoded TN-2026 alliance post - this works for any
 * already-loaded state + year, any of the four metrics above.
 *
 * Presentational conventions (interactive-row, keyboard activation, map
 * hover-link) intentionally match `AssemblyBrowseList` exactly so a row here
 * behaves identically to a row in the plain browse list.
 */
export function RankedConstituencyList({
  results,
  priorResults,
  metric,
  direction,
  limit = 20,
  onSelect,
  onRowEnter,
  onRowLeave,
  emptyState,
}: RankedConstituencyListProps): ReactNode {
  const rankable = listRankableConstituencies(results);

  const rows: RankedRow[] = rankable.map(({ id, result }) => ({
    id,
    result,
    value:
      metric === 'winnerSwing'
        ? (computeWinnerSwing(id, results, priorResults)?.swingPercentPoints ?? null)
        : metricValue(metric, result),
  }));

  const ranked = rankConstituencies(
    rows,
    (row) => row.value,
    direction,
    (row) => row.result.constituencyNo
  ).slice(0, limit);

  const missingCount = rows.length - ranked.filter((r) => r.value != null).length;

  if (ranked.length === 0) {
    return (
      <>{emptyState ?? <div className="no-data-message">No constituencies to rank yet.</div>}</>
    );
  }

  return (
    <div className="ranked-constituency-list">
      <h3 className="ranked-list-title">
        <ArrowUpDown size={14} className="item-icon" aria-hidden="true" />
        {METRIC_LABELS[metric](direction)} ({ranked.length})
      </h3>
      {ranked.map((row, index) => {
        const winner = winnerOf(row.result);
        const color = winner ? getPartyColor(winner.party) : undefined;
        const handleActivate = (): void => onSelect(row.id, row.result);
        const style: ExtendedCSSProperties | undefined = color
          ? { '--item-color': color }
          : undefined;
        return (
          <div
            key={row.id}
            className="ranked-list-row interactive-row"
            style={style}
            onClick={handleActivate}
            onKeyDown={(e: KeyboardEvent) => sidebarListRowKeyDown(e, handleActivate)}
            {...rowHoverProps(
              { onRowEnter, onRowLeave },
              {
                level: 'assemblies',
                name: acDisplayName(row.result),
                no: row.result.constituencyNo,
                schemaId: row.id,
              }
            )}
            role="button"
            tabIndex={0}
          >
            <span className="ranked-list-rank">#{index + 1}</span>
            <div className="ranked-list-info">
              <span className="ranked-list-name">{acDisplayName(row.result)}</span>
              <span className="ranked-list-district">{row.result.districtName}</span>
              {winner && (
                <span className="ranked-list-winner">
                  {getPartyShortName(winner.party)} - {winner.name}
                </span>
              )}
            </div>
            <span className="ranked-list-value">
              {formatMetricValue(metric, row.result, row.value)}
            </span>
          </div>
        );
      })}
      {missingCount > 0 && (
        <p className="ranked-list-missing-note">
          {missingCount} constituenc{missingCount === 1 ? 'y is' : 'ies are'} missing data for this
          metric and {missingCount === 1 ? 'is' : 'are'} not shown above.
        </p>
      )}
    </div>
  );
}
