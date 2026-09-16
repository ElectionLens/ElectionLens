import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SummaryVotesPanel } from './SummaryVotesPanel';
import type { StateSummaryPanelData } from '../../types';

function makeData(overrides: Partial<StateSummaryPanelData> = {}): StateSummaryPanelData {
  return {
    variant: 'assembly',
    seatUnitLabel: 'ACs',
    constituenciesCounted: 2,
    totalValidVotes: 1000,
    seatRows: [],
    voteRows: [
      { party: 'DMK', votes: 600, pct: 60 },
      { party: 'AIADMK', votes: 400, pct: 40 },
    ],
    suppressSummaryMessage: null,
    partyCandidateRowsByParty: {},
    ...overrides,
  } as StateSummaryPanelData;
}

describe('SummaryVotesPanel', () => {
  it('renders nothing without summary data', () => {
    const { container } = render(
      <SummaryVotesPanel
        stateSummaryData={null}
        selectedSummaryParty={null}
        openPartyCandidates={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the suppress message when vote rows are empty and a message is set', () => {
    render(
      <SummaryVotesPanel
        stateSummaryData={makeData({ voteRows: [], suppressSummaryMessage: 'No votes yet' })}
        selectedSummaryParty={null}
        openPartyCandidates={vi.fn()}
      />
    );
    expect(screen.getByText('No votes yet')).toBeInTheDocument();
  });

  it('falls back to a generic loading message when vote rows are empty with no explicit message', () => {
    render(
      <SummaryVotesPanel
        stateSummaryData={makeData({ voteRows: [] })}
        selectedSummaryParty={null}
        openPartyCandidates={vi.fn()}
      />
    );
    expect(screen.getByText('Loading or no result file matched to the map.')).toBeInTheDocument();
  });

  it('lists each party with vote share and formatted absolute votes, and calls back with "votes"', () => {
    const openPartyCandidates = vi.fn();
    render(
      <SummaryVotesPanel
        stateSummaryData={makeData()}
        selectedSummaryParty={null}
        openPartyCandidates={openPartyCandidates}
      />
    );
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('(600)')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Filter map by DMK'));
    expect(openPartyCandidates).toHaveBeenCalledWith('DMK', 'votes');
  });
});
