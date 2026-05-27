/** Booth-wise data provenance for TN Form20 extraction. */

export type BoothDataTier = 'verified' | 'mostly_verified' | 'partial' | 'incomplete';

export type BoothVoteSource = 'form20' | 'estimated' | 'missing';

export interface BoothDataQuality {
  tier: BoothDataTier;
  totalBooths: number;
  form20ParsedBooths: number;
  estimatedBooths: number;
  missingBooths: number;
  form20ParsedPct: number;
  postalVotes: number;
  postalPct: number;
  unmappedVotes?: number;
  unmappedPct?: number;
  acTotalsReconciled: boolean;
}

export interface UnmappedCandidate {
  name: string;
  party: string;
  unmapped: number;
  booth: number;
  postal: number;
  total: number;
}

export interface UnmappedData {
  candidates: UnmappedCandidate[];
  note?: string;
}

export function boothVoteSource(sourceNote?: string, voteTotal = 0): BoothVoteSource {
  if (sourceNote === 'residual_booth_fill') return 'estimated';
  if (sourceNote === 'no_form20_row' || voteTotal === 0) return 'missing';
  return 'form20';
}

export function boothSourceLabel(source: BoothVoteSource): string {
  switch (source) {
    case 'form20':
      return 'Form20 verified';
    case 'estimated':
      return 'Estimated';
    case 'missing':
      return 'No booth data';
  }
}

export function tierLabel(tier: BoothDataTier): string {
  switch (tier) {
    case 'verified':
      return 'Form20 verified';
    case 'mostly_verified':
      return 'Mostly verified';
    case 'partial':
      return 'Partial booth data';
    case 'incomplete':
      return 'Incomplete booth data';
  }
}

export function tierDescription(quality: BoothDataQuality): string {
  const {
    form20ParsedPct,
    missingBooths,
    postalPct,
    unmappedPct = 0,
    acTotalsReconciled,
  } = quality;
  const parts: string[] = [];
  parts.push(`${form20ParsedPct.toFixed(0)}% of booths have Form20-extracted votes.`);
  if (missingBooths > 0) {
    parts.push(`${missingBooths.toLocaleString()} booths have no booth-level votes yet.`);
  }
  if (postalPct > 0) {
    parts.push(`${postalPct.toFixed(1)}% postal ballots (from Form20 summary row).`);
  }
  if (unmappedPct > 0) {
    parts.push(
      `${unmappedPct.toFixed(1)}% of votes are not yet mapped to booths (not postal — extraction pending).`
    );
  }
  if (acTotalsReconciled) {
    parts.push('Constituency totals match official results.');
  } else {
    parts.push('Booth + postal + unmapped sum to official totals.');
  }
  return parts.join(' ');
}

export function shouldShowPostalTab(
  postal: { candidates?: { postal?: number }[] } | undefined,
  quality: BoothDataQuality | undefined,
  unmapped?: UnmappedData | undefined
): boolean {
  if (!postal?.candidates?.length) return false;
  const postalSum = postal.candidates.reduce((s, c) => s + (c.postal ?? 0), 0);
  const unmappedSum = unmapped?.candidates?.reduce((s, c) => s + (c.unmapped ?? 0), 0) ?? 0;
  if (postalSum > 0 || unmappedSum > 0) return true;
  return quality != null && quality.tier !== 'verified';
}
