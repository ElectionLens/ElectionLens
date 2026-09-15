import type { ReactNode } from 'react';
import { getPartyColor, getPartyShortName } from '../../utils/partyData';
import { LeftPaneButton } from '../LeftPaneButton';
import type { StateSummaryPanelData } from '../../types';
import { SummaryFooter } from './SummaryFooter';

export interface SummarySeatsPanelProps {
  stateSummaryData: StateSummaryPanelData | null;
  selectedSummaryParty: string | null;
  onSummaryPartyChange?: ((party: string | null) => void) | undefined;
  openPartyCandidates: (party: string, sourceTab: 'seats' | 'votes') => void;
}

/** "Seats won" list for the current state summary. */
export function SummarySeatsPanel({
  stateSummaryData,
  selectedSummaryParty,
  onSummaryPartyChange,
  openPartyCandidates,
}: SummarySeatsPanelProps): ReactNode {
  if (!stateSummaryData) return null;
  return (
    <div
      className="sidebar-summary"
      data-summary-variant={stateSummaryData.variant}
      data-summary-pane="seats"
    >
      <div className="state-map-summary-section">
        {stateSummaryData.suppressSummaryMessage ? (
          <p className="state-map-summary-muted">{stateSummaryData.suppressSummaryMessage}</p>
        ) : stateSummaryData.seatRows.length === 0 ? (
          <p className="state-map-summary-muted">No seat data mapped yet.</p>
        ) : (
          <ul className="state-map-summary-list">
            {stateSummaryData.seatRows.map((row) => {
              const col = getPartyColor(row.party);
              const isSelected = selectedSummaryParty === row.party;
              return (
                <li key={row.party} className="state-map-summary-list-item">
                  <LeftPaneButton
                    variant="row"
                    className={`state-map-summary-row interactive-row ${isSelected ? 'is-selected' : ''}`}
                    title={`Filter map by ${row.party}`}
                    onClick={() => openPartyCandidates(row.party, 'seats')}
                    {...(onSummaryPartyChange && { 'aria-pressed': isSelected })}
                  >
                    <span
                      className="state-map-summary-swatch"
                      style={{ backgroundColor: col, boxShadow: `0 0 0 1px ${col}40` }}
                    />
                    <span className="state-map-summary-party" title={row.party}>
                      {getPartyShortName(row.party)}
                    </span>
                    <span className="state-map-summary-value">{row.seats}</span>
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
