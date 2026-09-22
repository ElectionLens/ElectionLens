import type { JSX } from 'react';

import type { ResultSummary, PodiumEntry } from '../../utils/resultSummary';
import { getPartyColor, getPartyShortName, getPartyFullName } from '../../utils/partyData';
import { formatNumber } from '../../utils/formatNumber';

export interface ResultPodiumProps {
  summary: ResultSummary;
  /** Show short party codes (DMK) rather than full names. */
  partyShortNames?: boolean;
}

interface PodiumCardProps {
  label: string;
  entry: PodiumEntry;
  rank: 1 | 2 | 3;
  partyShortNames: boolean;
}

function PodiumCard({ label, entry, rank, partyShortNames }: PodiumCardProps): JSX.Element {
  const partyColor = getPartyColor(entry.party);
  return (
    <div
      className={`podium-card podium-card--rank-${rank}`}
      style={{ borderLeftColor: partyColor }}
    >
      <div className="podium-card-label">{label}</div>
      <div className="podium-card-name" title={entry.name}>
        {entry.name}
      </div>
      <div className="podium-card-party" title={getPartyFullName(entry.party)}>
        <span className="podium-party-swatch" style={{ background: partyColor }} aria-hidden />
        {partyShortNames ? getPartyShortName(entry.party) : entry.party}
      </div>
      <div className="podium-card-figures">
        {/* Votes dominant, share secondary: the count is the fact, the share is context. */}
        <span className="podium-card-votes">{formatNumber(entry.votes)}</span>
        {entry.voteShare != null && (
          <span className="podium-card-share">{entry.voteShare.toFixed(1)}%</span>
        )}
      </div>
    </div>
  );
}

/**
 * Winner / Runner-up / 3rd / Margin, as a 2x2 grid (UI revamp S1).
 *
 * This is the "know the result in two seconds" card. It replaces a single
 * winner card that sat above a raw candidate table, so the top three and the
 * margin are visible without reading rows.
 *
 * Renders nothing without a winner: an empty podium is worse than no podium,
 * and callers already show pending/loading banners for that case.
 */
export function ResultPodium({
  summary,
  partyShortNames = true,
}: ResultPodiumProps): JSX.Element | null {
  const { winner, runnerUp, third, margin, marginPct } = summary;
  if (!winner) return null;

  const winnerParty = partyShortNames ? getPartyShortName(winner.party) : winner.party;
  const resultLabel = `Result summary: winner ${winner.name}, ${winnerParty}, ${formatNumber(winner.votes)} votes${
    margin != null ? `, margin ${formatNumber(margin)} votes` : ''
  }`;

  return (
    <div
      className="result-podium"
      data-testid="result-podium"
      role="region"
      aria-label={resultLabel}
    >
      <PodiumCard label="Winner" entry={winner} rank={1} partyShortNames={partyShortNames} />
      {runnerUp && (
        <PodiumCard label="Runner-up" entry={runnerUp} rank={2} partyShortNames={partyShortNames} />
      )}
      {third && <PodiumCard label="3rd" entry={third} rank={3} partyShortNames={partyShortNames} />}
      {margin != null && (
        <div className="podium-card podium-card--margin">
          <div className="podium-card-label">Margin</div>
          <div className="podium-card-figures podium-card-figures--margin">
            <span className="podium-card-votes">{formatNumber(margin)}</span>
            {marginPct != null && (
              <span className="podium-card-share">{marginPct.toFixed(1)}%</span>
            )}
          </div>
          {runnerUp && (
            <div className="podium-card-margin-detail">
              over {partyShortNames ? getPartyShortName(runnerUp.party) : runnerUp.party}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
