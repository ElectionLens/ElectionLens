import type { ReactNode } from 'react';

import { getPartyColor, getPartyShortName } from '../../utils/partyData';
import { LeftPaneButton } from '../LeftPaneButton';
import type { StateSummaryPanelData } from '../../types';

export interface SeatSummaryListProps {
  rows: StateSummaryPanelData['seatRows'];
  selectedParty: string | null;
  onPartyChange?: ((party: string | null) => void) | undefined;
  onPartyOpen: (party: string) => void;
}

/** Compact seat breakdown shared by the Seats pane and derived Vote share pane. */
export function SeatSummaryList({
  rows,
  selectedParty,
  onPartyChange,
  onPartyOpen,
}: SeatSummaryListProps): ReactNode {
  if (rows.length === 0) {
    return <p className="state-map-summary-muted">No seat data mapped yet.</p>;
  }

  return (
    <ul className="state-map-summary-list">
      {rows.map((row) => {
        const color = getPartyColor(row.party);
        const isSelected = selectedParty === row.party;
        return (
          <li key={row.party} className="state-map-summary-list-item">
            <LeftPaneButton
              variant="row"
              className={`state-map-summary-row interactive-row ${isSelected ? 'is-selected' : ''}`}
              title={`Filter map by ${row.party}`}
              onClick={() => onPartyOpen(row.party)}
              {...(onPartyChange && { 'aria-pressed': isSelected })}
            >
              <span
                className="state-map-summary-swatch"
                style={{ backgroundColor: color, boxShadow: `0 0 0 1px ${color}40` }}
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
  );
}
