import { useState, useCallback, useRef } from 'react';
import { ELECTIONS } from '../constants/paths';
import type { StateElectionIndex, ElectionResultsByConstituency, ACElectionResult } from '../types';
import { isAssemblyElectionResult } from '../utils/electionResults';
import { defaultAssemblyDataYear } from '../utils/electionSchedule';

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
 * Strips diacritics, removes only (SC)/(ST) — not (North)/(South) — then alphanumeric key
 */
function normalizeACName(name: string): string {
  return stripDiacritics(name)
    .toUpperCase()
    .replace(/\s*\(\s*(SC|ST)\s*\)\s*/gi, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/** Common spelling variants for AC names (URL vs data), e.g. Tadpatri vs Tadipatri, Pappireddipatti vs Pappireddippatti (PC data) */
const AC_NAME_VARIANTS: Record<string, string[]> = {
  TADPATRI: ['TADPATRI', 'TADIPATRI'],
  TADIPATRI: ['TADIPATRI', 'TADPATRI'],
  PAPPIREDDIPATTI: ['PAPPIREDDIPATTI', 'PAPPIREDDIPPATTI'],
  PAPPIREDDIPPATTI: ['PAPPIREDDIPPATTI', 'PAPPIREDDIPATTI'],
};

function getACNameSearchVariants(normalized: string): string[] {
  const added = AC_NAME_VARIANTS[normalized];
  return added ?? [normalized];
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
  /** Indicative next assembly year from the loaded state index (for UI copy) */
  assemblyNextElectionYear: number | null;
  /** Load election index for a state. Pass yearFromUrl to avoid overwriting URL year with latest. */
  loadStateIndex: (
    stateName: string,
    options?: { yearFromUrl?: number }
  ) => Promise<StateElectionIndex | null>;
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
  const [assemblyNextElectionYear, setAssemblyNextElectionYear] = useState<number | null>(null);
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
    async (
      stateName: string,
      options?: { yearFromUrl?: number }
    ): Promise<StateElectionIndex | null> => {
      const slug = getStateSlug(stateName);
      const preserveYear = options?.yearFromUrl != null;

      // Check cache
      const cached = indexCache.current.get(slug);
      if (cached) {
        setAvailableYears(cached.availableYears);
        setAssemblyNextElectionYear(cached.nextAssemblyElectionYear ?? null);
        if (!preserveYear && !selectedYear && cached.availableYears.length > 0) {
          const defaultYear = defaultAssemblyDataYear(cached.availableYears, {
            nextAssemblyElectionYear: cached.nextAssemblyElectionYear ?? null,
          });
          if (defaultYear != null) {
            setSelectedYear(defaultYear);
          }
        }
        return cached;
      }

      try {
        const response = await fetch(ELECTIONS.getIndexPath(slug));
        if (!response.ok) {
          return null;
        }

        const index = (await response.json()) as StateElectionIndex;
        indexCache.current.set(slug, index);
        statesWithData.current.add(slug);

        setAvailableYears(index.availableYears);
        setAssemblyNextElectionYear(index.nextAssemblyElectionYear ?? null);
        if (!preserveYear && !selectedYear && index.availableYears.length > 0) {
          const defaultYear = defaultAssemblyDataYear(index.availableYears, {
            nextAssemblyElectionYear: index.nextAssemblyElectionYear ?? null,
          });
          if (defaultYear != null) {
            setSelectedYear(defaultYear);
          }
        }

        return index;
      } catch {
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

      setCurrentResult(null);
      setLoading(true);
      setError(null);

      let result: ACElectionResult | undefined;
      try {
        // Load index if not already loaded (pass yearFromUrl so loadStateIndex does not overwrite URL year)
        let index = indexCache.current.get(slug);
        if (!index) {
          const loadedIndex = await loadStateIndex(
            stateName,
            year != null ? { yearFromUrl: year } : undefined
          );
          if (!loadedIndex) {
            setError('Could not load election index for this state.');
            return null;
          }
          index = loadedIndex;
        }

        // Default to latest completed / map year when none requested (not the single upcoming slot)
        const defaultYear = defaultAssemblyDataYear(index.availableYears, {
          nextAssemblyElectionYear: index.nextAssemblyElectionYear ?? null,
        });
        let targetYear = year ?? defaultYear;

        if (targetYear === undefined || targetYear === null) {
          return null;
        }

        // If requested year is not available, fall back to the closest available year
        if (!index.availableYears.includes(targetYear)) {
          // Find the closest available year
          const sortedYears = [...index.availableYears].sort((a, b) => a - b);
          let closestYear =
            defaultAssemblyDataYear(index.availableYears, {
              nextAssemblyElectionYear: index.nextAssemblyElectionYear ?? null,
            }) ?? sortedYears[sortedYears.length - 1];
          let minDiff = Infinity;

          for (const availableYear of sortedYears) {
            const diff = Math.abs(availableYear - targetYear);
            if (diff < minDiff) {
              minDiff = diff;
              closestYear = availableYear;
            }
          }
          targetYear = closestYear!;
        }

        // Load results for the year
        const results = await loadYearResults(stateName, targetYear);
        if (!results) {
          return null;
        }

        // Find the AC result using simplified lookup (schema ID or name matching)
        const searchName = canonicalName ?? acName;
        const normalizedSearch = normalizeACName(searchName);
        const searchVariants = getACNameSearchVariants(normalizedSearch);

        // Strategy 1: Schema ID direct lookup (primary path for new data format)
        if (schemaId) {
          const hit = results[schemaId];
          if (isAssemblyElectionResult(hit)) result = hit;
        }

        // Strategy 2: Direct key match (for any legacy data)
        if (!result) {
          const hit = results[searchName.toUpperCase().trim()];
          if (isAssemblyElectionResult(hit)) result = hit;
        }

        // Strategy 3: Match by name properties (for schema ID-keyed data), including spelling variants (e.g. Tadpatri/Tadipatri)
        if (!result) {
          for (const [entryKey, value] of Object.entries(results)) {
            if (entryKey.startsWith('_') || !value || typeof value !== 'object') continue;
            const acVal = value as ACElectionResult;
            if (!isAssemblyElectionResult(acVal)) continue;

            const namesToCheck = [
              acVal.constituencyName,
              acVal.constituencyNameOriginal,
              acVal.name,
            ].filter((n): n is string => Boolean(n));

            for (const name of namesToCheck) {
              const normalizedName = normalizeACName(name);
              if (searchVariants.includes(normalizedName)) {
                result = acVal;
                break;
              }
            }
            if (result) break;
          }
        }

        // Strategy 4: Partial match (one contains the other) - handles minor variations and spelling variants
        if (!result) {
          for (const [entryKey, value] of Object.entries(results)) {
            if (entryKey.startsWith('_') || !value || typeof value !== 'object') continue;
            const acVal = value as ACElectionResult;
            if (!isAssemblyElectionResult(acVal)) continue;

            const namesToCheck = [
              acVal.constituencyName,
              acVal.constituencyNameOriginal,
              acVal.name,
            ].filter((n): n is string => Boolean(n));

            for (const name of namesToCheck) {
              const normalizedName = normalizeACName(name);
              const matches = searchVariants.some(
                (v) =>
                  normalizedName.includes(v) || v.includes(normalizedName) || normalizedName === v
              );
              if (matches) {
                result = acVal;
                break;
              }
            }
            if (result) break;
          }
        }

        if (result) {
          setError(null);
          setCurrentResult(result);
          setSelectedYear(targetYear);
        } else {
          setError('Constituency not found in election data for this year.');
        }

        return result ?? null;
      } catch (e) {
        console.error('getACResult failed:', e);
        setError('Could not load constituency results.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [loadStateIndex, loadYearResults]
  );

  /**
   * Clear current result
   */
  const clearResult = useCallback(() => {
    setCurrentResult(null);
    setError(null);
  }, []);

  return {
    availableYears,
    assemblyNextElectionYear,
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
