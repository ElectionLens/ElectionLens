import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryFooter } from './SummaryFooter';
import type { StateSummaryPanelData } from '../../types';

function makeData(overrides: Partial<StateSummaryPanelData> = {}): StateSummaryPanelData {
  return {
    variant: 'assembly',
    seatUnitLabel: 'ACs',
    constituenciesCounted: 234,
    totalValidVotes: 232630,
    seatRows: [],
    voteRows: null,
    suppressSummaryMessage: null,
    partyCandidateRowsByParty: {},
    ...overrides,
  } as StateSummaryPanelData;
}

describe('SummaryFooter', () => {
  it('renders nothing when there is no summary data', () => {
    const { container } = render(<SummaryFooter stateSummaryData={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the counted unit and en-IN formatted vote total', () => {
    render(<SummaryFooter stateSummaryData={makeData()} />);
    expect(screen.getByText('234 ACs counted · 2,32,630 valid votes')).toBeInTheDocument();
  });

  it('omits the vote clause when total valid votes is zero', () => {
    render(<SummaryFooter stateSummaryData={makeData({ totalValidVotes: 0 })} />);
    expect(screen.getByText('234 ACs counted')).toBeInTheDocument();
  });
});
