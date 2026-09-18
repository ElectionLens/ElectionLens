import type { ReactNode } from 'react';
import { getPartyColor, getPartyShortName } from '../../utils/partyData';
import { LeftPaneButton } from '../LeftPaneButton';
import type { StateSummaryPanelData } from '../../types';
import { formatIn } from './shared';
import { SummaryFooter } from './SummaryFooter';

export interface SummaryVotesPanelProps {
  stateSummaryData: StateSummaryPanelData | null;
  selectedSummaryParty: string | null;
  onSummaryPartyChange?: ((party: string | null) => void) | undefined;
  openPartyCandidates: (party: string, sourceTab: 'seats' | 'votes') => void;
}

/** "Vote share" list for the current state summary. */
export function SummaryVotesPanel({
  stateSummaryData,
  selectedSummaryParty,
  onSummaryPartyChange,
  openPartyCandidates,
}: SummaryVotesPanelProps): ReactNode {
  if (!stateSummaryData) return null;
  return (
    <div
      className="sidebar-summary"
      data-summary-variant={stateSummaryData.variant}
      data-summary-pane="votes"
    >
      <div className="state-map-summary-section">
        <p className="state-map-summary-subtitle">{stateSummaryData.subtitle}</p>
        {stateSummaryData.suppressSummaryMessage && (
          <p className="state-map-summary-muted state-map-summary-warning">
            {stateSummaryData.suppressSummaryMessage}
          </p>
        )}
        {!stateSummaryData.voteRows?.length ? (
          <p className="state-map-summary-muted">
            {'Loading or no result file matched to the map.'}
          </p>
        ) : (
          <ul className="state-map-summary-list">
            {stateSummaryData.voteRows.map((row) => {
              const col = getPartyColor(row.party);
              const isSelected = selectedSummaryParty === row.party;
              return (
                <li key={row.party} className="state-map-summary-list-item">
                  <LeftPaneButton
                    variant="row"
                    className={`state-map-summary-row interactive-row ${isSelected ? 'is-selected' : ''}`}
                    title={`Filter map by ${row.party}`}
                    onClick={() => openPartyCandidates(row.party, 'votes')}
                    {...(onSummaryPartyChange && { 'aria-pressed': isSelected })}
                  >
                    <span
                      className="state-map-summary-swatch"
                      style={{ backgroundColor: col, boxShadow: `0 0 0 1px ${col}40` }}
                    />
                    <span className="state-map-summary-party" title={row.party}>
                      {getPartyShortName(row.party)}
                    </span>
                    <span className="state-map-summary-votepct">
                      {row.pct.toFixed(1)}%
                      <span className="state-map-summary-voteabs"> ({formatIn(row.votes)})</span>
                    </span>
                  </LeftPaneButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SummaryFooter stateSummaryData={stateSummaryData} />
    </div>
  );
}
