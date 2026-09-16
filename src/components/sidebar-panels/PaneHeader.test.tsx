import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaneHeader, type PaneHeaderProps } from './PaneHeader';

function baseProps(overrides: Partial<PaneHeaderProps> = {}): PaneHeaderProps {
  return {
    leftPane: 'region',
    leftPaneView: null,
    leftPaneParty: null,
    summaryReturnTab: 'seats',
    onReset: vi.fn(),
    onLeftPaneChange: vi.fn(),
    onCloseElectionPanel: vi.fn(),
    onClosePCElectionPanel: vi.fn(),
    ...overrides,
  };
}

describe('PaneHeader', () => {
  it('renders nothing at the root pane', () => {
    const { container } = render(<PaneHeader {...baseProps({ leftPane: 'root' })} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Region" and calls onReset from the region pane', () => {
    const onReset = vi.fn();
    render(<PaneHeader {...baseProps({ leftPane: 'region', onReset })} />);
    expect(screen.getByText('Region')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back one level' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('titles the summary pane by vote/seat view and goes back to region', () => {
    const onLeftPaneChange = vi.fn();
    render(
      <PaneHeader
        {...baseProps({ leftPane: 'summary', leftPaneView: 'votes', onLeftPaneChange })}
      />
    );
    expect(screen.getByText('Vote share')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onLeftPaneChange).toHaveBeenCalledWith({
      pane: 'region',
      paneView: null,
      paneParty: null,
    });
  });

  it('titles the summary pane "Seats won" when not showing votes', () => {
    render(<PaneHeader {...baseProps({ leftPane: 'summary', leftPaneView: 'seats' })} />);
    expect(screen.getByText('Seats won')).toBeInTheDocument();
  });

  it('party pane goes back to summary, preferring the current view over the return tab', () => {
    const onLeftPaneChange = vi.fn();
    render(
      <PaneHeader
        {...baseProps({
          leftPane: 'party',
          leftPaneView: 'votes',
          summaryReturnTab: 'seats',
          onLeftPaneChange,
        })}
      />
    );
    expect(screen.getByText('Party candidates')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onLeftPaneChange).toHaveBeenCalledWith({
      pane: 'summary',
      paneView: 'votes',
      paneParty: null,
    });
  });

  it('party pane falls back to summaryReturnTab when leftPaneView is null', () => {
    const onLeftPaneChange = vi.fn();
    render(
      <PaneHeader
        {...baseProps({
          leftPane: 'party',
          leftPaneView: null,
          summaryReturnTab: 'votes',
          onLeftPaneChange,
        })}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onLeftPaneChange).toHaveBeenCalledWith(expect.objectContaining({ paneView: 'votes' }));
  });

  it('AC pane closes the election panel and returns to party when a party is active', () => {
    const onCloseElectionPanel = vi.fn();
    const onLeftPaneChange = vi.fn();
    render(
      <PaneHeader
        {...baseProps({
          leftPane: 'ac',
          leftPaneParty: 'DMK',
          onCloseElectionPanel,
          onLeftPaneChange,
        })}
      />
    );
    expect(screen.getByText('Assembly detail')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onCloseElectionPanel).toHaveBeenCalledTimes(1);
    expect(onLeftPaneChange).toHaveBeenCalledWith(
      expect.objectContaining({ pane: 'party', paneParty: 'DMK' })
    );
  });

  it('AC pane returns to region when no party is active', () => {
    const onLeftPaneChange = vi.fn();
    render(
      <PaneHeader {...baseProps({ leftPane: 'ac', leftPaneParty: null, onLeftPaneChange })} />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onLeftPaneChange).toHaveBeenCalledWith(expect.objectContaining({ pane: 'region' }));
  });

  it('PC pane closes the PC election panel and shows "Parliament detail"', () => {
    const onClosePCElectionPanel = vi.fn();
    render(<PaneHeader {...baseProps({ leftPane: 'pc', onClosePCElectionPanel })} />);
    expect(screen.getByText('Parliament detail')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onClosePCElectionPanel).toHaveBeenCalledTimes(1);
  });

  it('tolerates missing optional callbacks', () => {
    render(
      <PaneHeader
        leftPane="ac"
        leftPaneView={null}
        leftPaneParty={null}
        summaryReturnTab="seats"
        onReset={vi.fn()}
      />
    );
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});
