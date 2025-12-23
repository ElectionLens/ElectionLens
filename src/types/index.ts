/**
 * ElectionLens Type Definitions
 * Comprehensive types for India Electoral Map
 */

// ============================================================
// GeoJSON Types
// ============================================================

/** GeoJSON geometry types */
export type GeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon'
  | 'GeometryCollection';

/** GeoJSON Position (longitude, latitude, optional altitude) */
export type Position = [number, number] | [number, number, number];

/** GeoJSON Polygon coordinates */
export type PolygonCoordinates = Position[][];

/** GeoJSON MultiPolygon coordinates */
export type MultiPolygonCoordinates = Position[][][];

/** Base GeoJSON Geometry */
export interface Geometry {
  type: GeometryType;
  coordinates: Position | Position[] | Position[][] | Position[][][];
}

/** Polygon Geometry */
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: PolygonCoordinates;
}

/** MultiPolygon Geometry */
export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: MultiPolygonCoordinates;
}

/** Union of supported geometries */
export type SupportedGeometry = PolygonGeometry | MultiPolygonGeometry;

// ============================================================
// Feature Property Types
// ============================================================

/** State feature properties */
export interface StateProperties {
  /** State name (e.g., "Tamil Nadu") */
  shapeName?: string;
  /** Alternative state name field */
  ST_NM?: string;
  /** State code */
  stateCode?: string;
  /** Schema ID for canonical lookup (e.g., "TN") */
  schemaId?: string;
}

/** District feature properties */
export interface DistrictProperties {
  /** District name */
  district?: string;
  /** Alternative name field */
  NAME?: string;
  /** Alternative district field */
  DISTRICT?: string;
  /** State name */
  state?: string;
  /** Schema ID for canonical lookup (e.g., "TN-D01") */
  schemaId?: string;
}

/** Parliamentary Constituency (PC) properties */
export interface ConstituencyProperties {
  /** Lok Sabha seat name */
  ls_seat_name?: string;
  /** Alternative PC name field */
  PC_NAME?: string;
  /** Lok Sabha seat code */
  ls_seat_code?: string;
  /** Alternative PC number field */
  PC_No?: string;
  /** State/UT name */
  state_ut_name?: string;
  /** Alternative state name field */
  STATE_NAME?: string;
  /** Schema ID for canonical lookup (e.g., "TN-01") */
  schemaId?: string;
}

/** Assembly Constituency (AC) properties */
export interface AssemblyProperties {
  /** Assembly constituency name */
  AC_NAME?: string;
  /** Assembly constituency number */
  AC_NO?: string;
  /** State name */
  ST_NAME?: string;
  /** Parliamentary constituency name */
  PC_NAME?: string;
  /** District name */
  DIST_NAME?: string;
  /** Schema ID for canonical lookup (e.g., "TN-001") */
  schemaId?: string;
}

/** Union of all feature properties */
export type FeatureProperties =
  | StateProperties
  | DistrictProperties
  | ConstituencyProperties
  | AssemblyProperties;

// ============================================================
// GeoJSON Feature Types
// ============================================================

/** Generic GeoJSON Feature */
export interface Feature<P = FeatureProperties> {
  type: 'Feature';
  properties: P;
  geometry: SupportedGeometry;
  id?: string | number;
}

/** State Feature */
export type StateFeature = Feature<StateProperties>;

/** District Feature */
export type DistrictFeature = Feature<DistrictProperties>;

/** Constituency Feature */
export type ConstituencyFeature = Feature<ConstituencyProperties>;

/** Assembly Feature */
export type AssemblyFeature = Feature<AssemblyProperties>;

/** GeoJSON FeatureCollection */
export interface FeatureCollection<F extends Feature = Feature> {
  type: 'FeatureCollection';
  features: F[];
}

/** States FeatureCollection */
export type StatesGeoJSON = FeatureCollection<StateFeature>;

/** Districts FeatureCollection */
export type DistrictsGeoJSON = FeatureCollection<DistrictFeature>;

/** Constituencies FeatureCollection */
export type ConstituenciesGeoJSON = FeatureCollection<ConstituencyFeature>;

/** Assemblies FeatureCollection */
export type AssembliesGeoJSON = FeatureCollection<AssemblyFeature>;

