import { describe, it, expect } from 'vitest';
import type { ACElectionResult, ElectionResultsByConstituency } from '../types';
import {
  computeMargin,
  computeNotaSharePercent,
  computeTurnoutPercent,
  computeSwing,
  computeWinnerSwing,
  listRankableConstituencies,
  rankConstituencies,
} from './constituencyMetrics';

function ac(overrides: Partial<ACElectionResult> = {}): ACElectionResult {
  return {
    year: 2021,
    constituencyNo: 1,
    constituencyName: 'Test AC',
    constituencyNameOriginal: 'Test AC',
    constituencyType: 'GEN',
    districtName: 'Test District',
    validVotes: 1000,
    electors: 1500,
    turnout: 66.7,
    enop: 5,
    totalCandidates: 3,
    candidates: [
      {
        position: 1,
        name: 'Alice',
        party: 'DMK',
        votes: 600,
        voteShare: 60,
        margin: 200,
        marginPct: 20,
        sex: 'F',
        age: null,
        depositLost: false,
      },
      {
        position: 2,
        name: 'Bob',
        party: 'ADMK',
        votes: 400,
        voteShare: 40,
        margin: null,
        marginPct: null,
        sex: 'M',
        age: null,
        depositLost: false,
      },
    ],
    ...overrides,
  };
}

function byId(entries: Record<string, ACElectionResult>): ElectionResultsByConstituency {
  return entries;
}

describe('computeMargin', () => {
  it('matches selectResultSummary rather than re-deriving margin independently', () => {
    const result = computeMargin(ac());
    expect(result.margin).toBe(200);
    expect(result.marginPct).toBeCloseTo(20, 5);
  });

  it('returns null for a pending result', () => {
    const result = computeMargin(ac({ resultsPending: true }));
    expect(result.margin).toBeNull();
    expect(result.marginPct).toBeNull();
  });
});

describe('computeNotaSharePercent', () => {
  it('returns NOTA vote share when NOTA contested', () => {
    const result = ac({
      candidates: [
        ...ac().candidates,
        {
          position: 3,
          name: 'NOTA',
          party: 'NOTA',
          votes: 10,
          voteShare: 1,
          margin: null,
          marginPct: null,
          sex: '',
          age: null,
          depositLost: true,
        },
      ],
    });
    expect(computeNotaSharePercent(result)).toBe(1);
  });

  it('returns null when NOTA did not contest', () => {
    expect(computeNotaSharePercent(ac())).toBeNull();
  });

  it('returns null for a pending result even if a NOTA row exists', () => {
    const pending = ac({
      resultsPending: true,
      candidates: [
        {
          position: 1,
          name: 'NOTA',
          party: 'NOTA',
          votes: 10,
          voteShare: 1,
          margin: null,
          marginPct: null,
          sex: '',
          age: null,
          depositLost: true,
        },
      ],
    });
    expect(computeNotaSharePercent(pending)).toBeNull();
  });
});

describe('computeTurnoutPercent', () => {
  it('returns the reported turnout', () => {
    expect(computeTurnoutPercent(ac({ turnout: 71.2 }))).toBeCloseTo(71.2, 5);
  });

  it('treats zero/negative turnout as unknown, not a real value', () => {
    expect(computeTurnoutPercent(ac({ turnout: 0 }))).toBeNull();
  });
});

describe('listRankableConstituencies', () => {
  it('drops _meta and keeps real AC entries', () => {
    const data = byId({ 'TN-001': ac(), 'TN-002': ac({ constituencyNo: 2 }) });
    (data as ElectionResultsByConstituency)._meta = { description: 'test file' };
    const rankable = listRankableConstituencies(data);
    expect(rankable.map((r) => r.id).sort()).toEqual(['TN-001', 'TN-002']);
  });

  it('excludes pending results', () => {
    const data = byId({ 'TN-001': ac(), 'TN-002': ac({ resultsPending: true }) });
    const rankable = listRankableConstituencies(data);
    expect(rankable.map((r) => r.id)).toEqual(['TN-001']);
  });
});

