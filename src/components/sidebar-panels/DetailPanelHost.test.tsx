import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailPanelHost, type DetailPanelHostProps } from './DetailPanelHost';

vi.mock('../ElectionResultPanel', () => ({
  ElectionResultPanel: (props: { result: unknown }) => (
    <div data-testid="ac-panel">{JSON.stringify(props.result)}</div>
  ),
}));
vi.mock('../PCElectionResultPanel', () => ({
  PCElectionResultPanel: (props: { result: unknown }) => (
    <div data-testid="pc-panel">{JSON.stringify(props.result)}</div>
  ),
}));

function baseProps(overrides: Partial<DetailPanelHostProps> = {}): DetailPanelHostProps {
  return {
    showACDetailPanel: false,
    showPCDetailPanel: false,
    electionResult: null,
    acPanelPlaceholderResult: null,
    onCloseElectionPanel: vi.fn(),
    currentState: 'TN',
    availableYears: [2021],
    selectedYear: 2021,
    availablePCYears: [2024],
    selectedACPCYear: null,
    boothResults: null,
    boothsWithResults: [],
    acResultsLoading: false,
    acResultsLoadError: null,
    sidebarLayerOptions: [],
    pcElectionResult: null,
    onClosePCElectionPanel: vi.fn(),
    pcAvailableYears: [2024],
    pcSelectedYear: 2024,
    ...overrides,
  } as DetailPanelHostProps;
}

describe('DetailPanelHost', () => {
  it('renders nothing when neither panel is requested', () => {
    const { container } = render(<DetailPanelHost {...baseProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the AC panel using the real result when available', () => {
    render(
      <DetailPanelHost
        {...baseProps({
          showACDetailPanel: true,
          electionResult: { name: 'Real AC' } as never,
        })}
      />
    );
    expect(screen.getByTestId('ac-panel')).toHaveTextContent('Real AC');
  });

  it('falls back to the placeholder AC result while the real one loads', () => {
    render(
      <DetailPanelHost
        {...baseProps({
          showACDetailPanel: true,
          electionResult: null,
          acPanelPlaceholderResult: { name: 'Placeholder AC' } as never,
        })}
      />
    );
    expect(screen.getByTestId('ac-panel')).toHaveTextContent('Placeholder AC');
  });

  it('renders nothing for the AC panel when there is no result and no close handler', () => {
    const { container } = render(
      <DetailPanelHost
        {...baseProps({
          showACDetailPanel: true,
          electionResult: null,
          acPanelPlaceholderResult: null,
        })}
      />
    );
    expect(container.querySelector('[data-testid="ac-panel"]')).toBeNull();
  });

  it('renders nothing for the AC panel when there is a result but no close handler', () => {
    const { container } = render(
      <DetailPanelHost
        {...baseProps({
          showACDetailPanel: true,
          electionResult: { name: 'X' } as never,
          onCloseElectionPanel: undefined,
        })}
      />
    );
    expect(container.querySelector('[data-testid="ac-panel"]')).toBeNull();
  });

  it('renders the PC panel when requested with a result and close handler', () => {
    render(
      <DetailPanelHost
        {...baseProps({
          showPCDetailPanel: true,
          pcElectionResult: { name: 'Real PC' } as never,
        })}
      />
    );
    expect(screen.getByTestId('pc-panel')).toHaveTextContent('Real PC');
  });

  it('renders nothing for the PC panel without a result', () => {
    const { container } = render(
      <DetailPanelHost {...baseProps({ showPCDetailPanel: true, pcElectionResult: null })} />
    );
    expect(container.querySelector('[data-testid="pc-panel"]')).toBeNull();
  });

  it('prefers the AC panel when both flags are somehow true', () => {
    render(
      <DetailPanelHost
        {...baseProps({
          showACDetailPanel: true,
          showPCDetailPanel: true,
          electionResult: { name: 'AC wins' } as never,
          pcElectionResult: { name: 'PC loses' } as never,
        })}
      />
    );
    expect(screen.getByTestId('ac-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('pc-panel')).not.toBeInTheDocument();
  });
});
