import { describe, it, expect } from 'vitest';
import { isAssemblyElectionResult, isAssemblyResultEntry } from './electionResults';

describe('electionResults', () => {
  it('isAssemblyElectionResult accepts TCPD-style rows without constituencyNo (MP, RJ, …)', () => {
    expect(
      isAssemblyElectionResult({
        constituencyName: 'SHEOPUR',
        constituencyNameOriginal: 'SHEOPUR',
        year: 2023,
        candidates: [{ name: 'A', party: 'INC', votes: 1, position: 1 }],
      })
    ).toBe(true);
    expect(
      isAssemblyElectionResult({
        constituencyName: 'SADULSHAHAR',
        constituencyNameOriginal: 'SADULSHAHAR',
        year: 2023,
        candidates: [{ name: 'B', party: 'BJP', votes: 1, position: 1 }],
      })
    ).toBe(true);
  });

  it('isAssemblyResultEntry rejects _meta and non-rows', () => {
    expect(isAssemblyResultEntry('_meta', { resultsPending: true })).toBe(false);
    expect(isAssemblyResultEntry('MP-001', { candidates: [] })).toBe(false);
  });
});