/** Generic GeoJSON data */
export type GeoJSONData =
  | StatesGeoJSON
  | DistrictsGeoJSON
  | ConstituenciesGeoJSON
  | AssembliesGeoJSON;

// ============================================================
// Map Level Types
// ============================================================

/** Map display levels */
export type MapLevel = 'states' | 'districts' | 'constituencies' | 'assemblies';

/** View modes for state-level display */
export type ViewMode = 'constituencies' | 'districts';

// ============================================================
// Style Types
// ============================================================

/** Hex color string (e.g., "#ff0000") */
export type HexColor = `#${string}`;

/** Color palette (array of hex colors) */
export type ColorPalette = HexColor[];

/** Color palettes for each map level */
export interface ColorPalettes {
  states: ColorPalette;
  districts: ColorPalette;
  constituencies: ColorPalette;
  assemblies: ColorPalette;
}

/** Leaflet path style options */
export interface FeatureStyle {
  fillColor: string;
  fillOpacity: number;
  color: string;
  weight: number;
  opacity: number;
}

/** Hover style options */
export interface HoverStyle {
  weight: number;
  color: string;
  fillOpacity: number;
}

// ============================================================
// Cache Types
// ============================================================

/** Districts cache (keyed by state file name) */
export interface DistrictsCache {
  [stateFileName: string]: DistrictsGeoJSON;
}

/** Cache statistics */
export interface CacheStats {
  /** Number of items in IndexedDB */
  dbCount: number;
  /** Number of states in memory cache */
  memCount: number;
  /** Total number of states */
  totalStates?: number;
  /** Number of parliamentary constituencies loaded */
  pcCount: number;
  /** Number of assembly constituencies loaded */
  acCount: number;
}

/** IndexedDB stored item */
export interface DBStoredItem<T = unknown> {
  id: string;
  data: T;
  timestamp: number;
}

// ============================================================
// Navigation State Types
// ============================================================

/** Current navigation state */
export interface NavigationState {
  /** Currently selected state (null = India view) */
  currentState: string | null;
  /** Current view mode */
  currentView: ViewMode;
  /** Currently selected parliamentary constituency */
  currentPC: string | null;
  /** Currently selected district */
  currentDistrict: string | null;
}

// ============================================================
// Hook Return Types
// ============================================================

/** useElectionData hook return type */
export interface UseElectionDataReturn {
  // Data
  statesGeoJSON: StatesGeoJSON | null;
  parliamentGeoJSON: ConstituenciesGeoJSON | null;
  assemblyGeoJSON: AssembliesGeoJSON | null;
  districtsCache: DistrictsCache;

  // Navigation state
  currentState: string | null;
  currentView: ViewMode;
  currentPC: string | null;
  currentDistrict: string | null;
  currentAssembly: string | null;

  // UI state
  loading: boolean;
  error: string | null;
  cacheStats: CacheStats;

  // Data getters
  getConstituenciesForState: (stateName: string) => ConstituencyFeature[];
  getAssembliesForPC: (pcName: string, stateName: string) => AssemblyFeature[];
  getAssembliesForDistrict: (districtName: string, stateName: string) => AssemblyFeature[];

  // Navigation actions
  navigateToState: (stateName: string) => Promise<ConstituenciesGeoJSON | DistrictsGeoJSON | null>;
  navigateToPC: (pcName: string, stateName: string) => Promise<AssembliesGeoJSON>;
  navigateToDistrict: (districtName: string, stateName: string) => Promise<AssembliesGeoJSON>;
  loadDistrictsForState: (stateName: string) => Promise<DistrictsGeoJSON | null>;
  switchView: (view: ViewMode) => void;
  resetView: () => void;
  goBackToState: () => void;
  selectAssembly: (assemblyName: string | null) => void;

  // Utils
  updateCacheStats: () => Promise<void>;
}

// ============================================================
// Component Props Types
// ============================================================

