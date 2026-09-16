import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SummarySeatsPanel } from './SummarySeatsPanel';
import type { StateSummaryPanelData } from '../../types';

function makeData(overrides: Partial<StateSummaryPanelData> = {}): StateSummaryPanelData {
  return {
    variant: 'assembly',
    seatUnitLabel: 'ACs',
    constituenciesCounted: 2,
    totalValidVotes: 1000,
    seatRows: [
      { party: 'DMK', seats: 120 },
      { party: 'AIADMK', seats: 90 },
    ],
    voteRows: null,
    suppressSummaryMessage: null,
    partyCandidateRowsByParty: {},
    ...overrides,
  } as StateSummaryPanelData;
}

describe('SummarySeatsPanel', () => {
  it('renders nothing without summary data', () => {
    const { container } = render(
      <SummarySeatsPanel
        stateSummaryData={null}
        selectedSummaryParty={null}
        openPartyCandidates={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a muted message when a suppress message is set', () => {
    render(
      <SummarySeatsPanel
        stateSummaryData={makeData({ suppressSummaryMessage: 'Results pending' })}
        selectedSummaryParty={null}
        openPartyCandidates={vi.fn()}
      />
    );
    expect(screen.getByText('Results pending')).toBeInTheDocument();
  });

  it('shows a fallback message when there are no seat rows', () => {
    render(
      <SummarySeatsPanel
        stateSummaryData={makeData({ seatRows: [] })}
        selectedSummaryParty={null}
        openPartyCandidates={vi.fn()}
      />
    );
    expect(screen.getByText('No seat data mapped yet.')).toBeInTheDocument();
  });

  it('lists each party with its seat count and calls back with the "seats" tab on click', () => {
    const openPartyCandidates = vi.fn();
    render(
      <SummarySeatsPanel
        stateSummaryData={makeData()}
        selectedSummaryParty={null}
        openPartyCandidates={openPartyCandidates}
      />
    );
    expect(screen.getByText('120')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Filter map by DMK'));
    expect(openPartyCandidates).toHaveBeenCalledWith('DMK', 'seats');
  });

  it('marks the selected party row as selected', () => {
    render(
      <SummarySeatsPanel
        stateSummaryData={makeData()}
        selectedSummaryParty="DMK"
        openPartyCandidates={vi.fn()}
      />
    );
    expect(screen.getByTitle('Filter map by DMK')).toHaveClass('is-selected');
  });
});
