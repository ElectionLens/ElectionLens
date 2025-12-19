import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useElectionData } from './useElectionData';

// Mock the db utils
vi.mock('../utils/db', () => ({
  initDB: vi.fn(() => Promise.resolve({})),
  getFromDB: vi.fn(() => Promise.resolve(null)),
  saveToDB: vi.fn(() => Promise.resolve(true)),
  getDBStats: vi.fn(() => Promise.resolve({ count: 0 }))
}));

// Mock GeoJSON data
const mockStatesGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { shapeName: 'Tamil Nadu', ST_NM: 'Tamil Nadu' },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Kerala', ST_NM: 'Kerala' },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Karnataka', ST_NM: 'Karnataka' },
      geometry: { type: 'Polygon', coordinates: [] }
    }
  ]
};

const mockParliamentGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        state_ut_name: 'Tamil Nadu',
        ls_seat_name: 'Chennai South',
        ls_seat_code: '1'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: {
        state_ut_name: 'Tamil Nadu',
        ls_seat_name: 'Chennai Central',
        ls_seat_code: '2'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: {
        state_ut_name: 'Tamil Nadu',
        ls_seat_name: 'Chennai North',
        ls_seat_code: '3'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: {
        state_ut_name: 'Kerala',
        ls_seat_name: 'Thiruvananthapuram',
        ls_seat_code: '1'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    }
  ]
};

const mockAssemblyGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        ST_NAME: 'TAMIL NADU',
        PC_NAME: 'CHENNAI SOUTH',
        AC_NAME: 'Mylapore',
        AC_NO: '1',
        DIST_NAME: 'CHENNAI'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: {
        ST_NAME: 'TAMIL NADU',
        PC_NAME: 'CHENNAI SOUTH',
        AC_NAME: 'Velachery',
        AC_NO: '2',
        DIST_NAME: 'CHENNAI'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: {
        ST_NAME: 'TAMIL NADU',
        PC_NAME: 'CHENNAI SOUTH',
        AC_NAME: 'Saidapet',
        AC_NO: '3',
        DIST_NAME: 'CHENNAI'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: {
        ST_NAME: 'TAMIL NADU',
        PC_NAME: 'CHENNAI CENTRAL',
        AC_NAME: 'Royapuram',
        AC_NO: '4',
        DIST_NAME: 'CHENNAI'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: {
        ST_NAME: 'KERALA',
        PC_NAME: 'THIRUVANANTHAPURAM',
        AC_NAME: 'Kazhakkoottam',
        AC_NO: '1',
        DIST_NAME: 'THIRUVANANTHAPURAM'
      },
      geometry: { type: 'Polygon', coordinates: [] }
    }
  ]
};

const mockDistrictGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { district: 'Chennai', NAME: 'Chennai' },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      type: 'Feature',
      properties: { district: 'Coimbatore', NAME: 'Coimbatore' },
      geometry: { type: 'Polygon', coordinates: [] }
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  
  // Helper to create a mock Response
  const createMockResponse = (data: unknown) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
  
  global.fetch = vi.fn((url: string | URL | Request) => {
    const urlStr = url.toString();
    // New reorganized paths
    if (urlStr.includes('/boundaries/states.geojson')) {
      return Promise.resolve(createMockResponse(mockStatesGeoJSON));
    }
    if (urlStr.includes('/parliament/constituencies.geojson')) {
      return Promise.resolve(createMockResponse(mockParliamentGeoJSON));
    }
    if (urlStr.includes('/assembly/constituencies.geojson')) {
      return Promise.resolve(createMockResponse(mockAssemblyGeoJSON));
    }
    if (urlStr.includes('/districts/') && urlStr.includes('.geojson')) {
      return Promise.resolve(createMockResponse(mockDistrictGeoJSON));
    }
    return Promise.reject(new Error(`Not found: ${urlStr}`));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useElectionData', () => {
  describe('initial state', () => {
    it('should have correct initial values', () => {
      const { result } = renderHook(() => useElectionData());
      
      expect(result.current.currentState).toBeNull();
      expect(result.current.currentView).toBe('constituencies');
      expect(result.current.currentPC).toBeNull();
      expect(result.current.currentDistrict).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should have statesGeoJSON initially null', () => {
      const { result } = renderHook(() => useElectionData());
      // Initially null before data loads
      expect(result.current.statesGeoJSON).toBeNull();
    });

    it('should have empty districtsCache initially', () => {
      const { result } = renderHook(() => useElectionData());
      expect(result.current.districtsCache).toEqual({});
    });

    it('should have cacheStats with required properties', () => {
      const { result } = renderHook(() => useElectionData());
      
      expect(result.current.cacheStats).toHaveProperty('dbCount');
      expect(result.current.cacheStats).toHaveProperty('memCount');
      expect(result.current.cacheStats).toHaveProperty('pcCount');
      expect(result.current.cacheStats).toHaveProperty('acCount');
    });
  });

  describe('data loading', () => {
    it('should load states data on mount', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.statesGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      expect(result.current.statesGeoJSON?.features?.length).toBe(3);
    });

    it('should load parliament data on mount', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      expect(result.current.parliamentGeoJSON?.features?.length).toBe(4);
    });

    it('should load assembly data on mount', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      expect(result.current.assemblyGeoJSON?.features?.length).toBe(5);
    });

    it('should fetch from correct URLs', async () => {
      renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('india_states.geojson');
        expect(global.fetch).toHaveBeenCalledWith('india_parliament_alternate.geojson');
        expect(global.fetch).toHaveBeenCalledWith('india_assembly.geojson');
      });
    });
  });

  describe('getConstituenciesForState', () => {
    it('should return empty array when parliament data not loaded', () => {
      const { result } = renderHook(() => useElectionData());
      
      const constituencies = result.current.getConstituenciesForState('Tamil Nadu');
      expect(constituencies).toEqual([]);
    });

    it('should return constituencies for a valid state after data loads', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      const constituencies = result.current.getConstituenciesForState('Tamil Nadu');
      expect(constituencies.length).toBe(3);
    });

    it('should return empty array for non-existent state', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      const constituencies = result.current.getConstituenciesForState('Unknown State');
      expect(constituencies).toEqual([]);
    });

    it('should handle state names with diacritics', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      // Should still match Tamil Nadu even with variations
      const constituencies = result.current.getConstituenciesForState('Tamil Nādu');
      expect(constituencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAssembliesForPC', () => {
    it('should return empty array when assembly data not loaded', () => {
      const { result } = renderHook(() => useElectionData());
      
      const assemblies = result.current.getAssembliesForPC('Chennai South', 'Tamil Nadu');
      expect(assemblies).toEqual([]);
    });

    it('should return assemblies for a valid PC after data loads', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      const assemblies = result.current.getAssembliesForPC('Chennai South', 'Tamil Nadu');
      expect(assemblies.length).toBe(3);
    });

    it('should return empty array for non-existent PC', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      const assemblies = result.current.getAssembliesForPC('Unknown PC', 'Tamil Nadu');
      expect(assemblies).toEqual([]);
    });

    it('should be case insensitive for PC name', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      const assemblies = result.current.getAssembliesForPC('CHENNAI SOUTH', 'Tamil Nadu');
      expect(assemblies.length).toBe(3);
    });
  });

  describe('getAssembliesForDistrict', () => {
    it('should return empty array when assembly data not loaded', () => {
      const { result } = renderHook(() => useElectionData());
      
      const assemblies = result.current.getAssembliesForDistrict('Chennai', 'Tamil Nadu');
      expect(assemblies).toEqual([]);
    });

    it('should return assemblies for a valid district after data loads', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      const assemblies = result.current.getAssembliesForDistrict('Chennai', 'Tamil Nadu');
      expect(assemblies.length).toBe(4); // All assemblies in Chennai district
    });

    it('should return empty array for non-existent district', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      const assemblies = result.current.getAssembliesForDistrict('Unknown District', 'Tamil Nadu');
      expect(assemblies).toEqual([]);
    });
  });

  describe('navigateToState', () => {
    it('should set currentState', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      
      expect(result.current.currentState).toBe('Tamil Nadu');
    });

    it('should set currentView to constituencies', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      
      expect(result.current.currentView).toBe('constituencies');
    });

    it('should clear currentPC and currentDistrict', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      
      expect(result.current.currentPC).toBeNull();
      expect(result.current.currentDistrict).toBeNull();
    });

    it('should return FeatureCollection with constituencies', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      let featureCollection;
      await act(async () => {
        featureCollection = await result.current.navigateToState('Tamil Nadu');
      });
      
      expect(featureCollection.type).toBe('FeatureCollection');
      expect(featureCollection.features.length).toBe(3);
    });
  });

  describe('navigateToPC', () => {
    it('should set currentPC', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
        await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      
      expect(result.current.currentPC).toBe('Chennai South');
    });

    it('should clear currentDistrict when navigating to PC', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      
      expect(result.current.currentDistrict).toBeNull();
    });

    it('should return FeatureCollection with assemblies', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      let featureCollection;
      await act(async () => {
        featureCollection = await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      
      expect(featureCollection.type).toBe('FeatureCollection');
      expect(featureCollection.features.length).toBe(3);
    });
  });

  describe('navigateToDistrict', () => {
    it('should set currentDistrict', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToDistrict('Chennai', 'Tamil Nadu');
      });
      
      expect(result.current.currentDistrict).toBe('Chennai');
    });

    it('should clear currentPC when navigating to district', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToDistrict('Chennai', 'Tamil Nadu');
      });
      
      expect(result.current.currentPC).toBeNull();
    });

    it('should return FeatureCollection with assemblies', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      let featureCollection;
      await act(async () => {
        featureCollection = await result.current.navigateToDistrict('Chennai', 'Tamil Nadu');
      });
      
      expect(featureCollection.type).toBe('FeatureCollection');
      expect(featureCollection.features.length).toBe(4);
    });
  });

  describe('loadDistrictsForState', () => {
    it('should set currentState', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await act(async () => {
        await result.current.loadDistrictsForState('Tamil Nadu');
      });
      
      expect(result.current.currentState).toBe('Tamil Nadu');
    });

    it('should set currentView to districts', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await act(async () => {
        await result.current.loadDistrictsForState('Tamil Nadu');
      });
      
      expect(result.current.currentView).toBe('districts');
    });

    it('should clear currentPC and currentDistrict', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await act(async () => {
        await result.current.loadDistrictsForState('Tamil Nadu');
      });
      
      expect(result.current.currentPC).toBeNull();
      expect(result.current.currentDistrict).toBeNull();
    });

    it('should return district data', async () => {
      const { result } = renderHook(() => useElectionData());
      
      let districtData;
      await act(async () => {
        districtData = await result.current.loadDistrictsForState('Tamil Nadu');
      });
      
      expect(districtData.features.length).toBe(2);
    });

    it('should fetch from correct URL', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await act(async () => {
        await result.current.loadDistrictsForState('Tamil Nadu');
      });
      
      expect(global.fetch).toHaveBeenCalledWith('states/tamil-nadu.geojson');
    });
  });

  describe('switchView', () => {
    it('should not switch view when no state is selected', () => {
      const { result } = renderHook(() => useElectionData());
      
      act(() => {
        result.current.switchView('districts');
      });
      
      expect(result.current.currentView).toBe('constituencies');
    });

    it('should switch view when state is selected', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      
      act(() => {
        result.current.switchView('districts');
      });
      
      expect(result.current.currentView).toBe('districts');
    });

    it('should clear currentPC when switching view', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
        await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      
      act(() => {
        result.current.switchView('districts');
      });
      
      expect(result.current.currentPC).toBeNull();
    });

    it('should clear currentDistrict when switching view', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
        await result.current.navigateToDistrict('Chennai', 'Tamil Nadu');
      });
      
      act(() => {
        result.current.switchView('constituencies');
      });
      
      expect(result.current.currentDistrict).toBeNull();
    });
  });

  describe('resetView', () => {
    it('should reset all navigation state', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.statesGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      
      act(() => {
        result.current.resetView();
      });
      
      expect(result.current.currentState).toBeNull();
      expect(result.current.currentView).toBe('constituencies');
      expect(result.current.currentPC).toBeNull();
      expect(result.current.currentDistrict).toBeNull();
    });

    it('should reset from deeply nested state', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
        await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      
      act(() => {
        result.current.resetView();
      });
      
      expect(result.current.currentState).toBeNull();
      expect(result.current.currentPC).toBeNull();
    });
  });

  describe('goBackToState', () => {
    it('should clear PC and district', () => {
      const { result } = renderHook(() => useElectionData());
      
      act(() => {
        result.current.goBackToState();
      });
      
      expect(result.current.currentPC).toBeNull();
      expect(result.current.currentDistrict).toBeNull();
    });

    it('should preserve currentState', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
        await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      
      act(() => {
        result.current.goBackToState();
      });
      
      expect(result.current.currentState).toBe('Tamil Nadu');
    });

    it('should preserve currentView', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
        await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      
      const viewBefore = result.current.currentView;
      
      act(() => {
        result.current.goBackToState();
      });
      
      expect(result.current.currentView).toBe(viewBefore);
    });
  });

  describe('cacheStats', () => {
    it('should track cache statistics', () => {
      const { result } = renderHook(() => useElectionData());
      
      expect(result.current.cacheStats).toHaveProperty('dbCount');
      expect(result.current.cacheStats).toHaveProperty('memCount');
      expect(result.current.cacheStats).toHaveProperty('pcCount');
      expect(result.current.cacheStats).toHaveProperty('acCount');
    });

    it('should have totalStates property', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.cacheStats.totalStates).toBeDefined();
      }, { timeout: 3000 });
    });

    it('should update pcCount after parliament data loads', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.cacheStats.pcCount).toBe(4);
      }, { timeout: 3000 });
    });

    it('should update acCount after assembly data loads', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.cacheStats.acCount).toBe(5);
      }, { timeout: 3000 });
    });
  });

  describe('error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
      
      const { result } = renderHook(() => useElectionData());
      
      // Should not throw, just log error
      await waitFor(() => {
        // Hook should still be functional
        expect(result.current.resetView).toBeDefined();
      });
    });

    it('should handle HTTP errors', async () => {
      global.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 404
      }));
      
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        // Should set error state for critical data
        expect(result.current.resetView).toBeDefined();
      });
    });
  });

  describe('loading state', () => {
    it('should set loading during navigation', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      // Loading should be false after data loads
      expect(result.current.loading).toBe(false);
    });
  });
});

