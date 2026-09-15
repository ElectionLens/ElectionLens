/**
 * Pure booth-wise analysis engine, extracted from the BoothwiseAnalysis
 * component so the (fairly involved) domain logic can be unit tested
 * without mounting React. No JSX, no hooks - just data in, insights out.
 */
import type { BoothResults, BoothWithResult } from '../../hooks/useBoothData';
import { getPartyShortName } from '../../utils/partyData';
import { formatNumber } from './shared';

export interface LinkedBooth {
  id: string;
  name: string;
  detail?: string;
}

export interface AnalysisInsight {
  type: 'strength' | 'weakness' | 'opportunity' | 'insight';
  title: string;
  description: string;
  value?: string;
  icon: 'target' | 'zap' | 'trending-down' | 'alert' | 'award';
  linkedBooths?: LinkedBooth[];
}

export interface BoothwiseAnalysisResult {
  winnerParty: string;
  winnerBoothCount: number;
  runnerUpParty: string;
  runnerUpBoothCount: number;
  totalBooths: number;
  partyBoothWins: Record<string, number>;
  partyBooths: Record<string, Array<{ booth: BoothWithResult; percent: number; margin: number }>>;
  avgMargins: Record<string, number>;
  insights: AnalysisInsight[];
  closeContests: number;
  landslides: number;
  womenBooths: number;
  oneSidedBooths: number;
  highNotaBooths: number;
  zeroVoteInstances: number;
  strongestAreas: Array<{
    area: string;
    winnerWins: number;
    totalBooths: number;
    winPercent: number;
  }>;
  weakestAreas: Array<{
    area: string;
    winnerWins: number;
    totalBooths: number;
    winPercent: number;
  }>;
  strikeRates: Array<{ party: string; wins: number; strikeRate: string; totalVotes: number }>;
}

