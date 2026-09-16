import { describe, it, expect } from 'vitest';
import { formatNumber } from './formatNumber';

describe('formatNumber', () => {
  it('uses Indian digit grouping regardless of machine locale', () => {
    // The whole point of B3: a bare .toLocaleString() would render "232,630" on a
    // US-locale machine. Indian grouping puts the first separator after 3 digits,
    // then every 2 thereafter.
    expect(formatNumber(232630)).toBe('2,32,630');
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(100000)).toBe('1,00,000');
    expect(formatNumber(10000000)).toBe('1,00,00,000');
  });

  it('leaves short numbers ungrouped', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(999)).toBe('999');
  });

  it('renders nullish input as an em dash rather than "null"', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('formats zero as "0", not as the nullish placeholder', () => {
    // Guards against a `!num` check sneaking back in.
    expect(formatNumber(0)).not.toBe('—');
  });

  it('handles negative numbers', () => {
    expect(formatNumber(-27945)).toBe('-27,945');
  });
});
