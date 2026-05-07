import { describe, it, expect } from 'vitest';
import { inferSexFromAnnouncedName } from '../../scripts/lib/infer-candidate-sex.mjs';

describe('inferSexFromAnnouncedName (script used by AC 2026 fetch)', () => {
  it('returns F for Smt. honorific', () => {
    expect(inferSexFromAnnouncedName('SMT.KAVITHA KALYANASUNDARAM')).toBe('F');
  });

  it('returns F for Shri (mati) variants', () => {
    expect(inferSexFromAnnouncedName('SHRIMATI. RANI DEV')).toBe('F');
  });

  it('returns M for Shri / Thiru honorific', () => {
    expect(inferSexFromAnnouncedName('SHRI RAJESH KUMAR')).toBe('M');
    expect(inferSexFromAnnouncedName('THIRU. VEERAMANI')).toBe('M');
  });

  it('returns F when token appears after stripping prefixes', () => {
    expect(inferSexFromAnnouncedName('DR. PRIYA Lakshmi')).toBe('F');
  });

  it('returns empty string when sex cannot be inferred', () => {
    expect(inferSexFromAnnouncedName('VENKATACHALAM. G')).toBe('');
    expect(inferSexFromAnnouncedName('')).toBe('');
  });
});