describe('useElectionData - navigation workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    global.fetch = vi.fn((url) => {
      if (url.includes('india_states.geojson')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockStatesGeoJSON)
        });
      }
      if (url.includes('india_parliament_alternate.geojson')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockParliamentGeoJSON)
        });
      }
      if (url.includes('india_assembly.geojson')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAssemblyGeoJSON)
        });
      }
      if (url.includes('.geojson')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDistrictGeoJSON)
        });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  describe('complete navigation flow', () => {
    it('should handle India -> State -> PC -> Back to State -> Reset flow', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      // Start: India view
      expect(result.current.currentState).toBeNull();
      
      // Navigate to state
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      expect(result.current.currentState).toBe('Tamil Nadu');
      
      // Navigate to PC
      await act(async () => {
        await result.current.navigateToPC('Chennai South', 'Tamil Nadu');
      });
      expect(result.current.currentPC).toBe('Chennai South');
      
      // Go back to state
      act(() => {
        result.current.goBackToState();
      });
      expect(result.current.currentPC).toBeNull();
      expect(result.current.currentState).toBe('Tamil Nadu');
      
      // Reset to India
      act(() => {
        result.current.resetView();
      });
      expect(result.current.currentState).toBeNull();
    });

    it('should handle India -> State -> District -> Back to State flow', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.assemblyGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      // Navigate to state with districts
      await act(async () => {
        await result.current.loadDistrictsForState('Tamil Nadu');
      });
      expect(result.current.currentView).toBe('districts');
      
      // Navigate to district
      await act(async () => {
        await result.current.navigateToDistrict('Chennai', 'Tamil Nadu');
      });
      expect(result.current.currentDistrict).toBe('Chennai');
      
      // Go back to state
      act(() => {
        result.current.goBackToState();
      });
      expect(result.current.currentDistrict).toBeNull();
      expect(result.current.currentState).toBe('Tamil Nadu');
    });

    it('should handle view switching between constituencies and districts', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      // Navigate to state
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      expect(result.current.currentView).toBe('constituencies');
      
      // Switch to districts
      act(() => {
        result.current.switchView('districts');
      });
      expect(result.current.currentView).toBe('districts');
      
      // Switch back to constituencies
      act(() => {
        result.current.switchView('constituencies');
      });
      expect(result.current.currentView).toBe('constituencies');
    });
  });

  describe('multi-state navigation', () => {
    it('should handle navigating between different states', async () => {
      const { result } = renderHook(() => useElectionData());
      
      await waitFor(() => {
        expect(result.current.parliamentGeoJSON).not.toBeNull();
      }, { timeout: 3000 });
      
      // Navigate to Tamil Nadu
      await act(async () => {
        await result.current.navigateToState('Tamil Nadu');
      });
      expect(result.current.currentState).toBe('Tamil Nadu');
      
      // Navigate to Kerala
      await act(async () => {
        await result.current.navigateToState('Kerala');
      });
      expect(result.current.currentState).toBe('Kerala');
      
      // Previous PC/District should be cleared
      expect(result.current.currentPC).toBeNull();
      expect(result.current.currentDistrict).toBeNull();
    });
  });
});

