import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSchema } from './useSchema';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockSchema = {
  version: '1.0.0',
  lastUpdated: '2024-01-01',
  sources: { geo: 'test', elections: 'test' },
  states: {
    TN: {
      id: 'TN',
      name: 'Tamil Nadu',
      aliases: ['tamil nadu', 'TAMIL NADU'],
      isoCode: 'IN-TN',
      censusCode: '33',
      type: 'state',
      loksabhaSeats: 39,
      assemblySeats: 234,
      delimitation: 2008,
      elections: { assembly: [2021], parliament: [2024] },
    },
  },
  parliamentaryConstituencies: {
    'TN-01': {
      id: 'TN-01',
      stateId: 'TN',
      pcNo: 1,
      name: 'Chennai North',
      aliases: ['chennai north'],
      type: 'GEN',
      assemblyIds: ['TN-001', 'TN-002'],
      delimitation: 2008,
    },
  },
  assemblyConstituencies: {
    'TN-001': {
      id: 'TN-001',
      stateId: 'TN',
      pcId: 'TN-01',
      districtId: 'TN-D01',
      acNo: 1,
      name: 'Anna Nagar',
      aliases: ['anna nagar'],
      type: 'GEN',
      delimitation: 2008,
    },
    'TN-002': {
      id: 'TN-002',
      stateId: 'TN',
      pcId: 'TN-01',
      districtId: 'TN-D01',
      acNo: 2,
      name: 'Villivakkam (SC)',
      aliases: ['villivakkam (sc)', 'villivakkam'],
      type: 'SC',
      delimitation: 2008,
    },
  },
  districts: {
    'TN-D01': {
      id: 'TN-D01',
      stateId: 'TN',
      censusCode: '602',
      name: 'Chennai',
      aliases: ['chennai'],
      assemblyIds: ['TN-001', 'TN-002'],
    },
  },
  indices: {
    stateByName: { 'tamil nadu': 'TN' },
    pcByName: { 'chennai north|TN': 'TN-01' },
    acByName: {
      'anna nagar|TN': 'TN-001',
      'villivakkam sc|TN': 'TN-002', // parentheses removed by normalization
      'villivakkam|TN': 'TN-002',
    },
    districtByName: { 'chennai|TN': 'TN-D01' },
  },
};

describe('useSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads schema on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSchema,
    });

    const { result } = renderHook(() => useSchema());

    expect(result.current.loading).toBe(true);
    expect(result.current.isReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useSchema());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toContain('404');
  });

  describe('entity lookups', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSchema,
      });
    });

    it('gets state by ID', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      const state = result.current.getState('TN');
      expect(state?.name).toBe('Tamil Nadu');
    });

    it('gets PC by ID', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      const pc = result.current.getPC('TN-01');
      expect(pc?.name).toBe('Chennai North');
    });

    it('gets AC by ID', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      const ac = result.current.getAC('TN-001');
      expect(ac?.name).toBe('Anna Nagar');
    });

    it('returns null for unknown ID', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.getState('XX')).toBeNull();
      expect(result.current.getPC('XX-99')).toBeNull();
      expect(result.current.getAC('XX-999')).toBeNull();
    });
  });

  describe('name resolution', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSchema,
      });
    });

    it('resolves state name to ID', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.resolveStateName('Tamil Nadu')).toBe('TN');
      expect(result.current.resolveStateName('tamil nadu')).toBe('TN');
      expect(result.current.resolveStateName('TAMIL NADU')).toBe('TN');
    });

    it('resolves PC name to ID', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.resolvePCName('Chennai North', 'TN')).toBe('TN-01');
    });

    it('resolves AC name with reservation suffix', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      // With suffix
      expect(result.current.resolveACName('Villivakkam (SC)', 'TN')).toBe('TN-002');
      // Without suffix (fallback)
      expect(result.current.resolveACName('Villivakkam', 'TN')).toBe('TN-002');
    });

    it('returns null for unknown names', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.resolveStateName('Unknown State')).toBeNull();
      expect(result.current.resolvePCName('Unknown PC', 'TN')).toBeNull();
      expect(result.current.resolveACName('Unknown AC', 'TN')).toBeNull();
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSchema,
      });
    });

    it('gets state by name', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      const state = result.current.getStateByName('Tamil Nadu');
      expect(state?.id).toBe('TN');
    });

    it('gets AC by name with state context', async () => {
      const { result } = renderHook(() => useSchema());
      await waitFor(() => expect(result.current.isReady).toBe(true));

      const ac = result.current.getACByName('Anna Nagar', 'TN');
      expect(ac?.id).toBe('TN-001');
      expect(ac?.type).toBe('GEN');
    });
  });
});
