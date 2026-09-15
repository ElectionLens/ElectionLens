import { useState, useCallback, useEffect, useMemo } from 'react';
import { Map, Building2, Landmark, Database, Check, Link2, BookOpen } from 'lucide-react';
import { normalizeName } from '../utils/helpers';
import { LeftPaneButton } from './LeftPaneButton';
import { SearchBox } from './SearchBox';
import { YearSelector, type YearOption } from './YearSelector';
import { buildMapYearDropdownOptions } from '../utils/mapYearOptions';
import { buildAcPanelPlaceholder } from '../utils/acPanelPlaceholder';
import { useBoothData } from '../hooks/useBoothData';
import {
  Breadcrumb,
  BrowseList,
  SummarySeatsPanel,
  SummaryVotesPanel,
  PartyCandidatesPanel,
  DetailPanelHost,
  PaneHeader,
} from './sidebar-panels';
import type {
  ACElectionResult,
  BrowseListWinnersContext,
  InfoPanelContent,
  PCElectionResult,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  StatesGeoJSON,
  ConstituenciesGeoJSON,
  AssembliesGeoJSON,
  DistrictsCache,
  GeoJSONData,
  PartyCandidateRow,
  ViewMode,
  CacheStats,
  StateSummaryPanelData,
} from '../types';

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
    if (showACDetailPanel && acDetailResult) {
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

  const openPartyCandidates = useCallback(
    (party: string, sourceTab: 'seats' | 'votes'): void => {
      onSummaryPartyChange?.(party);
      setSummaryReturnTab(sourceTab);
      onLeftPaneChange?.({ pane: 'party', paneView: sourceTab, paneParty: party });
    },
    [onSummaryPartyChange, onLeftPaneChange]
  );

  const activePartyCandidateParty = leftPaneParty ?? selectedSummaryParty;

  const handlePartyCandidateSelect = useCallback(
    (row: PartyCandidateRow): void => {
      onLeftPaneChange?.({
        pane: row.constituencyType === 'PC' ? 'pc' : 'ac',
        paneView: leftPaneView ?? summaryReturnTab,
        paneParty: activePartyCandidateParty,
      });
      onSummaryCandidateSelect?.(row);
    },
    [
      onLeftPaneChange,
      leftPaneView,
      summaryReturnTab,
      activePartyCandidateParty,
      onSummaryCandidateSelect,
    ]
  );

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

  const isPartyPaneActive =
    showSummarySidebarUI && Boolean(stateSummaryData) && leftPane === 'party';
  const isSeatsPaneActive =
    showSummarySidebarUI &&
    Boolean(stateSummaryData) &&
    (leftPane === 'summary' ? leftPaneView === 'seats' : sidebarTab === 'seats');
  const isVotesPaneActive =
    showSummarySidebarUI &&
    Boolean(stateSummaryData) &&
    (leftPane === 'summary' ? leftPaneView === 'votes' : sidebarTab === 'votes');

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
            <div className="breadcrumb-nav">
              {Breadcrumb({
                currentState,
                currentPC,
                currentDistrict,
                displayState,
                selectedAssembly,
                electionResult,
                onReset,
                onGoBackToState,
              })}
            </div>
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
            <PaneHeader
              leftPane={leftPane}
              leftPaneView={leftPaneView}
              leftPaneParty={leftPaneParty}
              summaryReturnTab={summaryReturnTab}
              onReset={onReset}
              onLeftPaneChange={onLeftPaneChange}
              onCloseElectionPanel={onCloseElectionPanel}
              onClosePCElectionPanel={onClosePCElectionPanel}
            />
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
              {hasDetailPanel ? (
                <DetailPanelHost
                  showACDetailPanel={showACDetailPanel}
                  showPCDetailPanel={showPCDetailPanel}
                  electionResult={electionResult}
                  acPanelPlaceholderResult={acPanelPlaceholderResult}
                  onCloseElectionPanel={onCloseElectionPanel}
                  shareUrl={shareUrl}
                  currentState={currentState}
                  availableYears={availableYears}
                  selectedYear={selectedYear}
                  onYearChange={onYearChange}
                  parliamentContributions={parliamentContributions}
                  availablePCYears={availablePCYears}
                  selectedACPCYear={selectedACPCYear}
                  onACPCYearChange={onACPCYearChange}
                  pcContributionShareUrl={pcContributionShareUrl}
                  boothResults={boothResults}
                  boothsWithResults={boothsWithResults}
                  acResultsLoading={acResultsLoading}
                  acResultsLoadError={acResultsLoadError}
                  sidebarLayerOptions={sidebarLayerOptions}
                  onElectionPanelViewTabSync={onElectionPanelViewTabSync}
                  pcElectionResult={pcElectionResult}
                  onClosePCElectionPanel={onClosePCElectionPanel}
                  pcShareUrl={pcShareUrl}
                  pcAvailableYears={pcAvailableYears}
                  pcSelectedYear={pcSelectedYear}
                  onPCYearChange={onPCYearChange}
                />
              ) : isPartyPaneActive ? (
                <PartyCandidatesPanel
                  party={activePartyCandidateParty}
                  stateSummaryData={stateSummaryData}
                  partyCandidateQuery={partyCandidateQuery}
                  onPartyCandidateQueryChange={setPartyCandidateQuery}
                  partyCandidateSort={partyCandidateSort}
                  onPartyCandidateSortChange={setPartyCandidateSort}
                  showVotePaneOutcome={leftPaneView === 'votes'}
                  onCandidateSelect={handlePartyCandidateSelect}
                />
              ) : isSeatsPaneActive ? (
                <SummarySeatsPanel
                  stateSummaryData={stateSummaryData}
                  selectedSummaryParty={selectedSummaryParty}
                  onSummaryPartyChange={onSummaryPartyChange}
                  openPartyCandidates={openPartyCandidates}
                />
              ) : isVotesPaneActive ? (
                <SummaryVotesPanel
                  stateSummaryData={stateSummaryData}
                  selectedSummaryParty={selectedSummaryParty}
                  onSummaryPartyChange={onSummaryPartyChange}
                  openPartyCandidates={openPartyCandidates}
                />
              ) : (
                <BrowseList
                  statesGeoJSON={statesGeoJSON}
                  currentData={currentData}
                  currentState={currentState}
                  currentView={currentView}
                  currentPC={currentPC}
                  currentDistrict={currentDistrict}
                  browseListWinnersContext={browseListWinnersContext}
                  resolveDistrictName={resolveDistrictName}
                  getDistrict={getDistrict}
                  onStateClick={onStateClick}
                  onDistrictClick={onDistrictClick}
                  onConstituencyClick={onConstituencyClick}
                  onAssemblyClick={onAssemblyClick}
                />
              )}
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
