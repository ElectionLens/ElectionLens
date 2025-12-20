import { useState, useCallback, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { useElectionData } from './hooks/useElectionData';
import { useUrlState, type UrlState } from './hooks/useUrlState';
import { normalizeName, toTitleCase } from './utils/helpers';
import type {
  GeoJSONData,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  ViewMode,
} from './types';

/**
 * Main application component
 * Orchestrates data loading, navigation, and UI state
 */
function App(): JSX.Element {
  const {
    statesGeoJSON,
    parliamentGeoJSON,
    assemblyGeoJSON,
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
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState,
    selectAssembly,
  } = useElectionData();

  /**
   * Handle URL-based navigation (deep linking)
   */
  const handleUrlNavigate = useCallback(
    async (urlState: UrlState): Promise<void> => {
      if (!urlState.state) {
        resetView();
        setCurrentData(null);
        return;
      }

      // Find matching state name (case insensitive)
      let matchedState = urlState.state;
      if (statesGeoJSON?.features) {
        const found = statesGeoJSON.features.find((f) => {
          const name = normalizeName(f.properties.shapeName ?? f.properties.ST_NM ?? '');
          return name.toLowerCase() === urlState.state?.toLowerCase().replace(/-/g, ' ');
        });
        if (found) {
          matchedState = found.properties.shapeName ?? found.properties.ST_NM ?? urlState.state;
        }
      }

      if (urlState.pc) {
        // First navigate to state, then to PC
        await navigateToState(matchedState);
        const data = await navigateToPC(
          toTitleCase(urlState.pc.replace(/-/g, ' ')).toUpperCase(),
          matchedState
        );
        setCurrentData(data);
        if (urlState.assembly) {
          selectAssembly(toTitleCase(urlState.assembly.replace(/-/g, ' ')).toUpperCase());
        }
      } else if (urlState.district) {
        // First navigate to state districts, then to specific district
        await loadDistrictsForState(matchedState);
        const data = await navigateToDistrict(
          toTitleCase(urlState.district.replace(/-/g, ' ')),
          matchedState
        );
        setCurrentData(data);
        if (urlState.assembly) {
          selectAssembly(toTitleCase(urlState.assembly.replace(/-/g, ' ')).toUpperCase());
        }
      } else if (urlState.view === 'districts') {
        const data = await loadDistrictsForState(matchedState);
        setCurrentData(data);
      } else {
        const data = await navigateToState(matchedState);
        setCurrentData(data);
      }
    },
    [
      statesGeoJSON,
      navigateToState,
      navigateToPC,
      navigateToDistrict,
      loadDistrictsForState,
      resetView,
      selectAssembly,
    ]
  );

  // URL state management for deep linking
  // Wait for statesGeoJSON to be loaded before processing URL
  const isDataReady = Boolean(statesGeoJSON);
  const { getShareableUrl } = useUrlState(
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    handleUrlNavigate,
    isDataReady
  );

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Current displayed data
  const [currentData, setCurrentData] = useState<GeoJSONData | null>(null);

  /**
   * Toggle mobile sidebar visibility
   */
  const toggleSidebar = useCallback((): void => {
    setSidebarOpen((prev) => !prev);
  }, []);

  /**
   * Close mobile sidebar
   */
  const closeSidebar = useCallback((): void => {
    setSidebarOpen(false);
  }, []);

  /**
   * Close sidebar on mobile after action
   */
  const closeSidebarOnMobile = useCallback((): void => {
    if (window.innerWidth <= 768) {
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
      } else if (currentState) {
        if (currentView === 'constituencies') {
          const data = await navigateToState(currentState);
          setCurrentData(data);
        } else {
          const data = await loadDistrictsForState(currentState);
          setCurrentData(data);
        }
      } else {
        setCurrentData(null);
      }
    }
    updateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState, currentView, currentPC, currentDistrict]);

  /**
   * Handle state click from map or sidebar
   */
  const handleStateClick = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarOnMobile();
      const data = await navigateToState(stateName);
      setCurrentData(data);
    },
    [navigateToState, closeSidebarOnMobile]
  );

  /**
   * Handle district click from map or sidebar
   */
  const handleDistrictClick = useCallback(
    async (districtName: string, _feature: DistrictFeature): Promise<void> => {
      closeSidebarOnMobile();
      if (!currentState) return;
      const data = await navigateToDistrict(districtName, currentState);
      setCurrentData(data);
    },
    [navigateToDistrict, currentState, closeSidebarOnMobile]
  );

  /**
   * Handle constituency click from map or sidebar
   */
  const handleConstituencyClick = useCallback(
    async (pcName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarOnMobile();
      if (!currentState) return;
      const data = await navigateToPC(pcName, currentState);
      setCurrentData(data);
    },
    [navigateToPC, currentState, closeSidebarOnMobile]
  );

  /**
   * Handle assembly click - select and update URL
   */
  const handleAssemblyClick = useCallback(
    (acName: string, _feature: AssemblyFeature): void => {
      selectAssembly(acName);
    },
    [selectAssembly]
  );

  /**
   * Handle search selection - state
   */
  const handleSearchStateSelect = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarOnMobile();
      const data = await navigateToState(stateName);
      setCurrentData(data);
    },
    [navigateToState, closeSidebarOnMobile]
  );

  /**
   * Handle search selection - constituency
   */
  const handleSearchConstituencySelect = useCallback(
    async (pcName: string, stateName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarOnMobile();
      // First navigate to the state
      await navigateToState(stateName);
      // Then navigate to the PC
      const data = await navigateToPC(pcName, stateName);
      setCurrentData(data);
    },
    [navigateToState, navigateToPC, closeSidebarOnMobile]
  );

  /**
   * Handle search selection - assembly
   * Navigate to the state, then to the PC containing the assembly, then select the assembly
   */
  const handleSearchAssemblySelect = useCallback(
    async (acName: string, stateName: string, feature: AssemblyFeature): Promise<void> => {
      closeSidebarOnMobile();

      // Get the PC name from the assembly feature
      const pcName = feature.properties.PC_NAME ?? '';

      // First navigate to the state to set currentState properly
      await navigateToState(stateName);

      if (pcName) {
        // Navigate to the PC
        const data = await navigateToPC(pcName, stateName);
        setCurrentData(data);
        // Then select the assembly
        selectAssembly(acName);
      }
    },
    [navigateToState, navigateToPC, selectAssembly, closeSidebarOnMobile]
  );

  /**
   * Copy shareable URL to clipboard
   */
  const handleShare = useCallback(async (): Promise<void> => {
    const url = getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
    });

    try {
      await navigator.clipboard.writeText(url);
      // Show a brief notification (could add a toast here)
      console.log('URL copied:', url);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }, [getShareableUrl, currentState, currentView, currentPC, currentDistrict, currentAssembly]);

  /**
   * Handle view switch between constituencies and districts
   */
  const handleSwitchView = useCallback(
    async (view: ViewMode): Promise<void> => {
      switchView(view);
      if (currentState) {
        if (view === 'constituencies') {
          const data = await navigateToState(currentState);
          setCurrentData(data);
        } else {
          const data = await loadDistrictsForState(currentState);
          setCurrentData(data);
        }
      }
    },
    [switchView, currentState, navigateToState, loadDistrictsForState]
  );

  /**
   * Handle reset to India view
   */
  const handleReset = useCallback((): void => {
    resetView();
    setCurrentData(null);
  }, [resetView]);

  /**
   * Handle go back to state from PC/district
   */
  const handleGoBackToState = useCallback(async (): Promise<void> => {
    goBackToState();
    if (currentState) {
      if (currentView === 'constituencies') {
        const data = await navigateToState(currentState);
        setCurrentData(data);
      } else {
        const data = await loadDistrictsForState(currentState);
        setCurrentData(data);
      }
    }
  }, [goBackToState, currentState, currentView, navigateToState, loadDistrictsForState]);

  /**
   * Handle go back one navigation level
   * PC/District view -> State view -> India view
   */
  const handleGoBack = useCallback(async (): Promise<void> => {
    if (currentPC || currentDistrict) {
      // In PC or district view, go back to state
      await handleGoBackToState();
    } else if (currentState) {
      // In state view, go back to India
      handleReset();
    }
  }, [currentPC, currentDistrict, currentState, handleGoBackToState, handleReset]);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className={`mobile-toggle ${sidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <div className="container">
        <Sidebar
          statesGeoJSON={statesGeoJSON}
          parliamentGeoJSON={parliamentGeoJSON}
          assemblyGeoJSON={assemblyGeoJSON}
          currentState={currentState}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          cacheStats={cacheStats}
          currentData={currentData}
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
          onShare={handleShare}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
        />

        <MapView
          statesGeoJSON={statesGeoJSON}
          currentData={currentData}
          currentState={currentState}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          onStateClick={handleStateClick}
          onDistrictClick={handleDistrictClick}
          onConstituencyClick={handleConstituencyClick}
          onAssemblyClick={handleAssemblyClick}
          onSwitchView={handleSwitchView}
          onReset={handleReset}
          onGoBack={handleGoBack}
        />
      </div>

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
