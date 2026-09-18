import type { ReactNode } from 'react';
import type { StateSummaryPanelData } from '../../types';
import { SummaryFooter } from './SummaryFooter';
import { SeatSummaryList } from './SeatSummaryList';

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
        <p className="state-map-summary-subtitle">{stateSummaryData.subtitle}</p>
        {stateSummaryData.suppressSummaryMessage && (
          <p className="state-map-summary-muted state-map-summary-warning">
            {stateSummaryData.suppressSummaryMessage}
          </p>
        )}
        <SeatSummaryList
          rows={stateSummaryData.seatRows}
          selectedParty={selectedSummaryParty}
          onPartyChange={onSummaryPartyChange}
          onPartyOpen={(party) => openPartyCandidates(party, 'seats')}
        />
      </div>

      <SummaryFooter stateSummaryData={stateSummaryData} />
    </div>
  );
}
