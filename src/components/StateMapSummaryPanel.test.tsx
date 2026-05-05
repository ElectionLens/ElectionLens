import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StateMapSummaryPanel } from './StateMapSummaryPanel';

describe('StateMapSummaryPanel', () => {
  it('renders assembly title, seat and vote sections', () => {
    render(
      <StateMapSummaryPanel
        variant="assembly"
        stateDisplayName="Test State"
        subtitle="Assembly 2021"
        seatRows={[{ party: 'DMK', seats: 5 }]}
        voteRows={[{ party: 'DMK', votes: 1000, pct: 50 }]}
        totalValidVotes={2000}
        constituenciesCounted={10}
        seatUnitLabel="ACs"
      />
    );

    const root = screen
      .getByRole('heading', { name: /Assembly • Test State/i })
      .closest('.state-map-summary-panel');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('state-map-summary-assembly');

    expect(screen.getByText('Assembly 2021')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Seats won \(ACs\)/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Vote share \(statewide\)/i })).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/10 ACs counted/)).toBeInTheDocument();
    expect(screen.getByText(/2,000 valid votes/)).toBeInTheDocument();
  });

  it('uses “state” vote share label for parliament variant', () => {
    render(
      <StateMapSummaryPanel
        variant="parliament"
        stateDisplayName="Test State"
        subtitle="Lok Sabha 2024"
        seatRows={[{ party: 'X', seats: 1 }]}
        voteRows={[{ party: 'X', votes: 100, pct: 100 }]}
        totalValidVotes={100}
        constituenciesCounted={1}
        seatUnitLabel="PCs"
      />
    );

    expect(screen.getByRole('heading', { name: /Lok Sabha • Test State/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Seats won \(PCs\)/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Vote share \(state\)/i })).toBeInTheDocument();
  });

  it('shows suppress message in seat section and in vote section when votes are empty', () => {
    const msg = 'Pre-poll / announced-only data: treat seat and vote aggregates as provisional.';
    render(
      <StateMapSummaryPanel
        variant="assembly"
        stateDisplayName="S"
        subtitle="Assembly 2026"
        seatRows={[{ party: 'A', seats: 1 }]}
        voteRows={null}
        totalValidVotes={0}
        constituenciesCounted={1}
        seatUnitLabel="ACs"
        suppressSummaryMessage={msg}
      />
    );

    const seatSection = screen.getByRole('heading', { name: /Seats won/i }).closest('div');
    expect(seatSection).not.toBeNull();
    expect(within(seatSection!).getByText(msg)).toBeInTheDocument();

    const voteHeading = screen.getByRole('heading', { name: /Vote share/i });
    const voteSection = voteHeading.closest('.state-map-summary-section');
    expect(voteSection).not.toBeNull();
    expect(within(voteSection!).getByText(msg)).toBeInTheDocument();
  });

  it('shows empty seat copy when no rows and not suppressed', () => {
    render(
      <StateMapSummaryPanel
        variant="assembly"
        stateDisplayName="S"
        subtitle="Y"
        seatRows={[]}
        voteRows={null}
        totalValidVotes={0}
        constituenciesCounted={0}
        seatUnitLabel="ACs"
      />
    );

    expect(screen.getByText('No seat data mapped yet.')).toBeInTheDocument();
    expect(screen.getByText('Loading or no result file matched to the map.')).toBeInTheDocument();
  });
});
