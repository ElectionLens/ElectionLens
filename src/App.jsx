import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { useElectionData } from './hooks/useElectionData';
import { getStateFileName } from './utils/helpers';

function App() {
  const {
    statesGeoJSON,
    districtsCache,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    loading,
    cacheStats,
    getConstituenciesForState,
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState
  } = useElectionData();
  
  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Current displayed data
  const [currentData, setCurrentData] = useState(null);
  
  // Toggle mobile sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);
  
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);
  
  // Close sidebar on mobile after action
  const closeSidebarOnMobile = useCallback(() => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }, [closeSidebar]);
  
  // Load initial data and update on state changes
  useEffect(() => {
    async function updateData() {
      if (currentPC) {
        const data = await navigateToPC(currentPC, currentState);
        setCurrentData(data);
      } else if (currentDistrict) {
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
  }, [currentState, currentView, currentPC, currentDistrict]);
  
  // Handle state click
  const handleStateClick = useCallback(async (stateName, feature) => {
    closeSidebarOnMobile();
    const data = await navigateToState(stateName);
    setCurrentData(data);
  }, [navigateToState, closeSidebarOnMobile]);
  
  // Handle district click
  const handleDistrictClick = useCallback(async (districtName, feature) => {
    closeSidebarOnMobile();
    const data = await navigateToDistrict(districtName, currentState);
    setCurrentData(data);
  }, [navigateToDistrict, currentState, closeSidebarOnMobile]);
  
  // Handle constituency click
  const handleConstituencyClick = useCallback(async (pcName, feature) => {
    closeSidebarOnMobile();
    const data = await navigateToPC(pcName, currentState);
    setCurrentData(data);
  }, [navigateToPC, currentState, closeSidebarOnMobile]);
  
  // Handle assembly click (optional, for future use)
  const handleAssemblyClick = useCallback((acName, feature) => {
    console.log('Clicked assembly:', acName);
  }, []);
  
  // Handle view switch
  const handleSwitchView = useCallback(async (view) => {
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
  
  // Handle reset
  const handleReset = useCallback(() => {
    resetView();
    setCurrentData(null);
  }, [resetView]);
  
  // Handle go back to state
  const handleGoBackToState = useCallback(async () => {
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

