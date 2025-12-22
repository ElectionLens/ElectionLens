/**
 * Master Schema Types - Single Source of Truth
 *
 * This schema defines canonical IDs and names for all geographic and political entities.
 * All other data files (GeoJSON, election results) reference these IDs.
 */

// ============================================================================
// STATE
// ============================================================================

export interface StateEntity {
  /** Unique state ID (e.g., "TN", "MH", "KA") */
  id: string;

  /** Canonical display name (e.g., "Tamil Nadu") */
  name: string;

  /** Alternative names for matching (uppercase, with diacritics, etc.) */
  aliases: string[];

  /** ISO 3166-2 code (e.g., "IN-TN") */
  isoCode: string;

  /** Census code */
  censusCode: string;

  /** Type: state or union territory */
  type: 'state' | 'union_territory';

  /** Number of Lok Sabha seats */
  loksabhaSeats: number;

  /** Number of assembly seats (null for UTs without assembly) */
  assemblySeats: number | null;

  /** Current delimitation year for assembly */
  delimitation: number | null;

  /** Available election years */
  elections: {
    assembly: number[];
    parliament: number[];
  };
}

// ============================================================================
// PARLIAMENTARY CONSTITUENCY (PC)
// ============================================================================

export interface PCEntity {
  /** Unique PC ID (e.g., "TN-01", "MH-15") - format: {stateId}-{pcNo} */
  id: string;

  /** Parent state ID */
  stateId: string;

  /** PC number within state (1-indexed) */
  pcNo: number;

  /** Canonical display name (e.g., "Chennai North") */
  name: string;

  /** Alternative names for matching */
  aliases: string[];

  /** Reservation status */
  type: 'GEN' | 'SC' | 'ST';

  /** Child assembly constituency IDs */
  assemblyIds: string[];

  /** Delimitation year this PC was created/modified */
  delimitation: number;
}

// ============================================================================
// ASSEMBLY CONSTITUENCY (AC)
// ============================================================================

export interface ACEntity {
  /** Unique AC ID (e.g., "TN-001", "MH-150") - format: {stateId}-{acNo} */
  id: string;

  /** Parent state ID */
  stateId: string;

  /** Parent PC ID */
  pcId: string;

  /** Parent district ID */
  districtId: string;

  /** AC number within state (1-indexed) */
  acNo: number;

  /** Canonical display name (e.g., "Anna Nagar") */
  name: string;

  /** Alternative names for matching */
  aliases: string[];

  /** Reservation status */
  type: 'GEN' | 'SC' | 'ST';

  /** Delimitation year this AC was created/modified */
  delimitation: number;
}

// ============================================================================
// DISTRICT
// ============================================================================

export interface DistrictEntity {
  /** Unique district ID (e.g., "TN-CHN", "MH-MUM") */
  id: string;

  /** Parent state ID */
  stateId: string;

  /** Census district code */
  censusCode: string;

  /** Canonical display name */
  name: string;

  /** Alternative names for matching */
  aliases: string[];

  /** Child assembly constituency IDs */
  assemblyIds: string[];
}

// ============================================================================
// MASTER SCHEMA
// ============================================================================

export interface MasterSchema {
  /** Schema version for migrations */
  version: string;

  /** Last updated timestamp */
  lastUpdated: string;

  /** Data sources */
  sources: {
    geo: string;
    elections: string;
  };

  /** All states/UTs indexed by ID */
  states: Record<string, StateEntity>;

  /** All parliamentary constituencies indexed by ID */
  parliamentaryConstituencies: Record<string, PCEntity>;

  /** All assembly constituencies indexed by ID */
  assemblyConstituencies: Record<string, ACEntity>;

  /** All districts indexed by ID */
  districts: Record<string, DistrictEntity>;

  /** Lookup indices for fast name resolution */
  indices: {
    /** State name (lowercase, normalized) -> state ID */
    stateByName: Record<string, string>;

    /** PC name + state (lowercase) -> PC ID */
    pcByName: Record<string, string>;

    /** AC name + state (lowercase) -> AC ID */
    acByName: Record<string, string>;

    /** District name + state (lowercase) -> district ID */
    districtByName: Record<string, string>;
  };
}

// ============================================================================
// HELPER TYPES FOR REFERENCES
// ============================================================================

/**
 * Reference to schema entity in GeoJSON properties
 */
export interface GeoJSONSchemaRef {
  /** Schema entity ID */
  schemaId: string;

  /** Entity type for validation */
  schemaType: 'state' | 'pc' | 'ac' | 'district';
}

/**
 * Reference to schema entity in election data
 */
export interface ElectionSchemaRef {
  /** Schema entity ID */
  schemaId: string;

  /** Canonical name (denormalized for display) */
  name: string;

  /** Reservation type (denormalized for display) */
  type: 'GEN' | 'SC' | 'ST';
}
