import type { ACElectionResult, PCElectionResult } from '../types';

/** Short party abbreviations (INC, BJP, CPI(M), …) for result panels and maps context where space matters. */
export function shouldUseShortPartyLabelsAssembly(
  result: ACElectionResult,
  stateName?: string
): boolean {
  /** Assam: compact labels on all assembly years (long regional names). */
  if (result.schemaId?.startsWith('AS-')) return true;
  if (result.year !== 2026) return false;
  if (result.schemaId?.startsWith('KL-') || result.schemaId?.startsWith('WB-')) return true;
  const n = (stateName ?? '').toLowerCase();
  return n.includes('kerala') || n.includes('west bengal');
}

export function shouldUseShortPartyLabelsPC(result: PCElectionResult, stateName?: string): boolean {
  if (result.schemaId?.startsWith('AS-')) return true;
  if (result.year !== 2026) return false;
  if (result.schemaId?.startsWith('KL-') || result.schemaId?.startsWith('WB-')) return true;
  const n = (stateName ?? result.stateName ?? '').toLowerCase();
  return n.includes('kerala') || n.includes('west bengal');
}
