import { useState, useCallback, useRef } from 'react';
import { ELECTIONS } from '../constants/paths';
import type { StateElectionIndex, ElectionResultsByConstituency, ACElectionResult } from '../types';

/**
 * Strip diacritics from text
 * Converts characters like ā, ī, ū to a, i, u
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

/** Convert state name to state ID (replaces getStateSlug) */
function getStateId(stateName: string): string {
  const normalized = stripDiacritics(stateName).toLowerCase().trim();
  return STATE_ID_MAP[normalized] || normalized.toUpperCase().slice(0, 2);
}

/** @deprecated Use getStateId instead */
function getStateSlug(stateName: string): string {
  return getStateId(stateName);
}

/**
 * Normalize AC name for matching
 * Strips diacritics, removes parentheses (SC/ST suffixes), converts to uppercase
 */
function normalizeACName(name: string): string {
  return stripDiacritics(name)
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '') // Remove parentheses like (SC), (ST)
    .replace(/[^A-Z0-9]/g, '') // Keep only alphanumeric
    .trim();
}

/** Options for getACResult */
export interface GetACResultOptions {
  /** Schema ID for direct lookup (e.g., "RJ-108") */
  schemaId?: string | undefined;
  /** Canonical AC name from schema (avoids fuzzy matching) */
  canonicalName?: string | undefined;
}

/** useElectionResults hook return type */
export interface UseElectionResultsReturn {
  /** Available election years for current state */
  availableYears: number[];
  /** Currently selected year */
  selectedYear: number | null;
  /** Election result for selected AC */
  currentResult: ACElectionResult | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Check if election data is available for a state */
  hasElectionData: (stateName: string) => boolean;
  /** Load election index for a state */
  loadStateIndex: (stateName: string) => Promise<StateElectionIndex | null>;
  /** Get election result for an AC */
  getACResult: (
    acName: string,
    stateName: string,
    year?: number,
    options?: GetACResultOptions
  ) => Promise<ACElectionResult | null>;
  /** Set selected year */
  setSelectedYear: (year: number) => void;
  /** Clear current result */
  clearResult: () => void;
}

/**
 * Hook for loading and managing election results data
 */
