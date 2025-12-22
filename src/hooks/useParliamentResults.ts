import { useState, useCallback, useRef } from 'react';
import { PC_ELECTIONS } from '../constants/paths';
import type {
  PCElectionResult,
  PCElectionResultsByConstituency,
  ACContributionToPC,
} from '../types';

/** State election index for PC */
interface PCStateElectionIndex {
  state: string;
  stateSlug: string;
  availableYears: number[];
  totalConstituencies: number;
  lastUpdated: string;
  source: string;
}

/**
 * Strip diacritics from text
 */
function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** State name to ID mapping (ISO 3166-2:IN codes) */
const STATE_ID_MAP: Record<string, string> = {
  'andaman and nicobar islands': 'AN',
  'andaman & nicobar islands': 'AN',
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  assam: 'AS',
  bihar: 'BR',
  chandigarh: 'CH',
  chhattisgarh: 'CG',
  chattisgarh: 'CG',
  'dadra and nagar haveli and daman and diu': 'DD',
  'dnh and dd': 'DD',
  delhi: 'DL',
  'nct of delhi': 'DL',
  goa: 'GA',
  gujarat: 'GJ',
  haryana: 'HR',
  'himachal pradesh': 'HP',
  'jammu and kashmir': 'JK',
  'jammu & kashmir': 'JK',
  jharkhand: 'JH',
  karnataka: 'KA',
  kerala: 'KL',
  ladakh: 'LA',
  lakshadweep: 'LD',
  'madhya pradesh': 'MP',
  maharashtra: 'MH',
  manipur: 'MN',
  meghalaya: 'ML',
  mizoram: 'MZ',
  nagaland: 'NL',
  odisha: 'OD',
  orissa: 'OD',
  puducherry: 'PY',
  pondicherry: 'PY',
  punjab: 'PB',
  rajasthan: 'RJ',
  sikkim: 'SK',
  'tamil nadu': 'TN',
  telangana: 'TS',
  tripura: 'TR',
  'uttar pradesh': 'UP',
  uttarakhand: 'UK',
  uttaranchal: 'UK',
  'west bengal': 'WB',
};

/** Convert state name to state ID */
function getStateId(stateName: string): string {
  const normalized = stripDiacritics(stateName).toLowerCase().trim();
  return STATE_ID_MAP[normalized] || normalized.toUpperCase().slice(0, 2);
}

/** @deprecated Use getStateId instead */
function getStateSlug(stateName: string): string {
  return getStateId(stateName);
}

/** Name mappings for inconsistent naming between GeoJSON and election data */
const PC_NAME_MAPPINGS: Record<string, string> = {
  PONDICHERRY: 'PUDUCHERRY',
  PONDICHERY: 'PUDUCHERRY',
};

/**
 * Create a canonical key for matching
 */
function createCanonicalKey(name: string): string {
  const key = stripDiacritics(name)
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '') // Remove parentheses like (SC)/(ST)
    .replace(/[^A-Z0-9]/g, ''); // Keep only alphanumeric (removes spaces, hyphens, etc.)

  // Apply name mappings
  return PC_NAME_MAPPINGS[key] ?? key;
}

/** useParliamentResults hook return type */
export interface UseParliamentResultsReturn {
  /** Available election years for current state */
  availableYears: number[];
  /** Currently selected year */
  selectedYear: number | null;
  /** Election result for selected PC */
  currentResult: PCElectionResult | null;
  /** AC contribution when viewing AC within PC */
  currentACContribution: ACContributionToPC | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Check if PC election data is available for a state */
  hasPCElectionData: (stateName: string) => boolean;
  /** Load PC election index for a state */
  loadStateIndex: (stateName: string) => Promise<PCStateElectionIndex | null>;
  /** Get election result for a PC */
  getPCResult: (
    pcName: string,
    stateName: string,
    year?: number
  ) => Promise<PCElectionResult | null>;
  /** Get AC contribution to PC election */
  getACContribution: (
    acName: string,
    pcName: string,
    stateName: string,
    year?: number
  ) => Promise<ACContributionToPC | null>;
  /** Set selected year */
  setSelectedYear: (year: number) => void;
  /** Clear current result */
  clearResult: () => void;
}