describe('computeSwing', () => {
  it('computes the vote-share change for a party across two years, matched by AC id', () => {
    const current = byId({
      'TN-001': ac({
        candidates: [
          {
            position: 1,
            name: 'Alice',
            party: 'DMK',
            votes: 600,
            voteShare: 60,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
        ],
      }),
    });
    const prior = byId({
      'TN-001': ac({
        candidates: [
          {
            position: 1,
            name: 'Alice2',
            party: 'DMK',
            votes: 500,
            voteShare: 50,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
        ],
      }),
    });

    const swing = computeSwing('TN-001', 'DMK', current, prior);
    expect(swing).not.toBeNull();
    expect(swing!.currentSharePercent).toBe(60);
    expect(swing!.priorSharePercent).toBe(50);
    expect(swing!.swingPercentPoints).toBeCloseTo(10, 5);
  });

  it('returns null, not zero, when there is no prior year at all', () => {
    const current = byId({ 'TN-001': ac() });
    expect(computeSwing('TN-001', 'DMK', current, null)).toBeNull();
    expect(computeSwing('TN-001', 'DMK', current, undefined)).toBeNull();
  });

  it('returns null when the prior file has a different rankable constituency count (delimitation guard)', () => {
    const current = byId({ 'TN-001': ac(), 'TN-002': ac({ constituencyNo: 2 }) });
    const prior = byId({ 'TN-001': ac() }); // only 1 constituency in the prior file
    expect(computeSwing('TN-001', 'DMK', current, prior)).toBeNull();
  });

  it('returns null when the AC is missing from either year', () => {
    const current = byId({ 'TN-001': ac() });
    const prior = byId({ 'TN-002': ac({ constituencyNo: 2 }) });
    expect(computeSwing('TN-001', 'DMK', current, prior)).toBeNull();
  });

  it('returns null when either year is pending', () => {
    const current = byId({ 'TN-001': ac({ resultsPending: true }) });
    const prior = byId({ 'TN-001': ac() });
    expect(computeSwing('TN-001', 'DMK', current, prior)).toBeNull();
  });

  it('returns null when the party did not contest one of the two elections', () => {
    const current = byId({ 'TN-001': ac() }); // has DMK and ADMK
    const prior = byId({
      'TN-001': ac({
        candidates: [
          {
            position: 1,
            name: 'X',
            party: 'INC',
            votes: 500,
            voteShare: 50,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
        ],
      }),
    });
    expect(computeSwing('TN-001', 'DMK', current, prior)).toBeNull();
  });
});

describe('computeWinnerSwing', () => {
  it('uses the current winner party automatically', () => {
    const current = byId({ 'TN-001': ac() }); // winner is DMK, 60%
    const prior = byId({
      'TN-001': ac({
        candidates: [
          {
            position: 1,
            name: 'Alice2',
            party: 'DMK',
            votes: 500,
            voteShare: 50,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
          {
            position: 2,
            name: 'Bob2',
            party: 'ADMK',
            votes: 500,
            voteShare: 50,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
        ],
      }),
    });
    const swing = computeWinnerSwing('TN-001', current, prior);
    expect(swing?.swingPercentPoints).toBeCloseTo(10, 5);
  });

  it('returns null when the current AC cannot be found', () => {
    const current = byId({ 'TN-002': ac({ constituencyNo: 2 }) });
    expect(computeWinnerSwing('TN-001', current, current)).toBeNull();
  });
});

describe('rankConstituencies', () => {
  it('sorts ascending by a numeric metric', () => {
    const items = [
      { id: 'a', v: 30 },
      { id: 'b', v: 10 },
      { id: 'c', v: 20 },
    ];
    const ranked = rankConstituencies(
      items,
      (i) => i.v,
      'asc',
      (i) => i.v
    );
    expect(ranked.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts descending by a numeric metric', () => {
    const items = [
      { id: 'a', v: 30 },
      { id: 'b', v: 10 },
      { id: 'c', v: 20 },
    ];
    const ranked = rankConstituencies(
      items,
      (i) => i.v,
      'desc',
      (i) => i.v
    );
    expect(ranked.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('always sorts nulls last, regardless of direction', () => {
    const items = [
      { id: 'a', v: 10 as number | null },
      { id: 'b', v: null },
      { id: 'c', v: 5 as number | null },
    ];
    const asc = rankConstituencies(
      items,
      (i) => i.v,
      'asc',
      () => 0
    );
    expect(asc.map((i) => i.id)).toEqual(['c', 'a', 'b']);

    const desc = rankConstituencies(
      items,
      (i) => i.v,
      'desc',
      () => 0
    );
    expect(desc.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties (including all-null groups) with the tiebreaker for a stable order', () => {
    const items = [
      { id: 'z', v: null as number | null, tb: 3 },
      { id: 'x', v: null as number | null, tb: 1 },
      { id: 'y', v: null as number | null, tb: 2 },
    ];
    const ranked = rankConstituencies(
      items,
      (i) => i.v,
      'asc',
      (i) => i.tb
    );
    expect(ranked.map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });

  it('does not mutate the input array order via reference sharing surprises', () => {
    const items = [
      { id: 'a', v: 2 },
      { id: 'b', v: 1 },
    ];
    const ranked = rankConstituencies(
      items,
      (i) => i.v,
      'asc',
      (i) => i.v
    );
    expect(ranked).not.toBe(items);
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
