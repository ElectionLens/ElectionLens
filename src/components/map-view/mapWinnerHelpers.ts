/**
 * Small pure helpers for resolving AC/PC winners from candidate lists,
 * extracted from MapView.tsx (no React, no Leaflet - trivially testable).
 */

/** PC acWiseResults row: prefer first non-NOTA by votes for map winner */
export function pickNonNotaAcWinner<T extends { party?: string; name: string; votes?: number }>(
  candidates: T[]
): T | undefined {
  if (!candidates.length) return undefined;
  const sorted = [...candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  return sorted.find((c) => String(c.party ?? '').toUpperCase() !== 'NOTA') ?? sorted[0];
}

/** Do not overwrite a real AC party with NOTA from a duplicate/bad acWise row */
export function assignAcWinnerBySchemaId(
  winners: Record<string, { party: string; candidate: string }>,
  sid: string | null | undefined,
  party: string,
  candidate: string
): void {
  if (!sid) return;
  const nextNota = String(party ?? '').toUpperCase() === 'NOTA';
  const prev = winners[sid];
  const prevReal = prev && String(prev.party ?? '').toUpperCase() !== 'NOTA';
  if (nextNota && prevReal) return;
  winners[sid] = { party, candidate };
}
