/**
 * GeoJSON Data File Paths
 * Centralized path configuration for all geographical data files
 */

/** Base path for all geo data files */
export const GEO_DATA_BASE = '/data/geo';

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
   * @param stateSlug - The state slug (e.g., "tamil-nadu")
   * @returns Full path to the GeoJSON file
   */
  getPath: (stateSlug: string): string => 
    `${GEO_DATA_BASE}/districts/${stateSlug}.geojson`,
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
  getDistrictKey: (stateSlug: string): string => 
    `geo_districts_${stateSlug}`,
} as const;

/** Data version for cache invalidation */
export const DATA_VERSION = '1.0.0';

