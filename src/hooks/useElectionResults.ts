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

/** State slug generator */
function getStateSlug(stateName: string): string {
  return stripDiacritics(stateName)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Known AC name mappings: GeoJSON name -> Election data name
 * Used for edge cases where automated matching fails
 */
const AC_NAME_MAPPINGS: Record<string, string> = {
  // Bihar
  GORIAKOTHI: 'GORIYAKOTHI',
  RUNNISAIDPUR: 'RUNNI SAIDPUR',
  TRIVENIGANJ: 'TRIVENI GANJ',
  // Chhattisgarh
  DURGRURAL: 'DURG GRAMIN',
  NARAYANPUR: 'NARAINPUR',
  NAWAGARH: 'BINDRA NAWAGARH',
  // Gujarat
  KALAVAD: 'KALAWAD',
  CHORYASI: 'CHORASI',
  // Jharkhand
  MANDU: 'MANDHU',
  GOMIA: 'GOMIYA',
  // Kerala
  NEMMARA: 'NEMARA',
  // Madhya Pradesh
  SUMAWALI: 'SUMAOLI',
  NARYOLI: 'NARYAWALI',
  // Maharashtra
  DEOLALI: 'DEOLI',
  // Manipur
  KEISAMTHONG: 'KEISHAMTHONG',
  // Meghalaya
  SOHING: 'SOHRA',
  // Nagaland
  SHAMTORRCHESSORE: 'SHAMATOR CHESSORE',
  // Rajasthan
  SAHARA: 'SAHADA',
  KARANPUR: 'SRI KARANPUR',
  GANGANAGAR: 'SRI GANGANAGAR',
  NEEMAKATHANA: 'NEEMKATHANA',
  LADNUN: 'LADNU',
  RAMGARH: 'DANTA RAMGARH',
  KAPASAN: 'KAPASIN',
  // Tamil Nadu
  ARAKKONAM: 'ARAKONAM',
  EDAPPADI: 'EDAPADI',
  SENTHAMANGALAM: 'SENTHAMAN GALAM',
  VILUPPURAM: 'VILLUPURAM',
  // Uttar Pradesh
  PATIYALI: 'PATIALI',
  PANIYRA: 'PANIARA',
  MARIYAHU: 'MARIAHU',
  // West Bengal
  BAISNABNAGAR: 'BAISHNAB NAGAR',
};

/**
 * Create a canonical key for matching (removes all separators and special chars)
 */
function createCanonicalKey(name: string): string {
  return stripDiacritics(name)
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '') // Remove parentheses
    .replace(/[^A-Z0-9]/g, ''); // Keep only alphanumeric
}

/**
 * Create a simplified key for fuzzy matching
 * Removes vowels and normalizes consonants for phonetic similarity
 */
function createFuzzyKey(name: string): string {
  return createCanonicalKey(name)
    .replace(/TH/g, 'T') // Normalize TH to T
    .replace(/PH/g, 'F') // Normalize PH to F
    .replace(/Y/g, 'I') // Normalize Y to I
    .replace(/W/g, 'V') // Normalize W to V
    .replace(/[AEIOU]/g, '') // Remove vowels
    .substring(0, 12); // First 12 consonants
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function similarityScore(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;

  // Check if shorter is contained in longer
  if (longer.includes(shorter)) return shorter.length / longer.length;

  // Count matching characters
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i]!)) matches++;
  }
  return matches / longer.length;
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

      // Find the AC result using multiple matching strategies
      const searchName = canonicalName ?? acName;
      const canonicalKey = createCanonicalKey(searchName);
      const fuzzyKey = createFuzzyKey(searchName);

      // Check if there's a known mapping for this AC
      const mappedName = AC_NAME_MAPPINGS[canonicalKey];

      // Try direct match first (using canonical name if provided)
      let result = results[searchName.toUpperCase()];

      // If canonicalName was provided and we got a result, we're done (skip fuzzy matching)
      if (canonicalName && result) {
        console.log('[getACResult] Direct match with canonical name:', canonicalName);
        setCurrentResult(result);
        setSelectedYear(targetYear);
        return result;
      }

      // Also try original acName if different from searchName
      if (!result && canonicalName) {
        result = results[acName.toUpperCase()];
      }

      if (!result) {
        const keys = Object.keys(results);

        // Try mapped name if available
        if (mappedName) {
          const mappedMatch = keys.find(
            (k) =>
              createCanonicalKey(k) === createCanonicalKey(mappedName) ||
              k.toUpperCase().replace(/\s+/g, ' ').trim() === mappedName
          );
          if (mappedMatch) {
            result = results[mappedMatch];
          }
        }

        // Try canonical key match
        if (!result) {
          const canonicalMatch = keys.find((k) => createCanonicalKey(k) === canonicalKey);
          if (canonicalMatch) {
            result = results[canonicalMatch];
          }
        }

        // Try fuzzy match
        if (!result) {
          const fuzzyMatch = keys.find((k) => createFuzzyKey(k) === fuzzyKey);
          if (fuzzyMatch) {
            result = results[fuzzyMatch];
          }
        }

        // Try similarity-based match
        if (!result) {
          let bestMatch: string | null = null;
          let bestScore = 0.7; // Minimum threshold

          keys.forEach((k) => {
            const keyCanonical = createCanonicalKey(k);
            const score = similarityScore(canonicalKey, keyCanonical);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = k;
            }
          });

          if (bestMatch) {
            result = results[bestMatch];
          }
        }

        // Try first word match as last resort
        if (!result) {
          const firstWord = canonicalKey.substring(0, Math.min(6, canonicalKey.length));
          if (firstWord.length >= 4) {
            const firstWordMatch = keys.find((k) => {
              const keyCanonical = createCanonicalKey(k);
              return (
                keyCanonical.startsWith(firstWord) ||
                firstWord.startsWith(keyCanonical.substring(0, firstWord.length))
              );
            });
            if (firstWordMatch) {
              result = results[firstWordMatch];
            }
          }
        }
      }

      // If not found and state is Andhra Pradesh, try Telangana (due to 2014 state split)
      if (!result && slug === 'andhra-pradesh') {
        const telanganaResults = await loadYearResults('Telangana', targetYear);
        if (telanganaResults) {
          const telKeys = Object.keys(telanganaResults);

          // Try canonical match in Telangana data
          const telCanonicalMatch = telKeys.find((k) => createCanonicalKey(k) === canonicalKey);
          if (telCanonicalMatch) {
            result = telanganaResults[telCanonicalMatch];
          }

          // Try fuzzy match in Telangana data
          if (!result) {
            const telFuzzyMatch = telKeys.find((k) => createFuzzyKey(k) === fuzzyKey);
            if (telFuzzyMatch) {
              result = telanganaResults[telFuzzyMatch];
            }
          }

          // Try similarity match in Telangana data
          if (!result) {
            let bestMatch: string | null = null;
            let bestScore = 0.7;
            telKeys.forEach((k) => {
              const score = similarityScore(canonicalKey, createCanonicalKey(k));
              if (score > bestScore) {
                bestScore = score;
                bestMatch = k;
              }
            });
            if (bestMatch) {
              result = telanganaResults[bestMatch];
            }
          }
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
