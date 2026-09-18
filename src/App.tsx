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
import { trackPageView } from './utils/firebase';
import { withUrlLocation, viewSwitchUrlLocation, type UrlLocationInput } from './utils/urlLocation';
import { readLocation, rawYearParam, parseAssemblyYearParam } from './utils/mapUrlContext';
import { useSelectLocation } from './hooks/useSelectLocation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useHoverLink } from './hooks/useHoverLink';
import { resolvePanelMode, PANEL_WIDEN_MIN_VIEWPORT, type PanelMode } from './utils/panelMode';
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
  const { hovered: hoveredFeature, onRowEnter, onRowLeave } = useHoverLink();
  const [stateSummaryData, setStateSummaryData] = useState<StateSummaryPanelData | null>(null);
  const [leftPane, setLeftPane] = useState<LeftPane>('root');
  const [leftPaneView, setLeftPaneView] = useState<LeftPaneView>(null);
  const [leftPaneParty, setLeftPaneParty] = useState<string | null>(null);
  /** Active result-panel tab, mirrored from the panel so width can react to it. */
  const [panelTab, setPanelTab] = useState<string | null>(null);
  /** Explicit user width choice; null means "infer from what I'm doing". */
  const [panelWidthOverride, setPanelWidthOverride] = useState<PanelMode | null>(null);

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

  /**
   * Where the user currently is, as the URL layer wants it. Every updateUrl /
   * getShareableUrl call below derives from this rather than respelling it.
   */
  const urlLocation = useMemo(
    (): UrlLocationInput => ({
      currentState,
      currentView,
      currentPC,
      currentDistrict,
      currentAssembly,
      selectedYear,
      selectedACPCYear,
      showACsWithinPC,
      blogOpen,
    }),
    [
      currentState,
      currentView,
      currentPC,
      currentDistrict,
      currentAssembly,
      selectedYear,
      selectedACPCYear,
      showACsWithinPC,
      blogOpen,
    ]
  );
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
    const urlYear = parseAssemblyYearParam(readLocation()?.search ?? '');
    if (urlYear == null) return;
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

    const search = readLocation()?.search ?? '';
    const yearForACResult = parseAssemblyYearParam(search) ?? undefined;

    const fetchKey = `${currentState}|${currentAssembly}|${schemaId}|${rawYearParam(search) ?? ''}`;
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
   * The single entry point for "the user picked a place". Map clicks, search
   * results and summary rows all delegate here so the sequence cannot drift
   * between surfaces the way the hand-rolled copies did.
   */
  const { selectLocation } = useSelectLocation({
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    selectAssembly,
    clearElectionResult,
    clearPCElectionResult,
    getACResult,
    getPCResult,
    loadStateIndex,
    loadPCStateIndex,
    setPCSelectedYear,
    setSelectedACPCYear,
    setCurrentData,
    setParliamentContributions,
    loadAllParliamentContributions,
    getAC,
    resolveACName,
    getStateIdFromName,
    closeSidebarAfterAction,
    currentState,
    currentPC,
    selectedYear,
    selectedACPCYear,
    pcSelectedYear,
    updateUrlRef,
  });

  /**
   * Handle state click from map or sidebar
   */
  const handleStateClick = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      await selectLocation({ level: 'state', stateName });
    },
    [selectLocation]
  );

  /**
   * Handle district click from map or sidebar
   */
  const handleDistrictClick = useCallback(
    async (districtName: string, _feature: DistrictFeature): Promise<void> => {
      if (!currentState) return;
      await selectLocation({ level: 'district', stateName: currentState, districtName });
    },
    [selectLocation, currentState]
  );

  /**
   * Handle constituency click from map or sidebar
   */
  const handleConstituencyClick = useCallback(
    async (pcName: string, _feature: ConstituencyFeature): Promise<void> => {
      if (!currentState) return;
      await selectLocation({ level: 'pc', stateName: currentState, pcName });
    },
    [selectLocation, currentState]
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
   * Handle assembly click - select, zoom, and show election results.
   * No `ensureAssembliesView`: a click inside a PC keeps that PC's scoped layer.
   */
  const handleAssemblyClick = useCallback(
    async (acName: string, feature: AssemblyFeature): Promise<void> => {
      if (!currentState) return;
      await selectLocation({ level: 'assembly', stateName: currentState, acName, feature });
    },
    [selectLocation, currentState]
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
      await selectLocation({ level: 'state', stateName });
    },
    [selectLocation]
  );

  /**
   * Handle search selection - constituency
   */
  const handleSearchConstituencySelect = useCallback(
    async (pcName: string, stateName: string, _feature: ConstituencyFeature): Promise<void> => {
      await selectLocation({ level: 'pc', stateName, pcName });
    },
    [selectLocation]
  );

  /**
   * Handle search selection - assembly
   * Navigate to the assemblies view and select the assembly
   * URL: /state/ac/ac-name?year=YYYY or year=pc-YYYY (same URL/year rules as map click)
   */
  const handleSearchAssemblySelect = useCallback(
    async (acName: string, stateName: string, feature: AssemblyFeature): Promise<void> => {
      // Unlike a map click, search can land from anywhere, so the statewide
      // assembly layer has to be loaded before the AC can be shown.
      await selectLocation({
        level: 'assembly',
        stateName,
        acName,
        feature,
        ensureAssembliesView: true,
      });
    },
    [selectLocation]
  );

  /**
   * Handle search selection - district
   * Navigate to the district view
   * URL: /state/district/district-name
   */
  const handleSearchDistrictSelect = useCallback(
    async (districtName: string, stateName: string, _feature: DistrictFeature): Promise<void> => {
      await selectLocation({ level: 'district', stateName, districtName });
    },
    [selectLocation]
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
      if (
        currentState &&
        (currentView === 'assemblies' ||
          currentView === 'districts' ||
          currentView === 'constituencies')
      ) {
        updateUrlRef.current(
          withUrlLocation(urlLocation, {
            tab: null,
            blogPost: null,
            year,
            pcYear: null,
            blog: false,
          })
        );
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
      currentState,
      currentView,
      getACResult,
      resolveACName,
      getAC,
      urlLocation,
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
      updateUrlRef.current(
        withUrlLocation(urlLocation, {
          tab: null,
          blogPost: null,
          year: null,
          pcYear: year,
          blog: false,
        })
      );
    },
    [
      currentAssembly,
      currentState,
      currentView,
      currentPC,
      setSelectedACPCYear,
      setPCSelectedYear,
      urlLocation,
    ]
  );

  /**
   * Handle year change in parliamentary election results (sync year to URL)
   */
  const handlePCYearChange = useCallback(
    async (year: number): Promise<void> => {
      setPCSelectedYear(year);
      if (currentState && (currentPC || currentView === 'constituencies')) {
        updateUrlRef.current(
          withUrlLocation(urlLocation, {
            tab: null,
            blogPost: null,
            year,
            pcYear: null,
            blog: false,
          })
        );
      }
      if (currentPC && currentState) {
        await getPCResult(currentPC, currentState, year);
      }
    },
    [setPCSelectedYear, currentPC, currentState, currentView, getPCResult, urlLocation]
  );

  /**
   * Keep `?tab=` in sync when the embedded election panel switches View (Overview / Booths / …).
   */
  const handleElectionPanelViewTabSync = useCallback(
    (panelTab: 'overview' | 'booths' | 'postal' | 'analysis'): void => {
      // Mirrored into App state as well as the URL: the panel width depends on
      // which tab is open, and reading it back out of the URL would not be
      // reactive.
      setPanelTab(panelTab);
      if (!currentState || !currentAssembly) return;
      const searchParams =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const blogPostParam =
        blogOpen && searchParams?.get('blogPost') ? searchParams.get('blogPost') : null;
      updateUrl(
        withUrlLocation(urlLocation, {
          tab: panelTab === 'overview' ? null : panelTab,
          blogPost: blogPostParam,
        })
      );
    },
    [blogOpen, currentAssembly, currentState, urlLocation, updateUrl]
  );

  /**
   * Panel width follows intent (UI revamp section 3): browse while picking a
   * place, analyse once a constituency is selected, deep-dive in booth and
   * analysis tables. `resolvePanelMode` owns the rules so the CSS selectors and
   * any future card surface cannot disagree about the answer.
   */
  const canWidenPanel = useMediaQuery(`(min-width: ${PANEL_WIDEN_MIN_VIEWPORT}px)`);

  // Selecting a different place starts a fresh panel on its default tab, so a
  // stale 'booths' must not linger and hold the panel at deep-dive width. The
  // width override is dropped too: it was a decision about the previous place,
  // and silently carrying it forward would make the next selection open at a
  // width the user never asked for.
  useEffect(() => {
    setPanelTab(null);
    setPanelWidthOverride(null);
  }, [currentAssembly, currentPC]);

  const panelMode = useMemo(
    () =>
      resolvePanelMode({
        hasSelection: Boolean(currentAssembly ?? currentPC),
        activeTab: panelTab,
        canWiden: canWidenPanel,
        override: panelWidthOverride,
      }),
    [currentAssembly, currentPC, panelTab, canWidenPanel, panelWidthOverride]
  );

  /**
   * Get current share URL for AC election results (matches URL: assembly year or year=pc-YYYY)
   */
  const currentShareUrl = useMemo(() => {
    if (!currentAssembly) return undefined;
    return getShareableUrl(withUrlLocation(urlLocation, { tab: null, blogPost: null }));
  }, [getShareableUrl, urlLocation, currentAssembly]);

  /**
   * Get share URL for PC contribution in AC panel (year=pc-YYYY format)
   *
   * Identical to {@link currentShareUrl} - when a PC year is active the shared
   * location already carries `year=pc-YYYY`. It is a separate prop only so the
   * AC panel can hide its "share contribution" affordance when no PC year is
   * selected, so the guard is the whole difference.
   */
  const pcContributionShareUrl = useMemo(
    () => (selectedACPCYear ? currentShareUrl : undefined),
    [currentShareUrl, selectedACPCYear]
  );

  /**
   * Get current share URL for PC election results
   */
  const currentPCShareUrl = useMemo(() => {
    if (!currentPC) return undefined;
    // PC-level share: drop the AC-scoped parts and use the parliament year.
    return getShareableUrl(
      withUrlLocation(urlLocation, {
        tab: null,
        blogPost: null,
        district: null,
        assembly: null,
        year: pcSelectedYear,
        pcYear: null,
      })
    );
  }, [getShareableUrl, urlLocation, currentPC, pcSelectedYear]);

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
            updateUrlRef.current(
              viewSwitchUrlLocation({
                state: currentState,
                view: 'constituencies',
                year: latestYear,
              })
            );
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
        updateUrlRef.current(
          viewSwitchUrlLocation({
            state: currentState,
            view: 'assemblies',
            year: yearForUrl,
            assembly: currentAssembly,
          })
        );
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
          updateUrlRef.current(
            viewSwitchUrlLocation({ state: currentState, view: 'districts', year: latestYear })
          );
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
    }
    // Toggling the blog must not disturb which year the URL is showing, so both
    // year fields are passed through as-is rather than via the shared
    // pcYear-wins rule (they land on different branches when a PC is selected
    // without an assembly).
    updateUrl(
      withUrlLocation(urlLocation, {
        tab: null,
        blogPost: null,
        year: selectedYear,
        pcYear: selectedACPCYear,
        blog: newBlogOpen,
      })
    );
  }, [
    blogOpen,
    clearElectionResult,
    clearPCElectionResult,
    updateUrl,
    urlLocation,
    selectedYear,
    selectedACPCYear,
  ]);

  /**
   * Handle blog close
   */
  const handleBlogClose = useCallback((): void => {
    setBlogOpen(false);
    // Closing the blog leaves the year alone - see handleBlogToggle.
    updateUrl(
      withUrlLocation(urlLocation, {
        tab: null,
        blogPost: null,
        year: selectedYear,
        pcYear: selectedACPCYear,
        blog: false,
      })
    );
  }, [updateUrl, urlLocation, selectedYear, selectedACPCYear]);

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

      <div className="container" data-panel-mode={panelMode}>
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
          onRowEnter={onRowEnter}
          onRowLeave={onRowLeave}
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
          panelMode={panelMode}
          onPanelWidthOverrideChange={setPanelWidthOverride}
          canWidenPanel={canWidenPanel}
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
          hoveredFeature={hoveredFeature}
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
