import type { ACElectionResult, ElectionResultsFileMeta } from '../types';

export function isAssemblyElectionResult(value: unknown): value is ACElectionResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as ACElectionResult;
  return Array.isArray(r.candidates) && typeof r.constituencyNo === 'number';
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
