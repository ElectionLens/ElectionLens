/**
 * GeoJSON Data File Paths
 * Centralized path configuration for all geographical data files
 *
 * Note: As of v2.0, paths use state IDs (TN, MH) instead of slugs (tamil-nadu, maharashtra)
 */

/** Base path for all geo data files */
export const GEO_DATA_BASE = '/data/geo';

/** Base path for election data files */
export const ELECTION_DATA_BASE = '/data/elections';

/** Boundary data paths */
export const BOUNDARIES = {
  /** India states and union territories */
  STATES: `${GEO_DATA_BASE}/boundaries/states.geojson`,
} as const;

/** Parliament (Lok Sabha) data paths */
export const PARLIAMENT = {
  /** Parliamentary constituency boundaries */
  CONSTITUENCIES: `${GEO_DATA_BASE}/parliament/constituencies.geojson`,
} as const;

/** Assembly (Vidhan Sabha) data paths */
export const ASSEMBLY = {
  /** Assembly constituency boundaries */
  CONSTITUENCIES: `${GEO_DATA_BASE}/assembly/constituencies.geojson`,
} as const;

/** Districts data paths */
export const DISTRICTS = {
  /** Base path for district files */
  BASE: `${GEO_DATA_BASE}/districts`,

  /**
   * Get the full path for a state's district file
   * @param stateId - The state ID (e.g., "TN") - preferred
   * @returns Full path to the GeoJSON file
   */
  getPath: (stateId: string): string => `${GEO_DATA_BASE}/districts/${stateId}.geojson`,
} as const;

/** Assembly election data paths */
export const ELECTIONS = {
  /** Base path for assembly election files */
  AC_BASE: `${ELECTION_DATA_BASE}/ac`,

  /** Master index of all states with election data */
  MASTER_INDEX: `${ELECTION_DATA_BASE}/ac/index.json`,

  /**
   * Get the index file path for a state's election data
   * @param stateId - The state ID (e.g., "TN")
   */
  getIndexPath: (stateId: string): string => `${ELECTION_DATA_BASE}/ac/${stateId}/index.json`,

  /**
   * Get the election results file path for a specific year
   * @param stateId - The state ID
   * @param year - The election year
   */
  getYearPath: (stateId: string, year: number): string =>
    `${ELECTION_DATA_BASE}/ac/${stateId}/${year}.json`,
} as const;

/** Parliamentary election data paths */
export const PC_ELECTIONS = {
  /** Base path for parliamentary election files */
  PC_BASE: `${ELECTION_DATA_BASE}/pc`,

  /**
   * Get the index file path for a state's PC election data
   * @param stateId - The state ID (e.g., "TN")
   */
  getIndexPath: (stateId: string): string => `${ELECTION_DATA_BASE}/pc/${stateId}/index.json`,

  /**
   * Get the PC election results file path for a specific year
   * @param stateId - The state ID
   * @param year - The election year
   */
  getYearPath: (stateId: string, year: number): string =>
    `${ELECTION_DATA_BASE}/pc/${stateId}/${year}.json`,
} as const;

/** IndexedDB cache keys */
export const CACHE_KEYS = {
  STATES: 'geo_boundaries_states',
  PARLIAMENT: 'geo_parliament_constituencies',
  ASSEMBLY: 'geo_assembly_constituencies',

  /**
   * Get cache key for district data
   * @param stateSlug - The state slug
   */
  getDistrictKey: (stateSlug: string): string => `geo_districts_${stateSlug}`,
} as const;

/** Data version for cache invalidation */
export const DATA_VERSION = '1.0.0';