export function useElectionResults(): UseElectionResultsReturn {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [currentResult, setCurrentResult] = useState<ACElectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache for loaded data
  const indexCache = useRef<Map<string, StateElectionIndex>>(new Map());
  const resultsCache = useRef<Map<string, ElectionResultsByConstituency>>(new Map());

  // States with available election data (dynamically populated)
  const statesWithData = useRef(new Set<string>());

  /**
   * Check if election data is available for a state
   */
  const hasElectionData = useCallback((stateName: string): boolean => {
    const slug = getStateSlug(stateName);
    return statesWithData.current.has(slug);
  }, []);

  /**
   * Load election index for a state
   */
  const loadStateIndex = useCallback(
    async (stateName: string): Promise<StateElectionIndex | null> => {
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
        const response = await fetch(ELECTIONS.getIndexPath(slug));
        if (!response.ok) {
          console.log(`No election data for ${stateName}`);
          return null;
        }

        const index = (await response.json()) as StateElectionIndex;
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
        console.log(`Failed to load election index for ${stateName}:`, err);
        return null;
      }
    },
    [selectedYear]
  );

  /**
   * Load election results for a specific year
   */
  const loadYearResults = useCallback(
    async (stateName: string, year: number): Promise<ElectionResultsByConstituency | null> => {
      const slug = getStateSlug(stateName);
      const cacheKey = `${slug}_${year}`;

      // Check cache
      const cached = resultsCache.current.get(cacheKey);
      if (cached) return cached;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(ELECTIONS.getYearPath(slug, year));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const results = (await response.json()) as ElectionResultsByConstituency;
        resultsCache.current.set(cacheKey, results);

        return results;
      } catch (err) {
        console.error(`Failed to load ${year} election data for ${stateName}:`, err);
        setError(`Could not load election data for ${year}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get election result for an AC
   * @param acName - AC name to search for
   * @param stateName - State name
   * @param year - Optional year (defaults to latest)
   * @param options - Optional schemaId or canonicalName for direct lookup
   */
  const getACResult = useCallback(
    async (
      acName: string,
      stateName: string,
      year?: number,
      options?: GetACResultOptions
    ): Promise<ACElectionResult | null> => {
      const slug = getStateSlug(stateName);
      const { schemaId, canonicalName } = options ?? {};
      console.log(
        '[getACResult] State:',
        stateName,
        '=> Slug:',
        slug,
        '| AC:',
        acName,
        schemaId ? `| schemaId: ${schemaId}` : ''
      );

      // Load index if not already loaded
      let index = indexCache.current.get(slug);
      if (!index) {
        console.log('[getACResult] Loading index...');
        const loadedIndex = await loadStateIndex(stateName);
        if (!loadedIndex) {
          console.log('[getACResult] FAILED to load index for', slug);
          return null;
        }
        index = loadedIndex;
        console.log('[getACResult] Index loaded, years:', index.availableYears);
      }

      // Determine year to use - always use latest if no year explicitly provided
      const lastAvailableYear = index.availableYears[index.availableYears.length - 1];
      let targetYear = year ?? lastAvailableYear;

      if (targetYear === undefined || targetYear === null) return null;

      // If requested year is not available, fall back to the closest available year
      if (!index.availableYears.includes(targetYear)) {
        // Find the closest available year
        const sortedYears = [...index.availableYears].sort((a, b) => a - b);
        let closestYear = sortedYears[sortedYears.length - 1]; // Default to latest
        let minDiff = Infinity;

        for (const availableYear of sortedYears) {
          const diff = Math.abs(availableYear - targetYear);
          if (diff < minDiff) {
            minDiff = diff;
            closestYear = availableYear;
          }
        }

        console.log(
          `[getACResult] Year ${targetYear} not available, falling back to ${closestYear}`
        );
        targetYear = closestYear!;
      }

      // Load results for the year
      const results = await loadYearResults(stateName, targetYear);
      if (!results) {
        console.log('[getACResult] FAILED to load results for year', targetYear);
        return null;
      }
      console.log('[getACResult] Results loaded, keys count:', Object.keys(results).length);

      // Find the AC result using simplified lookup (schema ID or name matching)
      let result: ACElectionResult | undefined;
      const searchName = canonicalName ?? acName;
      const normalizedSearch = normalizeACName(searchName);

      console.log('[getACResult] ==== SEARCH START ====');
      console.log('[getACResult] acName:', acName);
      console.log('[getACResult] canonicalName:', canonicalName);
      console.log('[getACResult] searchName:', searchName);
      console.log('[getACResult] normalizedSearch:', normalizedSearch);
      console.log('[getACResult] schemaId:', schemaId);

      // Strategy 1: Schema ID direct lookup (primary path for new data format)
      if (schemaId) {
        result = results[schemaId];
        if (result) {
          console.log('[getACResult] ✓ Schema ID match:', schemaId);
        }
      }

      // Strategy 2: Direct key match (for any legacy data)
      if (!result) {
        result = results[searchName.toUpperCase().trim()];
        if (result) {
          console.log('[getACResult] ✓ Direct key match:', searchName.toUpperCase().trim());
        }
      }

      // Strategy 3: Match by name properties (for schema ID-keyed data)
      if (!result) {
        for (const [key, value] of Object.entries(results)) {
          if (!value || typeof value !== 'object') continue;

          // Check constituencyName, constituencyNameOriginal, name
          const namesToCheck = [
            value.constituencyName,
            value.constituencyNameOriginal,
            value.name,
          ].filter((n): n is string => Boolean(n));

          for (const name of namesToCheck) {
            if (normalizeACName(name) === normalizedSearch) {
              result = value;
              console.log('[getACResult] ✓ Name property match:', key, '→', name);
              break;
            }
          }
          if (result) break;
        }
      }

      // Strategy 4: Partial match (one contains the other) - handles minor variations
      if (!result) {
        for (const [key, value] of Object.entries(results)) {
          if (!value || typeof value !== 'object') continue;

          const namesToCheck = [
            value.constituencyName,
            value.constituencyNameOriginal,
            value.name,
          ].filter((n): n is string => Boolean(n));

          for (const name of namesToCheck) {
            const normalizedName = normalizeACName(name);
            if (
              normalizedName.includes(normalizedSearch) ||
              normalizedSearch.includes(normalizedName)
            ) {
              result = value;
              console.log('[getACResult] ✓ Partial match:', key, '→', name);
              break;
            }
          }
          if (result) break;
        }
      }

      if (result) {
        setCurrentResult(result);
        setSelectedYear(targetYear);
      }

      return result ?? null;
    },
    [loadStateIndex, loadYearResults]
  );

  /**
   * Clear current result
   */
  const clearResult = useCallback(() => {
    setCurrentResult(null);
  }, []);

  return {
    availableYears,
    selectedYear,
    currentResult,
    loading,
    error,
    hasElectionData,
    loadStateIndex,
    getACResult,
    setSelectedYear,
    clearResult,
  };
}
