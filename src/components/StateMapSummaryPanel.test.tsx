import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { StateMapSummaryPanel } from './StateMapSummaryPanel';

describe('StateMapSummaryPanel', () => {
  it('renders seat and vote lists and footer', () => {
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

    const root = document.querySelector('.state-map-summary-panel');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('state-map-summary-assembly');

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/10 ACs counted/)).toBeInTheDocument();
    expect(screen.getByText(/2,000 valid votes/)).toBeInTheDocument();
  });

  it('renders parliament variant lists', () => {
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

    expect(document.querySelector('.state-map-summary-parliament')).not.toBeNull();
    expect(screen.getByText(/100\.0%/)).toBeInTheDocument();
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

    const sections = document.querySelectorAll('.state-map-summary-section');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(within(sections[0] as HTMLElement).getByText(msg)).toBeInTheDocument();
    expect(within(sections[1] as HTMLElement).getByText(msg)).toBeInTheDocument();
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

  it('renders clickable seat rows and exposes selected state', () => {
    const onPartyToggle = vi.fn();
    render(
      <StateMapSummaryPanel
        variant="assembly"
        stateDisplayName="Test State"
        subtitle="Assembly 2021"
        seatRows={[
          { party: 'DMK', seats: 5 },
          { party: 'AIADMK', seats: 3 },
        ]}
        voteRows={null}
        totalValidVotes={0}
        constituenciesCounted={8}
        seatUnitLabel="ACs"
        selectedParty="DMK"
        onPartyToggle={onPartyToggle}
      />
    );

    const buttons = screen.getAllByRole('button');
    const dmkBtn = buttons.find(
      (btn) => btn.textContent?.includes('DMK') && !btn.textContent?.includes('AIADMK')
    );
    const aiadmkBtn = buttons.find((btn) => btn.textContent?.includes('AIADMK'));
    expect(dmkBtn).toBeDefined();
    expect(aiadmkBtn).toBeDefined();
    expect(dmkBtn!).toHaveAttribute('aria-pressed', 'true');
    expect(aiadmkBtn!).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(aiadmkBtn!);
    expect(onPartyToggle).toHaveBeenCalledWith('AIADMK');

    fireEvent.click(dmkBtn!);
    expect(onPartyToggle).toHaveBeenLastCalledWith(null);
  });
});
