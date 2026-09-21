import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ResultPodium } from './ResultPodium';
import { KpiStrip } from './KpiStrip';
import type { ResultSummary, KpiValues } from '../../utils/resultSummary';

const summary: ResultSummary = {
  winner: { name: 'Alpha', party: 'DMK', votes: 100_000, voteShare: 50 },
  runnerUp: { name: 'Beta', party: 'ADMK', votes: 60_000, voteShare: 30 },
  third: { name: 'Gamma', party: 'BJP', votes: 40_000, voteShare: 20 },
  margin: 40_000,
  marginPct: 20,
};

const emptyKpis: KpiValues = {
  electors: null,
  validVotes: null,
  turnout: null,
  nota: null,
  rejected: null,
  winnerLedBooths: null,
  runnerLedBooths: null,
  totalBooths: null,
};

describe('ResultPodium', () => {
  it('shows the top three and the margin', () => {
    render(<ResultPodium summary={summary} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText('Margin')).toBeInTheDocument();
  });

  it('provides a concise accessible result summary for the visual podium', () => {
    render(<ResultPodium summary={summary} />);
    expect(
      screen.getByRole('region', { name: /winner Alpha, DMK, 1,00,000 votes/i })
    ).toBeInTheDocument();
  });

  it('formats votes with Indian digit grouping', () => {
    render(<ResultPodium summary={summary} />);
    // 1,00,000 not 100,000 - see steal-list S3.
    expect(screen.getByText('1,00,000')).toBeInTheDocument();
  });

  it('renders nothing without a winner, rather than an empty shell', () => {
    const { container } = render(
      <ResultPodium
        summary={{ winner: null, runnerUp: null, third: null, margin: null, marginPct: null }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('omits absent podium places in a two-candidate race', () => {
    render(<ResultPodium summary={{ ...summary, third: null }} />);
    expect(screen.queryByText('3rd')).not.toBeInTheDocument();
    expect(screen.getByText('Runner-up')).toBeInTheDocument();
  });

  it('carries the party colour on the card border for scanning', () => {
    const { container } = render(<ResultPodium summary={summary} />);
    const card = container.querySelector('.podium-card--rank-1') as HTMLElement;
    expect(card.style.borderLeftColor).toBeTruthy();
  });
});

describe('KpiStrip', () => {
  const kpis: KpiValues = {
    electors: 250_000,
    validVotes: 200_000,
    turnout: 80,
    nota: 2_000,
    rejected: 450,
    winnerLedBooths: 244,
    runnerLedBooths: 80,
    totalBooths: 324,
  };

  it('renders all seven-plus figures when present', () => {
    render(<KpiStrip kpis={kpis} />);
    expect(screen.getByText('2,50,000')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('244')).toBeInTheDocument();
    expect(screen.getByText('324')).toBeInTheDocument();
  });

  it('labels booth-lead cells with the actual parties', () => {
    render(<KpiStrip kpis={kpis} winnerPartyLabel="DMK" runnerPartyLabel="ADMK" />);
    expect(screen.getByText('DMK-led booths')).toBeInTheDocument();
    expect(screen.getByText('ADMK-led booths')).toBeInTheDocument();
  });

  it('drops unknown cells instead of printing a fabricated zero', () => {
    // "0 NOTA votes" and "NOTA not loaded" are different claims.
    render(<KpiStrip kpis={{ ...kpis, nota: null, rejected: null }} />);
    expect(screen.queryByText('NOTA')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
    expect(screen.getByText('Turnout')).toBeInTheDocument();
  });

  it('renders nothing when every figure is unknown', () => {
    const { container } = render(<KpiStrip kpis={emptyKpis} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses a description list, so labels and values are programmatically paired', () => {
    const { container } = render(<KpiStrip kpis={kpis} />);
    expect(container.querySelector('dl')).toBeTruthy();
    expect(container.querySelectorAll('dt').length).toBe(container.querySelectorAll('dd').length);
  });
});
