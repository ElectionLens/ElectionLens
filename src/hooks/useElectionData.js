import { useState, useEffect, useCallback, useRef } from 'react';
import { initDB, getFromDB, saveToDB, getDBStats } from '../utils/db';
import { normalizeStateName, getStateFileName, removeDiacritics } from '../utils/helpers';
import { 
  STATE_FILE_MAP, 
  ASM_STATE_ALIASES, 
  DISTRICT_NAME_MAPPINGS, 
  PC_NAME_MAPPINGS,
  PC_STATE_ALIASES 
} from '../constants';

export function useElectionData() {
  // Data states
  const [statesGeoJSON, setStatesGeoJSON] = useState(null);
  const [parliamentGeoJSON, setParliamentGeoJSON] = useState(null);
  const [assemblyGeoJSON, setAssemblyGeoJSON] = useState(null);
  const [districtsCache, setDistrictsCache] = useState({});
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cacheStats, setCacheStats] = useState({ dbCount: 0, memCount: 0, pcCount: 0, acCount: 0 });
  
  // Current navigation state
  const [currentState, setCurrentState] = useState(null);
  const [currentView, setCurrentView] = useState('constituencies'); // 'districts' or 'constituencies'
  const [currentPC, setCurrentPC] = useState(null);
  const [currentDistrict, setCurrentDistrict] = useState(null);
  
  // Refs for caching
  const districtsCacheRef = useRef({});

  // Update cache stats
  const updateCacheStats = useCallback(async () => {
    const dbStats = await getDBStats();
    const totalStates = [...new Set(Object.values(STATE_FILE_MAP))].length;
    setCacheStats({
      dbCount: dbStats.count,
      memCount: Object.keys(districtsCacheRef.current).length,
      totalStates,
      pcCount: parliamentGeoJSON?.features?.length || 0,
      acCount: assemblyGeoJSON?.features?.length || 0
    });
  }, [parliamentGeoJSON, assemblyGeoJSON]);

  // Initialize database and load initial data
  useEffect(() => {
    async function init() {
      await initDB();
      await loadStatesData();
      await loadParliamentData();
      await loadAssemblyData();
      preloadAllDistricts();
    }
    init();
  }, []);

  // Update cache stats when data changes
  useEffect(() => {
    updateCacheStats();
  }, [statesGeoJSON, parliamentGeoJSON, assemblyGeoJSON, districtsCache, updateCacheStats]);

  // Load states GeoJSON
  const loadStatesData = useCallback(async () => {
    try {
      let data = await getFromDB('india_states');
      
      if (data) {
        console.log('States loaded from DB:', data.features.length);
      } else {
        const response = await fetch('india_states.geojson');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
        console.log('States loaded from file:', data.features.length);
        saveToDB('india_states', data);
      }
      
      setStatesGeoJSON(data);
      return data;
    } catch (err) {
      console.error('Failed to load states:', err);
      setError('Failed to load map data');
      return null;
    }
  }, []);

  // Load parliament GeoJSON
  const loadParliamentData = useCallback(async () => {
    try {
      let data = await getFromDB('india_parliament_alt');
      
      if (data) {
        console.log('Parliament data loaded from DB:', data.features.length);
      } else {
        const response = await fetch('india_parliament_alternate.geojson');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawData = await response.json();
        
        let features;
        if (Array.isArray(rawData)) {
          features = rawData.filter(f => f && f.properties && f.geometry);
        } else if (rawData.features) {
          features = rawData.features.filter(f => f && f.properties && f.geometry);
        } else {
          features = [];
        }
        
        data = { type: 'FeatureCollection', features };
        console.log('Parliament data loaded from file:', data.features.length);
        saveToDB('india_parliament_alt', data);
      }
      
      setParliamentGeoJSON(data);
      return data;
    } catch (err) {
      console.error('Failed to load parliament data:', err);
      return null;
    }
  }, []);

  // Load assembly GeoJSON
  const loadAssemblyData = useCallback(async () => {
    try {
      let data = await getFromDB('india_assembly');
      
      if (data) {
        console.log('Assembly data loaded from DB:', data.features.length);
      } else {
        const response = await fetch('india_assembly.geojson');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawData = await response.json();
        
        let features;
        if (Array.isArray(rawData)) {
          features = rawData.filter(f => f && f.properties && f.geometry);
        } else if (rawData.features) {
          features = rawData.features.filter(f => f && f.properties && f.geometry);
        } else {
          features = [];
        }
        
        data = { type: 'FeatureCollection', features };
        console.log('Assembly data loaded from file:', data.features.length);
        saveToDB('india_assembly', data);
      }
      
      setAssemblyGeoJSON(data);
      return data;
    } catch (err) {
      console.error('Failed to load assembly data:', err);
      return null;
    }
  }, []);

  // Preload all district files
  const preloadAllDistricts = useCallback(async () => {
    const stateFiles = [...new Set(Object.values(STATE_FILE_MAP))];
    
    const loadPromises = stateFiles.map(async (fileName) => {
      if (districtsCacheRef.current[fileName]) return true;
      
      const cached = await getFromDB(`districts_${fileName}`);
      if (cached) {
        districtsCacheRef.current[fileName] = cached;
        return true;
      }
      
      try {
        const response = await fetch(`states/${fileName}.geojson`);
        if (response.ok) {
          const data = await response.json();
          districtsCacheRef.current[fileName] = data;
          saveToDB(`districts_${fileName}`, data);
          return true;
        }
      } catch (e) {
        // Silently fail for missing files
      }
      return false;
    });
    
    const results = await Promise.all(loadPromises);
    const loaded = results.filter(Boolean).length;
    console.log(`Preloaded ${loaded} state district files`);
    
    setDistrictsCache({ ...districtsCacheRef.current });
    updateCacheStats();
  }, [updateCacheStats]);

  // Get constituencies for a state
  const getConstituenciesForState = useCallback((stateName) => {
    if (!parliamentGeoJSON) return [];
    
    const normalized = removeDiacritics(normalizeStateName(stateName));
    
    return parliamentGeoJSON.features.filter(f => {
      let pcState = f.properties.state_ut_name || f.properties.STATE_NAME || '';
      if (PC_STATE_ALIASES[pcState]) {
        pcState = PC_STATE_ALIASES[pcState];
      }
      return removeDiacritics(normalizeStateName(pcState)) === normalized;
    });
  }, [parliamentGeoJSON]);

  // Get assemblies for a PC
  const getAssembliesForPC = useCallback((pcName, stateName) => {
    if (!assemblyGeoJSON) return [];
    
    let normalizedPC = pcName.toUpperCase().trim();
    let normalizedState = removeDiacritics(normalizeStateName(stateName)).toUpperCase();
    
    const asmState = ASM_STATE_ALIASES[normalizedState] || normalizedState;
    
    const mappingKey = `${normalizedPC}|${normalizedState}`;
    if (PC_NAME_MAPPINGS[mappingKey]) {
      normalizedPC = PC_NAME_MAPPINGS[mappingKey];
    }
    
    return assemblyGeoJSON.features.filter(f => {
      const asmPC = (f.properties.PC_NAME || '').toUpperCase().trim();
      const asmStateName = (f.properties.ST_NAME || '').toUpperCase().trim();
      
      if (asmStateName !== asmState) return false;
      
      if (asmPC === normalizedPC) return true;
      
      if (asmPC === normalizedPC + ' (SC)' || 
          asmPC === normalizedPC + ' (ST)' ||
          asmPC === normalizedPC + '(SC)' ||
          asmPC === normalizedPC + '(ST)') return true;
      
      const cleanAsmPC = asmPC.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (cleanAsmPC === normalizedPC) return true;
      
      if (asmPC.startsWith(normalizedPC) || normalizedPC.startsWith(asmPC)) {
        const minLen = Math.min(asmPC.length, normalizedPC.length);
        if (minLen >= 10) return true;
      }
      
      return false;
    });
  }, [assemblyGeoJSON]);

  // Get assemblies for a district
  const getAssembliesForDistrict = useCallback((districtName, stateName) => {
    if (!assemblyGeoJSON) return [];
    
    let normalizedDist = districtName.toUpperCase().trim();
    let normalizedState = removeDiacritics(normalizeStateName(stateName)).toUpperCase().trim();
    
    const asmState = ASM_STATE_ALIASES[normalizedState] || normalizedState;
    
    const mappingKey = `${normalizedDist}|${normalizedState}`;
    if (DISTRICT_NAME_MAPPINGS[mappingKey]) {
      normalizedDist = DISTRICT_NAME_MAPPINGS[mappingKey];
    }
    
    return assemblyGeoJSON.features.filter(f => {
      const asmDistRaw = (f.properties.DIST_NAME || '').toUpperCase();
      const asmDist = asmDistRaw.replace(/[^A-Z]/g, '');
      const asmStateName = (f.properties.ST_NAME || '').toUpperCase().trim();
      
      if (asmStateName !== asmState) return false;
      
      const cleanDist = normalizedDist.replace(/[^A-Z]/g, '');
      return asmDist === cleanDist;
    });
  }, [assemblyGeoJSON]);

  // Load districts for a state
  const loadDistrictsForState = useCallback(async (stateName) => {
    const fileName = getStateFileName(stateName);
    console.log(`Loading districts for ${stateName} from states/${fileName}.geojson`);
    
    setLoading(true);
    
    try {
      let data;
      
      if (districtsCacheRef.current[fileName]) {
        data = districtsCacheRef.current[fileName];
      } else {
        data = await getFromDB(`districts_${fileName}`);
        if (data) {
          districtsCacheRef.current[fileName] = data;
        }
      }
      
      if (!data) {
        const response = await fetch(`states/${fileName}.geojson`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
        districtsCacheRef.current[fileName] = data;
        saveToDB(`districts_${fileName}`, data);
      }
      
      console.log(`Loaded ${data.features.length} districts`);
      
      setDistrictsCache({ ...districtsCacheRef.current });
      setCurrentState(stateName);
      setCurrentView('districts');
      setCurrentPC(null);
      setCurrentDistrict(null);
      updateCacheStats();
      
      return data;
    } catch (err) {
      console.error('Failed to load districts:', err);
      setError(`Could not load districts for ${stateName}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [updateCacheStats]);

  // Navigate to state (constituencies view)
  const navigateToState = useCallback(async (stateName) => {
    setLoading(true);
    try {
      if (!parliamentGeoJSON) {
        await loadParliamentData();
      }
      
      const constituencies = getConstituenciesForState(stateName);
      console.log(`Found ${constituencies.length} constituencies for ${stateName}`);
      
      if (constituencies.length === 0) {
        // Switch to districts view if no constituencies
        return loadDistrictsForState(stateName);
      }
      
      setCurrentState(stateName);
      setCurrentView('constituencies');
      setCurrentPC(null);
      setCurrentDistrict(null);
      
      return { type: 'FeatureCollection', features: constituencies };
    } finally {
      setLoading(false);
    }
  }, [parliamentGeoJSON, loadParliamentData, getConstituenciesForState, loadDistrictsForState]);

  // Navigate to PC (assembly view)
  const navigateToPC = useCallback(async (pcName, stateName) => {
    setLoading(true);
    try {
      if (!assemblyGeoJSON) {
        await loadAssemblyData();
      }
      
      const assemblies = getAssembliesForPC(pcName, stateName);
      console.log(`Found ${assemblies.length} assembly constituencies for ${pcName}`);
      
      setCurrentPC(pcName);
      setCurrentDistrict(null);
      
      return { type: 'FeatureCollection', features: assemblies };
    } finally {
      setLoading(false);
    }
  }, [assemblyGeoJSON, loadAssemblyData, getAssembliesForPC]);

  // Navigate to district (assembly view)
  const navigateToDistrict = useCallback(async (districtName, stateName) => {
    setLoading(true);
    try {
      if (!assemblyGeoJSON) {
        await loadAssemblyData();
      }
      
      const assemblies = getAssembliesForDistrict(districtName, stateName);
      console.log(`Found ${assemblies.length} assembly constituencies for district ${districtName}`);
      
      setCurrentDistrict(districtName);
      setCurrentPC(null);
      
      return { type: 'FeatureCollection', features: assemblies };
    } finally {
      setLoading(false);
    }
  }, [assemblyGeoJSON, loadAssemblyData, getAssembliesForDistrict]);

  // Switch view between districts and constituencies
  const switchView = useCallback((view) => {
    if (!currentState) return;
    setCurrentView(view);
    setCurrentPC(null);
    setCurrentDistrict(null);
  }, [currentState]);

  // Reset to India view
  const resetView = useCallback(() => {
    setCurrentState(null);
    setCurrentView('constituencies');
    setCurrentPC(null);
    setCurrentDistrict(null);
  }, []);

  // Go back to state from PC/district
  const goBackToState = useCallback(() => {
    setCurrentPC(null);
    setCurrentDistrict(null);
  }, []);

  return {
    // Data
    statesGeoJSON,
    parliamentGeoJSON,
    assemblyGeoJSON,
    districtsCache,
    
    // State
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    loading,
    error,
    cacheStats,
    
    // Data getters
    getConstituenciesForState,
    getAssembliesForPC,
    getAssembliesForDistrict,
    
    // Navigation
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState,
    
    // Utils
    updateCacheStats
  };
}