/**
 * Hook for loading and managing parliamentary election results data
 */
export function useParliamentResults(): UseParliamentResultsReturn {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [currentResult, setCurrentResult] = useState<PCElectionResult | null>(null);
  const [currentACContribution, setCurrentACContribution] = useState<ACContributionToPC | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache for loaded data
  const indexCache = useRef<Map<string, PCStateElectionIndex>>(new Map());
  const resultsCache = useRef<Map<string, PCElectionResultsByConstituency>>(new Map());

  // States with available PC election data
  const statesWithData = useRef(new Set<string>());

  /**
   * Check if PC election data is available for a state
   */
  const hasPCElectionData = useCallback((stateName: string): boolean => {
    const slug = getStateSlug(stateName);
    return statesWithData.current.has(slug);
  }, []);

  /**
   * Load PC election index for a state
   */
  const loadStateIndex = useCallback(
    async (stateName: string): Promise<PCStateElectionIndex | null> => {
      const slug = getStateSlug(stateName);

      // Check cache
      const cached = indexCache.current.get(slug);
      if (cached) {
        setAvailableYears(cached.availableYears);
        if (!selectedYear && cached.availableYears.length > 0) {
          const lastYear = cached.availableYears[cached.availableYears.length - 1];
          if (lastYear !== undefined) {
            setSelectedYear(lastYear);
          }
        }
        return cached;
      }

      try {
        const response = await fetch(PC_ELECTIONS.getIndexPath(slug));
        if (!response.ok) {
          console.log(`No PC election data for ${stateName}`);
          return null;
        }

        const index = (await response.json()) as PCStateElectionIndex;
        indexCache.current.set(slug, index);
        statesWithData.current.add(slug);

        setAvailableYears(index.availableYears);
        if (!selectedYear && index.availableYears.length > 0) {
          const lastYear = index.availableYears[index.availableYears.length - 1];
          if (lastYear !== undefined) {
            setSelectedYear(lastYear);
          }
        }

        return index;
      } catch (err) {
        console.log(`Failed to load PC election index for ${stateName}:`, err);
        return null;
      }
    },
    [selectedYear]
  );

  /**
   * Load PC election results for a specific year
   */
  const loadYearResults = useCallback(
    async (stateName: string, year: number): Promise<PCElectionResultsByConstituency | null> => {
      const slug = getStateSlug(stateName);
      const cacheKey = `${slug}_${year}`;

      // Check cache
      const cached = resultsCache.current.get(cacheKey);
      if (cached) return cached;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(PC_ELECTIONS.getYearPath(slug, year));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const results = (await response.json()) as PCElectionResultsByConstituency;
        resultsCache.current.set(cacheKey, results);

        return results;
      } catch (err) {
        console.error(`Failed to load ${year} PC election data for ${stateName}:`, err);
        setError(`Could not load PC election data for ${year}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get election result for a PC
   */
  const getPCResult = useCallback(
    async (pcName: string, stateName: string, year?: number): Promise<PCElectionResult | null> => {
      const slug = getStateSlug(stateName);
      console.log('[getPCResult] State:', stateName, '=> Slug:', slug, '| PC:', pcName);

      // Load index if not already loaded
      let index = indexCache.current.get(slug);
      if (!index) {
        console.log('[getPCResult] Loading index...');
        const loadedIndex = await loadStateIndex(stateName);
        if (!loadedIndex) {
          console.log('[getPCResult] FAILED to load index for', slug);
          return null;
        }
        index = loadedIndex;
        console.log('[getPCResult] Index loaded, years:', index.availableYears);
      }

      // Determine year to use - always use latest if no year explicitly provided
      const lastAvailableYear = index.availableYears[index.availableYears.length - 1];
      const targetYear = year ?? lastAvailableYear;

      if (targetYear === undefined || targetYear === null) return null;
      if (!index.availableYears.includes(targetYear)) return null;

      // Load results for the year
      const results = await loadYearResults(stateName, targetYear);
      if (!results) {
        console.log('[getPCResult] FAILED to load results for year', targetYear);
        return null;
      }
      console.log('[getPCResult] Results loaded, keys count:', Object.keys(results).length);

      // Find the PC result using multiple matching strategies
      const canonicalSearch = createCanonicalKey(pcName);

      // Try direct match first
      let result = results[pcName.toUpperCase().trim()];

      if (!result) {
        const keys = Object.keys(results);

        // Try canonical key match
        const canonicalMatch = keys.find((k) => createCanonicalKey(k) === canonicalSearch);
        if (canonicalMatch) {
          result = results[canonicalMatch];
        }

        // Try partial match (one name contains the other)
        if (!result) {
          const partialMatch = keys.find((k) => {
            const keyCanonical = createCanonicalKey(k);
            return keyCanonical.includes(canonicalSearch) || canonicalSearch.includes(keyCanonical);
          });
          if (partialMatch) {
            result = results[partialMatch];
          }
        }
      }

      if (result) {
        setCurrentResult(result);
        setSelectedYear(targetYear);
        setCurrentACContribution(null); // Clear AC contribution when loading PC result
      }

      return result ?? null;
    },
    [loadStateIndex, loadYearResults]
  );

  /**
   * Get AC contribution to PC election
   * This shows how votes in a specific AC contributed to the PC result
   */
  const getACContribution = useCallback(
    async (
      acName: string,
      pcName: string,
      stateName: string,
      year?: number
    ): Promise<ACContributionToPC | null> => {
      // First get the PC result
      const pcResult = await getPCResult(pcName, stateName, year);
      if (!pcResult) return null;

      // Check if AC-wise results are available
      if (!pcResult.acWiseResults) {
        // AC-wise breakdown not available in data
        // Create a placeholder showing that this AC is part of the PC
        const isACPartOfPC = pcResult.assemblyConstituencies?.some((ac) => {
          const acCanonical = createCanonicalKey(ac);
          const searchCanonical = createCanonicalKey(acName);
          return (
            acCanonical === searchCanonical ||
            acCanonical.includes(searchCanonical) ||
            searchCanonical.includes(acCanonical)
          );
        });

        if (isACPartOfPC) {
          // Return PC-level results as the AC contribution
          // This indicates the AC is part of this PC but detailed breakdown isn't available
          const contribution: ACContributionToPC = {
            acName: acName,
            acNo: 0,
            electors: 0,
            validVotes: 0,
            turnout: 0,
            candidates: pcResult.candidates.map((c) => ({
              ...c,
              acWiseVotes: undefined, // No AC-wise breakdown available
            })),
          };
          setCurrentACContribution(contribution);
          return contribution;
        }
        return null;
      }

      // Find the AC in the results
      const canonicalSearch = createCanonicalKey(acName);
      const acKeys = Object.keys(pcResult.acWiseResults);

      let acContribution: ACContributionToPC | undefined;

      // Try exact match
      acContribution = pcResult.acWiseResults[acName.toUpperCase()];

      if (!acContribution) {
        // Try canonical match
        const matchKey = acKeys.find((k) => createCanonicalKey(k) === canonicalSearch);
        if (matchKey) {
          acContribution = pcResult.acWiseResults[matchKey];
        }
      }

      if (acContribution) {
        setCurrentACContribution(acContribution);
        return acContribution;
      }

      return null;
    },
    [getPCResult]
  );

  /**
   * Clear current result
   */
  const clearResult = useCallback(() => {
    setCurrentResult(null);
    setCurrentACContribution(null);
  }, []);

  return {
    availableYears,
    selectedYear,
    currentResult,
    currentACContribution,
    loading,
    error,
    hasPCElectionData,
    loadStateIndex,
    getPCResult,
    getACContribution,
    setSelectedYear,
    clearResult,
  };
}
