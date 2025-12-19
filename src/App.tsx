import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { useElectionData } from './hooks/useElectionData';
import type {
  GeoJSONData,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  ViewMode
} from './types';

/**
 * Main application component
 * Orchestrates data loading, navigation, and UI state
 */
function App(): JSX.Element {
  const {
    statesGeoJSON,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    loading,
    cacheStats,
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState
  } = useElectionData();
  
  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  
  // Current displayed data
  const [currentData, setCurrentData] = useState<GeoJSONData | null>(null);
  
  /**
   * Toggle mobile sidebar visibility
   */
  const toggleSidebar = useCallback((): void => {
    setSidebarOpen(prev => !prev);
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
  const handleStateClick = useCallback(async (stateName: string, _feature: StateFeature): Promise<void> => {
    closeSidebarOnMobile();
    const data = await navigateToState(stateName);
    setCurrentData(data);
  }, [navigateToState, closeSidebarOnMobile]);
  
  /**
   * Handle district click from map or sidebar
   */
  const handleDistrictClick = useCallback(async (districtName: string, _feature: DistrictFeature): Promise<void> => {
    closeSidebarOnMobile();
    if (!currentState) return;
    const data = await navigateToDistrict(districtName, currentState);
    setCurrentData(data);
  }, [navigateToDistrict, currentState, closeSidebarOnMobile]);
  
  /**
   * Handle constituency click from map or sidebar
   */
  const handleConstituencyClick = useCallback(async (pcName: string, _feature: ConstituencyFeature): Promise<void> => {
    closeSidebarOnMobile();
    if (!currentState) return;
    const data = await navigateToPC(pcName, currentState);
    setCurrentData(data);
  }, [navigateToPC, currentState, closeSidebarOnMobile]);
  
  /**
   * Handle assembly click (optional, for future use)
   */
  const handleAssemblyClick = useCallback((acName: string, _feature: AssemblyFeature): void => {
    console.log('Clicked assembly:', acName);
  }, []);
  
  /**
   * Handle view switch between constituencies and districts
   */
  const handleSwitchView = useCallback(async (view: ViewMode): Promise<void> => {
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
  }, [switchView, currentState, navigateToState, loadDistrictsForState]);
  
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

  return (
    <>
      {/* Mobile toggle button */}
      <button 
        className={`mobile-toggle ${sidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <span>{sidebarOpen ? '✕' : '☰'}</span>
      </button>
      
      <div className="container">
        <Sidebar
          statesGeoJSON={statesGeoJSON}
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