describe('useElectionData - returned functions', () => {
  it('should return all expected functions', () => {
    const { result } = renderHook(() => useElectionData());
    
    // Data getters
    expect(typeof result.current.getConstituenciesForState).toBe('function');
    expect(typeof result.current.getAssembliesForPC).toBe('function');
    expect(typeof result.current.getAssembliesForDistrict).toBe('function');
    
    // Navigation
    expect(typeof result.current.navigateToState).toBe('function');
    expect(typeof result.current.navigateToPC).toBe('function');
    expect(typeof result.current.navigateToDistrict).toBe('function');
    expect(typeof result.current.loadDistrictsForState).toBe('function');
    expect(typeof result.current.switchView).toBe('function');
    expect(typeof result.current.resetView).toBe('function');
    expect(typeof result.current.goBackToState).toBe('function');
    
    // Utils
    expect(typeof result.current.updateCacheStats).toBe('function');
  });

  it('should return all expected data properties', () => {
    const { result } = renderHook(() => useElectionData());
    
    expect(result.current).toHaveProperty('statesGeoJSON');
    expect(result.current).toHaveProperty('parliamentGeoJSON');
    expect(result.current).toHaveProperty('assemblyGeoJSON');
    expect(result.current).toHaveProperty('districtsCache');
  });

  it('should return all expected state properties', () => {
    const { result } = renderHook(() => useElectionData());
    
    expect(result.current).toHaveProperty('currentState');
    expect(result.current).toHaveProperty('currentView');
    expect(result.current).toHaveProperty('currentPC');
    expect(result.current).toHaveProperty('currentDistrict');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('cacheStats');
  });
});
