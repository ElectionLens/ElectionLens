import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { BlogSection } from './components/BlogSection';
import { MetaTags } from './components/MetaTags';
import { useElectionData } from './hooks/useElectionData';
import { useElectionResults } from './hooks/useElectionResults';
import { useParliamentResults } from './hooks/useParliamentResults';
import { useUrlState, type UrlState, type UrlUpdateInput } from './hooks/useUrlState';
import { useSchema } from './hooks/useSchema';
import { useUrlNavigate } from './hooks/useUrlNavigate';
import { normalizeName, normalizePcNameCompact, getStateIdFromName } from './utils/helpers';
import { defaultAssemblyDataYearFromIndex } from './utils/electionSchedule';
import { mergeAssamAssemblyGeoForYear, assamMapDataForYear } from './utils/assamAssemblyGeo';
import { trackPageView, trackConstituencySelect } from './utils/firebase';
import {
  PARLIAMENT_YEARS,
  loadParliamentContributionsForAC,
} from './utils/parliamentContributions';
import type {
  BrowseListWinnersContext,
  GeoJSONData,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  ViewMode,
  PartyCandidateRow,
  StateSummaryPanelData,
} from './types';

/**
 * Main application component
 * Orchestrates data loading, navigation, and UI state
 */
function App(): JSX.Element {
  type LeftPane = NonNullable<UrlState['pane']>;
  type LeftPaneView = NonNullable<UrlState['paneView']> | null;
  const {
    statesGeoJSON,
    parliamentGeoJSON,
    assemblyGeoJSON,
    assamAssemblyPre2024Geo,
    districtsCache,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    loading,
    cacheStats,
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState,
    selectAssembly,
  } = useElectionData();

  // Assembly election results hook
  const {
    currentResult: electionResult,
    availableYears,
    selectedYear,
    getACResult,
    setSelectedYear,
    clearResult: clearElectionResult,
    loadStateIndex,
    loading: acResultsLoading,
    error: acResultsLoadError,
  } = useElectionResults();

  // Parliamentary election results hook
  const {
    currentResult: pcElectionResult,
    availableYears: pcAvailableYears,
    selectedYear: pcSelectedYear,
    getPCResult,
    setSelectedYear: setPCSelectedYear,
    clearResult: clearPCElectionResult,
    loadStateIndex: loadPCStateIndex,
  } = useParliamentResults();

  // Schema for canonical name resolution
  const {
    getAC,
    getPC,
    getDistrict,
    resolveACName,
    resolveStateName,
    resolvePCName,
    resolveDistrictName,
    schema,
  } = useSchema();

  const [browseListWinnersContext, setBrowseListWinnersContext] =
    useState<BrowseListWinnersContext | null>(null);

  // State for AC's parliament contributions (all years)
  const [parliamentContributions, setParliamentContributions] = useState<
    Record<
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
  >({});

  // Selected parliament year in AC panel (for URL state)
  const [selectedACPCYear, setSelectedACPCYear] = useState<number | null>(null);

  // Available parliament years for the current AC: always show all PARLIAMENT_YEARS in toolbar/panel
  // (merged with any loaded contributions so 2019-PC etc. appear even before that year is loaded)
  const availablePCYears = useMemo(
    () =>
      [...new Set([...Object.keys(parliamentContributions).map(Number), ...PARLIAMENT_YEARS])].sort(
        (a, b) => a - b
      ),
    [parliamentContributions]
  );

  // URL state management for deep linking
  // Wait for statesGeoJSON to be loaded before processing URL
  const isDataReady = Boolean(statesGeoJSON);
  // When viewing a specific PC: true = show ACs within PC, false = show PC boundary only (synced to URL)
  const [showACsWithinPC, setShowACsWithinPC] = useState<boolean>(true);
  // Blog section state (declared before useUrlState so the hook can sync `blog=` with other query params)
  const [blogOpen, setBlogOpen] = useState<boolean>(false);
  const [selectedSummaryParty, setSelectedSummaryParty] = useState<string | null>(null);
  const [stateSummaryData, setStateSummaryData] = useState<StateSummaryPanelData | null>(null);
  const [leftPane, setLeftPane] = useState<LeftPane>('root');
  const [leftPaneView, setLeftPaneView] = useState<LeftPaneView>(null);
  const [leftPaneParty, setLeftPaneParty] = useState<string | null>(null);

  const handleLeftPaneChange = useCallback(
    (next: { pane: LeftPane; paneView?: LeftPaneView; paneParty?: string | null }) => {
      setLeftPane(next.pane);
      setLeftPaneView(next.paneView ?? null);
      setLeftPaneParty(next.paneParty ?? null);
    },
    []
  );
  // Use the appropriate year based on context:
  // - For AC view (assemblies) or districts: use assembly year (selectedYear) or pcYear (selectedACPCYear)
  // - For PC view (constituencies): use parliament year (pcSelectedYear)
  const urlYear =
    currentView === 'assemblies' || currentView === 'districts' ? selectedYear : pcSelectedYear;
  // Current displayed data
  const [currentData, setCurrentData] = useState<GeoJSONData | null>(null);
  // PC winners for state-level PC view first paint (set in handleUrlNavigate so map has colors before MapView loadResults)
  const [initialPCWinners, setInitialPCWinners] = useState<Record<
    string,
    { party: string; candidate: string }
  > | null>(null);
  // Ref to store updateUrl for use in handleUrlNavigate (placeholder until useUrlState below assigns the real function via effect)
  const updateUrlRef = useRef<(state: UrlUpdateInput) => void>(() => {});
  const { handleUrlNavigate } = useUrlNavigate({
    statesGeoJSON,
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    loadDistrictsForState,
    resetView,
    selectAssembly,
    getACResult,
    getPCResult,
    loadStateIndex,
    loadPCStateIndex,
    resolvePCName,
    resolveACName,
    getAC,
    schema,
    setSelectedYear,
    setPCSelectedYear,
    setSelectedACPCYear,
    setShowACsWithinPC,
    setCurrentData,
    setInitialPCWinners,
    setParliamentContributions,
    setLeftPane,
    setLeftPaneView,
    setLeftPaneParty,
    setBlogOpen,
    updateUrlRef,
  });
  const { getShareableUrl, updateUrl } = useUrlState(
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    urlYear,
    selectedACPCYear,
    handleUrlNavigate,
    isDataReady,
    showACsWithinPC,
    blogOpen,
    leftPane,
    leftPaneView,
    leftPaneParty
  );

  useEffect(() => {
    if (!currentState) {
      if (leftPane !== 'root' || leftPaneView !== null || leftPaneParty !== null) {
        setLeftPane('root');
        setLeftPaneView(null);
        setLeftPaneParty(null);
      }
      return;
    }
    if (pcElectionResult) {
      if (leftPane !== 'pc') setLeftPane('pc');
      return;
    }
    if (electionResult || currentAssembly) {
      if (leftPane !== 'ac') setLeftPane('ac');
      return;
    }
    if (currentPC || currentDistrict) {
      if (leftPane !== 'region') setLeftPane('region');
      return;
    }
    if (leftPane === 'root' || leftPane === 'ac' || leftPane === 'pc') {
      setLeftPane('region');
    }
  }, [
    currentState,
    currentPC,
    currentDistrict,
    currentAssembly,
    electionResult,
    pcElectionResult,
    leftPane,
    leftPaneView,
    leftPaneParty,
  ]);

  useEffect(() => {
    if (leftPaneParty && selectedSummaryParty !== leftPaneParty) {
      setSelectedSummaryParty(leftPaneParty);
    }
  }, [leftPaneParty, selectedSummaryParty]);

  // Ref to store updateUrl for use in handleUrlNavigate
  useEffect(() => {
    updateUrlRef.current = updateUrl;
  }, [updateUrl]);

  // Keep selectedYear in sync with URL when on AC page with ?year= (single source of truth)
  // Corrects any overwrite from loadStateIndex or other async updates after initial URL load
  const getACResultRef = useRef(getACResult);
  getACResultRef.current = getACResult;
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      currentView !== 'assemblies' ||
      !currentAssembly ||
      !currentState
    ) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get('year');
    if (!yearParam || yearParam.startsWith('pc-')) return;
    const urlYear = parseInt(yearParam, 10);
    if (isNaN(urlYear)) return;
    if (selectedYear !== urlYear) {
      setSelectedYear(urlYear);
      setSelectedACPCYear(null);
      const ac = currentAssembly;
      const state = currentState;
      void (async (): Promise<void> => {
        await getACResultRef.current(ac, state, urlYear);
      })();
    }
  }, [currentView, currentAssembly, currentState, selectedYear, setSelectedYear]);

  /** After schema fetch, redo AC lookup with schemaId (first navigation often ran before schema was ready → fuzzy Strategy 4 could pick wrong AC; pc-* URLs skipped the yearly resync above). */
  const assemblySchemaPanelFetchRef = useRef<string>('');

  useEffect(() => {
    assemblySchemaPanelFetchRef.current = '';
  }, [currentAssembly, currentState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!schema || currentView !== 'assemblies' || !currentAssembly || !currentState) return;

    const stateId = getStateIdFromName(currentState);
    const schemaId = resolveACName(currentAssembly, stateId);
    if (!schemaId) return;

    const params = new URLSearchParams(window.location.search);
    const rawYearParam = params.get('year');
    const parsedAsmYear =
      rawYearParam && !rawYearParam.startsWith('pc-') ? parseInt(rawYearParam, 10) : NaN;
    const yearForACResult = !Number.isNaN(parsedAsmYear) ? parsedAsmYear : undefined;

    const fetchKey = `${currentState}|${currentAssembly}|${schemaId}|${rawYearParam ?? ''}`;
    if (assemblySchemaPanelFetchRef.current === fetchKey) return;
    assemblySchemaPanelFetchRef.current = fetchKey;

    const canonicalName = getAC(schemaId)?.name;
    void getACResult(currentAssembly, currentState, yearForACResult, {
      schemaId,
      canonicalName,
    });
  }, [schema, currentView, currentAssembly, currentState, resolveACName, getAC, getACResult]);

  /**
   * Sidebar visibility: mobile starts closed (sheet); desktop starts open (docked beside map).
   * Wide layout keeps the map usable while the sidebar is open (no overlay / no hiding map controls).
   */
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 768;
  });

  /**
   * Year used only for Assam pre/post-delimitation AC geometry:
   * - AC-in-PC map: Lok Sabha year (`pcSelectedYear`).
   * - State AC map with `?year=pc-YYYY` (PC contribution coloring): use that PC year so boundaries match the LS election (post-delimitation for 2024).
   * - Otherwise assembly result year (`selectedYear`).
   */
  const assamMapBoundaryYear = useMemo((): number | null => {
    if (!currentState || getStateIdFromName(currentState) !== 'AS') {
      return selectedYear ?? null;
    }
    if (currentPC && showACsWithinPC) {
      return pcSelectedYear ?? selectedYear ?? null;
    }
    if (selectedACPCYear != null) {
      return selectedACPCYear;
    }
    return selectedYear ?? null;
  }, [currentState, currentPC, showACsWithinPC, pcSelectedYear, selectedYear, selectedACPCYear]);

  /** Assembly GeoJSON with historical Assam polygons when boundary year is before 2024 */
  const assemblyGeoForMap = useMemo(
    () =>
      mergeAssamAssemblyGeoForYear(assemblyGeoJSON, assamAssemblyPre2024Geo, assamMapBoundaryYear),
    [assemblyGeoJSON, assamAssemblyPre2024Geo, assamMapBoundaryYear]
  );

  /** Map layer data — swaps Assam AC shapes for pre-delimitation using {@link assamMapBoundaryYear} */
  const mapViewCurrentData = useMemo(
    () =>
      assamMapDataForYear(
        currentData,
        assemblyGeoJSON,
        assamAssemblyPre2024Geo,
        currentState,
        assamMapBoundaryYear
      ),
    [currentData, assemblyGeoJSON, assamAssemblyPre2024Geo, currentState, assamMapBoundaryYear]
  );

  /**
   * Update document title dynamically for SEO and browser tabs
   * Also track page views for analytics
   */
  useEffect(() => {
    let title = 'Election Lens - India Electoral Map';

    if (electionResult) {
      // Constituency selected with election result
      title = `${(electionResult.constituencyNameOriginal ?? electionResult.name ?? electionResult.constituencyName ?? 'Constituency').toUpperCase()} ${electionResult.year ?? ''} Results | Election Lens`;
    } else if (currentAssembly) {
      title = `${currentAssembly} | Election Lens`;
    } else if (currentPC) {
      title = `${currentPC} PC, ${currentState} | Election Lens`;
    } else if (currentDistrict) {
      title = `${currentDistrict} District, ${currentState} | Election Lens`;
    } else if (currentState) {
      title = `${currentState} Elections | Election Lens`;
    }

    document.title = title;

    // Track page view in Firebase Analytics
    trackPageView(window.location.pathname, title);
  }, [currentState, currentPC, currentDistrict, currentAssembly, electionResult]);

  const toggleSidebar = useCallback((): void => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback((): void => {
    setSidebarOpen(false);
  }, []);

  /** Close mobile sheet after navigation so the map stays usable without an extra tap. */
  const closeSidebarAfterAction = useCallback((): void => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      closeSidebar();
    }
  }, [closeSidebar]);

  // Load initial data and update on state changes
  useEffect(() => {
    async function updateData(): Promise<void> {
      if (currentPC && currentState) {
        const data = await navigateToPC(currentPC, currentState);
        setCurrentData(data);
      } else if (currentDistrict && currentState) {
        const data = await navigateToDistrict(currentDistrict, currentState);
        setCurrentData(data);
        void loadStateIndex(currentState);
      } else if (currentState) {
        if (currentView === 'constituencies') {
          const data = await navigateToState(currentState);
          setCurrentData(data);
          void loadStateIndex(currentState);
        } else if (currentView === 'assemblies') {
          const data = await navigateToAssemblies(currentState);
          setCurrentData(data);
          void loadStateIndex(currentState);
        } else if (currentView === 'districts') {
          const data = await loadDistrictsForState(currentState);
          setCurrentData(data);
          void loadStateIndex(currentState);
        }
      } else {
        setCurrentData(null);
      }
    }
    void updateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState, currentView, currentPC, currentDistrict, loadStateIndex]);

  /**
   * Handle state click from map or sidebar
   */
  const handleStateClick = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarAfterAction();
      clearElectionResult();
      clearPCElectionResult();
      const data = await navigateToState(stateName);
      setCurrentData(data);
      // Pre-load election index for the state (both AC and PC)
      void loadStateIndex(stateName);
      const pcIndex = await loadPCStateIndex(stateName);
      // Landing on PC view: ensure valid PC year for this state so map is colored
      if (
        pcIndex?.availableYears?.length &&
        (pcSelectedYear == null || !pcIndex.availableYears.includes(pcSelectedYear))
      ) {
        const latestYear = pcIndex.availableYears[pcIndex.availableYears.length - 1];
        if (latestYear !== undefined) {
          setPCSelectedYear(latestYear);
          updateUrlRef.current({
            state: stateName,
            view: 'constituencies',
            pc: null,
            district: null,
            assembly: null,
            year: latestYear,
            pcYear: null,
            showACs: null,
            blog: false,
            blogPost: null,
          });
        }
      }
      // Track analytics
      trackConstituencySelect('state', stateName);
    },
    [
      navigateToState,
      closeSidebarAfterAction,
      loadStateIndex,
      loadPCStateIndex,
      clearElectionResult,
      clearPCElectionResult,
      pcSelectedYear,
      setPCSelectedYear,
    ]
  );

  /**
   * Handle district click from map or sidebar
   */
  const handleDistrictClick = useCallback(
    async (districtName: string, _feature: DistrictFeature): Promise<void> => {
      closeSidebarAfterAction();
      if (!currentState) return;
      selectAssembly(null); // Clear assembly when navigating to new district
      clearElectionResult();
      clearPCElectionResult();
      const data = await navigateToDistrict(districtName, currentState);
      setCurrentData(data);
      // Track analytics
      trackConstituencySelect('district', districtName, currentState);
    },
    [
      navigateToDistrict,
      currentState,
      closeSidebarAfterAction,
      selectAssembly,
      clearElectionResult,
      clearPCElectionResult,
    ]
  );

  /**
   * Handle constituency click from map or sidebar
   */
  const handleConstituencyClick = useCallback(
    async (pcName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarAfterAction();
      if (!currentState) return;
      selectAssembly(null); // Clear assembly when navigating to new PC
      clearElectionResult();
      const data = await navigateToPC(pcName, currentState);
      setCurrentData(data);
      // Preserve year: use pcSelectedYear, or fallback to URL (handles stale closure / state not yet updated)
      let yearToLoad = pcSelectedYear ?? undefined;
      if (yearToLoad == null && typeof window !== 'undefined') {
        const yearParam = new URLSearchParams(window.location.search).get('year');
        if (yearParam && !yearParam.startsWith('pc-')) {
          const parsed = parseInt(yearParam, 10);
          if (!isNaN(parsed)) yearToLoad = parsed;
        }
      }
      await getPCResult(pcName, currentState, yearToLoad);
      // Track analytics
      trackConstituencySelect('pc', pcName, currentState);
    },
    [
      navigateToPC,
      currentState,
      pcSelectedYear,
      closeSidebarAfterAction,
      selectAssembly,
      clearElectionResult,
      getPCResult,
    ]
  );

  /**
   * Get related states to search (for boundary changes like AP-Telangana)
   */
  /**
   * Load AC's contribution to all parliament elections
   */
  const loadAllParliamentContributions = useCallback(
    async (acName: string, pcName: string, stateName: string) => {
      const contributions = await loadParliamentContributionsForAC(acName, pcName, stateName, {
        resolveStateName,
        resolvePCName,
      });
      setParliamentContributions(contributions);
    },
    [resolveStateName, resolvePCName]
  );

  /**
   * Load parliament contributions when assembly is selected via deep link
   * This effect runs when there's a selected assembly but no parliament contributions yet
   * Uses assemblyGeoJSON or schema to find the PC name
   */
  useEffect(() => {
    if (currentAssembly && currentState && Object.keys(parliamentContributions).length === 0) {
      // URL / navigateToPC already set the correct PC; GeoJSON PC_NAME is often blank after merges.
      let pcName: string | null = currentPC;

      if (!pcName && assemblyGeoForMap) {
        const acFeature = assemblyGeoForMap.features.find(
          (f) => f.properties.AC_NAME?.toUpperCase() === currentAssembly.toUpperCase()
        );
        const fromGeo = acFeature?.properties.PC_NAME?.trim();
        pcName = fromGeo || null;
      }

      if (!pcName) {
        const stateId = resolveStateName(currentState);
        if (stateId) {
          const acId = resolveACName(currentAssembly, stateId);
          if (acId) {
            const acEntity = getAC(acId);
            if (acEntity?.pcId) {
              const pcEntity = getPC(acEntity.pcId);
              if (pcEntity) {
                pcName = pcEntity.name.toUpperCase();
              }
            }
          }
        }
      }

      if (pcName) {
        void loadAllParliamentContributions(currentAssembly, pcName, currentState);
      }
    }
  }, [
    currentAssembly,
    currentState,
    currentPC,
    assemblyGeoForMap,
    parliamentContributions,
    loadAllParliamentContributions,
    resolveStateName,
    resolveACName,
    getAC,
    getPC,
  ]);

  /**
   * Handle assembly click - select, zoom, and show election results
   */
  const handleAssemblyClick = useCallback(
    async (acName: string, feature: AssemblyFeature): Promise<void> => {
      closeSidebarAfterAction(); // Hide sheet so map + panel stay visible after drill-down
      selectAssembly(acName);
      clearPCElectionResult(); // Close PC panel to show AC panel
      setParliamentContributions({}); // Clear previous contributions

      // Preserve year parameters from URL when switching assemblies
      // Tab parameter is automatically preserved by useUrlState's updateUrl
      const urlParams = new URLSearchParams(window.location.search);
      const yearParam = urlParams.get('year');
      let yearToUse: number | undefined = undefined;

      // When toolbar is already in PC contribution mode, keep it — do not let a stale ?year=2021
      // (or a stale closure missing selectedACPCYear in deps) clear PC coloring after sidebar click/search.
      if (selectedACPCYear != null) {
        if (selectedYear !== null) {
          yearToUse = selectedYear;
        }
      } else if (yearParam) {
        if (yearParam.startsWith('pc-')) {
          // Parliament contribution year: year=pc-2024
          const parsed = parseInt(yearParam.slice(3), 10);
          if (!isNaN(parsed)) {
            setSelectedACPCYear(parsed);
          }
        } else {
          // Regular year (assembly or, in PC view, the PC year)
          const parsed = parseInt(yearParam, 10);
          if (!isNaN(parsed)) {
            yearToUse = parsed;
            // In PC view, show AC contribution to PC for this year; in district/AC view, show assembly result (clear PC year)
            if (currentPC && pcSelectedYear != null) {
              setSelectedACPCYear(pcSelectedYear);
            } else {
              setSelectedACPCYear(null); // Assembly year in URL — panel shows AC result, not PC contribution
            }
          }
        }
      } else if (currentPC && pcSelectedYear != null) {
        // PC view but no year in URL: use current PC year so panel shows AC contribution to PC
        setSelectedACPCYear(pcSelectedYear);
      } else {
        // District or state AC view, no year in URL — ensure panel shows assembly result, not stale PC year
        setSelectedACPCYear(null);
      }

      // If no year in URL, preserve current selectedYear if it exists
      if (yearToUse === undefined && selectedYear !== null) {
        yearToUse = selectedYear;
      }

      // Load election results for this AC - preserve year if available
      if (currentState) {
        // Try to use schema for direct lookup (avoids fuzzy matching)
        const schemaId = feature.properties.schemaId;
        const schemaAC = schemaId ? getAC(schemaId) : null;

        await getACResult(acName, currentState, yearToUse, {
          schemaId,
          canonicalName: schemaAC?.name,
        });

        // Load all parliament contributions if we have PC info
        const pcName = feature.properties.PC_NAME;
        if (pcName) {
          await loadAllParliamentContributions(acName, pcName, currentState);
        }

        // Tab parameter will be preserved automatically by useUrlState's updateUrl
        // which reads it from the current URL when updating

        // Track analytics
        trackConstituencySelect('assembly', acName, currentState);
      }
    },
    [
      closeSidebarAfterAction,
      selectAssembly,
      currentState,
      currentPC,
      pcSelectedYear,
      selectedACPCYear,
      getACResult,
      getAC,
      clearPCElectionResult,
      loadAllParliamentContributions,
      selectedYear,
      setSelectedACPCYear,
    ]
  );

  /**
   * Handle closing the election panel
   */
  const handleCloseElectionPanel = useCallback((): void => {
    selectAssembly(null);
    clearElectionResult();
    setSelectedACPCYear(null); // Reset PC year selection
    // Note: Don't clear PC result when closing AC panel in PC view
    // The PC panel should remain visible
  }, [selectAssembly, clearElectionResult]);

  /**
   * Handle closing the PC election panel
   */
  const handleClosePCElectionPanel = useCallback((): void => {
    clearPCElectionResult();
  }, [clearPCElectionResult]);

  /**
   * Handle search selection - state
   */
  const handleSearchStateSelect = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarAfterAction();
      const data = await navigateToState(stateName);
      setCurrentData(data);
      void loadStateIndex(stateName);
    },
    [navigateToState, closeSidebarAfterAction, loadStateIndex]
  );

  /**
   * Handle search selection - constituency
   */
  const handleSearchConstituencySelect = useCallback(
    async (pcName: string, stateName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarAfterAction();
      // First navigate to the state
      await navigateToState(stateName);
      // Then navigate to the PC
      const data = await navigateToPC(pcName, stateName);
      setCurrentData(data);
    },
    [navigateToState, navigateToPC, closeSidebarAfterAction]
  );

  /**
   * Handle search selection - assembly
   * Navigate to the assemblies view and select the assembly
   * URL: /state/ac/ac-name?year=YYYY or year=pc-YYYY (same URL/year rules as map click)
   */
  const handleSearchAssemblySelect = useCallback(
    async (acName: string, stateName: string, feature: AssemblyFeature): Promise<void> => {
      closeSidebarAfterAction();
      clearPCElectionResult();
      setParliamentContributions({});

      const data = await navigateToAssemblies(stateName);
      setCurrentData(data);

      selectAssembly(acName);

      const urlParams = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : ''
      );
      const yearParam = urlParams.get('year');
      let yearToUse: number | undefined = undefined;

      if (selectedACPCYear != null) {
        if (selectedYear !== null) {
          yearToUse = selectedYear;
        }
      } else if (yearParam) {
        if (yearParam.startsWith('pc-')) {
          const parsed = parseInt(yearParam.slice(3), 10);
          if (!isNaN(parsed)) {
            setSelectedACPCYear(parsed);
          }
        } else {
          const parsed = parseInt(yearParam, 10);
          if (!isNaN(parsed)) {
            yearToUse = parsed;
            if (currentPC && pcSelectedYear != null) {
              setSelectedACPCYear(pcSelectedYear);
            } else {
              setSelectedACPCYear(null);
            }
          }
        }
      } else if (currentPC && pcSelectedYear != null) {
        setSelectedACPCYear(pcSelectedYear);
      } else {
        setSelectedACPCYear(null);
      }

      if (yearToUse === undefined && selectedYear !== null) {
        yearToUse = selectedYear;
      }

      const stateId = getStateIdFromName(stateName);
      const schemaId = feature.properties.schemaId ?? resolveACName(acName, stateId);
      const schemaAC = schemaId ? getAC(schemaId) : null;

      await getACResult(acName, stateName, yearToUse, {
        schemaId: schemaId ?? undefined,
        canonicalName: schemaAC?.name,
      });

      const pcName = feature.properties.PC_NAME;
      if (pcName) {
        await loadAllParliamentContributions(acName, pcName, stateName);
      }

      trackConstituencySelect('assembly', acName, stateName);
    },
    [
      navigateToAssemblies,
      selectAssembly,
      getACResult,
      closeSidebarAfterAction,
      clearPCElectionResult,
      resolveACName,
      getAC,
      currentPC,
      pcSelectedYear,
      selectedYear,
      selectedACPCYear,
      setSelectedACPCYear,
      loadAllParliamentContributions,
    ]
  );

  /**
   * Handle search selection - district
   * Navigate to the district view
   * URL: /state/district/district-name
   */
  const handleSearchDistrictSelect = useCallback(
    async (districtName: string, stateName: string, _feature: DistrictFeature): Promise<void> => {
      closeSidebarAfterAction();
      clearElectionResult();
      clearPCElectionResult();

      // Navigate to the district
      const data = await navigateToDistrict(districtName, stateName);
      setCurrentData(data);

      // Track analytics
      trackConstituencySelect('district', districtName, stateName);
    },
    [navigateToDistrict, closeSidebarAfterAction, clearElectionResult, clearPCElectionResult]
  );

  const handleSummaryCandidateSelect = useCallback(
    async (row: PartyCandidateRow): Promise<void> => {
      if (row.constituencyType === 'AC') {
        const targetAcName = row.acName ?? row.constituencyName;
        const normalizedTarget = normalizeName(targetAcName).toUpperCase();
        let acFeature =
          assemblyGeoForMap?.features.find((f) => {
            const featureName = normalizeName(f.properties.AC_NAME ?? '').toUpperCase();
            return (
              (row.schemaId && f.properties.schemaId === row.schemaId) ||
              featureName === normalizedTarget
            );
          }) ?? null;

        if (!acFeature && row.stateName) {
          await navigateToState(row.stateName);
          const assemblyData = await navigateToAssemblies(row.stateName);
          setCurrentData(assemblyData);
          acFeature =
            assemblyData.features.find((f) => {
              const featureName = normalizeName(f.properties.AC_NAME ?? '').toUpperCase();
              return (
                (row.schemaId && f.properties.schemaId === row.schemaId) ||
                featureName === normalizedTarget
              );
            }) ?? null;
        }

        if (acFeature) {
          await handleSearchAssemblySelect(targetAcName, row.stateName, acFeature);
        }
        return;
      }

      const targetPcName = row.pcName ?? row.constituencyName;
      const normalizedPcTarget = normalizePcNameCompact(targetPcName);
      const pcFeature =
        parliamentGeoJSON?.features.find((f) => {
          const featureName = normalizePcNameCompact(
            f.properties.ls_seat_name ?? f.properties.PC_NAME ?? ''
          );
          return (
            (row.schemaId && f.properties.schemaId === row.schemaId) ||
            featureName === normalizedPcTarget
          );
        }) ?? null;

      if (pcFeature) {
        await handleSearchConstituencySelect(targetPcName, row.stateName, pcFeature);
      }
    },
    [
      assemblyGeoForMap,
      navigateToState,
      navigateToAssemblies,
      handleSearchAssemblySelect,
      parliamentGeoJSON,
      handleSearchConstituencySelect,
    ]
  );

  /**
   * Copy the current browser URL to clipboard (matches the address bar, including query and hash).
   */
  const handleShare = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }, []);

  /**
   * Handle year change in assembly election results
   */
  const handleYearChange = useCallback(
    async (year: number): Promise<void> => {
      setSelectedYear(year);
      // Sync year to URL in assemblies or state districts map view (with or without assembly selected)
      if (currentState && (currentView === 'assemblies' || currentView === 'districts')) {
        updateUrlRef.current({
          state: currentState,
          view: currentView,
          pc: currentPC,
          district: currentDistrict,
          assembly: currentAssembly,
          year,
          pcYear: null,
          showACs: currentPC ? (showACsWithinPC ?? true) : null,
          blog: false,
          blogPost: null,
        });
      }
      if (currentAssembly && currentState) {
        const stateId = getStateIdFromName(currentState);
        const schemaId = resolveACName(currentAssembly, stateId);
        await getACResult(currentAssembly, currentState, year, {
          schemaId: schemaId ?? undefined,
          canonicalName: schemaId ? getAC(schemaId)?.name : undefined,
        });
      }
    },
    [
      setSelectedYear,
      currentAssembly,
      currentPC,
      currentState,
      currentView,
      currentDistrict,
      getACResult,
      resolveACName,
      getAC,
      showACsWithinPC,
    ]
  );

  /**
   * Handle PC contribution year change in AC view (toolbar or sidepanel; syncs year=pc-YYYY to URL).
   * Pass null when switching to an assembly year to clear PC year.
   * Updates URL when in assemblies or districts view OR when AC-within-PC (currentPC && currentAssembly).
   * When in AC-within-PC, also set pcSelectedYear so MapView loadResults and toolbar stay in sync.
   */
  const handleACPCYearChange = useCallback(
    (year: number | null): void => {
      setSelectedACPCYear(year);
      if (currentPC != null && currentAssembly != null && year != null) {
        setPCSelectedYear(year);
      }
      const shouldSyncPcYearToUrl =
        currentState &&
        (currentView === 'assemblies' ||
          currentView === 'districts' ||
          (currentPC != null && currentAssembly != null));
      if (!shouldSyncPcYearToUrl) return;
      updateUrlRef.current({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: null,
        pcYear: year,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: false,
        blogPost: null,
      });
    },
    [
      currentAssembly,
      currentState,
      currentView,
      currentPC,
      currentDistrict,
      setPCSelectedYear,
      showACsWithinPC,
    ]
  );

  /**
   * Handle year change in parliamentary election results (sync year to URL)
   */
  const handlePCYearChange = useCallback(
    async (year: number): Promise<void> => {
      setPCSelectedYear(year);
      if (currentState && (currentPC || currentView === 'constituencies')) {
        updateUrlRef.current({
          state: currentState,
          view: currentView,
          pc: currentPC,
          district: currentDistrict,
          assembly: currentAssembly,
          year,
          pcYear: null,
          showACs: currentPC ? (showACsWithinPC ?? true) : null,
          blog: false,
          blogPost: null,
        });
      }
      if (currentPC && currentState) {
        await getPCResult(currentPC, currentState, year);
      }
    },
    [
      setPCSelectedYear,
      currentPC,
      currentState,
      currentView,
      currentDistrict,
      currentAssembly,
      getPCResult,
      showACsWithinPC,
    ]
  );

  /**
   * Keep `?tab=` in sync when the embedded election panel switches View (Overview / Booths / …).
   */
  const handleElectionPanelViewTabSync = useCallback(
    (panelTab: 'overview' | 'booths' | 'postal' | 'analysis'): void => {
      if (!currentState || !currentAssembly) return;
      const searchParams =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const blogPostParam =
        blogOpen && searchParams?.get('blogPost') ? searchParams.get('blogPost') : null;
      const pcYearActive = selectedACPCYear != null;
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: pcYearActive ? null : selectedYear,
        pcYear: pcYearActive ? selectedACPCYear : null,
        tab: panelTab === 'overview' ? null : panelTab,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: blogOpen,
        blogPost: blogPostParam,
      });
    },
    [
      blogOpen,
      currentAssembly,
      currentDistrict,
      currentPC,
      currentState,
      currentView,
      selectedACPCYear,
      selectedYear,
      showACsWithinPC,
      updateUrl,
    ]
  );

  /**
   * Get current share URL for AC election results (matches URL: assembly year or year=pc-YYYY)
   */
  const currentShareUrl = useMemo(() => {
    if (!currentAssembly) return undefined;
    const pcYearActive = selectedACPCYear != null;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: pcYearActive ? null : selectedYear,
      pcYear: pcYearActive ? selectedACPCYear : null,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: blogOpen,
      blogPost: null,
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedACPCYear,
    showACsWithinPC,
    blogOpen,
  ]);

  /**
   * Get share URL for PC contribution in AC panel (year=pc-YYYY format)
   */
  const pcContributionShareUrl = useMemo(() => {
    if (!currentAssembly || !selectedACPCYear) return undefined;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: null,
      pcYear: selectedACPCYear,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: blogOpen,
      blogPost: null,
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedACPCYear,
    showACsWithinPC,
    blogOpen,
  ]);

  /**
   * Get current share URL for PC election results
   */
  const currentPCShareUrl = useMemo(() => {
    if (!currentPC) return undefined;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: null,
      assembly: null,
      year: pcSelectedYear,
      pcYear: null,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: blogOpen,
      blogPost: null,
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    pcSelectedYear,
    showACsWithinPC,
    blogOpen,
  ]);

  /**
   * Handle view switch between constituencies and districts
   */
  const handleSwitchView = useCallback(
    async (view: ViewMode): Promise<void> => {
      if (!currentState) {
        switchView(view);
        return;
      }

      // Each navigation function sets the view internally
      if (view === 'constituencies') {
        const data = await navigateToState(currentState);
        setCurrentData(data);
        const pcIndex = await loadPCStateIndex(currentState);
        if (
          pcIndex?.availableYears?.length &&
          (pcSelectedYear == null || !pcIndex.availableYears.includes(pcSelectedYear))
        ) {
          const latestYear = pcIndex.availableYears[pcIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
            setPCSelectedYear(latestYear);
            updateUrlRef.current({
              state: currentState,
              view: 'constituencies',
              pc: null,
              district: null,
              assembly: null,
              year: latestYear,
              pcYear: null,
              showACs: null,
              blog: false,
              blogPost: null,
            });
          }
        }
      } else if (view === 'assemblies') {
        setSelectedACPCYear(null);
        const data = await navigateToAssemblies(currentState);
        setCurrentData(data);
        const acIndex = await loadStateIndex(currentState);
        const acYears = acIndex?.availableYears ?? [];
        let yearForUrl = selectedYear;
        if (
          acIndex &&
          acYears.length > 0 &&
          (yearForUrl == null || !acYears.includes(yearForUrl))
        ) {
          const latestYear = defaultAssemblyDataYearFromIndex(acIndex);
          if (latestYear != null) {
            setSelectedYear(latestYear);
            yearForUrl = latestYear;
          }
        }
        updateUrlRef.current({
          state: currentState,
          view: 'assemblies',
          pc: null,
          district: null,
          assembly: currentAssembly,
          year: yearForUrl,
          pcYear: null,
          showACs: null,
          blog: false,
          blogPost: null,
        });
      } else if (view === 'districts') {
        const data = await loadDistrictsForState(currentState);
        setCurrentData(data);
        const acIndex = await loadStateIndex(currentState);
        const acYears = acIndex?.availableYears ?? [];
        const latestYear = acIndex != null ? defaultAssemblyDataYearFromIndex(acIndex) : undefined;
        // No year or invalid year: set to latest so districts get 100% party coloring
        const needsCorrection =
          latestYear != null && (selectedYear == null || !acYears.includes(selectedYear));
        if (needsCorrection) {
          setSelectedYear(latestYear);
          updateUrlRef.current({
            state: currentState,
            view: 'districts',
            pc: null,
            district: null,
            assembly: null,
            year: latestYear,
            pcYear: null,
            showACs: null,
            blog: false,
            blogPost: null,
          });
        }
      }
    },
    [
      switchView,
      currentState,
      navigateToState,
      navigateToAssemblies,
      loadDistrictsForState,
      loadStateIndex,
      loadPCStateIndex,
      selectedYear,
      pcSelectedYear,
      currentAssembly,
      setSelectedYear,
      setPCSelectedYear,
      setSelectedACPCYear,
    ]
  );

  /**
   * Handle reset to India view
   */
  const handleReset = useCallback((): void => {
    resetView();
    selectAssembly(null);
    clearElectionResult();
    clearPCElectionResult();
    setSelectedACPCYear(null);
    setCurrentData(null);
    setBlogOpen(false);
    updateUrl({
      state: null,
      view: 'constituencies',
      pc: null,
      district: null,
      assembly: null,
      year: null,
      pcYear: null,
      tab: null,
      showACs: null,
      blog: false,
      blogPost: null,
    });
  }, [resetView, selectAssembly, clearElectionResult, clearPCElectionResult, updateUrl]);

  /**
   * Handle blog toggle
   */
  const handleBlogToggle = useCallback((): void => {
    const newBlogOpen = !blogOpen;
    setBlogOpen(newBlogOpen);
    if (newBlogOpen) {
      // Close election panels when opening blog
      clearElectionResult();
      clearPCElectionResult();
      // Update URL
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: selectedYear,
        pcYear: selectedACPCYear,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: true,
        blogPost: null,
      });
    } else {
      // Update URL to remove blog params
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: selectedYear,
        pcYear: selectedACPCYear,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: false,
        blogPost: null,
      });
    }
  }, [
    blogOpen,
    clearElectionResult,
    clearPCElectionResult,
    updateUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedACPCYear,
    showACsWithinPC,
  ]);

  /**
   * Handle blog close
   */
  const handleBlogClose = useCallback((): void => {
    setBlogOpen(false);
    // Update URL to remove blog params
    updateUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: selectedYear,
      pcYear: selectedACPCYear,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: false,
      blogPost: null,
    });
  }, [
    updateUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedACPCYear,
    showACsWithinPC,
  ]);

  /**
   * Handle go back to state from PC/district
   */
  const handleGoBackToState = useCallback(async (): Promise<void> => {
    goBackToState();
    clearElectionResult();
    clearPCElectionResult();
    if (currentState) {
      if (currentView === 'constituencies') {
        const data = await navigateToState(currentState);
        setCurrentData(data);
      } else if (currentView === 'assemblies') {
        const data = await navigateToAssemblies(currentState);
        setCurrentData(data);
      } else if (currentView === 'districts') {
        const data = await loadDistrictsForState(currentState);
        setCurrentData(data);
      }
    }
  }, [
    goBackToState,
    currentState,
    currentView,
    navigateToState,
    navigateToAssemblies,
    loadDistrictsForState,
    clearElectionResult,
    clearPCElectionResult,
  ]);

  /**
   * Handle go back one navigation level
   * Assembly selected -> PC/District view -> State view -> India view
   */
  const handleGoBack = useCallback(async (): Promise<void> => {
    if (currentAssembly) {
      // If assembly is selected, deselect it and stay in current view
      selectAssembly(null);
      clearElectionResult();
      setParliamentContributions({});
      setSelectedACPCYear(null); // Reset PC year selection

      // If we're in PC view, reload the PC election result to show the parliament panel
      if (currentPC && currentState) {
        await getPCResult(currentPC, currentState);
      }
    } else if (currentPC || currentDistrict) {
      // In PC or district view (no assembly selected), go back to state
      await handleGoBackToState();
    } else if (currentState) {
      // In state view, go back to India
      handleReset();
    }
  }, [
    currentAssembly,
    currentPC,
    currentDistrict,
    currentState,
    handleGoBackToState,
    handleReset,
    selectAssembly,
    clearElectionResult,
    getPCResult,
  ]);

  return (
    <>
      {/* Menu / close — toggles docked sidebar on web; slide-over sheet on narrow viewports */}
      <button
        className={`mobile-toggle ${sidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
        type="button"
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <div className="container">
        <Sidebar
          statesGeoJSON={statesGeoJSON}
          parliamentGeoJSON={parliamentGeoJSON}
          assemblyGeoJSON={assemblyGeoForMap}
          districtsCache={districtsCache}
          currentState={currentState}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          cacheStats={cacheStats}
          currentData={mapViewCurrentData}
          onStateClick={handleStateClick}
          onDistrictClick={handleDistrictClick}
          onConstituencyClick={handleConstituencyClick}
          onAssemblyClick={handleAssemblyClick}
          onSwitchView={handleSwitchView}
          onReset={handleReset}
          onGoBackToState={handleGoBackToState}
          onSearchStateSelect={handleSearchStateSelect}
          onSearchConstituencySelect={handleSearchConstituencySelect}
          onSearchAssemblySelect={handleSearchAssemblySelect}
          onSearchDistrictSelect={handleSearchDistrictSelect}
          onShare={handleShare}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          onBlogClick={handleBlogToggle}
          selectedSummaryParty={selectedSummaryParty}
          onSummaryPartyChange={setSelectedSummaryParty}
          onSummaryCandidateSelect={handleSummaryCandidateSelect}
          stateSummaryData={stateSummaryData}
          selectedAssembly={currentAssembly}
          availableYears={availableYears}
          selectedYear={selectedYear}
          availablePCYears={availablePCYears}
          selectedACPCYear={selectedACPCYear}
          pcAvailableYears={pcAvailableYears}
          pcSelectedYear={pcSelectedYear}
          onYearChange={handleYearChange}
          onACPCYearChange={handleACPCYearChange}
          onPCYearChange={handlePCYearChange}
          showACsWithinPC={showACsWithinPC}
          onShowACsWithinPCChange={setShowACsWithinPC}
          electionResult={electionResult}
          acResultsLoading={acResultsLoading}
          acResultsLoadError={acResultsLoadError}
          shareUrl={currentShareUrl}
          parliamentContributions={parliamentContributions}
          pcContributionShareUrl={pcContributionShareUrl}
          pcElectionResult={pcElectionResult}
          pcShareUrl={currentPCShareUrl}
          onCloseElectionPanel={handleCloseElectionPanel}
          onClosePCElectionPanel={handleClosePCElectionPanel}
          onElectionPanelViewTabSync={handleElectionPanelViewTabSync}
          leftPane={leftPane}
          leftPaneView={leftPaneView}
          leftPaneParty={leftPaneParty}
          onLeftPaneChange={handleLeftPaneChange}
          browseListWinnersContext={browseListWinnersContext}
          resolveDistrictName={resolveDistrictName}
          getDistrict={getDistrict}
        />

        <MapView
          statesGeoJSON={statesGeoJSON}
          parliamentGeoJSON={parliamentGeoJSON}
          districtsCache={districtsCache}
          currentData={mapViewCurrentData}
          currentState={currentState}
          initialPCWinners={initialPCWinners}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          selectedAssembly={currentAssembly}
          electionResult={electionResult}
          acResultsLoading={acResultsLoading}
          acResultsLoadError={acResultsLoadError}
          shareUrl={currentShareUrl}
          availableYears={availableYears}
          selectedYear={selectedYear}
          parliamentContributions={parliamentContributions}
          availablePCYears={availablePCYears}
          selectedACPCYear={selectedACPCYear}
          pcContributionShareUrl={pcContributionShareUrl}
          pcElectionResult={pcElectionResult}
          pcShareUrl={currentPCShareUrl}
          pcAvailableYears={pcAvailableYears}
          pcSelectedYear={pcSelectedYear}
          onStateClick={handleStateClick}
          onDistrictClick={handleDistrictClick}
          onConstituencyClick={handleConstituencyClick}
          onAssemblyClick={handleAssemblyClick}
          onSwitchView={handleSwitchView}
          onReset={handleReset}
          onGoBack={handleGoBack}
          onYearChange={handleYearChange}
          onACPCYearChange={handleACPCYearChange}
          onPCYearChange={handlePCYearChange}
          showACsWithinPC={showACsWithinPC}
          onShowACsWithinPCChange={setShowACsWithinPC}
          selectedSummaryParty={selectedSummaryParty}
          onSummaryPartyChange={setSelectedSummaryParty}
          onStateSummaryDataChange={setStateSummaryData}
          onBrowseListWinnersContext={setBrowseListWinnersContext}
        />
      </div>

      {/* Dynamic Meta Tags for Social Media */}
      <MetaTags
        title={
          blogOpen
            ? 'NDA Alliance for 2026: Constituencies That Will Flip with AMMK | Election Lens'
            : electionResult
              ? `${electionResult.constituencyNameOriginal || electionResult.name} (${electionResult.year}) | Election Lens`
              : pcElectionResult
                ? `${pcElectionResult.constituencyNameOriginal || pcElectionResult.name} (${pcElectionResult.year}) | Election Lens`
                : currentState
                  ? `${currentState} Election Results | Election Lens`
                  : 'Election Lens - India Electoral Map & Results'
        }
        description={
          blogOpen
            ? 'Analysis of how the NDA alliance (ADMK + BJP + PMK + AMMK) will impact Tamil Nadu assembly constituencies based on 2021 election data. Interactive analysis with booth-wise breakdowns.'
            : electionResult
              ? `${electionResult.constituencyNameOriginal || electionResult.name} ${electionResult.year} election results. Winner: ${electionResult.candidates[0]?.name || 'N/A'} (${electionResult.candidates[0]?.party || 'N/A'}) with ${electionResult.candidates[0]?.voteShare?.toFixed(1) || '0'}% vote share. View detailed booth-wise results, postal votes, and analysis.`
              : pcElectionResult
                ? `${pcElectionResult.constituencyNameOriginal || pcElectionResult.name} ${pcElectionResult.year} parliamentary election results. View detailed constituency-wise breakdown and analysis.`
                : currentState
                  ? `Explore ${currentState} election results with detailed Assembly and Parliamentary constituency data. Historical election results, vote shares, margins, and turnout.`
                  : 'Interactive map with detailed Assembly and Parliament election results. Historical data, vote shares, margins and turnout for every constituency.'
        }
        {...(typeof window !== 'undefined' && { url: window.location.href })}
        type={blogOpen ? 'article' : 'website'}
      />

      {/* Blog Section */}
      <BlogSection
        isOpen={blogOpen}
        onClose={handleBlogClose}
        onAssemblyClick={handleAssemblyClick}
        onNavigateToState={async (stateName: string) => {
          const data = await navigateToState(stateName);
          setCurrentData(data);
          // Switch to assemblies view for Tamil Nadu
          if (stateName === 'Tamil Nadu') {
            const assembliesData = await navigateToAssemblies(stateName);
            setCurrentData(assembliesData);
          }
        }}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay active">
          <div className="spinner"></div>
        </div>
      )}
    </>
  );
}

export default App;
