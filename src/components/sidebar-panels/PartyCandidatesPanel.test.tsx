import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyCandidatesPanel, type PartyCandidatesPanelProps } from './PartyCandidatesPanel';
import type { PartyCandidateRow, StateSummaryPanelData } from '../../types';

function row(overrides: Partial<PartyCandidateRow> = {}): PartyCandidateRow {
  return {
    party: 'DMK',
    candidateName: 'A Candidate',
    constituencyName: 'AC One',
    votes: 1000,
    voteShare: 50,
    position: 1,
    ...overrides,
  } as PartyCandidateRow;
}

function baseProps(overrides: Partial<PartyCandidatesPanelProps> = {}): PartyCandidatesPanelProps {
  return {
    party: 'DMK',
    stateSummaryData: {
      partyCandidateRowsByParty: {
        DMK: [
          row({ candidateName: 'Alpha', constituencyName: 'Zed AC', voteShare: 40, position: 2 }),
          row({ candidateName: 'Beta', constituencyName: 'Alpha AC', voteShare: 60, position: 1 }),
        ],
      },
    } as unknown as StateSummaryPanelData,
    partyCandidateQuery: '',
    onPartyCandidateQueryChange: vi.fn(),
    partyCandidateSort: 'share',
    onPartyCandidateSortChange: vi.fn(),
    showVotePaneOutcome: true,
    onCandidateSelect: vi.fn(),
    ...overrides,
  };
}

describe('PartyCandidatesPanel', () => {
  it('renders nothing without a party or summary data', () => {
    const { container: c1 } = render(<PartyCandidatesPanel {...baseProps({ party: null })} />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(
      <PartyCandidatesPanel {...baseProps({ stateSummaryData: null })} />
    );
    expect(c2.firstChild).toBeNull();
  });

  it('sorts by vote share descending by default', () => {
    render(<PartyCandidatesPanel {...baseProps()} />);
    const names = screen.getAllByRole('button').map((b) => b.querySelector('strong')?.textContent);
    expect(names).toEqual(['Beta', 'Alpha']);
  });

  it('sorts by constituency name when requested', () => {
    render(<PartyCandidatesPanel {...baseProps({ partyCandidateSort: 'constituency' })} />);
    const names = screen.getAllByRole('button').map((b) => b.querySelector('strong')?.textContent);
    expect(names).toEqual(['Beta', 'Alpha']); // "Alpha AC" < "Zed AC"
  });

  it('filters by candidate or constituency name (case-insensitive)', () => {
    render(<PartyCandidatesPanel {...baseProps({ partyCandidateQuery: 'zed' })} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument();
  });

  it('shows a no-match message when the filter excludes everything', () => {
    render(<PartyCandidatesPanel {...baseProps({ partyCandidateQuery: 'nonexistent' })} />);
    expect(screen.getByText('No candidates match this filter.')).toBeInTheDocument();
  });

  it('shows Won/Lost outcome labels when showVotePaneOutcome is true', () => {
    render(<PartyCandidatesPanel {...baseProps()} />);
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('Lost (2nd)')).toBeInTheDocument();
  });

  it('hides outcome labels when showVotePaneOutcome is false', () => {
    render(<PartyCandidatesPanel {...baseProps({ showVotePaneOutcome: false })} />);
    expect(screen.queryByText('Won')).not.toBeInTheDocument();
  });

  it('fires the query/sort change and candidate-select callbacks', () => {
    const onPartyCandidateQueryChange = vi.fn();
    const onPartyCandidateSortChange = vi.fn();
    const onCandidateSelect = vi.fn();
    render(
      <PartyCandidatesPanel
        {...baseProps({
          onPartyCandidateQueryChange,
          onPartyCandidateSortChange,
          onCandidateSelect,
        })}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Filter candidate or constituency'), {
      target: { value: 'be' },
    });
    expect(onPartyCandidateQueryChange).toHaveBeenCalledWith('be');

    fireEvent.change(screen.getByLabelText('Sort', { selector: 'select' }), {
      target: { value: 'constituency' },
    });
    expect(onPartyCandidateSortChange).toHaveBeenCalledWith('constituency');

    fireEvent.click(screen.getByText('Beta'));
    expect(onCandidateSelect).toHaveBeenCalledWith(
      expect.objectContaining({ candidateName: 'Beta' })
    );
  });

  it('handles a party with no rows at all', () => {
    render(
      <PartyCandidatesPanel
        {...baseProps({ stateSummaryData: { partyCandidateRowsByParty: {} } as never })}
      />
    );
    expect(screen.getByText('0 of 0 shown')).toBeInTheDocument();
  });
});
