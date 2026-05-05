import { describe, it, expect } from 'vitest';
import { shouldUseShortPartyLabelsAssembly, shouldUseShortPartyLabelsPC } from './partyDisplay';
import type { ACElectionResult, PCElectionResult } from '../types';

const acBase = {
  constituencyName: 'X',
  year: 2021,
  candidates: [],
} as unknown as ACElectionResult;

const pcBase = {
  constituencyName: 'X',
  year: 2021,
  candidates: [],
} as unknown as PCElectionResult;

describe('partyDisplay', () => {
  it('uses short party labels for Assam assembly (any year)', () => {
    expect(
      shouldUseShortPartyLabelsAssembly({ ...acBase, schemaId: 'AS-001', year: 2021 }, 'Assam')
    ).toBe(true);
    expect(
      shouldUseShortPartyLabelsAssembly({ ...acBase, schemaId: 'AS-001', year: 2026 }, 'Assam')
    ).toBe(true);
  });

  it('uses short labels for Kerala/West Bengal only in 2026', () => {
    expect(
      shouldUseShortPartyLabelsAssembly({ ...acBase, schemaId: 'KL-001', year: 2026 }, 'Kerala')
    ).toBe(true);
    expect(
      shouldUseShortPartyLabelsAssembly({ ...acBase, schemaId: 'KL-001', year: 2021 }, 'Kerala')
    ).toBe(false);
  });

  it('uses short labels for Assam PC when schemaId is AS-', () => {
    expect(shouldUseShortPartyLabelsPC({ ...pcBase, schemaId: 'AS-01', year: 2009 }, 'Assam')).toBe(
      true
    );
  });
});
