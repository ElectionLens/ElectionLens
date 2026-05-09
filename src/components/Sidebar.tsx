import { useState, useCallback, useEffect, useMemo } from 'react';
import { Map, Building2, Landmark, Database, Check, Link2, Clock, BookOpen } from 'lucide-react';
import {
  normalizeName,
  getFeatureColor,
  getElectionStateId,
  formatOrdinal,
} from '../utils/helpers';
import { getPartyColor, getPartyShortName } from '../utils/partyData';
import { LeftPaneButton } from './LeftPaneButton';
import { SearchBox } from './SearchBox';
import { YearSelector, type YearOption } from './YearSelector';
import { buildMapYearDropdownOptions } from '../utils/mapYearOptions';
import { buildAcPanelPlaceholder } from '../utils/acPanelPlaceholder';
import { ElectionResultPanel } from './ElectionResultPanel';
import { PCElectionResultPanel } from './PCElectionResultPanel';
import { useBoothData } from '../hooks/useBoothData';
import type {
  ACElectionResult,
  BrowseListWinnersContext,
  InfoPanelContent,
  PCElectionResult,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  Feature,
  AssemblyProperties,
  ConstituencyProperties,
  DistrictProperties,
  StateProperties,
  StatesGeoJSON,
  ConstituenciesGeoJSON,
  AssembliesGeoJSON,
  DistrictsCache,
  GeoJSONData,
  PartyCandidateRow,
  ViewMode,
  CacheStats,
  HexColor,
  StateSummaryPanelData,
} from '../types';
import {
  resolveAssemblyMapPolygonWinner,
  resolveDistrictPolygonParty,
  resolvePcMapPolygonWinner,
} from '../utils/mapPolygonWinners';
import type { ReactNode, CSSProperties, KeyboardEvent } from 'react';

/** Result label for party candidate rows (votes pane): Won / Lost (Nth) / — */
function partyCandidateOutcomeLabel(row: PartyCandidateRow): string {
  const pos = row.position;
  if (typeof pos !== 'number' || pos < 1) return '—';
  if (pos === 1) return 'Won';
  return `Lost (${formatOrdinal(pos)})`;
}

