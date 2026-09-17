import { describe, it, expect } from 'vitest';

import { selectResultSummary, selectKpiValues } from './resultSummary';
import type { ElectionCandidate } from '../types';

function candidate(partial: Partial<ElectionCandidate>): ElectionCandidate {
  return {
    position: 1,
    name: 'Someone',
    party: 'IND',
    votes: 0,
    voteShare: 0,
    margin: null,
    marginPct: null,
    sex: 'M',
    age: null,
    depositLost: false,
    ...partial,
  };
}

describe('selectResultSummary', () => {
  const candidates = [
    candidate({ name: 'Alpha', party: 'DMK', votes: 100_000, voteShare: 50 }),
    candidate({ name: 'Beta', party: 'ADMK', votes: 60_000, voteShare: 30 }),
    candidate({ name: 'Gamma', party: 'BJP', votes: 40_000, voteShare: 20 }),
  ];

  it('picks the top three in order', () => {
    const summary = selectResultSummary({ candidates, validVotes: 200_000 });
    expect(summary.winner?.name).toBe('Alpha');
    expect(summary.runnerUp?.name).toBe('Beta');
    expect(summary.third?.name).toBe('Gamma');
  });

  it('computes margin from the top two', () => {
    const summary = selectResultSummary({ candidates, validVotes: 200_000 });
    expect(summary.margin).toBe(40_000);
    expect(summary.marginPct).toBeCloseTo(20);
  });

  it('re-ranks defensively when the source file is mis-ordered', () => {
    // Crowning the wrong candidate is the worst error this app could make, so
    // arrival order is never trusted.
    const scrambled = [candidates[1]!, candidates[2]!, candidates[0]!];
    const summary = selectResultSummary({ candidates: scrambled, validVotes: 200_000 });
    expect(summary.winner?.name).toBe('Alpha');
    expect(summary.margin).toBe(40_000);
  });

  it('ignores candidate.margin, which is stale or null on some sources', () => {
    const withBadMargin = [
      candidate({ name: 'Alpha', party: 'DMK', votes: 100_000, margin: 999 }),
      candidate({ name: 'Beta', party: 'ADMK', votes: 60_000 }),
    ];
    expect(selectResultSummary({ candidates: withBadMargin, validVotes: 200_000 }).margin).toBe(
      40_000
    );
  });

  it('returns nulls for a pending result rather than a fake zero-vote podium', () => {
    const summary = selectResultSummary({
      candidates,
      validVotes: 0,
      resultsPending: true,
    });
    expect(summary.winner).toBeNull();
    expect(summary.margin).toBeNull();
  });

  it('handles a single-candidate race without inventing a runner-up', () => {
    const summary = selectResultSummary({
      candidates: [candidates[0]!],
      validVotes: 100_000,
    });
    expect(summary.winner?.name).toBe('Alpha');
    expect(summary.runnerUp).toBeNull();
    expect(summary.margin).toBeNull();
  });

  it('omits marginPct when valid votes are unknown, instead of dividing by zero', () => {
    const summary = selectResultSummary({ candidates, validVotes: 0 });
    expect(summary.margin).toBe(40_000);
    expect(summary.marginPct).toBeNull();
  });

  it('returns empty for missing or empty input', () => {
    expect(selectResultSummary(null).winner).toBeNull();
    expect(selectResultSummary({ candidates: [], validVotes: 0 }).winner).toBeNull();
  });
});

describe('selectKpiValues', () => {
  const result = { electors: 250_000, validVotes: 200_000, turnout: 80 };
  const summary = selectResultSummary({
    candidates: [
      candidate({ name: 'Alpha', party: 'DMK', votes: 100_000 }),
      candidate({ name: 'Beta', party: 'ADMK', votes: 84_000 }),
    ],
    validVotes: 200_000,
  });

  /** Booth file whose per-candidate columns sum to the official totals. */
  function healthyBooths(overrides: Record<string, unknown> = {}) {
    return {
      totalBooths: 2,
      candidates: [{ party: 'DMK' }, { party: 'ADMK' }],
      results: {
        b1: { votes: [50_000, 42_000], total: 92_000 },
        b2: { votes: [50_000, 42_000], total: 92_000 },
      },
      ...overrides,
    } as never;
  }

  it('reads headline figures off the AC result', () => {
    const kpis = selectKpiValues(result, null, undefined, summary);
    expect(kpis.electors).toBe(250_000);
    expect(kpis.validVotes).toBe(200_000);
    expect(kpis.turnout).toBe(80);
  });

  it('distinguishes unknown from zero', () => {
    // A missing NOTA figure and a genuine zero are different claims; rendering
    // a confident "0" for the former would misrepresent the data.
    const kpis = selectKpiValues(
      { electors: 0, validVotes: 0, turnout: 0 },
      null,
      undefined,
      summary
    );
    expect(kpis.electors).toBeNull();
    expect(kpis.nota).toBeNull();
    expect(kpis.totalBooths).toBeNull();
  });

  it('pulls NOTA and rejected out of postal data', () => {
    const boothResults = healthyBooths({
      postal: {
        candidates: [{ name: 'NOTA', party: 'NOTA', postal: 10, booth: 1_990, total: 2_000 }],
        totalValid: 200_000,
        rejected: 450,
        nota: 2_000,
        total: 202_450,
      },
    });
    const kpis = selectKpiValues(result, boothResults, undefined, summary);
    expect(kpis.nota).toBe(2_000);
    expect(kpis.rejected).toBe(450);
  });

  it('falls back to totalBooths when there is no booth-level analysis', () => {
    const kpis = selectKpiValues(result, healthyBooths(), undefined, summary);
    expect(kpis.totalBooths).toBe(2);
    expect(kpis.winnerLedBooths).toBeNull();
  });

  describe('corrupt booth columns', () => {
    // Real bug: four TN 2021 ACs record the runner-up's booth votes as a few
    // hundred against an official total in the tens of thousands, so summed
    // leads claim the winner led every booth in a six-point race.
    const corrupt = {
      totalBooths: 2,
      candidates: [{ party: 'DMK' }, { party: 'ADMK' }],
      results: {
        b1: { votes: [50_000, 53], total: 50_053 },
        b2: { votes: [50_000, 54], total: 50_054 },
      },
    } as never;

    it('suppresses booth-lead counts rather than publishing a false landslide', () => {
      const kpis = selectKpiValues(result, corrupt, undefined, summary);
      expect(kpis.winnerLedBooths).toBeNull();
      expect(kpis.runnerLedBooths).toBeNull();
    });

    it('still reports the booth count, which remains knowable', () => {
      // We know how many booths exist; we just cannot say who led them.
      expect(selectKpiValues(result, corrupt, undefined, summary).totalBooths).toBe(2);
    });

    it('leaves healthy booth files alone', () => {
      const kpis = selectKpiValues(result, healthyBooths(), undefined, summary);
      expect(kpis.totalBooths).toBe(2);
    });
  });
});
