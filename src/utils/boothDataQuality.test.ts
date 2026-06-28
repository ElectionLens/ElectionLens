import { describe, it, expect } from 'vitest';
import {
  boothVoteSource,
  effectiveBoothVoteSource,
  shouldShowBoothQualityBanner,
  shouldShowPostalTab,
  shouldShowUnmappedInPostalTab,
  tierDescription,
} from './boothDataQuality';

describe('boothDataQuality', () => {
  it('classifies booth vote sources', () => {
    expect(boothVoteSource(undefined, 100)).toBe('form20');
    expect(boothVoteSource('residual_booth_fill', 50)).toBe('estimated');
    expect(boothVoteSource('unmapped_booth_fill', 50)).toBe('estimated');
    expect(boothVoteSource('no_form20_row', 0)).toBe('missing');
  });

  it('shows postal tab when postal or unmapped votes exist', () => {
    expect(shouldShowPostalTab({ candidates: [{ postal: 100 }] }, undefined)).toBe(true);
    expect(
      shouldShowPostalTab({ candidates: [{ postal: 0 }] }, undefined, {
        candidates: [{ unmapped: 500, name: 'A', party: 'X', booth: 0, postal: 0, total: 500 }],
      })
    ).toBe(true);
  });

  it('hides quality banner when AC totals reconcile without synthetic fill', () => {
    expect(
      shouldShowBoothQualityBanner({
        tier: 'verified',
        totalBooths: 400,
        form20ParsedBooths: 200,
        estimatedBooths: 0,
        missingBooths: 200,
        form20ParsedPct: 50,
        postalVotes: 1000,
        postalPct: 1,
        unmappedPct: 40,
        acTotalsReconciled: true,
      })
    ).toBe(false);
  });

  it('hides unmapped postal UI when AC totals are complete', () => {
    expect(
      shouldShowUnmappedInPostalTab({
        tier: 'verified',
        totalBooths: 400,
        form20ParsedBooths: 200,
        estimatedBooths: 0,
        missingBooths: 200,
        form20ParsedPct: 50,
        postalVotes: 1000,
        postalPct: 1,
        acTotalsReconciled: true,
      })
    ).toBe(false);
  });

  it('shows booth quality banner only for broken data', () => {
    expect(
      shouldShowBoothQualityBanner({
        tier: 'incomplete',
        totalBooths: 400,
        form20ParsedBooths: 200,
        estimatedBooths: 50,
        missingBooths: 150,
        form20ParsedPct: 50,
        postalVotes: 0,
        postalPct: 0,
        acTotalsReconciled: false,
      })
    ).toBe(true);
  });

  it('treats reconciled booths as form20 for display', () => {
    expect(
      effectiveBoothVoteSource(
        {
          tier: 'verified',
          totalBooths: 10,
          form20ParsedBooths: 5,
          estimatedBooths: 0,
          missingBooths: 5,
          form20ParsedPct: 50,
          postalVotes: 0,
          postalPct: 0,
          acTotalsReconciled: true,
        },
        'no_form20_row',
        0
      )
    ).toBe('form20');
  });

  it('describes unmapped vs postal honestly', () => {
    const text = tierDescription({
      tier: 'partial',
      totalBooths: 400,
      form20ParsedBooths: 300,
      estimatedBooths: 0,
      missingBooths: 100,
      form20ParsedPct: 75,
      postalVotes: 5000,
      postalPct: 2.5,
      unmappedVotes: 40000,
      unmappedPct: 20,
      acTotalsReconciled: false,
    });
    expect(text).toContain('2.5% postal');
    expect(text).toContain('20.0%');
    expect(text).toContain('not postal');
  });
});
