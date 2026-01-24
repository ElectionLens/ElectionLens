import { useState, useCallback, useEffect } from 'react';

// Types for booth data
export interface Booth {
  id: string;
  boothNo: string;
  num: number;
  type: 'regular' | 'women' | 'auxiliary' | 'special';
  name: string;
  address: string;
  area: string;
  location?: { lat: number; lng: number };
}

export interface BoothList {
  acId: string;
  acName: string;
  state: string;
  totalBooths: number;
  lastUpdated: string;
  source: string;
  booths: Booth[];
}

export interface Candidate {
  slNo: number;
  name: string;
  party: string;
  symbol: string;
}

export interface BoothResult {
  votes: number[];
  total: number;
  rejected: number;
}

export interface PostalCandidate {
  name: string;
  party: string;
  postal: number;
  booth: number;
  total: number;
}

export interface PostalData {
  candidates: PostalCandidate[];
  totalValid: number;
  rejected: number;
  nota: number;
  total: number;
}

export interface BoothResults {
  acId: string;
  acName: string;
  year: number;
  electionType: 'assembly' | 'parliament';
  pcName?: string;
  date: string;
  totalBooths: number;
  source: string;
  candidates: Candidate[];
  results: Record<string, BoothResult>;
  summary: {
    totalVoters: number;
    totalVotes: number;
    turnoutPercent: number;
    winner: { name: string; party: string; votes: number };
    runnerUp: { name: string; party: string; votes: number };
    margin: number;
    marginPercent: number;
  };
  postal?: PostalData;
}

// Merged booth data for display
export interface BoothWithResult extends Booth {
  result?: BoothResult;
  winner?: { name: string; party: string; votes: number; percent: number };
}

interface UseBoothDataReturn {
  boothList: BoothList | null;
  boothResults: BoothResults | null;
  boothsWithResults: BoothWithResult[];
  availableYears: number[];
  loading: boolean;
  error: string | null;
  loadBoothData: (stateId: string, acId: string, year?: number) => Promise<void>;
  loadBoothResults: (stateId: string, acId: string, year: number) => Promise<void>;
}

/**
 * Hook for loading and managing booth-wise election data
 */