/** Enter / Space activates sidebar list rows rendered as div[role="button"]. */
function sidebarListRowKeyDown(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

/** Extended Sidebar props with search and share */
interface SidebarProps {
  statesGeoJSON: StatesGeoJSON | null;
  parliamentGeoJSON: ConstituenciesGeoJSON | null;
  assemblyGeoJSON: AssembliesGeoJSON | null;
  districtsCache: DistrictsCache;
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
  onSearchStateSelect: (stateName: string, feature: StateFeature) => void;
  onSearchConstituencySelect: (
    pcName: string,
    stateName: string,
    feature: ConstituencyFeature
  ) => void;
  onSearchAssemblySelect: (acName: string, stateName: string, feature: AssemblyFeature) => void;
  onSearchDistrictSelect: (
    districtName: string,
    stateName: string,
    feature: DistrictFeature
  ) => void;
  onShare: () => void;
  isOpen: boolean;
  onClose: () => void;
  onBlogClick?: () => void;
  selectedSummaryParty?: string | null;
  onSummaryPartyChange?: (party: string | null) => void;
  onSummaryCandidateSelect?: (row: PartyCandidateRow) => void;
  stateSummaryData?: StateSummaryPanelData | null;
  electionResult?: ACElectionResult | null;
  acResultsLoading?: boolean;
  acResultsLoadError?: string | null;
  shareUrl?: string | undefined;
  parliamentContributions?: Record<
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
  >;
  pcContributionShareUrl?: string | undefined;
  pcElectionResult?: PCElectionResult | null;
  pcShareUrl?: string | undefined;
  onCloseElectionPanel?: () => void;
  onClosePCElectionPanel?: () => void;
  /** Map toolbar controls moved into sidebar */
  selectedAssembly?: string | null;
  availableYears?: number[];
  selectedYear?: number | null;
  availablePCYears?: number[];
  selectedACPCYear?: number | null;
  pcAvailableYears?: number[];
  pcSelectedYear?: number | null;
  onYearChange?: (year: number) => void;
  onACPCYearChange?: (year: number | null) => void;
  onPCYearChange?: (year: number) => void;
  showACsWithinPC?: boolean;
  onShowACsWithinPCChange?: (show: boolean) => void;
  /** Sync sidebar election panel View with `?tab=` via App URL state */
  onElectionPanelViewTabSync?: (tab: 'overview' | 'booths' | 'postal' | 'analysis') => void;
  leftPane?: 'root' | 'region' | 'summary' | 'party' | 'ac' | 'pc';
  leftPaneView?: 'seats' | 'votes' | null;
  leftPaneParty?: string | null;
  onLeftPaneChange?: (next: {
    pane: 'root' | 'region' | 'summary' | 'party' | 'ac' | 'pc';
    paneView?: 'seats' | 'votes' | null;
    paneParty?: string | null;
  }) => void;
  browseListWinnersContext?: BrowseListWinnersContext | null;
  resolveDistrictName?: (districtName: string, stateId: string) => string | null;
  getDistrict?: (districtId: string) => { name?: string } | null | undefined;
}

/** Extended CSS properties to allow custom CSS variables */
interface ExtendedCSSProperties extends CSSProperties {
  '--item-color'?: string;
}

type SidebarTab = 'list' | 'seats' | 'votes';

function getSidebarTabFromUrl(): SidebarTab {
  if (typeof window === 'undefined') return 'list';
  const params = new URLSearchParams(window.location.search);
  const pane = params.get('pane');
  if (pane === 'summary' || pane === 'party') {
    const paneView = params.get('paneView');
    return paneView === 'votes' ? 'votes' : 'seats';
  }
  const value = params.get('summaryView');
  if (value === 'constituencies' || value === 'constituecies') return 'list';
  return value === 'seats' || value === 'votes' || value === 'list' ? value : 'list';
}

/**
 * Sidebar component for navigation and info display
 * Shows breadcrumbs, info panel, and lists of geographical features
 */
export function Sidebar({
  statesGeoJSON,
  parliamentGeoJSON,
  assemblyGeoJSON,
  districtsCache,
  currentState,
  currentView,
  currentPC,
  currentDistrict,
  cacheStats,
  currentData,
  onStateClick,
  onDistrictClick,
  onConstituencyClick,
  onAssemblyClick,
  onSwitchView,
  onReset,
  onGoBackToState,
  onSearchStateSelect,
  onSearchConstituencySelect,
  onSearchAssemblySelect,
  onSearchDistrictSelect,
  onShare,
  isOpen,
  onClose,
  onBlogClick,
  selectedSummaryParty = null,
  onSummaryPartyChange,
  onSummaryCandidateSelect,
  stateSummaryData = null,
  electionResult = null,
  acResultsLoading = false,
  acResultsLoadError = null,
  shareUrl,
  parliamentContributions,
  pcContributionShareUrl,
  pcElectionResult = null,
  pcShareUrl,
  onCloseElectionPanel,
  onClosePCElectionPanel,
  selectedAssembly = null,
  availableYears = [],
  selectedYear = null,
  availablePCYears = [],
  selectedACPCYear = null,
  pcAvailableYears = [],
  pcSelectedYear = null,
  onYearChange,
  onACPCYearChange,
  onPCYearChange,
  showACsWithinPC = true,
  onShowACsWithinPCChange,
  onElectionPanelViewTabSync,
  leftPane = 'root',
  leftPaneView = null,
  leftPaneParty = null,
  onLeftPaneChange,
  browseListWinnersContext = null,
  resolveDistrictName,
  getDistrict,
}: SidebarProps): JSX.Element {
  const { boothResults, boothsWithResults, loadBoothData, loadBoothResults } = useBoothData();
  const [isMobileSidebar, setIsMobileSidebar] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileSidebar(window.innerWidth <= 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!electionResult?.schemaId?.startsWith('TN-')) return;
    const yearToLoad = selectedACPCYear ?? selectedYear ?? electionResult.year;
    if (!yearToLoad) return;
    void loadBoothData('TN', electionResult.schemaId, yearToLoad);
  }, [
    electionResult?.schemaId,
    electionResult?.year,
    selectedACPCYear,
    selectedYear,
    loadBoothData,
  ]);

  useEffect(() => {
    if (!electionResult?.schemaId?.startsWith('TN-')) return;
    const yearToLoad = selectedACPCYear ?? selectedYear ?? electionResult.year;
    if (!yearToLoad) return;
    void loadBoothResults('TN', electionResult.schemaId, yearToLoad);
  }, [
    electionResult?.schemaId,
    electionResult?.year,
    selectedACPCYear,
    selectedYear,
    loadBoothResults,
  ]);

  const [copied, setCopied] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => getSidebarTabFromUrl());
  const [summaryReturnTab, setSummaryReturnTab] = useState<'seats' | 'votes'>('seats');
  const [partyCandidateQuery, setPartyCandidateQuery] = useState('');
  const [partyCandidateSort, setPartyCandidateSort] = useState<'share' | 'constituency'>('share');
  const displayState = currentState ? normalizeName(currentState) : null;

  useEffect(() => {
    if (stateSummaryData) {
      const tabFromUrl = getSidebarTabFromUrl();
      setSidebarTab(tabFromUrl === 'votes' ? 'votes' : 'seats');
      setPartyCandidateQuery('');
    } else {
      setSidebarTab('list');
      setPartyCandidateQuery('');
    }
  }, [stateSummaryData]);

  useEffect(() => {
    if (leftPaneView === 'votes') {
      setSidebarTab('votes');
    } else if (leftPaneView === 'seats') {
      setSidebarTab('seats');
    } else if (leftPane === 'region' || leftPane === 'root') {
      setSidebarTab('list');
    }
  }, [leftPane, leftPaneView]);

  useEffect(() => {
    const handlePopState = (): void => {
      const tabFromUrl = getSidebarTabFromUrl();
      setSidebarTab(tabFromUrl);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!stateSummaryData || !currentState) return;
    if (sidebarTab === 'seats') {
      onLeftPaneChange?.({ pane: 'summary', paneView: 'seats', paneParty: null });
    } else if (sidebarTab === 'votes') {
      onLeftPaneChange?.({ pane: 'summary', paneView: 'votes', paneParty: null });
    }
  }, [sidebarTab, stateSummaryData, currentState, onLeftPaneChange]);

  const handleShareClick = useCallback(() => {
    onShare();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [onShare]);

  const sidebarLayerOptions = useMemo<YearOption[]>(
    () => [
      {
        id: 'constituencies',
        label: 'Parliament (PC)',
        title: 'Parliamentary constituencies',
        isActive: currentView === 'constituencies',
        onClick: () => onSwitchView('constituencies'),
      },
      {
        id: 'districts',
        label: 'Districts',
        title: 'District boundaries',
        isActive: currentView === 'districts',
        onClick: () => onSwitchView('districts'),
      },
      {
        id: 'assemblies',
        label: 'Assembly (AC)',
        title: 'Assembly constituencies',
        isActive: currentView === 'assemblies',
        onClick: () => onSwitchView('assemblies'),
      },
    ],
    [currentView, onSwitchView]
  );

  const mapYearOptions = useMemo(
    () =>
      buildMapYearDropdownOptions({
        currentView,
        showACCheckbox: Boolean(currentPC),
        selectedAssembly,
        availableYears,
        selectedYear,
        availablePCYears,
        selectedPCYear: selectedACPCYear,
        pcAvailableYears,
        pcSelectedYear,
        ...(onYearChange ? { onYearChange } : {}),
        ...(onACPCYearChange ? { onPCYearChange: onACPCYearChange } : {}),
        ...(onPCYearChange ? { onPCYearChangeForPC: onPCYearChange } : {}),
      }),
    [
      currentView,
      currentPC,
      selectedAssembly,
      availableYears,
      selectedYear,
      availablePCYears,
      selectedACPCYear,
      pcAvailableYears,
      pcSelectedYear,
      onYearChange,
      onACPCYearChange,
      onPCYearChange,
    ]
  );

  const acPanelPlaceholderResult = useMemo(() => {
    if (!selectedAssembly || !currentState) return null;
    // Suppress orphaned panel chrome on statewide browse maps (PC grid or districts overview).
    // Keeps placeholder during PC+AC / district+AC hydration and transient drill state.
    const isNakedStateConstituenciesGrid =
      currentView === 'constituencies' && !currentPC && !currentDistrict;
    const isDistrictsOverview = currentView === 'districts' && !currentPC && !currentDistrict;
    if (isNakedStateConstituenciesGrid || isDistrictsOverview) return null;
    const y = selectedYear ?? new Date().getFullYear();
    return buildAcPanelPlaceholder(selectedAssembly, y);
  }, [selectedAssembly, selectedYear, currentView, currentPC, currentDistrict, currentState]);

  const showACDetailPanel = Boolean(
    (electionResult || acPanelPlaceholderResult) && onCloseElectionPanel
  );
  const showPCDetailPanel = Boolean(pcElectionResult && onClosePCElectionPanel);
  const hasDetailPanel = showACDetailPanel || showPCDetailPanel;

  const sidebarPanelViewOptions = useMemo<YearOption[]>(() => {
    return [
      {
        id: 'list',
        label: 'Constituencies',
        isActive: sidebarTab === 'list',
        onClick: () => {
          setSidebarTab('list');
          onLeftPaneChange?.({
            pane: currentState ? 'region' : 'root',
            paneView: null,
            paneParty: null,
          });
        },
      },
      {
        id: 'seats',
        label: 'Seats won',
        isActive: sidebarTab === 'seats',
        onClick: () => {
          setSidebarTab('seats');
          onLeftPaneChange?.({ pane: 'summary', paneView: 'seats', paneParty: null });
        },
      },
      {
        id: 'votes',
        label: 'Vote share',
        isActive: sidebarTab === 'votes',
        onClick: () => {
          setSidebarTab('votes');
          onLeftPaneChange?.({ pane: 'summary', paneView: 'votes', paneParty: null });
        },
      },
    ];
  }, [sidebarTab, onLeftPaneChange, currentState]);

  /**
   * Determine what to show in info panel based on current navigation
   */
  const getInfoContent = (): InfoPanelContent => {
    const acDetailResult = electionResult ?? acPanelPlaceholderResult;
    if (showPCDetailPanel && pcElectionResult) {
      const count = currentData?.features?.length ?? 0;
      return {
        title:
          pcElectionResult.constituencyNameOriginal ??
          pcElectionResult.name ??
          pcElectionResult.constituencyName ??
          '',
        statValue: displayState ?? '',
        statLabel: '',
        subValue: count,
        subLabel: 'Assembly Constituencies',
      };
    }
    if (showACDetailPanel && acDetailResult && currentView === 'assemblies') {
      const count = currentData?.features?.length ?? 0;
      const title =
        acDetailResult.constituencyNameOriginal ??
        acDetailResult.name ??
        acDetailResult.constituencyName ??
        selectedAssembly ??
        '';
      return {
        title: title || (displayState ?? ''),
        statValue: displayState ?? '',
        statLabel: '',
        subValue: count,
        subLabel: 'Assembly Constituencies',
      };
    }
    if (currentPC) {
      return {
        title: currentPC,
        statValue: displayState ?? '',
        statLabel: '',
        subValue: currentData?.features?.length ?? 0,
        subLabel: 'Assembly Constituencies',
      };
    }
    if (currentDistrict) {
      return {
        title: currentDistrict,
        statValue: displayState ?? '',
        statLabel: '',
        subValue: currentData?.features?.length ?? 0,
        subLabel: 'Assembly Constituencies',
      };
    }
    if (currentState) {
      const count = currentData?.features?.length ?? 0;
      let subLabel = 'Districts';
      if (currentView === 'constituencies') {
        subLabel = 'Parliamentary Constituencies';
      } else if (currentView === 'assemblies') {
        subLabel = 'Assembly Constituencies';
      }
      return {
        title: displayState ?? '',
        statValue: displayState ?? '',
        statLabel: '',
        subValue: count,
        subLabel,
      };
    }
    return {
      title: 'India',
      statValue: '36',
      statLabel: 'States & UTs',
      subValue: '-',
      subLabel: 'Select a State',
    };
  };

  const info = getInfoContent();
  const compactMetaParts = [info.statValue, info.subValue]
    .map((value, index) => {
      const label = index === 0 ? info.statLabel : info.subLabel;
      if (value === null || value === undefined) return null;
      const valueText = String(value).trim();
      const labelText = String(label ?? '').trim();
      if (!valueText) return null;
      if (valueText === '-') return labelText || null;
      return labelText ? `${valueText} ${labelText}` : valueText;
    })
    .filter((segment): segment is string => Boolean(segment));

  const formatIn = (num: number): string => {
    if (!Number.isFinite(num)) return '—';
    return Math.round(num).toLocaleString('en-IN');
  };

  /**
   * Render breadcrumb navigation
   */
  const renderBreadcrumb = (): ReactNode[] => {
    const crumbs: ReactNode[] = [
      <a key="india" onClick={onReset} role="button" tabIndex={0}>
        India
      </a>,
    ];

    if (currentState) {
      crumbs.push(<span key="sep1"> › </span>);
      if (currentPC ?? currentDistrict) {
        crumbs.push(
          <a key="state" onClick={onGoBackToState} role="button" tabIndex={0}>
            {displayState}
          </a>
        );
        crumbs.push(<span key="sep2"> › </span>);
        if (currentPC) {
          crumbs.push(<span key="pc">{currentPC}</span>);
        } else if (currentDistrict) {
          crumbs.push(<span key="district">{currentDistrict}</span>);
          crumbs.push(<span key="sep3"> › Assemblies</span>);
        }
      } else {
        crumbs.push(<span key="state">{displayState}</span>);
      }
    }

    return crumbs;
  };

  /**
   * Check if features are assembly data (have valid AC_NAME) vs constituency data (have ls_seat_name)
   */
  const isAssemblyData = (features: Feature[]): boolean => {
    if (!features.length) return false;
    // Check first few features for AC_NAME with actual value
    const sample = features.slice(0, 5);
    const hasAssemblyProps = sample.some((f) => {
      const props = f.properties as Record<string, unknown>;
      // Assembly data has AC_NAME with value, constituency has ls_seat_name
      const acName = props['AC_NAME'];
      return acName && typeof acName === 'string' && acName.trim() !== '';
    });
    const hasConstituencyProps = sample.some((f) => {
      const props = f.properties as Record<string, unknown>;
      const seatName = props['ls_seat_name'];
      return seatName && typeof seatName === 'string';
    });
    // It's assembly data if it has AC_NAME values and NOT ls_seat_name
    return hasAssemblyProps && !hasConstituencyProps;
  };

  /**
   * Render the appropriate list based on current navigation level
   */
  const renderList = (): ReactNode => {
    // Show assemblies if we're in assembly view
    if (currentPC ?? currentDistrict) {
      // Check if we have no data at all (empty features)
      if (!currentData?.features?.length) {
        return (
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">
                <Landmark size={40} />
              </div>
              <strong>No Assembly Data</strong>
              <p>
                {currentPC
                  ? 'This is a Union Territory without a state legislative assembly, or assembly boundary data is not available.'
                  : 'This is a newer district created after delimitation, or assembly boundary data is not yet available for this district.'}
              </p>
            </div>
          </div>
        );
      }

      // Verify we have assembly data, not constituency data (race condition protection)
      if (!isAssemblyData(currentData.features as Feature[])) {
        return (
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">
                <Clock size={40} />
              </div>
              <strong>Loading assembly data...</strong>
            </div>
          </div>
        );
      }

      type SortedAssembly = { feature: Feature<AssemblyProperties>; index: number };

      // Filter out features without valid names (pre-delimitation placeholders)
      const validFeatures = currentData.features.filter((f) => {
        const props = (f as Feature<AssemblyProperties>).properties;
        return props.AC_NAME && props.AC_NAME.trim() !== '';
      });

      const sorted: SortedAssembly[] = validFeatures
        .map(
          (f, idx): SortedAssembly => ({ feature: f as Feature<AssemblyProperties>, index: idx })
        )
        .sort((a, b) => {
          const noA = parseInt(a.feature.properties.AC_NO ?? '0', 10);
          const noB = parseInt(b.feature.properties.AC_NO ?? '0', 10);
          return noA - noB;
        });

      return (
        <div className="district-list">
          <h3>Assembly Constituencies ({sorted.length})</h3>
          {sorted.map(({ feature, index }) => {
            const name = feature.properties.AC_NAME ?? '';
            const acNo = feature.properties.AC_NO ?? '';
            const aw = resolveAssemblyMapPolygonWinner({
              props: feature.properties,
              winners: browseListWinnersContext?.constituencyWinners ?? {},
              suppressAssemblyPartyMapColors:
                browseListWinnersContext?.suppressAssemblyPartyMapColors ?? false,
              currentPC,
              currentDistrict,
              currentState,
              getStateId: getElectionStateId,
              districtWinners: browseListWinnersContext?.districtWinners ?? {},
              resolveDistrictName: resolveDistrictName ?? (() => null),
            });
            const color: HexColor = aw?.party
              ? (getPartyColor(aw.party) as HexColor)
              : getFeatureColor(index, 'assemblies');
            const style: ExtendedCSSProperties = { '--item-color': color };

            return (
              <div
                key={`assembly-${index}`}
                className="assembly-item interactive-row"
                style={style}
                onClick={() => onAssemblyClick?.(name, feature as AssemblyFeature)}
                onKeyDown={(e) =>
                  sidebarListRowKeyDown(e, () =>
                    onAssemblyClick?.(name, feature as AssemblyFeature)
                  )
                }
                role="button"
                tabIndex={0}
              >
                <Landmark size={14} className="item-icon" />
                <span>{name}</span>
                <span className="ac-number">{acNo}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Show constituencies
    if (currentState && currentView === 'constituencies') {
      if (!currentData?.features?.length) {
        return (
          <div className="district-list">
            <h3>No constituencies found</h3>
          </div>
        );
      }

      type SortedConstituency = { feature: Feature<ConstituencyProperties>; index: number };

      const sorted: SortedConstituency[] = [...currentData.features]
        .map(
          (f, idx): SortedConstituency => ({
            feature: f as Feature<ConstituencyProperties>,
            index: idx,
          })
        )
        .sort((a, b) => {
          const noA = parseInt(
            a.feature.properties.ls_seat_code ?? a.feature.properties.PC_No ?? '0',
            10
          );
          const noB = parseInt(
            b.feature.properties.ls_seat_code ?? b.feature.properties.PC_No ?? '0',
            10
          );
          return noA - noB;
        });

      return (
        <div className="district-list">
          <h3>Parliamentary Constituencies ({currentData.features.length})</h3>
          {sorted.map(({ feature, index }) => {
            const name = feature.properties.ls_seat_name ?? feature.properties.PC_NAME ?? 'Unknown';
            const pcNo = feature.properties.ls_seat_code ?? feature.properties.PC_No ?? '';
            const pw = resolvePcMapPolygonWinner({
              props: feature.properties,
              winners: browseListWinnersContext?.constituencyWinners ?? {},
              dominantPCParty: browseListWinnersContext?.dominantPCParty ?? null,
            });
            const color: HexColor = pw?.party
              ? (getPartyColor(pw.party) as HexColor)
              : getFeatureColor(index, 'constituencies');
            const style: ExtendedCSSProperties = { '--item-color': color };

            return (
              <div
                key={`pc-${index}`}
                className="constituency-item interactive-row"
                style={style}
                onClick={() => onConstituencyClick(name, feature as ConstituencyFeature)}
                onKeyDown={(e) =>
                  sidebarListRowKeyDown(e, () =>
                    onConstituencyClick(name, feature as ConstituencyFeature)
                  )
                }
                role="button"
                tabIndex={0}
              >
                <Building2 size={16} className="item-icon" />
                <span>{name}</span>
                <span className="pc-number">{pcNo}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Show districts
    if (currentState && currentView === 'districts') {
      if (!currentData?.features?.length) {
        return (
          <div className="district-list">
            <h3>No districts found</h3>
          </div>
        );
      }

      type DistrictItem = { name: string; index: number; feature: Feature<DistrictProperties> };

      const districts: DistrictItem[] = currentData.features
        .map((f, idx): DistrictItem => {
          const feat = f as Feature<DistrictProperties>;
          return {
            name:
              feat.properties.district ??
              feat.properties.NAME ??
              feat.properties.DISTRICT ??
              'Unknown',
            index: idx,
            feature: feat,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return (
        <div className="district-list">
          <h3>Districts ({currentData.features.length})</h3>
          {districts.map(({ name, index, feature }) => {
            const dp =
              browseListWinnersContext && currentState
                ? resolveDistrictPolygonParty(feature.properties, {
                    districtWinners: browseListWinnersContext.districtWinners,
                    currentState,
                    getStateId: getElectionStateId,
                    resolveDistrictName: resolveDistrictName ?? (() => null),
                    suppressPartyColors: browseListWinnersContext.suppressAssemblyPartyMapColors,
                    ...(getDistrict ? { getDistrict } : {}),
                  })
                : undefined;
            const color: HexColor = dp
              ? (getPartyColor(dp) as HexColor)
              : getFeatureColor(index, 'districts');
            const style: ExtendedCSSProperties = { '--item-color': color };
            return (
              <div
                key={`district-${index}`}
                className="district-item interactive-row"
                style={style}
                onClick={() => onDistrictClick(name, feature as DistrictFeature)}
                onKeyDown={(e) =>
                  sidebarListRowKeyDown(e, () => onDistrictClick(name, feature as DistrictFeature))
                }
                role="button"
                tabIndex={0}
              >
                <Map size={14} className="item-icon" />
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Show all assemblies for state (AC view at state level)
    if (currentState && currentView === 'assemblies') {
      if (!currentData?.features?.length) {
        return (
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">
                <Landmark size={40} />
              </div>
              <strong>Loading assembly data...</strong>
            </div>
          </div>
        );
      }

      // Verify we have assembly data
      if (!isAssemblyData(currentData.features as Feature[])) {
        return (
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">
                <Clock size={40} />
              </div>
              <strong>Loading assembly data...</strong>
            </div>
          </div>
        );
      }

      type SortedAssembly = { feature: Feature<AssemblyProperties>; index: number };

      // Filter out features without valid names
      const validFeatures = currentData.features.filter((f) => {
        const props = (f as Feature<AssemblyProperties>).properties;
        return props.AC_NAME && props.AC_NAME.trim() !== '';
      });

      const sorted: SortedAssembly[] = validFeatures
        .map(
          (f, idx): SortedAssembly => ({ feature: f as Feature<AssemblyProperties>, index: idx })
        )
        .sort((a, b) => {
          const noA = parseInt(a.feature.properties.AC_NO ?? '0', 10);
          const noB = parseInt(b.feature.properties.AC_NO ?? '0', 10);
          return noA - noB;
        });

      return (
        <div className="district-list">
          <h3>Assembly Constituencies ({sorted.length})</h3>
          {sorted.map(({ feature, index }) => {
            const name = feature.properties.AC_NAME ?? '';
            const acNo = feature.properties.AC_NO ?? '';
            const aw = resolveAssemblyMapPolygonWinner({
              props: feature.properties,
              winners: browseListWinnersContext?.constituencyWinners ?? {},
              suppressAssemblyPartyMapColors:
                browseListWinnersContext?.suppressAssemblyPartyMapColors ?? false,
              currentPC,
              currentDistrict,
              currentState,
              getStateId: getElectionStateId,
              districtWinners: browseListWinnersContext?.districtWinners ?? {},
              resolveDistrictName: resolveDistrictName ?? (() => null),
            });
            const color: HexColor = aw?.party
              ? (getPartyColor(aw.party) as HexColor)
              : getFeatureColor(index, 'assemblies');
            const style: ExtendedCSSProperties = { '--item-color': color };

            return (
              <div
                key={`assembly-${index}`}
                className="assembly-item interactive-row"
                style={style}
                onClick={() => onAssemblyClick?.(name, feature as AssemblyFeature)}
                onKeyDown={(e) =>
                  sidebarListRowKeyDown(e, () =>
                    onAssemblyClick?.(name, feature as AssemblyFeature)
                  )
                }
                role="button"
                tabIndex={0}
              >
                <Landmark size={14} className="item-icon" />
                <span>{name}</span>
                <span className="ac-number">{acNo}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Show states list (India view)
    if (statesGeoJSON?.features) {
      type StateItem = { name: string; index: number; feature: Feature<StateProperties> };

      const states: StateItem[] = statesGeoJSON.features
        .map((f, idx): StateItem => {
          const feat = f as Feature<StateProperties>;
          return {
            name: feat.properties.shapeName ?? feat.properties.ST_NM ?? '',
            index: idx,
            feature: feat,
          };
        })
        .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));

      return (
        <div className="district-list">
          <h3>States & Union Territories ({states.length})</h3>
          {states.map(({ name, index, feature }) => {
            const displayName = normalizeName(name);
            const stateId = feature.properties.schemaId ?? getElectionStateId(name);
            const sw = browseListWinnersContext?.stateWinners[stateId]?.party;
            const color: HexColor = sw
              ? (getPartyColor(sw) as HexColor)
              : getFeatureColor(index, 'states');
            return (
              <div
                key={`state-${index}`}
                className="district-item state-item interactive-row"
                onClick={() => onStateClick(name, feature as StateFeature)}
                onKeyDown={(e) =>
                  sidebarListRowKeyDown(e, () => onStateClick(name, feature as StateFeature))
                }
                role="button"
                tabIndex={0}
                style={{ '--item-color': color } as ExtendedCSSProperties}
              >
                <Map size={16} className="item-icon" />
                <span>{displayName}</span>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  const summaryFooter = (): ReactNode => {
    if (!stateSummaryData) return null;
    return (
      <div className="share-bar state-map-summary-footer">
        <div className="share-bar-info">
          <span className="district-label">
            {stateSummaryData.constituenciesCounted} {stateSummaryData.seatUnitLabel} counted
            {stateSummaryData.totalValidVotes > 0
              ? ` · ${formatIn(stateSummaryData.totalValidVotes)} valid votes`
              : ''}
          </span>
        </div>
      </div>
    );
  };

  const openPartyCandidates = useCallback(
    (party: string, sourceTab: 'seats' | 'votes'): void => {
      onSummaryPartyChange?.(party);
      setSummaryReturnTab(sourceTab);
      onLeftPaneChange?.({ pane: 'party', paneView: sourceTab, paneParty: party });
    },
    [onSummaryPartyChange, onLeftPaneChange]
  );

  const renderPartyCandidatesPanel = (): ReactNode => {
    const party = leftPaneParty ?? selectedSummaryParty;
    if (!stateSummaryData || !party) return null;
    const sourceRows = stateSummaryData.partyCandidateRowsByParty?.[party] ?? [];
    const query = partyCandidateQuery.trim().toLowerCase();
    const filtered = sourceRows.filter((row) => {
      if (!query) return true;
      return (
        (row.candidateName ?? '').toLowerCase().includes(query) ||
        (row.constituencyName ?? '').toLowerCase().includes(query)
      );
    });
    const rows = [...filtered].sort((a, b) => {
      if (partyCandidateSort === 'constituency') {
        const byConst = a.constituencyName.localeCompare(b.constituencyName);
        if (byConst !== 0) return byConst;
      }
      return b.voteShare !== a.voteShare ? b.voteShare - a.voteShare : a.position - b.position;
    });

    const showVotePaneOutcome = leftPaneView === 'votes';

    return (
      <div className="sidebar-summary party-candidates-panel" data-summary-pane="party-candidates">
        <div className="party-candidates-header">
          <h4>{getPartyShortName(party)} candidates</h4>
          <p aria-live="polite">
            {rows.length} of {sourceRows.length} shown
          </p>
        </div>
        <div className="party-candidates-controls">
          <input
            type="text"
            value={partyCandidateQuery}
            onChange={(e) => setPartyCandidateQuery(e.target.value)}
            placeholder="Filter candidate or constituency"
            aria-label="Filter party candidates"
          />
          <label>
            Sort
            <select
              value={partyCandidateSort}
              onChange={(e) => setPartyCandidateSort(e.target.value as 'share' | 'constituency')}
            >
              <option value="share">Vote share</option>
              <option value="constituency">Constituency</option>
            </select>
          </label>
        </div>
        <div className="party-candidates-list">
          {rows.length === 0 ? (
            <p className="state-map-summary-muted">No candidates match this filter.</p>
          ) : (
            rows.map((row, index) => {
              const outcomeText = partyCandidateOutcomeLabel(row);
              return (
                <LeftPaneButton
                  variant="row"
                  key={`${row.party}-${row.candidateName}-${row.constituencyName}-${index}`}
                  className="party-candidate-row interactive-row"
                  onClick={() => {
                    onLeftPaneChange?.({
                      pane: row.constituencyType === 'PC' ? 'pc' : 'ac',
                      paneView: leftPaneView ?? summaryReturnTab,
                      paneParty: party,
                    });
                    onSummaryCandidateSelect?.(row);
                  }}
                >
                  <span className="party-candidate-main">
                    <strong>{row.candidateName}</strong>
                    <span>{row.constituencyName}</span>
                  </span>
                  {showVotePaneOutcome ? (
                    <span
                      className={`party-candidate-outcome ${
                        row.position === 1
                          ? 'party-candidate-outcome--won'
                          : typeof row.position === 'number' && row.position > 1
                            ? 'party-candidate-outcome--lost'
                            : ''
                      }`}
                      title={outcomeText}
                    >
                      {outcomeText}
                    </span>
                  ) : null}
                  <span className="party-candidate-metrics">
                    <span>{row.voteShare.toFixed(1)}%</span>
                    <span>{formatIn(row.votes)}</span>
                  </span>
                </LeftPaneButton>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderSummarySeats = (): ReactNode => {
    if (!stateSummaryData) return null;
    return (
      <div
        className="sidebar-summary"
        data-summary-variant={stateSummaryData.variant}
        data-summary-pane="seats"
      >
        <div className="state-map-summary-section">
          {stateSummaryData.suppressSummaryMessage ? (
            <p className="state-map-summary-muted">{stateSummaryData.suppressSummaryMessage}</p>
          ) : stateSummaryData.seatRows.length === 0 ? (
            <p className="state-map-summary-muted">No seat data mapped yet.</p>
          ) : (
            <ul className="state-map-summary-list">
              {stateSummaryData.seatRows.map((row) => {
                const col = getPartyColor(row.party);
                const isSelected = selectedSummaryParty === row.party;
                return (
                  <li
                    key={row.party}
                    className={`state-map-summary-row ${isSelected ? 'is-selected' : ''}`}
                  >
                    <span
                      className="state-map-summary-swatch"
                      style={{ backgroundColor: col, boxShadow: `0 0 0 1px ${col}40` }}
                    />
                    <LeftPaneButton
                      variant="inline"
                      className="state-map-summary-party-link"
                      title={`Filter map by ${row.party}`}
                      onClick={() => openPartyCandidates(row.party, 'seats')}
                      {...(onSummaryPartyChange && { 'aria-pressed': isSelected })}
                    >
                      <span className="state-map-summary-party" title={row.party}>
                        {getPartyShortName(row.party)}
                      </span>
                    </LeftPaneButton>
                    <span className="state-map-summary-value">{row.seats}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {summaryFooter()}
      </div>
    );
  };

  const renderSummaryVotes = (): ReactNode => {
    if (!stateSummaryData) return null;
    return (
      <div
        className="sidebar-summary"
        data-summary-variant={stateSummaryData.variant}
        data-summary-pane="votes"
      >
        <div className="state-map-summary-section">
          {!stateSummaryData.voteRows?.length ? (
            <p className="state-map-summary-muted">
              {stateSummaryData.suppressSummaryMessage ??
                'Loading or no result file matched to the map.'}
            </p>
          ) : (
            <ul className="state-map-summary-list">
              {stateSummaryData.voteRows.map((row) => {
                const col = getPartyColor(row.party);
                const isSelected = selectedSummaryParty === row.party;
                return (
                  <li
                    key={row.party}
                    className={`state-map-summary-row ${isSelected ? 'is-selected' : ''}`}
                  >
                    <span
                      className="state-map-summary-swatch"
                      style={{ backgroundColor: col, boxShadow: `0 0 0 1px ${col}40` }}
                    />
                    <LeftPaneButton
                      variant="inline"
                      className="state-map-summary-party-link"
                      title={`Filter map by ${row.party}`}
                      onClick={() => openPartyCandidates(row.party, 'votes')}
                      {...(onSummaryPartyChange && { 'aria-pressed': isSelected })}
                    >
                      <span className="state-map-summary-party" title={row.party}>
                        {getPartyShortName(row.party)}
                      </span>
                    </LeftPaneButton>
                    <span className="state-map-summary-votepct">
                      {row.pct.toFixed(1)}%
                      <span className="state-map-summary-voteabs"> ({formatIn(row.votes)})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {summaryFooter()}
      </div>
    );
  };

  const renderDetailPanel = (): ReactNode => {
    if (showACDetailPanel) {
      const acResult = electionResult ?? acPanelPlaceholderResult;
      const onCloseAc = onCloseElectionPanel;
      if (!acResult || !onCloseAc) {
        return null;
      }
      return (
        <div className="sidebar-detail-host">
          <ElectionResultPanel
            result={acResult}
            onClose={onCloseAc}
            omitConstituencyHeading
            shareUrl={shareUrl}
            stateName={currentState ?? undefined}
            availableYears={availableYears}
            selectedYear={selectedYear ?? undefined}
            onYearChange={onYearChange}
            parliamentContributions={parliamentContributions}
            availablePCYears={availablePCYears}
            selectedPCYear={selectedACPCYear}
            onPCYearChange={onACPCYearChange}
            pcContributionShareUrl={pcContributionShareUrl}
            boothResults={boothResults}
            boothsWithResults={boothsWithResults}
            acResultsLoading={!electionResult && acResultsLoading}
            acResultsLoadError={!electionResult ? acResultsLoadError : null}
            layerOptions={sidebarLayerOptions}
            onViewTabSync={onElectionPanelViewTabSync}
          />
        </div>
      );
    }
    if (showPCDetailPanel) {
      if (!pcElectionResult || !onClosePCElectionPanel) {
        return null;
      }
      return (
        <div className="sidebar-detail-host">
          <PCElectionResultPanel
            result={pcElectionResult}
            onClose={onClosePCElectionPanel}
            omitConstituencyHeading
            shareUrl={pcShareUrl}
            stateName={currentState ?? undefined}
            availableYears={pcAvailableYears}
            selectedYear={pcSelectedYear ?? undefined}
            onYearChange={onPCYearChange}
            layerOptions={sidebarLayerOptions}
          />
        </div>
      );
    }
    return null;
  };

  /** Layer / year / Show ACs — same scope as the former map toolbar center. */
  const showStateMapControls = Boolean(currentState);
  /** Summary View dropdown + seats/votes panels only on undrilled state map. */
  const showSummarySidebarUI = Boolean(currentState && !currentPC && !currentDistrict);
  const hasSidebarMapControlRows =
    !hasDetailPanel ||
    (showSummarySidebarUI && Boolean(stateSummaryData)) ||
    (Boolean(currentPC) && Boolean(onShowACsWithinPCChange));
  const effectiveOpen = isOpen;
  /** Mobile only: dim map when AC/PC detail pane is open (list/summary sidebar keeps map usable like web). */
  const showSidebarOverlay = isMobileSidebar && isOpen && hasDetailPanel;

  const acDetailForBadge = showACDetailPanel ? (electionResult ?? acPanelPlaceholderResult) : null;
  const renderPaneHeader = (): ReactNode => {
    if (leftPane === 'root') return null;
    let title = 'Region';
    let onBack = onReset;
    if (leftPane === 'summary') {
      title = leftPaneView === 'votes' ? 'Vote share' : 'Seats won';
      onBack = () => onLeftPaneChange?.({ pane: 'region', paneView: null, paneParty: null });
    } else if (leftPane === 'party') {
      title = 'Party candidates';
      onBack = () =>
        onLeftPaneChange?.({
          pane: 'summary',
          paneView: leftPaneView ?? summaryReturnTab,
          paneParty: null,
        });
    } else if (leftPane === 'ac') {
      title = 'Assembly detail';
      onBack = () => {
        onCloseElectionPanel?.();
        onLeftPaneChange?.({
          pane: leftPaneParty ? 'party' : 'region',
          paneView: leftPaneView ?? summaryReturnTab,
          paneParty: leftPaneParty,
        });
      };
    } else if (leftPane === 'pc') {
      title = 'Parliament detail';
      onBack = () => {
        onClosePCElectionPanel?.();
        onLeftPaneChange?.({
          pane: leftPaneParty ? 'party' : 'region',
          paneView: leftPaneView ?? summaryReturnTab,
          paneParty: leftPaneParty,
        });
      };
    } else if (leftPane === 'region') {
      title = 'Region';
      onBack = onReset;
    }
    return (
      <div className="pane-stack-header">
        <LeftPaneButton variant="back" aria-label="Go back one level" onClick={onBack}>
          ← Back
        </LeftPaneButton>
        <span className="pane-stack-title">{title}</span>
      </div>
    );
  };

  return (
    <>
      <div className={`sidebar ${effectiveOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>
            <img src="/favicon.svg" alt="" width={24} height={24} />
            Election Lens
          </h1>
          <div className="sidebar-header-actions">
            <p>India Electoral Map</p>
            {onBlogClick && (
              <LeftPaneButton
                variant="chrome"
                className="blog-btn"
                onClick={onBlogClick}
                title="View Blog"
              >
                <BookOpen size={16} />
                <span>Blog</span>
              </LeftPaneButton>
            )}
          </div>
        </div>

        <div className="sidebar-scroll">
          <div className="breadcrumb pane-section pane-section-tight">
            <div className="breadcrumb-nav">{renderBreadcrumb()}</div>
            {currentState && (
              <LeftPaneButton
                variant="chrome"
                className={`share-btn ${copied ? 'copied' : ''}`}
                onClick={handleShareClick}
                title={copied ? 'Copied!' : 'Copy shareable link'}
              >
                {copied ? <Check size={16} /> : <Link2 size={16} />}
              </LeftPaneButton>
            )}
          </div>

          <div className="pane-section pane-section-tight">
            <SearchBox
              statesGeoJSON={statesGeoJSON}
              parliamentGeoJSON={parliamentGeoJSON}
              assemblyGeoJSON={assemblyGeoJSON}
              districtsCache={districtsCache}
              onStateSelect={onSearchStateSelect}
              onConstituencySelect={onSearchConstituencySelect}
              onAssemblySelect={onSearchAssemblySelect}
              onDistrictSelect={onSearchDistrictSelect}
            />
          </div>

          <div className="info-panel pane-content">
            {renderPaneHeader()}
            <div className="info-title info-title-row pane-section-header">
              <span className="info-title-text">{info.title}</span>
              {acDetailForBadge && (
                <span
                  className={`constituency-type type-${(acDetailForBadge.constituencyType ?? 'GEN').toLowerCase()}`}
                >
                  {acDetailForBadge.constituencyType ?? 'GEN'}
                </span>
              )}
              {showPCDetailPanel && pcElectionResult && (
                <>
                  <span className="pc-badge">Parliament</span>
                  <span
                    className={`constituency-type type-${(pcElectionResult.constituencyType ?? 'GEN').toLowerCase()}`}
                  >
                    {pcElectionResult.constituencyType ?? 'GEN'}
                  </span>
                </>
              )}
            </div>
            {compactMetaParts.length > 0 && (
              <div className="info-meta-line pane-section pane-section-tight">
                {compactMetaParts.join(' • ')}
              </div>
            )}

            {showStateMapControls && hasSidebarMapControlRows && (
              <div className="sidebar-map-controls pane-section pane-control-stack">
                {!hasDetailPanel && (
                  <div className="sidebar-view-selector-wrap">
                    <YearSelector
                      label="Layer"
                      fieldId="sidebar-layer-mode"
                      className="sidebar-view-selector"
                      variant="stacked"
                      options={sidebarLayerOptions}
                    />
                  </div>
                )}
                {mapYearOptions.length > 0 && !hasDetailPanel && (
                  <div className="sidebar-view-selector-wrap">
                    <YearSelector
                      label="Year"
                      fieldId="sidebar-map-year"
                      className="sidebar-view-selector"
                      variant="stacked"
                      options={mapYearOptions}
                    />
                  </div>
                )}
                {showSummarySidebarUI && stateSummaryData && (
                  <div className="sidebar-view-selector-wrap">
                    <YearSelector
                      label="View"
                      fieldId="sidebar-panel-view"
                      className="sidebar-view-selector"
                      variant="stacked"
                      options={sidebarPanelViewOptions}
                    />
                  </div>
                )}
                {Boolean(currentPC) && onShowACsWithinPCChange && (
                  <label className="sidebar-show-acs">
                    <input
                      type="checkbox"
                      checked={showACsWithinPC}
                      onChange={(e) => onShowACsWithinPCChange(e.target.checked)}
                      aria-label="Show assembly constituencies within this PC"
                    />
                    <span>Show ACs</span>
                  </label>
                )}
              </div>
            )}

            <div className="pane-section pane-content-body">
              {renderDetailPanel() ??
                (showSummarySidebarUI && stateSummaryData && leftPane === 'party'
                  ? renderPartyCandidatesPanel()
                  : showSummarySidebarUI &&
                      stateSummaryData &&
                      (leftPane === 'summary' ? leftPaneView === 'seats' : sidebarTab === 'seats')
                    ? renderSummarySeats()
                    : showSummarySidebarUI &&
                        stateSummaryData &&
                        (leftPane === 'summary' ? leftPaneView === 'votes' : sidebarTab === 'votes')
                      ? renderSummaryVotes()
                      : renderList())}
            </div>
          </div>

          <div className="cache-status">
            <Database size={12} className="cache-icon" />
            <strong> DB:</strong> {cacheStats.dbCount}
            {' | '}
            <Map size={12} className="cache-icon state-icon" /> {cacheStats.memCount}/
            {cacheStats.totalStates}
            {' | '}
            <Building2 size={12} className="cache-icon pc-icon" /> {cacheStats.pcCount}
            {' | '}
            <Landmark size={11} className="cache-icon ac-icon" /> {cacheStats.acCount}
            {cacheStats.memCount >= (cacheStats.totalStates ?? 0) &&
              cacheStats.pcCount > 0 &&
              cacheStats.acCount > 0 && <Check size={14} className="cache-check" />}
          </div>
        </div>
      </div>

      <div
        className={`sidebar-overlay ${showSidebarOverlay ? 'visible' : ''}`}
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Close sidebar"
      />
    </>
  );
}
