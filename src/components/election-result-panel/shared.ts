/**
 * Pure, framework-agnostic helpers shared across the election result panel's
 * sub-views (Overview / Booths / Postal / Analysis). Kept dependency-free
 * (no React) so they're trivial to unit test in isolation.
 */
import type { CSSProperties } from 'react';
import type { ACElectionResult, ElectionCandidate } from '../../types';
import { formatNumber } from '../../utils/formatNumber';

/** Re-exported so panel sub-views can keep importing from one place. */
export { formatNumber };

/** Softer outline chips for the embedded sidebar election panel */
export function embeddedPartyChipStyle(hex: string): CSSProperties {
  return {
    backgroundColor: `${hex}14`,
    color: hex,
    border: `1px solid ${hex}66`,
    fontWeight: 600,
    boxSizing: 'border-box',
  };
}

export function solidPartyChipStyle(hex: string): CSSProperties {
  return { backgroundColor: hex, color: '#ffffff', border: 'none' };
}

export function winnerPartyChipStyle(hex: string, embedded: boolean): CSSProperties {
  return embedded ? embeddedPartyChipStyle(hex) : solidPartyChipStyle(hex);
}

/** Placeholder rows while AC JSON is fetching (votes/shares shown as 0). */
export function loadingSkeletonCandidates(): ElectionCandidate[] {
  return Array.from({ length: 10 }, (_, i) => ({
    position: i + 1,
    name: '…',
    party: '—',
    votes: 0,
    voteShare: 0,
    margin: null,
    marginPct: null,
    sex: '',
    age: null,
    depositLost: false,
  }));
}

/** Remove diacritics from text (e.g., Tamil Nādu → Tamil Nadu) */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function generateShareText(
  result: ACElectionResult,
  stateName?: string,
  includeAllCandidates = false,
  formatParty: (p: string) => string = (p) => p
): string {
  if (result.resultsPending) {
    const loc =
      result.constituencyNameOriginal ?? result.name ?? result.constituencyName ?? 'Constituency';
    const st = stateName ? normalizeText(stateName) : '';
    const head = `\u{1F5F3}\u{FE0F} ${loc}${st ? `, ${st}` : ''} | ${result.year}`;
    const lines = result.candidates.map((c) => `${c.name} (${formatParty(c.party)})`);
    if (lines.length > 0) {
      return `${head}\n\nCandidates: ${lines.join('; ')}.`.trim();
    }
    return `${head}\n\nNo candidate list for this seat yet.`.trim();
  }
  const winner = result.candidates[0];
  if (!winner) return '';

  const normalizedState = stateName ? normalizeText(stateName) : undefined;
  const location = normalizedState
    ? `${result.constituencyNameOriginal ?? result.name ?? result.constituencyName ?? 'Unknown'}, ${normalizedState}`
    : result.constituencyNameOriginal;

  let text = `\u{1F5F3}\u{FE0F} ${location} | ${result.year}\n\n`;

  if (includeAllCandidates) {
    const topCandidates = result.candidates.slice(0, 3);
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    topCandidates.forEach((c, i) => {
      text += `${medals[i]} ${c.name} (${formatParty(c.party)}) - ${c.voteShare.toFixed(1)}%\n`;
    });
    if (result.candidates.length > 3) {
      text += `...+${result.candidates.length - 3} more\n`;
    }
  } else {
    const marginText = winner.margin ? ` by ${formatNumber(winner.margin)} votes` : '';
    text += `\u{1F3C6} ${winner.name} (${formatParty(winner.party)})${marginText}\n`;
    text += `\u{1F4CA} ${winner.voteShare?.toFixed(1) ?? '0.0'}% vote share\n`;
  }

  return text.trim();
}
