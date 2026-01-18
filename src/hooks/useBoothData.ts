import { useState, useCallback } from 'react';

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
  loadBoothData: (stateId: string, acId: string) => Promise<void>;
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

  /**
   * Load booth list for an AC
   */
  const loadBoothData = useCallback(async (stateId: string, acId: string) => {
    setLoading(true);
    setError(null);

    try {
      // Load booth list
      const boothPath = `/data/booths/${stateId}/${acId}/booths.json`;
      const response = await fetch(boothPath);

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
  }, []);

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
   */
  const boothsWithResults: BoothWithResult[] = (boothList?.booths || []).map((booth) => {
    const result = boothResults?.results[booth.id];
    let winner: BoothWithResult['winner'] = undefined;

    if (result && boothResults) {
      // Find winner for this booth
      const maxVotes = Math.max(...result.votes.slice(0, -1)); // Exclude NOTA
      const winnerIndex = result.votes.indexOf(maxVotes);
      const candidate = boothResults.candidates[winnerIndex];

      if (candidate && candidate.party !== 'NOTA') {
        winner = {
          name: candidate.name,
          party: candidate.party,
          votes: maxVotes,
          percent: (maxVotes / result.total) * 100,
        };
      }
    }

    return {
      ...booth,
      ...(result !== undefined && { result }),
      ...(winner !== undefined && { winner }),
    };
  });

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
