import type { ACElectionResult, ElectionResultsFileMeta } from '../types';

export function isAssemblyElectionResult(value: unknown): value is ACElectionResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as ACElectionResult;
  if (!Array.isArray(r.candidates)) return false;
  if (typeof r.constituencyNo === 'number') return true;
  // Schema-keyed files (e.g. Madhya Pradesh 2023 TCPD) often omit constituencyNo; the JSON key is the AC id
  if (typeof r.constituencyName === 'string' && r.constituencyName.length > 0) return true;
  if (typeof r.constituencyNameOriginal === 'string' && r.constituencyNameOriginal.length > 0)
    return true;
  if (typeof r.name === 'string' && r.name.length > 0) return true;
  return false;
}

export function isAssemblyResultEntry(key: string, value: unknown): value is ACElectionResult {
  if (!key || key.startsWith('_')) return false;
  return isAssemblyElectionResult(value);
}

/**
 * Do not use candidate rows for map winner coloring when votes are not yet counted or the file is
 * announced-candidate-only (e.g. WB/KL/TN 2026). File-level _meta applies to every row in that JSON.
 */
export function skipAssemblyWinnerColoring(
  result: ACElectionResult,
  fileMeta?: ElectionResultsFileMeta | undefined
): boolean {
  if (fileMeta?.candidatesPolicy === 'announced_only') return true;
  if (fileMeta?.resultsPending) return true;
  return Boolean(result.resultsPending);
}
