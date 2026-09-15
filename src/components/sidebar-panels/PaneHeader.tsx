import type { ReactNode } from 'react';
import { LeftPaneButton } from '../LeftPaneButton';

export type LeftPane = 'root' | 'region' | 'summary' | 'party' | 'ac' | 'pc';
export type LeftPaneView = 'seats' | 'votes' | null;

export interface LeftPaneChangeInput {
  pane: LeftPane;
  paneView?: LeftPaneView;
  paneParty?: string | null;
}

export interface PaneHeaderProps {
  leftPane: LeftPane;
  leftPaneView: LeftPaneView;
  leftPaneParty: string | null;
  summaryReturnTab: 'seats' | 'votes';
  onReset: () => void;
  onLeftPaneChange?: ((next: LeftPaneChangeInput) => void) | undefined;
  onCloseElectionPanel?: (() => void) | undefined;
  onClosePCElectionPanel?: (() => void) | undefined;
}

/** "← Back" header shown above the pane stack (region/summary/party/ac/pc), one level per screen. */
export function PaneHeader({
  leftPane,
  leftPaneView,
  leftPaneParty,
  summaryReturnTab,
  onReset,
  onLeftPaneChange,
  onCloseElectionPanel,
  onClosePCElectionPanel,
}: PaneHeaderProps): ReactNode {
  if (leftPane === 'root') return null;
  let title = 'Region';
  let onBack = onReset;
  if (leftPane === 'summary') {
    title = leftPaneView === 'votes' ? 'Vote share' : 'Seats won';
    onBack = () => onLeftPaneChange?.({ pane: 'region', paneView: null, paneParty: null });
  } else if (leftPane === 'party') {
    title = 'Party candidates';
    onBack = () =>
      onLeftPaneChange?.({
        pane: 'summary',
        paneView: leftPaneView ?? summaryReturnTab,
        paneParty: null,
      });
  } else if (leftPane === 'ac') {
    title = 'Assembly detail';
    onBack = () => {
      onCloseElectionPanel?.();
      onLeftPaneChange?.({
        pane: leftPaneParty ? 'party' : 'region',
        paneView: leftPaneView ?? summaryReturnTab,
        paneParty: leftPaneParty,
      });
    };
  } else if (leftPane === 'pc') {
    title = 'Parliament detail';
    onBack = () => {
      onClosePCElectionPanel?.();
      onLeftPaneChange?.({
        pane: leftPaneParty ? 'party' : 'region',
        paneView: leftPaneView ?? summaryReturnTab,
        paneParty: leftPaneParty,
      });
    };
  } else if (leftPane === 'region') {
    title = 'Region';
    onBack = onReset;
  }
  return (
    <div className="pane-stack-header">
      <LeftPaneButton variant="back" aria-label="Go back one level" onClick={onBack}>
        ← Back
      </LeftPaneButton>
      <span className="pane-stack-title">{title}</span>
    </div>
  );
}
