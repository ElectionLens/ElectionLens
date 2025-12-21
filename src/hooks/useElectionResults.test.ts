import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElectionResults } from './useElectionResults';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useElectionResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('initializes with null state', () => {
    const { result } = renderHook(() => useElectionResults());

    expect(result.current.currentResult).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.availableYears).toEqual([]);
  });

  it('provides loadStateIndex function', () => {
    const { result } = renderHook(() => useElectionResults());
    expect(typeof result.current.loadStateIndex).toBe('function');
  });

  it('provides getACResult function', () => {
    const { result } = renderHook(() => useElectionResults());
    expect(typeof result.current.getACResult).toBe('function');
  });

  it('provides clearResult function', () => {
    const { result } = renderHook(() => useElectionResults());
    expect(typeof result.current.clearResult).toBe('function');
  });

  it('clears result when clearResult is called', () => {
    const { result } = renderHook(() => useElectionResults());

    // Clear the result (should work even if nothing set)
    act(() => {
      result.current.clearResult();
    });

    expect(result.current.currentResult).toBeNull();
  });

  it('handles fetch errors gracefully', async () => {
    const { result } = renderHook(() => useElectionResults());

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      await result.current.loadStateIndex('Invalid State');
    });

    // Should not throw, error is logged
    expect(result.current.loading).toBe(false);
  });

  it('provides setSelectedYear function', () => {
    const { result } = renderHook(() => useElectionResults());
    expect(typeof result.current.setSelectedYear).toBe('function');
  });

  it('updates selectedYear when setSelectedYear is called', () => {
    const { result } = renderHook(() => useElectionResults());

    act(() => {
      result.current.setSelectedYear(2021);
    });

    expect(result.current.selectedYear).toBe(2021);
  });

  it('sets loading state appropriately', () => {
    const { result } = renderHook(() => useElectionResults());

    // Initial state should not be loading
    expect(result.current.loading).toBe(false);
  });

  it('returns empty available years initially', () => {
    const { result } = renderHook(() => useElectionResults());
    expect(result.current.availableYears).toEqual([]);
  });

  it('provides hasElectionData function', () => {
    const { result } = renderHook(() => useElectionResults());
    expect(typeof result.current.hasElectionData).toBe('function');
  });
});

describe('useElectionResults - state management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('can set and clear selected year', () => {
    const { result } = renderHook(() => useElectionResults());

    act(() => {
      result.current.setSelectedYear(2016);
    });
    expect(result.current.selectedYear).toBe(2016);

    act(() => {
      result.current.setSelectedYear(null);
    });
    expect(result.current.selectedYear).toBeNull();
  });

  it('returns null error initially', () => {
    const { result } = renderHook(() => useElectionResults());
    expect(result.current.error).toBeNull();
  });
});

describe('useElectionResults - loadStateIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('loads state index successfully', async () => {
    const mockIndex = {
      state: 'Tamil Nadu',
      availableYears: [2011, 2016, 2021],
      totalConstituencies: 234,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockIndex,
    });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.loadStateIndex('Tamil Nadu');
    });

    expect(result.current.availableYears).toEqual([2011, 2016, 2021]);
  });

  it('handles 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.loadStateIndex('Unknown State');
    });

    // Should not crash, years should be empty
    expect(result.current.availableYears).toEqual([]);
  });

  it('handles diacritic state names', async () => {
    const mockIndex = {
      state: 'Tamil Nadu',
      availableYears: [2021],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockIndex,
    });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.loadStateIndex('Tamil Nādu');
    });

    expect(result.current.availableYears).toEqual([2021]);
  });
});

describe('useElectionResults - getACResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('loads AC result with specific year', async () => {
    const mockIndex = { availableYears: [2016, 2021] };
    const mockResults = {
      OMALUR: {
        constituency: 'OMALUR',
        winner: { name: 'Test Candidate', party: 'DMK', votes: 50000 },
        candidates: [{ name: 'Test Candidate', party: 'DMK', votes: 50000 }],
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.getACResult('OMALUR', 'Tamil Nadu', 2021);
    });

    expect(result.current.currentResult).not.toBeNull();
    expect(result.current.currentResult?.constituency).toBe('OMALUR');
  });

  it('handles missing constituency gracefully', async () => {
    const mockIndex = { availableYears: [2021] };
    const mockResults = {};

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.getACResult('NONEXISTENT', 'Tamil Nadu', 2021);
    });

    expect(result.current.currentResult).toBeNull();
  });

  it('uses latest year when no year specified', async () => {
    const mockIndex = { availableYears: [2011, 2016, 2021] };
    const mockResults = {
      OMALUR: {
        constituency: 'OMALUR',
        winner: { name: 'Test', party: 'INC', votes: 40000 },
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.getACResult('OMALUR', 'Tamil Nadu');
    });

    // Should load latest year (2021)
    expect(result.current.selectedYear).toBe(2021);
  });
});

describe('useElectionResults - hasElectionData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('returns false for unknown state without loading', () => {
    const { result } = renderHook(() => useElectionResults());

    // Without loading, hasElectionData returns false
    expect(result.current.hasElectionData('Unknown State')).toBe(false);
  });

  it('returns true for state after successful loadStateIndex', async () => {
    const mockIndex = { availableYears: [2021] };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockIndex,
    });

    const { result } = renderHook(() => useElectionResults());

    // First load the state index
    await act(async () => {
      await result.current.loadStateIndex('Tamil Nadu');
    });

    // Now hasElectionData should return true
    expect(result.current.hasElectionData('Tamil Nadu')).toBe(true);
  });

  it('returns false for state after failed loadStateIndex', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.loadStateIndex('Unknown State');
    });

    expect(result.current.hasElectionData('Unknown State')).toBe(false);
  });
});