export function computeBoothwiseAnalysis(
  boothResults: BoothResults | null | undefined,
  boothsWithResults: BoothWithResult[],
  officialWinner: string | undefined,
  partyShortNames: boolean
): BoothwiseAnalysisResult | null {
  if (!boothResults || !boothResults.candidates || boothsWithResults.length === 0) {
    return null;
  }

  const fmtParty = (p: string) => (partyShortNames ? getPartyShortName(p) : p);

  const candidates = boothResults.candidates;
  const boothsWithData = boothsWithResults.filter(
    (b) =>
      b.result &&
      b.winner &&
      (b.voteSource === 'form20' ||
        (boothResults.dataQuality?.acTotalsReconciled &&
          boothResults.dataQuality.estimatedBooths === 0))
  );

  // Calculate booth wins for each party
  const partyBoothWins: Record<string, number> = {};
  const partyTotalVotes: Record<string, number> = {};
  const partyMargins: Record<string, number[]> = {};
  // Track which booths each party won
  const partyBooths: Record<
    string,
    Array<{ booth: BoothWithResult; percent: number; margin: number }>
  > = {};

  // Women's booth analysis
  const womenBooths = boothsWithResults.filter((b) => b.type === 'women');
  const regularBooths = boothsWithResults.filter((b) => b.type === 'regular');

  // Margin analysis
  const closeContests: BoothWithResult[] = []; // margin < 50 votes
  const landslides: BoothWithResult[] = []; // winner > 60%

  // NEW: Outlier detection
  const oneSidedBooths: Array<{ booth: BoothWithResult; party: string; percent: number }> = []; // >80% vote share
  const highNotaBooths: Array<{
    booth: BoothWithResult;
    notaVotes: number;
    notaPercent: number;
  }> = [];
  const zeroVoteInstances: Array<{ booth: BoothWithResult; party: string }> = [];

  // Area-wise analysis
  const areaWins: Record<string, Record<string, number>> = {};

  // Find NOTA index
  const notaIndex = candidates.findIndex((c) => c.party === 'NOTA' || c.name === 'NOTA');

  // Process each booth
  for (const booth of boothsWithResults) {
    if (!booth.result || !booth.winner) continue;

    const winnerParty = booth.winner.party;
    partyBoothWins[winnerParty] = (partyBoothWins[winnerParty] || 0) + 1;

    // Calculate margin for this booth
    const sortedVotes = [...booth.result.votes].sort((a, b) => b - a);
    const margin = (sortedVotes[0] ?? 0) - (sortedVotes[1] ?? 0);

    if (!partyMargins[winnerParty]) partyMargins[winnerParty] = [];
    partyMargins[winnerParty].push(margin);

    // Track booths won by each party
    if (!partyBooths[winnerParty]) partyBooths[winnerParty] = [];
    partyBooths[winnerParty].push({ booth, percent: booth.winner.percent, margin });

    // Close contests (margin < 50 votes)
    if (margin < 50) {
      closeContests.push(booth);
    }

    // Landslides (winner > 60%)
    if (booth.winner.percent > 60) {
      landslides.push(booth);
    }

    // NEW: One-sided booths (>80% vote share) - extreme strongholds
    if (booth.winner.percent > 80) {
      oneSidedBooths.push({ booth, party: winnerParty, percent: booth.winner.percent });
    }

    // NEW: High NOTA detection (>2% or >50 votes)
    if (notaIndex >= 0) {
      const notaVotes = booth.result.votes[notaIndex] ?? 0;
      const boothTotal = booth.result.total || 1; // Avoid division by zero
      const notaPercent = (notaVotes / boothTotal) * 100;
      if (notaPercent > 2 || notaVotes > 50) {
        highNotaBooths.push({ booth, notaVotes, notaPercent });
      }
    }

    // Zero vote detection - will be processed after we know top parties

    // Area-wise tracking
    const area = booth.area || 'Unknown';
    if (!areaWins[area]) areaWins[area] = {};
    areaWins[area][winnerParty] = (areaWins[area][winnerParty] || 0) + 1;

    // Total votes by party
    candidates.forEach((c, idx) => {
      const votes = booth.result?.votes[idx] || 0;
      partyTotalVotes[c.party] = (partyTotalVotes[c.party] || 0) + votes;
    });
  }

  // Sort parties by booth wins
  const sortedParties = Object.entries(partyBoothWins).sort((a, b) => b[1] - a[1]);

  // Use official winner if provided, otherwise fall back to booth wins leader
  const winnerParty = officialWinner || sortedParties[0]?.[0] || '';
  const winnerBoothCount = partyBoothWins[winnerParty] || 0;

  // Runner-up is the party with most booth wins that isn't the winner
  const runnerUpEntry = sortedParties.find(([party]) => party !== winnerParty);
  const runnerUpParty = runnerUpEntry?.[0] || '';
  const runnerUpBoothCount = runnerUpEntry?.[1] || 0;

  // NEW: Calculate Strike Rate for top parties (% of booths won)
  const totalBoothCount = boothsWithData.length || 1; // Avoid division by zero
  const strikeRates = sortedParties.slice(0, 5).map(([party, wins]) => ({
    party,
    wins,
    strikeRate: ((wins / totalBoothCount) * 100).toFixed(1),
    totalVotes: partyTotalVotes[party] || 0,
  }));

  // Calculate total votes to determine vote share
  const grandTotalVotes = Object.values(partyTotalVotes).reduce((a, b) => a + b, 0) || 1; // Avoid division by zero

  // Determine which parties to track for zero votes: top 2 + 3rd if >10%
  const partiesToTrackZero = new Set<string>();
  if (winnerParty) partiesToTrackZero.add(winnerParty);
  if (runnerUpParty) partiesToTrackZero.add(runnerUpParty);

  // Check 3rd party if >10% vote share
  const thirdParty = sortedParties[2];
  if (thirdParty) {
    const thirdPartyVoteShare = ((partyTotalVotes[thirdParty[0]] || 0) / grandTotalVotes) * 100;
    if (thirdPartyVoteShare > 10) {
      partiesToTrackZero.add(thirdParty[0]);
    }
  }

  // Now detect zero votes for these parties
  for (const booth of boothsWithData) {
    if (!booth.result) continue;

    candidates.forEach((c, idx) => {
      if (partiesToTrackZero.has(c.party)) {
        const votes = booth.result?.votes[idx] ?? 0;
        if (votes === 0) {
          zeroVoteInstances.push({ booth, party: c.party });
        }
      }
    });
  }

  // Women's booth performance
  const womenBoothWins: Record<string, number> = {};
  for (const booth of womenBooths) {
    if (booth.winner) {
      womenBoothWins[booth.winner.party] = (womenBoothWins[booth.winner.party] || 0) + 1;
    }
  }

  // Calculate average margins
  const avgMargins: Record<string, number> = {};
  for (const [party, margins] of Object.entries(partyMargins)) {
    avgMargins[party] = Math.round(margins.reduce((a, b) => a + b, 0) / (margins.length || 1));
  }

  // Find strongest and weakest areas for winner
  const areaPerformance = Object.entries(areaWins)
    .map(([area, wins]) => {
      const totalAreaBooths = Object.values(wins).reduce((a, b) => a + b, 0) || 1;
      return {
        area,
        winnerWins: wins[winnerParty] || 0,
        totalBooths: totalAreaBooths,
        winPercent: ((wins[winnerParty] || 0) / totalAreaBooths) * 100,
      };
    })
    .filter((a) => a.totalBooths >= 3); // Only areas with 3+ booths

  const strongestAreas = areaPerformance
    .filter((a) => a.winPercent >= 70)
    .sort((a, b) => b.winPercent - a.winPercent);
  const weakestAreas = areaPerformance
    .filter((a) => a.winPercent <= 30)
    .sort((a, b) => a.winPercent - b.winPercent);

  // Generate insights
  const insights: AnalysisInsight[] = [];

  // Key victory insight with Strike Rate
  const winnerStrikeRate = ((winnerBoothCount / totalBoothCount) * 100).toFixed(1);
  const winnerBooths = boothsWithData
    .filter((b) => b.winner?.party === winnerParty)
    .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

  insights.push({
    type: 'strength',
    title: 'Booth Strike Rate',
    description: `${winnerParty} won ${winnerBoothCount} of ${boothsWithData.length} booths — ${winnerStrikeRate}% strike rate. ${parseFloat(winnerStrikeRate) > 70 ? 'Overwhelming dominance.' : parseFloat(winnerStrikeRate) > 50 ? 'Consistent performance.' : 'Targeted strongholds.'}`,
    value: `${winnerStrikeRate}%`,
    icon: 'award',
    linkedBooths: winnerBooths.map((b) => ({
      id: b.id,
      name: b.boothNo,
      detail: `${b.winner?.percent.toFixed(0)}%`,
    })),
  });

  // Margin analysis - calculate margins for all booths won by winner
  const winnerBoothsWithMargin = boothsWithData
    .filter((b) => b.winner?.party === winnerParty)
    .map((b) => {
      const sorted = [...(b.result?.votes || [])].sort((x, y) => y - x);
      const margin = (sorted[0] ?? 0) - (sorted[1] ?? 0);
      return { booth: b, margin };
    })
    .sort((a, b) => b.margin - a.margin);

  if (avgMargins[winnerParty]) {
    insights.push({
      type: 'insight',
      title: 'Average Victory Margin',
      description: `Avg margin: ${formatNumber(avgMargins[winnerParty])} votes/booth. ${avgMargins[winnerParty] > 150 ? 'Comfortable cushion — difficult to overturn.' : avgMargins[winnerParty] > 75 ? 'Moderate margins — some vulnerable.' : 'Razor-thin — many could flip.'}`,
      value: `${formatNumber(avgMargins[winnerParty])} votes`,
      icon: 'target',
      linkedBooths: winnerBoothsWithMargin.slice(0, 20).map((item) => ({
        id: item.booth.id,
        name: item.booth.boothNo,
        detail: `+${formatNumber(item.margin)}`,
      })),
    });
  }

  // NEW: One-sided booths (extreme strongholds >80%)
  if (oneSidedBooths.length > 0) {
    const winnerOneSided = oneSidedBooths.filter((b) => b.party === winnerParty);
    const oppositionOneSided = oneSidedBooths.filter((b) => b.party !== winnerParty);

    if (winnerOneSided.length > 0) {
      insights.push({
        type: 'strength',
        title: 'Extreme Strongholds',
        description: `${winnerOneSided.length} booths with >80% vote share — fortress areas with near-total support.`,
        value: `${winnerOneSided.length} booths`,
        icon: 'zap',
        linkedBooths: winnerOneSided.map((b) => ({
          id: b.booth.id,
          name: b.booth.boothNo,
          detail: `${b.percent.toFixed(1)}%`,
        })),
      });
    }

    if (oppositionOneSided.length > 0) {
      const sortedOpposition = oppositionOneSided.sort((a, b) => b.percent - a.percent);
      insights.push({
        type: 'weakness',
        title: 'Opposition Fortresses',
        description: `${oppositionOneSided.length} booths where opposition has >80% — virtually impenetrable areas.`,
        value: `${oppositionOneSided.length} booths`,
        icon: 'alert',
        linkedBooths: sortedOpposition.map((b) => ({
          id: b.booth.id,
          name: b.booth.boothNo,
          detail: `${fmtParty(b.party)} ${b.percent.toFixed(1)}%`,
        })),
      });
    }
  }

  // Landslide booths (>60%)
  if (landslides.length > 0) {
    const winnerLandslides = landslides
      .filter((b) => b.winner?.party === winnerParty)
      .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));
    if (winnerLandslides.length > 0) {
      insights.push({
        type: 'strength',
        title: 'Landslide Victories',
        description: `Secured ${winnerLandslides.length} booths with >60% vote share (${((winnerLandslides.length / totalBoothCount) * 100).toFixed(1)}% of total). Strong base that can absorb swings.`,
        value: `${winnerLandslides.length} booths`,
        icon: 'zap',
        linkedBooths: winnerLandslides.map((b) => ({
          id: b.id,
          name: b.boothNo,
          detail: `${b.winner?.percent.toFixed(1)}%`,
        })),
      });
    }
  }

  // NEW: High NOTA analysis
  if (highNotaBooths.length > 0) {
    const totalNotaVotes = highNotaBooths.reduce((sum, b) => sum + b.notaVotes, 0);
    const sortedNotaBooths = highNotaBooths.sort((a, b) => b.notaVotes - a.notaVotes);
    insights.push({
      type: 'insight',
      title: 'High NOTA Booths',
      description: `${highNotaBooths.length} booths with high NOTA (>2% or >50 votes). Total: ${formatNumber(totalNotaVotes)} protest votes — signals voter dissatisfaction.`,
      value: `${highNotaBooths.length} booths`,
      icon: 'alert',
      linkedBooths: sortedNotaBooths.map((b) => ({
        id: b.booth.id,
        name: b.booth.boothNo,
        detail: `${b.notaVotes} NOTA (${b.notaPercent.toFixed(1)}%)`,
      })),
    });
  }

  // Zero vote detection for top parties
  if (zeroVoteInstances.length > 0) {
    // Group by party
    const partyZeroBooths: Record<string, BoothWithResult[]> = {};
    zeroVoteInstances.forEach((z) => {
      const existing = partyZeroBooths[z.party] ?? [];
      existing.push(z.booth);
      partyZeroBooths[z.party] = existing;
    });

    // Create insights for each party with zero votes (min 1 booth)
    const partiesWithZero = Object.entries(partyZeroBooths)
      .filter(([_, booths]) => booths.length >= 1)
      .sort((a, b) => b[1].length - a[1].length);

    if (partiesWithZero.length > 0) {
      // Combine all into one insight with all booths
      const totalZeroBooths = partiesWithZero.reduce((sum, [_, booths]) => sum + booths.length, 0);
      const description = partiesWithZero
        .map(([party, booths]) => `${fmtParty(party)}: ${booths.length}`)
        .join(', ');

      // Combine all linked booths
      const allLinkedBooths = partiesWithZero.flatMap(([party, booths]) =>
        booths.map((b) => ({
          id: b.id,
          name: b.boothNo,
          detail: `${fmtParty(party)}=0`,
        }))
      );

      insights.push({
        type: 'insight',
        title: 'Organizational Gaps',
        description: `Zero votes in ${totalZeroBooths} booth instances (${description}). Complete absence of ground presence.`,
        value: `${totalZeroBooths} gaps`,
        icon: 'trending-down',
        linkedBooths: allLinkedBooths,
      });
    }
  }

  // Women's booth insight
  if (womenBooths.length > 0) {
    const winnerWomenWins = womenBoothWins[winnerParty] || 0;
    const womenWinPercent = (winnerWomenWins / womenBooths.length) * 100;
    const regularWinPercent =
      regularBooths.length > 0
        ? (((partyBoothWins[winnerParty] ?? 0) - winnerWomenWins) / regularBooths.length) * 100
        : 0;

    const diff = womenWinPercent - regularWinPercent;
    // Get women's booths with results, sorted by winner's vote share
    const womenBoothsWithResults = womenBooths
      .filter((b) => b.result && b.winner)
      .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

    insights.push({
      type: diff > 5 ? 'strength' : diff < -5 ? 'weakness' : 'insight',
      title: 'Women Voter Analysis',
      description:
        diff > 5
          ? `Won ${womenWinPercent.toFixed(0)}% of women's booths vs ${regularWinPercent.toFixed(0)}% regular. Women voters favored ${fmtParty(winnerParty)}.`
          : diff < -5
            ? `Only ${womenWinPercent.toFixed(0)}% of women's booths vs ${regularWinPercent.toFixed(0)}% regular. Gender gap is a vulnerability.`
            : `Similar: ${womenWinPercent.toFixed(0)}% women's booths, ${regularWinPercent.toFixed(0)}% regular. No gender-based pattern.`,
      value: `${womenWinPercent.toFixed(0)}%`,
      icon: diff > 5 ? 'zap' : diff < -5 ? 'trending-down' : 'target',
      linkedBooths: womenBoothsWithResults.map((b) => ({
        id: b.id,
        name: `${b.boothNo} 👩`,
        detail: `${fmtParty(b.winner?.party ?? '')} ${b.winner?.percent.toFixed(0)}%`,
      })),
    });
  }

  // Close contests - battleground booths
  if (closeContests.length > 0) {
    const lostCloseContests = closeContests.filter((b) => b.winner?.party !== winnerParty);
    const wonCloseContests = closeContests.filter((b) => b.winner?.party === winnerParty);

    if (lostCloseContests.length > 0 || wonCloseContests.length > 0) {
      const totalMarginLost = lostCloseContests.reduce((sum, b) => {
        const sorted = [...(b.result?.votes || [])].sort((a, b) => b - a);
        return sum + ((sorted[0] ?? 0) - (sorted[1] ?? 0));
      }, 0);

      // Combine and sort by margin (closest first)
      const allCloseContests = closeContests
        .map((b) => {
          const sorted = [...(b.result?.votes || [])].sort((x, y) => y - x);
          const margin = (sorted[0] ?? 0) - (sorted[1] ?? 0);
          return { booth: b, margin, won: b.winner?.party === winnerParty };
        })
        .sort((a, b) => a.margin - b.margin);

      insights.push({
        type: 'opportunity',
        title: 'Battleground Booths',
        description: `${closeContests.length} booths decided by <50 votes. Lost ${lostCloseContests.length} (deficit: ${formatNumber(totalMarginLost)}), won ${wonCloseContests.length}. Micro-battlegrounds where every vote counts.`,
        value: `${closeContests.length} booths`,
        icon: 'alert',
        linkedBooths: allCloseContests.map((c) => ({
          id: c.booth.id,
          name: c.booth.boothNo,
          detail: `${c.won ? '✓' : '✗'} by ${c.margin}`,
        })),
      });
    }
  }

  // Strongest areas
  if (strongestAreas.length > 0) {
    // Get booths from strongest areas
    const strongAreaNames = new Set(strongestAreas.map((a) => a.area));
    const strongAreaBooths = boothsWithData
      .filter((b) => strongAreaNames.has(b.area || '') && b.winner?.party === winnerParty)
      .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

    insights.push({
      type: 'strength',
      title: 'Core Strongholds',
      description: `Dominated ${strongestAreas
        .slice(0, 3)
        .map((a) => `${a.area} (${a.winPercent.toFixed(0)}%)`)
        .join(', ')}. Core support bases.`,
      value: `${strongestAreas.length} areas`,
      icon: 'target',
      linkedBooths: strongAreaBooths.map((b) => ({
        id: b.id,
        name: b.boothNo,
        detail: `${b.area?.slice(0, 8) ?? ''} ${b.winner?.percent.toFixed(0)}%`,
      })),
    });
  }

  // Weakest areas
  if (weakestAreas.length > 0) {
    // Get booths from weakest areas (lost to opposition)
    const weakAreaNames = new Set(weakestAreas.map((a) => a.area));
    const weakAreaBooths = boothsWithData
      .filter((b) => weakAreaNames.has(b.area || '') && b.winner?.party !== winnerParty)
      .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

    insights.push({
      type: 'weakness',
      title: 'Vulnerable Zones',
      description: `Weak in ${weakestAreas
        .slice(0, 3)
        .map((a) => `${a.area} (${a.winPercent.toFixed(0)}%)`)
        .join(', ')}. Opposition strongholds.`,
      value: `${weakestAreas.length} areas`,
      icon: 'trending-down',
      linkedBooths: weakAreaBooths.map((b) => ({
        id: b.id,
        name: b.boothNo,
        detail: `${fmtParty(b.winner?.party ?? '')} ${b.winner?.percent.toFixed(0)}%`,
      })),
    });
  }

  // Competition analysis with strike rate comparison
  if (runnerUpParty) {
    const runnerUpStrikeRate = ((runnerUpBoothCount / totalBoothCount) * 100).toFixed(1);
    const competitionRatio = winnerBoothCount / (runnerUpBoothCount || 1);
    const runnerUpBooths = boothsWithData
      .filter((b) => b.winner?.party === runnerUpParty)
      .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

    // Special case: Runner-up won MORE booths than official winner (postal votes flipped result)
    if (runnerUpBoothCount > winnerBoothCount) {
      insights.push({
        type: 'opportunity',
        title: `${fmtParty(runnerUpParty)} Booth Dominance`,
        description: `${fmtParty(runnerUpParty)} won ${runnerUpBoothCount} booths vs ${fmtParty(winnerParty)}'s ${winnerBoothCount} — but lost overall! Postal votes likely flipped the result. Strong grassroots presence but couldn't convert to victory.`,
        value: `${runnerUpBoothCount} booths`,
        icon: 'alert',
        linkedBooths: runnerUpBooths.map((b) => ({
          id: b.id,
          name: b.boothNo,
          detail: `${fmtParty(runnerUpParty)} ${b.winner?.percent.toFixed(0)}%`,
        })),
      });
    } else {
      insights.push({
        type: 'insight',
        title: 'Competition Strike Rate',
        description: `${fmtParty(runnerUpParty)}: ${runnerUpStrikeRate}% (${runnerUpBoothCount} booths). ${
          competitionRatio > 2
            ? `Distant second — no threat.`
            : competitionRatio > 1.3
              ? `Competitive but outpaced.`
              : `Neck-and-neck race.`
        }`,
        value: `${runnerUpStrikeRate}%`,
        icon: 'target',
        linkedBooths: runnerUpBooths.map((b) => ({
          id: b.id,
          name: b.boothNo,
          detail: `${fmtParty(runnerUpParty)} ${b.winner?.percent.toFixed(0)}%`,
        })),
      });
    }
  }

  // Sort booths within each party by vote percent descending
  for (const party of Object.keys(partyBooths)) {
    partyBooths[party]?.sort((a, b) => b.percent - a.percent);
  }

  return {
    winnerParty,
    winnerBoothCount,
    runnerUpParty,
    runnerUpBoothCount,
    totalBooths: boothsWithData.length,
    partyBoothWins,
    partyBooths,
    avgMargins,
    insights,
    closeContests: closeContests.length,
    landslides: landslides.length,
    womenBooths: womenBooths.length,
    oneSidedBooths: oneSidedBooths.length,
    highNotaBooths: highNotaBooths.length,
    zeroVoteInstances: zeroVoteInstances.length,
    strongestAreas,
    weakestAreas,
    strikeRates,
  };
}