export function useBoothData(): UseBoothDataReturn {
  const [boothList, setBoothList] = useState<BoothList | null>(null);
  const [boothResults, setBoothResults] = useState<BoothResults | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAcId, setCurrentAcId] = useState<string | null>(null);

  /**
   * Load booth list for an AC (year-specific if available, otherwise fallback to generic)
   */
  const loadBoothData = useCallback(
    async (stateId: string, acId: string, year?: number) => {
      // Clear previous data if switching to a different AC
      if (currentAcId && currentAcId !== acId) {
        setBoothList(null);
        setBoothResults(null);
        setAvailableYears([]);
      }
      setCurrentAcId(acId);
      setLoading(true);
      setError(null);

      try {
        // Try year-specific booth list first, then fallback to generic
        let boothPath = `/data/booths/${stateId}/${acId}/booths.json`;
        let response = await fetch(boothPath);

        // If year is provided, try year-specific file first
        if (year) {
          const yearSpecificPath = `/data/booths/${stateId}/${acId}/booths-${year}.json`;
          const yearResponse = await fetch(yearSpecificPath);
          if (yearResponse.ok) {
            boothPath = yearSpecificPath;
            response = yearResponse;
          }
        }

        if (!response.ok) {
          throw new Error(`Booth data not available for ${acId}`);
        }

        const data: BoothList = await response.json();
        setBoothList(data);

        // Check available years by trying to fetch index or scanning
        const years: number[] = [];
        for (const year of [2024, 2021, 2019, 2016, 2014, 2011]) {
          try {
            const yearResponse = await fetch(`/data/booths/${stateId}/${acId}/${year}.json`, {
              method: 'HEAD',
            });
            if (yearResponse.ok) {
              years.push(year);
            }
          } catch {
            // Year not available
          }
        }
        setAvailableYears(years);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load booth data');
        setBoothList(null);
      } finally {
        setLoading(false);
      }
    },
    [currentAcId]
  );

  /**
   * Load booth results for a specific year
   */
  const loadBoothResults = useCallback(async (stateId: string, acId: string, year: number) => {
    try {
      const resultsPath = `/data/booths/${stateId}/${acId}/${year}.json`;
      const response = await fetch(resultsPath);

      if (!response.ok) {
        throw new Error(`Results not available for ${year}`);
      }

      const data: BoothResults = await response.json();
      setBoothResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
      setBoothResults(null);
    }
  }, []);

  /**
   * Merge booth list with results for display
   * Includes booths from results that may not be in booth list
   */
  const boothsWithResults: BoothWithResult[] = (() => {
    const boothMap = new Map<string, Booth>();
    const resultsList: BoothWithResult[] = [];

    // First, add all booths from booth list
    for (const booth of boothList?.booths || []) {
      boothMap.set(booth.id, booth);
    }

    // Process all results (includes booths not in list)
    const resultIds = Object.keys(boothResults?.results || {});
    const acId = boothResults?.acId || boothList?.acId || '';
    const acName = boothResults?.acName || boothList?.acName || '';

    for (const boothId of resultIds) {
      const result = boothResults?.results[boothId];
      let booth = boothMap.get(boothId);

      // If booth not in list, create a placeholder using actual AC info
      if (!booth) {
        // Extract booth number by removing AC prefix (e.g., "TN-123-45" -> "45")
        const boothNo = boothId.replace(`${acId}-`, '');
        booth = {
          id: boothId,
          boothNo: boothNo,
          num: parseInt(boothNo.replace(/[^\d]/g, '')) || 0,
          type: boothNo.includes('W') ? 'women' : boothNo.includes('M') ? 'auxiliary' : 'regular',
          name: `Polling Station ${boothNo}, ${acName}`,
          address: `Polling Station ${boothNo}, ${acName}`,
          area: acName,
        };
      }

      let winner: BoothWithResult['winner'] = undefined;

      if (result && boothResults && boothResults.candidates) {
        // Calculate AC-level vote totals for validation
        // This helps filter out candidates with corrupted booth data
        const acVoteTotals: number[] = boothResults.candidates.map((_, idx) => {
          return Object.values(boothResults.results).reduce(
            (sum, r) => sum + (r.votes[idx] || 0),
            0
          );
        });
        const totalAcVotes = acVoteTotals.reduce((sum, v) => sum + v, 0);

        // Find winner for this booth (excluding NOTA)
        const votesExcludingNota = result.votes.slice(0, -1);
        const maxVotes = Math.max(...votesExcludingNota);
        const winnerIndex = votesExcludingNota.indexOf(maxVotes);
        const candidate = boothResults.candidates[winnerIndex];

        // Validate: candidate must have at least 3% of AC votes to be a valid booth winner
        // This filters out spurious wins from minor candidates with corrupted data
        const candidateAcVotes = acVoteTotals[winnerIndex] ?? 0;
        const candidateAcShare = totalAcVotes > 0 ? candidateAcVotes / totalAcVotes : 0;
        const isValidWinner = candidateAcShare >= 0.03;

        if (candidate && candidate.party !== 'NOTA' && isValidWinner) {
          winner = {
            name: candidate.name,
            party: candidate.party,
            votes: maxVotes,
            percent: result.total > 0 ? (maxVotes / result.total) * 100 : 0,
          };
        } else if (candidate && candidate.party !== 'NOTA' && !isValidWinner) {
          // Find the candidates with at least 3% AC vote share and pick the one
          // with highest votes in this booth
          const validIndices = votesExcludingNota
            .map((_, i) => i)
            .filter((i) => {
              const acVotes = acVoteTotals[i] ?? 0;
              return totalAcVotes > 0 && acVotes / totalAcVotes >= 0.03;
            });

          const firstValidIndex = validIndices[0];
          if (firstValidIndex !== undefined) {
            // Find which valid candidate has the most votes in this booth
            let validWinnerIndex = firstValidIndex;
            for (const i of validIndices) {
              const bestVotes = votesExcludingNota[validWinnerIndex] ?? 0;
              const currentVotes = votesExcludingNota[i] ?? 0;
              if (currentVotes > bestVotes) {
                validWinnerIndex = i;
              }
            }

            const validCandidate = boothResults.candidates[validWinnerIndex];
            const validVotes = votesExcludingNota[validWinnerIndex] ?? 0;
            if (validCandidate) {
              winner = {
                name: validCandidate.name,
                party: validCandidate.party,
                votes: validVotes,
                percent: result.total > 0 ? (validVotes / result.total) * 100 : 0,
              };
            }
          }
        }
      }

      resultsList.push({
        ...booth,
        ...(result !== undefined && { result }),
        ...(winner !== undefined && { winner }),
      });
    }

    // Sort by booth number
    return resultsList.sort((a, b) => a.num - b.num);
  })();

  // Clear booth data when AC changes externally (not through loadBoothData)
  useEffect(() => {
    // This effect ensures data is cleared when switching away
    // The actual clearing happens in loadBoothData when acId changes
  }, []);

  return {
    boothList,
    boothResults,
    boothsWithResults,
    availableYears,
    loading,
    error,
    loadBoothData,
    loadBoothResults,
  };
}