/** Sidebar component props */
export interface SidebarProps {
  statesGeoJSON: StatesGeoJSON | null;
  currentState: string | null;
  currentView: ViewMode;
  currentPC: string | null;
  currentDistrict: string | null;
  cacheStats: CacheStats;
  currentData: GeoJSONData | null;
  onStateClick: (stateName: string, feature: StateFeature) => void;
  onDistrictClick: (districtName: string, feature: DistrictFeature) => void;
  onConstituencyClick: (pcName: string, feature: ConstituencyFeature) => void;
  onAssemblyClick?: (acName: string, feature: AssemblyFeature) => void;
  onSwitchView: (view: ViewMode) => void;
  onReset: () => void;
  onGoBackToState: () => void;
  isOpen: boolean;
  onClose: () => void;
}

/** MapView component props */
export interface MapViewProps {
  statesGeoJSON: StatesGeoJSON | null;
  /** Parliament constituencies GeoJSON for showing context */
  parliamentGeoJSON: ConstituenciesGeoJSON | null;
  currentData: GeoJSONData | null;
  currentState: string | null;
  currentView: ViewMode;
  currentPC: string | null;
  currentDistrict: string | null;
  selectedAssembly: string | null;
  electionResult: ACElectionResult | null;
  shareUrl?: string | undefined;
  availableYears?: number[] | undefined;
  selectedYear?: number | null | undefined;
  /** AC's contributions to Parliament elections (all years) */
  parliamentContributions?:
    | Record<
        number,
        {
          pcName: string;
          year: number;
          candidates: Array<{
            name: string;
            party: string;
            votes: number;
            voteShare: number;
            position: number;
          }>;
          validVotes: number;
        }
      >
    | undefined;
  /** Available parliament years for this AC */
  availablePCYears?: number[] | undefined;
  /** Selected parliament year in AC panel */
  selectedACPCYear?: number | null | undefined;
  /** PC election result */
  pcElectionResult?: PCElectionResult | null | undefined;
  pcShareUrl?: string | undefined;
  pcAvailableYears?: number[] | undefined;
  pcSelectedYear?: number | null | undefined;
  onStateClick: (stateName: string, feature: StateFeature) => void;
  onDistrictClick: (districtName: string, feature: DistrictFeature) => void;
  onConstituencyClick: (pcName: string, feature: ConstituencyFeature) => void;
  onAssemblyClick?: ((acName: string, feature: AssemblyFeature) => void) | undefined;
  onSwitchView: (view: ViewMode) => void;
  onReset: () => void;
  onGoBack: () => void;
  onCloseElectionPanel?: (() => void) | undefined;
  onYearChange?: ((year: number) => void) | undefined;
  /** Callback for changing parliament year in AC panel */
  onACPCYearChange?: ((year: number | null) => void) | undefined;
  onClosePCElectionPanel?: (() => void) | undefined;
  onPCYearChange?: ((year: number) => void) | undefined;
}

/** MapControls component props */
export interface MapControlsProps {
  currentState: string | null;
  currentView: ViewMode;
  onReset: () => void;
  onSwitchView: (view: ViewMode) => void;
  showViewToggle: boolean;
}

/** FitBounds component props */
export interface FitBoundsProps {
  geojson: GeoJSONData | null;
}

// ============================================================
// Info Panel Types
// ============================================================

/** Info panel content */
export interface InfoPanelContent {
  title: string;
  statValue: string;
  statLabel: string;
  subValue: number | string;
  subLabel: string;
}

// ============================================================
// Event Handler Types
// ============================================================

/** Generic click handler */
export type ClickHandler<T> = (name: string, feature: T) => void;

/** State click handler */
export type StateClickHandler = ClickHandler<StateFeature>;

/** District click handler */
export type DistrictClickHandler = ClickHandler<DistrictFeature>;

/** Constituency click handler */
export type ConstituencyClickHandler = ClickHandler<ConstituencyFeature>;

/** Assembly click handler */
export type AssemblyClickHandler = ClickHandler<AssemblyFeature>;

// ============================================================
// Utility Types
// ============================================================

/** State file name mapping */
export interface StateFileMap {
  [stateName: string]: string;
}

/** State alias mapping (for assembly data) */
export interface StateAliasMap {
  [currentName: string]: string;
}

/** District name mapping */
export interface DistrictNameMap {
  [districtStateKey: string]: string;
}

/** PC name mapping */
export interface PCNameMap {
  [pcStateKey: string]: string;
}

