import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSelectLocation } from './useSelectLocation';
import type { UseSelectLocationParams } from './useSelectLocation';
import type { AssemblyFeature } from '../types';

vi.mock('../utils/firebase', () => ({
  trackConstituencySelect: vi.fn(),
}));

import { trackConstituencySelect } from '../utils/firebase';

function makeParams(overrides: Partial<UseSelectLocationParams> = {}): UseSelectLocationParams {
  return {
    navigateToState: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
    navigateToPC: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
    navigateToDistrict: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
    navigateToAssemblies: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
    selectAssembly: vi.fn(),
    clearElectionResult: vi.fn(),
    clearPCElectionResult: vi.fn(),
    getACResult: vi.fn().mockResolvedValue(null),
    getPCResult: vi.fn().mockResolvedValue(null),
    loadStateIndex: vi.fn().mockResolvedValue(null),
    loadPCStateIndex: vi.fn().mockResolvedValue({ availableYears: [2019, 2024] }),
    setPCSelectedYear: vi.fn(),
    setSelectedACPCYear: vi.fn(),
    setCurrentData: vi.fn(),
    setParliamentContributions: vi.fn(),
    loadAllParliamentContributions: vi.fn().mockResolvedValue(undefined),
    getAC: vi.fn().mockReturnValue({ name: 'Canonical AC' }),
    resolveACName: vi.fn().mockReturnValue('TN-001'),
    getStateIdFromName: vi.fn().mockReturnValue('TN'),
    closeSidebarAfterAction: vi.fn(),
    currentState: 'Tamil Nadu',
    currentPC: null,
    selectedYear: 2021,
    selectedACPCYear: null,
    pcSelectedYear: 2024,
    updateUrlRef: { current: vi.fn() },
    ...overrides,
  };
}

function acFeature(props: Partial<AssemblyFeature['properties']> = {}): AssemblyFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [] },
    properties: { AC_NAME: 'Bargur', ST_NAME: 'TAMIL NADU', ...props },
  } as AssemblyFeature;
}

