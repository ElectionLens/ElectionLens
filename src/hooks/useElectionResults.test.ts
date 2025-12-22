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

describe('useElectionResults - getACResult matching strategies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('matches AC using canonical key (case insensitive)', async () => {
    const mockIndex = { availableYears: [2021] };
    const mockResults = {
      'TIRUCHIRAPPALLI WEST': {
        constituency: 'TIRUCHIRAPPALLI WEST',
        winner: { name: 'Test', party: 'DMK', votes: 50000 },
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      // Query with different case
      await result.current.getACResult('tiruchirappalli west', 'Tamil Nadu', 2021);
    });

    expect(result.current.currentResult).not.toBeNull();
    expect(result.current.currentResult?.constituency).toBe('TIRUCHIRAPPALLI WEST');
  });

  it('matches AC with reservation suffix variations', async () => {
    const mockIndex = { availableYears: [2021] };
    const mockResults = {
      'TN-042': {
        constituencyName: 'GANGAVALLI (SC)',
        constituencyNameOriginal: 'GANGAVALLI (SC)',
        name: 'Gangavalli',
        year: 2021,
        constituencyNo: 42,
        constituencyType: 'SC',
        validVotes: 100000,
        candidates: [{ name: 'Test', party: 'INC', votes: 45000 }],
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      // Query without reservation suffix - should match by normalizing names
      await result.current.getACResult('GANGAVALLI', 'Tamil Nadu', 2021);
    });

    expect(result.current.currentResult).not.toBeNull();
  });

  it('falls back to closest year when requested year is not available', async () => {
    const mockIndex = { availableYears: [2011, 2016, 2021] };
    const mockResults = {
      OMALUR: {
        constituency: 'OMALUR',
        winner: { name: 'Test', party: 'DMK', votes: 50000 },
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    let res: unknown;
    await act(async () => {
      // Request 2020, which is not available - should fall back to 2021 (closest)
      res = await result.current.getACResult('OMALUR', 'Tamil Nadu', 2020);
    });

    expect(res).not.toBeNull();
    expect(result.current.selectedYear).toBe(2021); // Falls back to closest year
  });

  it('returns null when year results fail to load', async () => {
    const mockIndex = { availableYears: [2021] };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      const res = await result.current.getACResult('OMALUR', 'Tamil Nadu', 2021);
      expect(res).toBeNull();
    });
  });

  it('uses cached index on subsequent calls', async () => {
    const mockIndex = { availableYears: [2021] };
    const mockResults = {
      OMALUR: {
        constituency: 'OMALUR',
        winner: { name: 'Test', party: 'DMK', votes: 40000 },
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    // First call loads index
    await act(async () => {
      await result.current.getACResult('OMALUR', 'Tamil Nadu', 2021);
    });

    // Second call should use cached index
    await act(async () => {
      await result.current.getACResult('OMALUR', 'Tamil Nadu', 2021);
    });

    // Index should only be fetched once
    expect(mockFetch).toHaveBeenCalledTimes(2); // Once for index, once for results (cached on second call)
  });

  it('requires exact spelling match (no fuzzy matching)', async () => {
    const mockIndex = { availableYears: [2021] };
    const mockResults = {
      'TN-001': {
        constituencyName: 'TIRUCHIRAPALLI WEST',
        constituencyNameOriginal: 'TIRUCHIRAPALLI WEST',
        name: 'Tiruchirapalli West',
        year: 2021,
        constituencyNo: 1,
        constituencyType: 'GEN',
        validVotes: 100000,
        candidates: [{ name: 'Test', party: 'DMK', votes: 50000 }],
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      // Query with slightly different spelling (double L vs single L) - should NOT match
      // This validates that fuzzy matching has been removed in favor of schema ID lookups
      await result.current.getACResult('TIRUCHIRAPPALLI WEST', 'Tamil Nadu', 2021);
    });

    // Should NOT find match - fuzzy matching removed, use schema IDs for reliable lookups
    expect(result.current.currentResult).toBeNull();
  });

  it('matches AC with exact spelling via schema ID', async () => {
    const mockIndex = { availableYears: [2021] };
    const mockResults = {
      'TN-001': {
        constituencyName: 'TIRUCHIRAPALLI WEST',
        constituencyNameOriginal: 'TIRUCHIRAPALLI WEST',
        name: 'Tiruchirapalli West',
        year: 2021,
        constituencyNo: 1,
        constituencyType: 'GEN',
        validVotes: 100000,
        candidates: [{ name: 'Test', party: 'DMK', votes: 50000 }],
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      // Query with schema ID - should always match regardless of name spelling
      await result.current.getACResult('any-name', 'Tamil Nadu', 2021, { schemaId: 'TN-001' });
    });

    // Should find match via schema ID
    expect(result.current.currentResult).not.toBeNull();
    expect(result.current.currentResult?.constituencyName).toBe('TIRUCHIRAPALLI WEST');
  });
});

describe('useElectionResults - loadStateIndex caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('returns cached index on subsequent calls', async () => {
    const mockIndex = { availableYears: [2011, 2016, 2021] };

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });

    const { result } = renderHook(() => useElectionResults());

    // First call
    await act(async () => {
      await result.current.loadStateIndex('Tamil Nadu');
    });

    // Second call should use cache
    await act(async () => {
      await result.current.loadStateIndex('Tamil Nadu');
    });

    // Fetch should only be called once
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sets available years from cached index', async () => {
    const mockIndex = { availableYears: [2011, 2016, 2021] };

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });

    const { result } = renderHook(() => useElectionResults());

    await act(async () => {
      await result.current.loadStateIndex('Tamil Nadu');
    });

    expect(result.current.availableYears).toEqual([2011, 2016, 2021]);

    // Call again with cache
    await act(async () => {
      await result.current.loadStateIndex('Tamil Nadu');
    });

    // Should still have same years
    expect(result.current.availableYears).toEqual([2011, 2016, 2021]);
  });
});
