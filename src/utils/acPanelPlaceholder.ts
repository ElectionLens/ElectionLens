import type { ACElectionResult } from '../types';

/** Minimal AC row so ElectionResultPanel can render while getACResult is in flight */
export function buildAcPanelPlaceholder(acLabel: string, year: number): ACElectionResult {
  return {
    year,
    constituencyNo: 0,
    constituencyName: acLabel,
    constituencyNameOriginal: acLabel,
    constituencyType: 'GEN',
    districtName: '',
    validVotes: 0,
    electors: 0,
    turnout: 0,
    enop: 0,
    totalCandidates: 0,
    candidates: [],
  };
}
