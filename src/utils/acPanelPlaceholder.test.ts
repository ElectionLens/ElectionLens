import { describe, it, expect } from 'vitest';
import { buildAcPanelPlaceholder } from './acPanelPlaceholder';

describe('buildAcPanelPlaceholder', () => {
  it('returns a minimal ACElectionResult for the given label and year', () => {
    const r = buildAcPanelPlaceholder('test-ac-slug', 2024);
    expect(r.year).toBe(2024);
    expect(r.constituencyName).toBe('test-ac-slug');
    expect(r.constituencyNameOriginal).toBe('test-ac-slug');
    expect(r.constituencyNo).toBe(0);
    expect(r.constituencyType).toBe('GEN');
    expect(r.candidates).toEqual([]);
    expect(r.validVotes).toBe(0);
    expect(r.electors).toBe(0);
  });
});
