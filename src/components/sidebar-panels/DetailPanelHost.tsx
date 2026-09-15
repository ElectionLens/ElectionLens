import type { ReactNode } from 'react';
import { ElectionResultPanel } from '../ElectionResultPanel';
import { PCElectionResultPanel } from '../PCElectionResultPanel';
import type { YearOption } from '../YearSelector';
import type { ACElectionResult, PCElectionResult } from '../../types';

interface ACParliamentContribution {
  pcName: string;
  year: number;
  candidates: Array<{
    name: string;
    party: string;
    votes: number;
    voteShare: number;
    position: number;
  }>;
  validVotes: number;
}
import type { BoothResults, BoothWithResult } from '../../hooks/useBoothData';

export interface DetailPanelHostProps {
  showACDetailPanel: boolean;
  showPCDetailPanel: boolean;
  electionResult: ACElectionResult | null;
  acPanelPlaceholderResult: ACElectionResult | null;
  onCloseElectionPanel?: (() => void) | undefined;
  shareUrl?: string | undefined;
  currentState: string | null;
  availableYears: number[];
  selectedYear: number | null;
  onYearChange?: ((year: number) => void) | undefined;
  parliamentContributions?: Record<number, ACParliamentContribution> | undefined;
  availablePCYears: number[];
  selectedACPCYear: number | null;
  onACPCYearChange?: ((year: number | null) => void) | undefined;
  pcContributionShareUrl?: string | undefined;
  boothResults: BoothResults | null;
  boothsWithResults: BoothWithResult[];
  acResultsLoading: boolean;
  acResultsLoadError: string | null;
  sidebarLayerOptions: YearOption[];
  onElectionPanelViewTabSync?:
    | ((tab: 'overview' | 'booths' | 'postal' | 'analysis') => void)
    | undefined;
  pcElectionResult: PCElectionResult | null;
  onClosePCElectionPanel?: (() => void) | undefined;
  pcShareUrl?: string | undefined;
  pcAvailableYears: number[];
  pcSelectedYear: number | null;
  onPCYearChange?: ((year: number) => void) | undefined;
}

/** Hosts whichever detail panel (AC or PC) is currently open, or nothing. */
export function DetailPanelHost({
  showACDetailPanel,
  showPCDetailPanel,
  electionResult,
  acPanelPlaceholderResult,
  onCloseElectionPanel,
  shareUrl,
  currentState,
  availableYears,
  selectedYear,
  onYearChange,
  parliamentContributions,
  availablePCYears,
  selectedACPCYear,
  onACPCYearChange,
  pcContributionShareUrl,
  boothResults,
  boothsWithResults,
  acResultsLoading,
  acResultsLoadError,
  sidebarLayerOptions,
  onElectionPanelViewTabSync,
  pcElectionResult,
  onClosePCElectionPanel,
  pcShareUrl,
  pcAvailableYears,
  pcSelectedYear,
  onPCYearChange,
}: DetailPanelHostProps): ReactNode {
  if (showACDetailPanel) {
    const acResult = electionResult ?? acPanelPlaceholderResult;
    const onCloseAc = onCloseElectionPanel;
    if (!acResult || !onCloseAc) return null;
    return (
      <div className="sidebar-detail-host">
        <ElectionResultPanel
          result={acResult}
          onClose={onCloseAc}
          omitConstituencyHeading
          shareUrl={shareUrl}
          stateName={currentState ?? undefined}
          availableYears={availableYears}
          selectedYear={selectedYear ?? undefined}
          onYearChange={onYearChange}
          parliamentContributions={parliamentContributions}
          availablePCYears={availablePCYears}
          selectedPCYear={selectedACPCYear}
          onPCYearChange={onACPCYearChange}
          pcContributionShareUrl={pcContributionShareUrl}
          boothResults={boothResults}
          boothsWithResults={boothsWithResults}
          acResultsLoading={!electionResult && acResultsLoading}
          acResultsLoadError={!electionResult ? acResultsLoadError : null}
          layerOptions={sidebarLayerOptions}
          onViewTabSync={onElectionPanelViewTabSync}
        />
      </div>
    );
  }
  if (showPCDetailPanel) {
    if (!pcElectionResult || !onClosePCElectionPanel) return null;
    return (
      <div className="sidebar-detail-host">
        <PCElectionResultPanel
          result={pcElectionResult}
          onClose={onClosePCElectionPanel}
          omitConstituencyHeading
          shareUrl={pcShareUrl}
          stateName={currentState ?? undefined}
          availableYears={pcAvailableYears}
          selectedYear={pcSelectedYear ?? undefined}
          onYearChange={onPCYearChange}
          layerOptions={sidebarLayerOptions}
        />
      </div>
    );
  }
  return null;
}
