import { describe, it, expect } from 'vitest';
import { SELECTED_ASSEMBLY_STYLE, SELECTED_ASSEMBLY_WEIGHT, partyFillStyle } from './polygonStyles';

describe('SELECTED_ASSEMBLY_STYLE', () => {
  it('is the dark green outline the five inline copies all used', () => {
    expect(SELECTED_ASSEMBLY_STYLE).toEqual({
      weight: 4,
      color: '#065f46',
      fillOpacity: 0.75,
      opacity: 1,
    });
  });

  it('is frozen, since every call site now shares this one object', () => {
    expect(Object.isFrozen(SELECTED_ASSEMBLY_STYLE)).toBe(true);
  });
});

describe('SELECTED_ASSEMBLY_WEIGHT', () => {
  it('is derived from the style, so the detector cannot drift from the setter', () => {
    // a sixth site hardcoded `4` to detect selection; deriving it means
    // changing the style updates the check automatically
    expect(SELECTED_ASSEMBLY_WEIGHT).toBe(SELECTED_ASSEMBLY_STYLE.weight);
  });
});

describe('partyFillStyle', () => {
  it('fills with the party colour and keeps the shared stroke', () => {
    const style = partyFillStyle('BJP');
    expect(style).toMatchObject({
      fillOpacity: 0.7,
      color: '#fff',
      weight: 1.5,
      opacity: 1,
    });
    expect(style.fillColor).toEqual(expect.any(String));
  });

  it('gives different parties different fills', () => {
    expect(partyFillStyle('BJP').fillColor).not.toBe(partyFillStyle('INC').fillColor);
  });

  it('still returns a usable style for an unknown party', () => {
    expect(partyFillStyle('').fillColor).toEqual(expect.any(String));
  });

  it('returns a fresh object each call so callers can safely spread over it', () => {
    expect(partyFillStyle('BJP')).not.toBe(partyFillStyle('BJP'));
  });
});
