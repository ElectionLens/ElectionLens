import { useState, useEffect, useCallback, useRef } from 'react';
import { initDB, getFromDB, saveToDB, getDBStats } from '../utils/db';
import { normalizeName, getStateFileName } from '../utils/helpers';
import {
  STATE_FILE_MAP,
  ASM_STATE_ALIASES,
  DISTRICT_NAME_MAPPINGS,
  PC_NAME_MAPPINGS,
  PC_STATE_ALIASES,
} from '../constants';
import { BOUNDARIES, PARLIAMENT, ASSEMBLY, DISTRICTS, CACHE_KEYS } from '../constants/paths';
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
  GeoJSONData,
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
    acCount: 0,
  });

  // Current navigation state
  const [currentState, setCurrentState] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('constituencies');
  const [currentPC, setCurrentPC] = useState<string | null>(null);
  const [currentDistrict, setCurrentDistrict] = useState<string | null>(null);
  const [currentAssembly, setCurrentAssembly] = useState<string | null>(null);

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
      acCount: assemblyGeoJSON?.features?.length ?? 0,
    });
  }, [parliamentGeoJSON, assemblyGeoJSON]);

  /**
   * Load states GeoJSON from cache or network
   */
  const loadStatesData = useCallback(async (): Promise<StatesGeoJSON | null> => {
    try {
      let data = (await getFromDB(CACHE_KEYS.STATES)) as StatesGeoJSON | null;

      if (!data) {
        const response = await fetch(BOUNDARIES.STATES);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = (await response.json()) as StatesGeoJSON;
        saveToDB(CACHE_KEYS.STATES, data);
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
      let data = (await getFromDB(CACHE_KEYS.PARLIAMENT)) as ConstituenciesGeoJSON | null;

      if (!data) {
        const response = await fetch(PARLIAMENT.CONSTITUENCIES);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawData = (await response.json()) as GeoJSONData | ConstituencyFeature[];

        let features: ConstituencyFeature[];
        if (Array.isArray(rawData)) {
          features = rawData.filter(
            (f): f is ConstituencyFeature =>
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
        saveToDB(CACHE_KEYS.PARLIAMENT, data);
      }

      setParliamentGeoJSON(data);
      return data;
    } catch (err) {
      console.error('Failed to load parliament data:', err);
      return null;
    }
  }, []);

  /**
   * Filter valid assembly features (remove pre-delimitation placeholders)
   */
  const filterValidAssemblyFeatures = (features: AssemblyFeature[]): AssemblyFeature[] => {
    return features.filter((f) => f.properties.AC_NAME && f.properties.AC_NAME.trim() !== '');
  };

  /**
   * Load assembly GeoJSON from cache or network
   */
  const loadAssemblyData = useCallback(async (): Promise<AssembliesGeoJSON | null> => {
    try {
      let data = (await getFromDB(CACHE_KEYS.ASSEMBLY)) as AssembliesGeoJSON | null;

      if (data) {
        // Filter cached data too (in case old cache has invalid features)
        const validFeatures = filterValidAssemblyFeatures(data.features);
        if (validFeatures.length !== data.features.length) {
          data = { type: 'FeatureCollection', features: validFeatures };
          // Update cache with filtered data
          saveToDB(CACHE_KEYS.ASSEMBLY, data);
        }
      } else {
        const response = await fetch(ASSEMBLY.CONSTITUENCIES);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawData = (await response.json()) as GeoJSONData | AssemblyFeature[];

        let features: AssemblyFeature[];
        if (Array.isArray(rawData)) {
          features = rawData.filter(
            (f): f is AssemblyFeature =>
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

        // Filter out pre-delimitation placeholders
        features = filterValidAssemblyFeatures(features);

        data = { type: 'FeatureCollection', features };
        saveToDB(CACHE_KEYS.ASSEMBLY, data);
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

      const cacheKey = CACHE_KEYS.getDistrictKey(fileName);
      const cached = (await getFromDB(cacheKey)) as DistrictsGeoJSON | null;
      if (cached) {
        districtsCacheRef.current[fileName] = cached;
        return true;
      }

      try {
        const response = await fetch(DISTRICTS.getPath(fileName));
        if (response.ok) {
          const data = (await response.json()) as DistrictsGeoJSON;
          districtsCacheRef.current[fileName] = data;
          saveToDB(cacheKey, data);
          return true;
        }
      } catch {
        // Silently fail for missing files
      }
      return false;
    });

    await Promise.all(loadPromises);
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
  const getConstituenciesForState = useCallback(
    (stateName: string): ConstituencyFeature[] => {
      if (!parliamentGeoJSON) return [];

      const normalized = normalizeName(stateName);

      return parliamentGeoJSON.features.filter((f): boolean => {
        let pcState = f.properties.state_ut_name ?? f.properties.STATE_NAME ?? '';
        const aliasedState = PC_STATE_ALIASES[pcState];
        if (aliasedState) {
          pcState = aliasedState;
        }
        return normalizeName(pcState) === normalized;
      });
    },
    [parliamentGeoJSON]
  );

  /**
   * Get assemblies for a parliamentary constituency
   */
  const getAssembliesForPC = useCallback(
    (pcName: string, stateName: string): AssemblyFeature[] => {
      if (!assemblyGeoJSON) return [];

      let normalizedPC = pcName.toUpperCase().trim();
      const normalizedState = normalizeName(stateName).toUpperCase();

      const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;

      const mappingKey = `${normalizedPC}|${normalizedState}`;
      const mappedPC = PC_NAME_MAPPINGS[mappingKey];
      if (mappedPC) {
        normalizedPC = mappedPC;
      }

      const result = assemblyGeoJSON.features.filter((f): boolean => {
        // Skip features without valid AC_NAME
        if (!f.properties.AC_NAME || f.properties.AC_NAME.trim() === '') return false;

        const asmPC = (f.properties.PC_NAME ?? '').toUpperCase().trim();
        const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();

        if (asmStateName !== asmState) return false;

        if (asmPC === normalizedPC) return true;

        // Check for SC/ST suffixes
        if (
          asmPC === normalizedPC + ' (SC)' ||
          asmPC === normalizedPC + ' (ST)' ||
          asmPC === normalizedPC + '(SC)' ||
          asmPC === normalizedPC + '(ST)'
        )
          return true;

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
      return result;
    },
    [assemblyGeoJSON]
  );

  /**
   * Get assemblies for a district
   */
  const getAssembliesForDistrict = useCallback(
    (districtName: string, stateName: string): AssemblyFeature[] => {
      if (!assemblyGeoJSON) return [];

      let normalizedDist = districtName.toUpperCase().trim();
      const normalizedState = normalizeName(stateName).toUpperCase().trim();

      const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;

      const mappingKey = `${normalizedDist}|${normalizedState}`;
      const mappedDist = DISTRICT_NAME_MAPPINGS[mappingKey];
      if (mappedDist) {
        normalizedDist = mappedDist;
      }

      return assemblyGeoJSON.features.filter((f): boolean => {
        // Skip features without valid AC_NAME
        if (!f.properties.AC_NAME || f.properties.AC_NAME.trim() === '') return false;

        const asmDistRaw = (f.properties.DIST_NAME ?? '').toUpperCase();
        const asmDist = asmDistRaw.replace(/[^A-Z]/g, '');
        const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();

        if (asmStateName !== asmState) return false;

        const cleanDist = normalizedDist.replace(/[^A-Z]/g, '');
        return asmDist === cleanDist;
      });
    },
    [assemblyGeoJSON]
  );

  /**
   * Get all assemblies for a state
   */
  const getAssembliesForState = useCallback(
    (stateName: string): AssemblyFeature[] => {
      if (!assemblyGeoJSON) return [];

      const normalizedState = normalizeName(stateName).toUpperCase().trim();
      const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;

      return assemblyGeoJSON.features.filter((f): boolean => {
        // Skip features without valid AC_NAME
        if (!f.properties.AC_NAME || f.properties.AC_NAME.trim() === '') return false;

        const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
        return asmStateName === asmState;
      });
    },
    [assemblyGeoJSON]
  );

  /**
   * Load district data for a state
   */
  const loadDistrictsForState = useCallback(
    async (stateName: string): Promise<DistrictsGeoJSON | null> => {
      const fileName = getStateFileName(stateName);
      const filePath = DISTRICTS.getPath(fileName);
      const cacheKey = CACHE_KEYS.getDistrictKey(fileName);
      setLoading(true);

      try {
        let data: DistrictsGeoJSON | null = null;

        if (districtsCacheRef.current[fileName]) {
          data = districtsCacheRef.current[fileName]!;
        } else {
          data = (await getFromDB(cacheKey)) as DistrictsGeoJSON | null;
          if (data) {
            districtsCacheRef.current[fileName] = data;
          }
        }

        if (!data) {
          const response = await fetch(filePath);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          data = (await response.json()) as DistrictsGeoJSON;
          districtsCacheRef.current[fileName] = data;
          saveToDB(cacheKey, data);
        }

        setDistrictsCache({ ...districtsCacheRef.current });
        setCurrentState(stateName);
        setCurrentView('districts');
        setCurrentPC(null);
        setCurrentDistrict(null);
        setCurrentAssembly(null);
        updateCacheStats();

        return data;
      } catch (err) {
        console.error('Failed to load districts:', err);
        setError(`Could not load districts for ${stateName}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [updateCacheStats]
  );

  /**
   * Navigate to a state (constituencies view)
   */
  const navigateToState = useCallback(
    async (stateName: string): Promise<ConstituenciesGeoJSON | DistrictsGeoJSON | null> => {
      setLoading(true);
      try {
        // Load parliament data and use returned value directly to avoid stale closure
        let parlData = parliamentGeoJSON;
        if (!parlData) {
          parlData = await loadParliamentData();
        }

        if (!parlData) {
          console.error('[navigateToState] Failed to load parliament data');
          return loadDistrictsForState(stateName);
        }

        // Filter constituencies using the fresh data
        const normalized = normalizeName(stateName);
        const constituencies = parlData.features.filter((f): boolean => {
          let pcState = f.properties.state_ut_name ?? f.properties.STATE_NAME ?? '';
          const aliasedState = PC_STATE_ALIASES[pcState];
          if (aliasedState) {
            pcState = aliasedState;
          }
          return normalizeName(pcState) === normalized;
        });

        if (constituencies.length === 0) {
          // Switch to districts view if no constituencies
          return loadDistrictsForState(stateName);
        }

        setCurrentState(stateName);
        setCurrentView('constituencies');
        setCurrentPC(null);
        setCurrentDistrict(null);
        setCurrentAssembly(null);

        return { type: 'FeatureCollection', features: constituencies };
      } finally {
        setLoading(false);
      }
    },
    [parliamentGeoJSON, loadParliamentData, loadDistrictsForState]
  );

  /**
   * Navigate to a parliamentary constituency (assembly view)
   */
  const navigateToPC = useCallback(
    async (pcName: string, stateName: string): Promise<AssembliesGeoJSON> => {
      setLoading(true);
      try {
        // Load assembly data and use returned value directly to avoid stale closure
        let asmData = assemblyGeoJSON;
        if (!asmData) {
          asmData = await loadAssemblyData();
        }

        if (!asmData) {
          console.error('[navigateToPC] Failed to load assembly data');
          return { type: 'FeatureCollection', features: [] };
        }

        // Filter assemblies using fresh data with SC/ST suffix matching
        let normalizedPC = normalizeName(pcName).toUpperCase().trim();
        const normalizedState = normalizeName(stateName).toUpperCase().trim();
        const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;

        // Check PC name mappings (for renamed constituencies)
        const mappingKey = `${normalizedPC}|${normalizedState}`;
        const mappedPC = PC_NAME_MAPPINGS[mappingKey];
        if (mappedPC) {
          normalizedPC = mappedPC;
        }

        const assemblies = asmData.features.filter((f) => {
          if (!f.properties.AC_NAME || f.properties.AC_NAME.trim() === '') return false;
          const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
          if (asmStateName !== asmState) return false;

          const asmPC = normalizeName(f.properties.PC_NAME ?? '')
            .toUpperCase()
            .trim();

          // Exact match
          if (asmPC === normalizedPC) return true;

          // Check for SC/ST suffixes (e.g., "KANCHEEPURAM (SC)")
          if (
            asmPC === normalizedPC + ' (SC)' ||
            asmPC === normalizedPC + ' (ST)' ||
            asmPC === normalizedPC + '(SC)' ||
            asmPC === normalizedPC + '(ST)'
          )
            return true;

          // Check cleaned PC name (remove suffixes)
          const cleanAsmPC = asmPC.replace(/\s*\([^)]*\)\s*$/, '').trim();
          if (cleanAsmPC === normalizedPC) return true;

          return false;
        });

        setCurrentState(stateName);
        setCurrentView('constituencies');
        setCurrentPC(pcName);
        setCurrentDistrict(null);
        // Don't clear assembly here - let the caller handle it

        return { type: 'FeatureCollection', features: assemblies };
      } finally {
        setLoading(false);
      }
    },
    [assemblyGeoJSON, loadAssemblyData]
  );

  /**
   * Navigate to a district (assembly view)
   */
  const navigateToDistrict = useCallback(
    async (districtName: string, stateName: string): Promise<AssembliesGeoJSON> => {
      setLoading(true);
      try {
        // Load assembly data and use returned value directly to avoid stale closure
        let asmData = assemblyGeoJSON;
        if (!asmData) {
          asmData = await loadAssemblyData();
        }

        if (!asmData) {
          return { type: 'FeatureCollection', features: [] };
        }

        // Filter assemblies using fresh data
        let normalizedDist = districtName.toUpperCase().trim();
        const normalizedState = normalizeName(stateName).toUpperCase().trim();
        const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;

        // Apply district name mappings
        const mappingKey = `${normalizedDist}|${normalizedState}`;
        const mappedDist = DISTRICT_NAME_MAPPINGS[mappingKey];
        if (mappedDist) {
          normalizedDist = mappedDist;
        }

        const assemblies = asmData.features.filter((f): boolean => {
          if (!f.properties.AC_NAME || f.properties.AC_NAME.trim() === '') return false;
          const asmDistRaw = (f.properties.DIST_NAME ?? '').toUpperCase();
          const asmDist = asmDistRaw.replace(/[^A-Z]/g, '');
          const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
          if (asmStateName !== asmState) return false;
          const cleanDist = normalizedDist.replace(/[^A-Z]/g, '');
          return asmDist === cleanDist;
        });

        setCurrentState(stateName);
        setCurrentView('districts');
        setCurrentDistrict(districtName);
        setCurrentPC(null);
        // Don't clear assembly here - let the caller handle it

        return { type: 'FeatureCollection', features: assemblies };
      } finally {
        setLoading(false);
      }
    },
    [assemblyGeoJSON, loadAssemblyData]
  );

  /**
   * Navigate to all assemblies view for a state
   */
  const navigateToAssemblies = useCallback(
    async (stateName: string): Promise<AssembliesGeoJSON> => {
      setLoading(true);
      try {
        // Load assembly data if not already loaded
        let asmData = assemblyGeoJSON;
        if (!asmData) {
          asmData = await loadAssemblyData();
        }

        if (!asmData) {
          return { type: 'FeatureCollection', features: [] };
        }

        // Get assemblies for this state using the loaded data directly
        const normalizedState = normalizeName(stateName).toUpperCase().trim();
        const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;

        const assemblies = asmData.features.filter((f): boolean => {
          if (!f.properties.AC_NAME || f.properties.AC_NAME.trim() === '') return false;
          const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
          return asmStateName === asmState;
        });

        setCurrentState(stateName);
        setCurrentView('assemblies');
        setCurrentPC(null);
        setCurrentDistrict(null);

        return { type: 'FeatureCollection', features: assemblies };
      } finally {
        setLoading(false);
      }
    },
    [assemblyGeoJSON, loadAssemblyData]
  );

  /**
   * Switch between districts, constituencies, and assemblies view
   */
  const switchView = useCallback(
    (view: ViewMode): void => {
      if (!currentState) return;
      setCurrentView(view);
      setCurrentPC(null);
      setCurrentDistrict(null);
      setCurrentAssembly(null);
    },
    [currentState]
  );

  /**
   * Reset to India view
   */
  const resetView = useCallback((): void => {
    setCurrentState(null);
    setCurrentView('constituencies');
    setCurrentPC(null);
    setCurrentDistrict(null);
    setCurrentAssembly(null);
  }, []);

  /**
   * Go back to state from PC/district
   */
  const goBackToState = useCallback((): void => {
    setCurrentPC(null);
    setCurrentDistrict(null);
    setCurrentAssembly(null);
  }, []);

  /**
   * Set current assembly (for deep linking)
   */
  const selectAssembly = useCallback((assemblyName: string | null): void => {
    setCurrentAssembly(assemblyName);
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
    currentAssembly,
    loading,
    error,
    cacheStats,

    // Data getters
    getConstituenciesForState,
    getAssembliesForPC,
    getAssembliesForDistrict,
    getAssembliesForState,

    // Navigation
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState,
    selectAssembly,

    // Utils
    updateCacheStats,
  };
}
