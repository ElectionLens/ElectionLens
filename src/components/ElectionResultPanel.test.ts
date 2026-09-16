import { describe, it, expect } from 'vitest';
import { parseTabFromSearch } from './ElectionResultPanel';

describe('parseTabFromSearch', () => {
  it('defaults to overview when there is no tab param', () => {
    expect(parseTabFromSearch('')).toBe('overview');
  });

  it.each(['booths', 'postal', 'analysis'])('accepts %s as a valid tab', (tab) => {
    expect(parseTabFromSearch(`?tab=${tab}`)).toBe(tab);
  });

  it('merges the legacy "candidates" deeplink into overview', () => {
    expect(parseTabFromSearch('?tab=candidates')).toBe('overview');
  });

  it('falls back to overview for an unrecognised tab value', () => {
    expect(parseTabFromSearch('?tab=nonsense')).toBe('overview');
  });
});
