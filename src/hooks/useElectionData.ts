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
import type {
  StatesGeoJSON,
  ConstituenciesGeoJSON,
  AssembliesGeoJSON,
  DistrictsGeoJSON,
  DistrictsCache,
  CacheStats,
  ViewMode,
  ConstituencyFeature,
  AssemblyFeature,
  UseElectionDataReturn,
  GeoJSONData
} from '../types';

/**
 * Custom hook for managing election data
 * Handles GeoJSON loading, caching, and navigation
 */
export function useElectionData(): UseElectionDataReturn {
  // Data states
  const [statesGeoJSON, setStatesGeoJSON] = useState<StatesGeoJSON | null>(null);
  const [parliamentGeoJSON, setParliamentGeoJSON] = useState<ConstituenciesGeoJSON | null>(null);
  const [assemblyGeoJSON, setAssemblyGeoJSON] = useState<AssembliesGeoJSON | null>(null);
  const [districtsCache, setDistrictsCache] = useState<DistrictsCache>({});
  
  // UI states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats>({ 
    dbCount: 0, 
    memCount: 0, 
    pcCount: 0, 
    acCount: 0 
  });
  
  // Current navigation state
  const [currentState, setCurrentState] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('constituencies');
  const [currentPC, setCurrentPC] = useState<string | null>(null);
  const [currentDistrict, setCurrentDistrict] = useState<string | null>(null);
  
  // Refs for caching
  const districtsCacheRef = useRef<DistrictsCache>({});

  /**
   * Update cache statistics
   */
  const updateCacheStats = useCallback(async (): Promise<void> => {
    const dbStats = await getDBStats();
    const totalStates = [...new Set(Object.values(STATE_FILE_MAP))].length;
    setCacheStats({
      dbCount: dbStats.count,
      memCount: Object.keys(districtsCacheRef.current).length,
      totalStates,
      pcCount: parliamentGeoJSON?.features?.length ?? 0,
      acCount: assemblyGeoJSON?.features?.length ?? 0
    });
  }, [parliamentGeoJSON, assemblyGeoJSON]);

  /**
   * Load states GeoJSON from cache or network
   */
  const loadStatesData = useCallback(async (): Promise<StatesGeoJSON | null> => {
    try {
      let data = await getFromDB('india_states') as StatesGeoJSON | null;
      
      if (data) {
        console.log('States loaded from DB:', data.features.length);
      } else {
        const response = await fetch('india_states.geojson');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json() as StatesGeoJSON;
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

  /**
   * Load parliament/constituency GeoJSON from cache or network
   */
  const loadParliamentData = useCallback(async (): Promise<ConstituenciesGeoJSON | null> => {
    try {
      let data = await getFromDB('india_parliament_alt') as ConstituenciesGeoJSON | null;
      
      if (data) {
        console.log('Parliament data loaded from DB:', data.features.length);
      } else {
        const response = await fetch('india_parliament_alternate.geojson');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawData = await response.json() as GeoJSONData | ConstituencyFeature[];
        
        let features: ConstituencyFeature[];
        if (Array.isArray(rawData)) {
          features = rawData.filter((f): f is ConstituencyFeature => 
            f !== null && f.properties !== undefined && f.geometry !== undefined
          );
        } else if ('features' in rawData && rawData.features) {
          features = (rawData.features as ConstituencyFeature[]).filter(
            (f): f is ConstituencyFeature => 
              f !== null && f.properties !== undefined && f.geometry !== undefined
          );
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

  /**
   * Load assembly GeoJSON from cache or network
   */
  const loadAssemblyData = useCallback(async (): Promise<AssembliesGeoJSON | null> => {
    try {
      let data = await getFromDB('india_assembly') as AssembliesGeoJSON | null;
      
      if (data) {
        console.log('Assembly data loaded from DB:', data.features.length);
      } else {
        const response = await fetch('india_assembly.geojson');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawData = await response.json() as GeoJSONData | AssemblyFeature[];
        
        let features: AssemblyFeature[];
        if (Array.isArray(rawData)) {
          features = rawData.filter((f): f is AssemblyFeature => 
            f !== null && f.properties !== undefined && f.geometry !== undefined
          );
        } else if ('features' in rawData && rawData.features) {
          features = (rawData.features as AssemblyFeature[]).filter(
            (f): f is AssemblyFeature => 
              f !== null && f.properties !== undefined && f.geometry !== undefined
          );
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

  /**
   * Preload all district GeoJSON files for fast switching
   */
  const preloadAllDistricts = useCallback(async (): Promise<void> => {
    const stateFiles = [...new Set(Object.values(STATE_FILE_MAP))];
    
    const loadPromises = stateFiles.map(async (fileName): Promise<boolean> => {
      if (districtsCacheRef.current[fileName]) return true;
      
      const cached = await getFromDB(`districts_${fileName}`) as DistrictsGeoJSON | null;
      if (cached) {
        districtsCacheRef.current[fileName] = cached;
        return true;
      }
      
      try {
        const response = await fetch(`states/${fileName}.geojson`);
        if (response.ok) {
          const data = await response.json() as DistrictsGeoJSON;
          districtsCacheRef.current[fileName] = data;
          saveToDB(`districts_${fileName}`, data);
          return true;
        }
      } catch {
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

  // Initialize database and load initial data
  useEffect(() => {
    async function init(): Promise<void> {
      await initDB();
      await loadStatesData();
      await loadParliamentData();
      await loadAssemblyData();
      preloadAllDistricts();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update cache stats when data changes
  useEffect(() => {
    updateCacheStats();
  }, [statesGeoJSON, parliamentGeoJSON, assemblyGeoJSON, districtsCache, updateCacheStats]);

  /**
   * Get constituencies for a given state
   */
  const getConstituenciesForState = useCallback((stateName: string): ConstituencyFeature[] => {
    if (!parliamentGeoJSON) return [];
    
    const normalized = removeDiacritics(normalizeStateName(stateName));
    
    return parliamentGeoJSON.features.filter((f): boolean => {
      let pcState = f.properties.state_ut_name ?? f.properties.STATE_NAME ?? '';
      const aliasedState = PC_STATE_ALIASES[pcState];
      if (aliasedState) {
        pcState = aliasedState;
      }
      return removeDiacritics(normalizeStateName(pcState)) === normalized;
    });
  }, [parliamentGeoJSON]);

  /**
   * Get assemblies for a parliamentary constituency
   */
  const getAssembliesForPC = useCallback((pcName: string, stateName: string): AssemblyFeature[] => {
    if (!assemblyGeoJSON) return [];
    
    let normalizedPC = pcName.toUpperCase().trim();
    const normalizedState = removeDiacritics(normalizeStateName(stateName)).toUpperCase();
    
    const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;
    
    const mappingKey = `${normalizedPC}|${normalizedState}`;
    const mappedPC = PC_NAME_MAPPINGS[mappingKey];
    if (mappedPC) {
      normalizedPC = mappedPC;
    }
    
    return assemblyGeoJSON.features.filter((f): boolean => {
      const asmPC = (f.properties.PC_NAME ?? '').toUpperCase().trim();
      const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
      
      if (asmStateName !== asmState) return false;
      
      if (asmPC === normalizedPC) return true;
      
      // Check for SC/ST suffixes
      if (asmPC === normalizedPC + ' (SC)' || 
          asmPC === normalizedPC + ' (ST)' ||
          asmPC === normalizedPC + '(SC)' ||
          asmPC === normalizedPC + '(ST)') return true;
      
      // Check cleaned PC name
      const cleanAsmPC = asmPC.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (cleanAsmPC === normalizedPC) return true;
      
      // Check for prefix matching
      if (asmPC.startsWith(normalizedPC) || normalizedPC.startsWith(asmPC)) {
        const minLen = Math.min(asmPC.length, normalizedPC.length);
        if (minLen >= 10) return true;
      }
      
      return false;
    });
  }, [assemblyGeoJSON]);

  /**
   * Get assemblies for a district
   */
  const getAssembliesForDistrict = useCallback((districtName: string, stateName: string): AssemblyFeature[] => {
    if (!assemblyGeoJSON) return [];
    
    let normalizedDist = districtName.toUpperCase().trim();
    const normalizedState = removeDiacritics(normalizeStateName(stateName)).toUpperCase().trim();
    
    const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;
    
    const mappingKey = `${normalizedDist}|${normalizedState}`;
    const mappedDist = DISTRICT_NAME_MAPPINGS[mappingKey];
    if (mappedDist) {
      normalizedDist = mappedDist;
    }
    
    return assemblyGeoJSON.features.filter((f): boolean => {
      const asmDistRaw = (f.properties.DIST_NAME ?? '').toUpperCase();
      const asmDist = asmDistRaw.replace(/[^A-Z]/g, '');
      const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
      
      if (asmStateName !== asmState) return false;
      
      const cleanDist = normalizedDist.replace(/[^A-Z]/g, '');
      return asmDist === cleanDist;
    });
  }, [assemblyGeoJSON]);

  /**
   * Load district data for a state
   */
  const loadDistrictsForState = useCallback(async (stateName: string): Promise<DistrictsGeoJSON | null> => {
    const fileName = getStateFileName(stateName);
    console.log(`Loading districts for ${stateName} from states/${fileName}.geojson`);
    
    setLoading(true);
    
    try {
      let data: DistrictsGeoJSON | null = null;
      
      if (districtsCacheRef.current[fileName]) {
        data = districtsCacheRef.current[fileName]!;
      } else {
        data = await getFromDB(`districts_${fileName}`) as DistrictsGeoJSON | null;
        if (data) {
          districtsCacheRef.current[fileName] = data;
        }
      }
      
      if (!data) {
        const response = await fetch(`states/${fileName}.geojson`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json() as DistrictsGeoJSON;
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

  /**
   * Navigate to a state (constituencies view)
   */
  const navigateToState = useCallback(async (stateName: string): Promise<ConstituenciesGeoJSON | DistrictsGeoJSON | null> => {
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

  /**
   * Navigate to a parliamentary constituency (assembly view)
   */
  const navigateToPC = useCallback(async (pcName: string, stateName: string): Promise<AssembliesGeoJSON> => {
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

  /**
   * Navigate to a district (assembly view)
   */
  const navigateToDistrict = useCallback(async (districtName: string, stateName: string): Promise<AssembliesGeoJSON> => {
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

  /**
   * Switch between districts and constituencies view
   */
  const switchView = useCallback((view: ViewMode): void => {
    if (!currentState) return;
    setCurrentView(view);
    setCurrentPC(null);
    setCurrentDistrict(null);
  }, [currentState]);

  /**
   * Reset to India view
   */
  const resetView = useCallback((): void => {
    setCurrentState(null);
    setCurrentView('constituencies');
    setCurrentPC(null);
    setCurrentDistrict(null);
  }, []);

  /**
   * Go back to state from PC/district
   */
  const goBackToState = useCallback((): void => {
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

