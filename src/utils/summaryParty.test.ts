import { describe, expect, it } from 'vitest';
import { isSummaryPartyPresent } from './summaryParty';

describe('isSummaryPartyPresent', () => {
  it('returns true when party is in seats', () => {
    expect(
      isSummaryPartyPresent(
        'DMK',
        [{ party: 'DMK' }, { party: 'AIADMK' }],
        [{ party: 'DMK', votes: 100, pct: 50 }]
      )
    ).toBe(true);
  });

  it('returns true when party is vote-only with zero seats', () => {
    expect(
      isSummaryPartyPresent(
        'NTK',
        [{ party: 'DMK' }, { party: 'AIADMK' }],
        [
          { party: 'DMK', votes: 100, pct: 40 },
          { party: 'NTK', votes: 75, pct: 30 },
        ]
      )
    ).toBe(true);
  });

  it('returns false when party is absent in both seats and votes', () => {
    expect(
      isSummaryPartyPresent('BJP', [{ party: 'DMK' }], [{ party: 'AIADMK', votes: 50, pct: 20 }])
    ).toBe(false);
  });
});