/** Nullable type helper */
export type Nullable<T> = T | null;

/** Optional type helper */
export type Optional<T> = T | undefined;

// ============================================================
// IndexedDB Types
// ============================================================

/** IndexedDB database instance */
export type IDBDatabaseInstance = IDBDatabase | null;

/** DB Stats result */
export interface DBStats {
  count: number;
}

// ============================================================
// Election Data Types
// ============================================================

/** Election candidate result */
export interface ElectionCandidate {
  position: number;
  name: string;
  party: string;
  votes: number;
  voteShare: number;
  margin: number | null;
  marginPct: number | null;
  sex: string;
  age: number | null;
  depositLost: boolean;
}

/** Assembly constituency election result */
export interface ACElectionResult {
  year: number;
  constituencyNo: number;
  constituencyName: string;
  constituencyNameOriginal: string;
  constituencyType: 'GEN' | 'SC' | 'ST';
  districtName: string;
  validVotes: number;
  electors: number;
  turnout: number;
  enop: number;
  totalCandidates: number;
  candidates: ElectionCandidate[];
  /** Schema ID (e.g., "RJ-193") - added by migration */
  schemaId?: string;
  /** Canonical name from schema - added by migration */
  name?: string;
  /** Reservation type from schema - added by migration */
  type?: 'GEN' | 'SC' | 'ST';
}

/** Election results keyed by constituency name */
export interface ElectionResultsByConstituency {
  [constituencyName: string]: ACElectionResult;
}

// ============================================================
// Parliamentary Election Data Types
// ============================================================

/** AC-wise votes for a candidate in PC election */
export interface ACWiseCandidateVotes {
  acName: string;
  votes: number;
  voteShare: number;
}

/** Parliamentary election candidate result */
export interface PCElectionCandidate {
  position: number;
  name: string;
  party: string;
  votes: number;
  voteShare: number;
  margin: number | null;
  marginPct: number | null;
  sex: string;
  age: number | null;
  depositLost: boolean;
  /** AC-wise breakdown of votes */
  acWiseVotes?: ACWiseCandidateVotes[] | undefined;
}

/** AC contribution to PC election */
export interface ACContributionToPC {
  acName: string;
  acNo: number;
  electors: number;
  validVotes: number;
  turnout: number;
  candidates: PCElectionCandidate[];
}

/** Parliamentary constituency election result */
export interface PCElectionResult {
  year: number;
  constituencyNo: number;
  constituencyName: string;
  constituencyNameOriginal: string;
  constituencyType: 'GEN' | 'SC' | 'ST';
  stateName: string;
  validVotes: number;
  electors: number;
  turnout: number;
  enop: number;
  totalCandidates: number;
  candidates: PCElectionCandidate[];
  /** Assembly constituencies that constitute this PC */
  assemblyConstituencies: string[];
  /** AC-wise breakdown of results */
  acWiseResults?: { [acName: string]: ACContributionToPC };
  /** Schema ID (e.g., "TN-25") - added by migration */
  schemaId?: string;
  /** Canonical name from schema - added by migration */
  name?: string;
  /** Reservation type from schema - added by migration */
  type?: 'GEN' | 'SC' | 'ST';
}

/** PC election results keyed by PC name */
export interface PCElectionResultsByConstituency {
  [pcName: string]: PCElectionResult;
}

/** State election data index */
export interface StateElectionIndex {
  state: string;
  stateCode: string;
  delimitation: number;
  availableYears: number[];
  totalConstituencies: number;
  lastUpdated: string;
  source: string;
}

/** All years election data for a state */
export interface StateElectionData {
  index: StateElectionIndex;
  years: {
    [year: number]: ElectionResultsByConstituency;
  };
}

// ============================================================
// Leaflet Extension Types
// ============================================================

/** Leaflet layer with additional properties */
export interface LeafletLayerWithFeature {
  feature?: Feature;
  setStyle: (style: Partial<FeatureStyle>) => void;
  bringToFront: () => void;
}

/** Leaflet mouse event */
export interface LeafletMouseEvent {
  target: LeafletLayerWithFeature;
  latlng: {
    lat: number;
    lng: number;
  };
}