describe('useSelectLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('state selection', () => {
    it('clears both result panels, so a stale AC/PC panel cannot survive the move', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({ level: 'state', stateName: 'Kerala' });
      });

      expect(params.clearElectionResult).toHaveBeenCalled();
      expect(params.clearPCElectionResult).toHaveBeenCalled();
      expect(params.navigateToState).toHaveBeenCalledWith('Kerala');
    });

    it('repairs an out-of-range PC year so the map is never left uncoloured', async () => {
      // The old search path skipped this entirely, which is why arriving at a
      // state via search could render an uncoloured choropleth.
      const params = makeParams({
        pcSelectedYear: 1997, // not in availableYears
        loadPCStateIndex: vi.fn().mockResolvedValue({ availableYears: [2019, 2024] }),
      });
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({ level: 'state', stateName: 'Kerala' });
      });

      expect(params.setPCSelectedYear).toHaveBeenCalledWith(2024);
      expect(params.updateUrlRef.current).toHaveBeenCalled();
    });

    it('keeps a valid PC year rather than gratuitously resetting it', async () => {
      const params = makeParams({ pcSelectedYear: 2019 });
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({ level: 'state', stateName: 'Kerala' });
      });

      expect(params.setPCSelectedYear).not.toHaveBeenCalled();
    });
  });

  describe('pc selection', () => {
    it('clears the stale assembly selection and AC panel', async () => {
      // Regression: the search path did neither, leaving a previously selected
      // AC highlighted and its panel open under a different PC.
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({
          level: 'pc',
          stateName: 'Tamil Nadu',
          pcName: 'Krishnagiri',
        });
      });

      expect(params.selectAssembly).toHaveBeenCalledWith(null);
      expect(params.clearElectionResult).toHaveBeenCalled();
    });

    it('loads the PC result, which the search path used to skip entirely', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({
          level: 'pc',
          stateName: 'Tamil Nadu',
          pcName: 'Krishnagiri',
        });
      });

      expect(params.getPCResult).toHaveBeenCalledWith('Krishnagiri', 'Tamil Nadu', 2024);
    });
  });

  describe('district selection', () => {
    it('clears the assembly selection', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({
          level: 'district',
          stateName: 'Tamil Nadu',
          districtName: 'Krishnagiri',
        });
      });

      expect(params.selectAssembly).toHaveBeenCalledWith(null);
    });
  });

  describe('assembly selection', () => {
    it('selects the AC and loads its result with schema hints', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({
          level: 'assembly',
          stateName: 'Tamil Nadu',
          acName: 'Bargur',
          feature: acFeature({ schemaId: 'TN-052' }),
        });
      });

      expect(params.selectAssembly).toHaveBeenCalledWith('Bargur');
      expect(params.getACResult).toHaveBeenCalledWith(
        'Bargur',
        'Tamil Nadu',
        expect.anything(),
        expect.objectContaining({ schemaId: 'TN-052', canonicalName: 'Canonical AC' })
      );
    });

    it('does NOT swap in the statewide layer by default, preserving PC scoping', async () => {
      // A map click inside a PC shows only that PC's ACs. Loading the statewide
      // assembly layer here would silently widen the view and lose PC context.
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({
          level: 'assembly',
          stateName: 'Tamil Nadu',
          acName: 'Bargur',
          feature: acFeature(),
        });
      });

      expect(params.navigateToAssemblies).not.toHaveBeenCalled();
    });

    it('loads the statewide layer when the caller asks, as search must', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({
          level: 'assembly',
          stateName: 'Tamil Nadu',
          acName: 'Bargur',
          feature: acFeature(),
          ensureAssembliesView: true,
        });
      });

      expect(params.navigateToAssemblies).toHaveBeenCalledWith('Tamil Nadu');
    });

    it('falls back to resolving the schema id when the feature lacks one', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({
          level: 'assembly',
          stateName: 'Tamil Nadu',
          acName: 'Bargur',
          feature: acFeature(),
        });
      });

      expect(params.resolveACName).toHaveBeenCalledWith('Bargur', 'TN');
    });

    it('loads parliament contributions only when the feature carries a PC', async () => {
      const withPc = makeParams();
      const { result: a } = renderHook(() => useSelectLocation(withPc));
      await act(async () => {
        await a.current.selectLocation({
          level: 'assembly',
          stateName: 'Tamil Nadu',
          acName: 'Bargur',
          feature: acFeature({ PC_NAME: 'Krishnagiri' }),
        });
      });
      expect(withPc.loadAllParliamentContributions).toHaveBeenCalledWith(
        'Bargur',
        'Krishnagiri',
        'Tamil Nadu'
      );

      const withoutPc = makeParams();
      const { result: b } = renderHook(() => useSelectLocation(withoutPc));
      await act(async () => {
        await b.current.selectLocation({
          level: 'assembly',
          stateName: 'Tamil Nadu',
          acName: 'Bargur',
          feature: acFeature(),
        });
      });
      expect(withoutPc.loadAllParliamentContributions).not.toHaveBeenCalled();
    });
  });

  describe('analytics', () => {
    it('tracks each level with its own label', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation({ level: 'state', stateName: 'Kerala' });
      });
      expect(trackConstituencySelect).toHaveBeenCalledWith('state', 'Kerala');

      await act(async () => {
        await result.current.selectLocation({
          level: 'pc',
          stateName: 'Tamil Nadu',
          pcName: 'Krishnagiri',
        });
      });
      expect(trackConstituencySelect).toHaveBeenCalledWith('pc', 'Krishnagiri', 'Tamil Nadu');
    });

    it('stays silent for programmatic moves, so deep links do not look like clicks', async () => {
      const params = makeParams();
      const { result } = renderHook(() => useSelectLocation(params));

      await act(async () => {
        await result.current.selectLocation(
          { level: 'state', stateName: 'Kerala' },
          { track: false }
        );
      });

      expect(trackConstituencySelect).not.toHaveBeenCalled();
    });
  });

  it('always closes the mobile sidebar, whichever level was chosen', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useSelectLocation(params));

    await act(async () => {
      await result.current.selectLocation({ level: 'state', stateName: 'Kerala' });
      await result.current.selectLocation({
        level: 'assembly',
        stateName: 'Tamil Nadu',
        acName: 'Bargur',
        feature: acFeature(),
      });
    });

    expect(params.closeSidebarAfterAction).toHaveBeenCalledTimes(2);
  });
});
