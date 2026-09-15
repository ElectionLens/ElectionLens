import type { ReactNode } from 'react';
import type { StateSummaryPanelData } from '../../types';
import { formatIn } from './shared';

export interface SummaryFooterProps {
  stateSummaryData: StateSummaryPanelData | null;
}

/** Small "N seats/constituencies counted · N valid votes" footer shared by the seats/votes panels. */
export function SummaryFooter({ stateSummaryData }: SummaryFooterProps): ReactNode {
  if (!stateSummaryData) return null;
  return (
    <div className="share-bar state-map-summary-footer">
      <div className="share-bar-info">
        <span className="district-label">
          {stateSummaryData.constituenciesCounted} {stateSummaryData.seatUnitLabel} counted
          {stateSummaryData.totalValidVotes > 0
            ? ` · ${formatIn(stateSummaryData.totalValidVotes)} valid votes`
            : ''}
        </span>
      </div>
    </div>
  );
}
