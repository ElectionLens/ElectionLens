import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { ElectionCandidate } from '../../types';
import { getPartyColor, getPartyFullName, getPartyShortName } from '../../utils/partyData';
import { embeddedPartyChipStyle, formatNumber } from './shared';

export const CandidateRow = memo(function CandidateRow({
  candidate,
  isWinner,
  isRunnerUp,
  hideVoteStats = false,
  partyShortNames = false,
  embeddedPanel = false,
}: {
  candidate: ElectionCandidate;
  isWinner: boolean;
  isRunnerUp: boolean;
  hideVoteStats?: boolean;
  partyShortNames?: boolean;
  embeddedPanel?: boolean;
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
      <span className="col-pos">{candidate.position}</span>
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
        <div
          className="vote-bar"
          style={{
            width: `${Math.min(candidate.voteShare, 100)}%`,
            backgroundColor: partyColor,
          }}
        />
      )}
    </div>
  );
});
