import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { ElectionCandidate } from '../../types';
import { getPartyColor, getPartyFullName, getPartyShortName } from '../../utils/partyData';
import { embeddedPartyChipStyle, formatNumber } from './shared';
import { CandidateBar } from './CandidateBar';

export const CandidateRow = memo(function CandidateRow({
  candidate,
  isWinner,
  isRunnerUp,
  hideVoteStats = false,
  partyShortNames = false,
  embeddedPanel = false,
  displayRank,
  leaderShare = 0,
}: {
  candidate: ElectionCandidate;
  isWinner: boolean;
  isRunnerUp: boolean;
  hideVoteStats?: boolean;
  partyShortNames?: boolean;
  embeddedPanel?: boolean;
  /**
   * Rank to show in the `#` column. Supplied by the list so ranks stay contiguous:
   * `candidate.position` comes from source data where NOTA was removed *after*
   * ranking, leaving gaps (1,2,3,4,6...). Falls back to `position` when omitted.
   */
  displayRank?: number;
  /**
   * Largest vote share in the field, so bars can be drawn relative to the
   * leader. Omitted (or 0) falls back to an absolute 0-100 scale.
   */
  leaderShare?: number;
}): JSX.Element {
  const partyColor = getPartyColor(candidate.party);
  const partyText = partyShortNames ? getPartyShortName(candidate.party) : candidate.party;

  const partyChipStyle: CSSProperties = embeddedPanel
    ? embeddedPartyChipStyle(partyColor)
    : {
        backgroundColor: `${partyColor}20`,
        color: partyColor,
        borderColor: partyColor,
        borderWidth: 1,
        borderStyle: 'solid',
      };

  return (
    <div
      className={`candidate-row interactive-row ${isWinner ? 'winner' : ''} ${isRunnerUp ? 'runner-up' : ''}`}
    >
      <span className="col-pos">{displayRank ?? candidate.position}</span>
      <span className="col-name" title={candidate.name}>
        {candidate.name}
        {candidate.sex && <span className="sex-badge">{candidate.sex}</span>}
      </span>
      <span className="col-party" title={getPartyFullName(candidate.party)} style={partyChipStyle}>
        {partyText}
      </span>
      <span className="col-votes">{hideVoteStats ? '—' : formatNumber(candidate.votes)}</span>
      <span className="col-share">
        {hideVoteStats ? '—' : `${candidate.voteShare.toFixed(1)}%`}
      </span>
      {!hideVoteStats && (
        <CandidateBar
          voteShare={candidate.voteShare}
          party={candidate.party}
          leaderShare={leaderShare}
        />
      )}
    </div>
  );
});
