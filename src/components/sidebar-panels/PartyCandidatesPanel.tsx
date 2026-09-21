import type { ReactNode } from 'react';
import { getPartyShortName } from '../../utils/partyData';
import { LeftPaneButton } from '../LeftPaneButton';
import type { PartyCandidateRow, StateSummaryPanelData } from '../../types';
import { formatIn, partyCandidateOutcomeLabel } from './shared';

export interface PartyCandidatesPanelProps {
  party: string | null;
  stateSummaryData: StateSummaryPanelData | null;
  partyCandidateQuery: string;
  onPartyCandidateQueryChange: (value: string) => void;
  partyCandidateSort: 'share' | 'constituency';
  onPartyCandidateSortChange: (value: 'share' | 'constituency') => void;
  showVotePaneOutcome: boolean;
  onCandidateSelect: (row: PartyCandidateRow) => void;
}

/** Drill-down list of every candidate for one party, reached from the seats/votes summary. */
export function PartyCandidatesPanel({
  party,
  stateSummaryData,
  partyCandidateQuery,
  onPartyCandidateQueryChange,
  partyCandidateSort,
  onPartyCandidateSortChange,
  showVotePaneOutcome,
  onCandidateSelect,
}: PartyCandidatesPanelProps): ReactNode {
  if (!stateSummaryData || !party) return null;
  const sourceRows = stateSummaryData.partyCandidateRowsByParty?.[party] ?? [];
  const query = partyCandidateQuery.trim().toLowerCase();
  const filtered = sourceRows.filter((row) => {
    if (!query) return true;
    return (
      (row.candidateName ?? '').toLowerCase().includes(query) ||
      (row.constituencyName ?? '').toLowerCase().includes(query)
    );
  });
  const rows = [...filtered].sort((a, b) => {
    if (partyCandidateSort === 'constituency') {
      const byConst = a.constituencyName.localeCompare(b.constituencyName);
      if (byConst !== 0) return byConst;
    }
    return b.voteShare !== a.voteShare ? b.voteShare - a.voteShare : a.position - b.position;
  });

  return (
    <div className="sidebar-summary party-candidates-panel" data-summary-pane="party-candidates">
      <div className="party-candidates-header">
        <h3>{getPartyShortName(party)} candidates</h3>
        <p aria-live="polite">
          {rows.length} of {sourceRows.length} shown
        </p>
      </div>
      <div className="party-candidates-controls">
        <input
          type="text"
          value={partyCandidateQuery}
          onChange={(e) => onPartyCandidateQueryChange(e.target.value)}
          placeholder="Filter candidate or constituency"
          aria-label="Filter party candidates"
        />
        <label>
          Sort
          <select
            value={partyCandidateSort}
            onChange={(e) => onPartyCandidateSortChange(e.target.value as 'share' | 'constituency')}
          >
            <option value="share">Vote share</option>
            <option value="constituency">Constituency</option>
          </select>
        </label>
      </div>
      <div className="party-candidates-list">
        {rows.length === 0 ? (
          <p className="state-map-summary-muted">No candidates match this filter.</p>
        ) : (
          rows.map((row, index) => {
            const outcomeText = partyCandidateOutcomeLabel(row);
            return (
              <LeftPaneButton
                variant="row"
                key={`${row.party}-${row.candidateName}-${row.constituencyName}-${index}`}
                className="party-candidate-row interactive-row"
                onClick={() => onCandidateSelect(row)}
              >
                <span className="party-candidate-main">
                  <span className="party-candidate-main-top">
                    <strong>{row.candidateName}</strong>
                    {showVotePaneOutcome ? (
                      <span
                        className={`party-candidate-outcome ${
                          row.position === 1
                            ? 'party-candidate-outcome--won'
                            : typeof row.position === 'number' && row.position > 1
                              ? 'party-candidate-outcome--lost'
                              : ''
                        }`}
                        title={outcomeText}
                      >
                        {outcomeText}
                      </span>
                    ) : null}
                  </span>
                  <span className="party-candidate-constituency">{row.constituencyName}</span>
                </span>
                <span className="party-candidate-metrics">
                  <span>{row.voteShare.toFixed(1)}%</span>
                  <span>{formatIn(row.votes)}</span>
                </span>
              </LeftPaneButton>
            );
          })
        )}
      </div>
    </div>
  );
}
