import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useParliamentResults } from './useParliamentResults';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useParliamentResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useParliamentResults());

    expect(result.current.availableYears).toEqual([]);
    expect(result.current.selectedYear).toBeNull();
    expect(result.current.currentResult).toBeNull();
    expect(result.current.currentACContribution).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('provides hasPCElectionData function', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(typeof result.current.hasPCElectionData).toBe('function');
  });

  it('provides loadStateIndex function', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(typeof result.current.loadStateIndex).toBe('function');
  });

  it('provides getPCResult function', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(typeof result.current.getPCResult).toBe('function');
  });

  it('provides getACContribution function', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(typeof result.current.getACContribution).toBe('function');
  });

  it('provides setSelectedYear function', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(typeof result.current.setSelectedYear).toBe('function');
  });

  it('provides clearResult function', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(typeof result.current.clearResult).toBe('function');
  });

  it('updates selectedYear when setSelectedYear is called', () => {
    const { result } = renderHook(() => useParliamentResults());

    act(() => {
      result.current.setSelectedYear(2024);
    });

    expect(result.current.selectedYear).toBe(2024);
  });

  it('clears result when clearResult is called', () => {
    const { result } = renderHook(() => useParliamentResults());

    act(() => {
      result.current.clearResult();
    });

    expect(result.current.currentResult).toBeNull();
    expect(result.current.currentACContribution).toBeNull();
  });

  it('handles fetch errors gracefully in loadStateIndex', async () => {
    const { result } = renderHook(() => useParliamentResults());

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      const index = await result.current.loadStateIndex('Invalid State');
      expect(index).toBeNull();
    });

    expect(result.current.loading).toBe(false);
  });

  it('handles fetch errors gracefully in getPCResult', async () => {
    const { result } = renderHook(() => useParliamentResults());

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: [2024],
          state: 'Tamil Nadu',
          stateSlug: 'tamil-nadu',
        }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      const pcResult = await result.current.getPCResult('Salem', 'Tamil Nadu');
      expect(pcResult).toBeNull();
    });
  });
});

describe('useParliamentResults - State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('returns false for hasPCElectionData initially', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(result.current.hasPCElectionData('Tamil Nadu')).toBe(false);
  });

  it('can set and clear selected year', () => {
    const { result } = renderHook(() => useParliamentResults());

    act(() => {
      result.current.setSelectedYear(2019);
    });
    expect(result.current.selectedYear).toBe(2019);

    act(() => {
      result.current.setSelectedYear(2024);
    });
    expect(result.current.selectedYear).toBe(2024);
  });

  it('returns null error initially', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(result.current.error).toBeNull();
  });

  it('returns empty available years initially', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(result.current.availableYears).toEqual([]);
  });
});

describe('useParliamentResults - Loading State Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('loads state index successfully', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = {
      state: 'Tamil Nadu',
      stateSlug: 'tamil-nadu',
      availableYears: [2009, 2014, 2019, 2024],
      totalConstituencies: 39,
      lastUpdated: '2024-01-01',
      source: 'ECI',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockIndex,
    });

    await act(async () => {
      const index = await result.current.loadStateIndex('Tamil Nadu');
      expect(index).toEqual(mockIndex);
    });

    expect(result.current.availableYears).toEqual([2009, 2014, 2019, 2024]);
  });

  it('handles 404 response', async () => {
    const { result } = renderHook(() => useParliamentResults());

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await act(async () => {
      const index = await result.current.loadStateIndex('Unknown State');
      expect(index).toBeNull();
    });
  });

  it('handles diacritic state names', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = {
      state: 'Tamil Nadu',
      availableYears: [2024],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockIndex,
    });

    await act(async () => {
      const index = await result.current.loadStateIndex('Tamil Nādu');
      expect(index).not.toBeNull();
    });
  });
});

describe('useParliamentResults - getPCResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('loads PC result successfully', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = {
      state: 'Tamil Nadu',
      availableYears: [2024],
    };

    const mockResults = {
      SALEM: {
        pcName: 'SALEM',
        winner: { name: 'Test Candidate', party: 'DMK', votes: 500000 },
        candidates: [{ name: 'Test Candidate', party: 'DMK', votes: 500000 }],
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    await act(async () => {
      const pcResult = await result.current.getPCResult('Salem', 'Tamil Nadu', 2024);
      expect(pcResult).not.toBeNull();
    });

    expect(result.current.currentResult).not.toBeNull();
  });

  it('handles missing PC gracefully', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = { availableYears: [2024] };
    const mockResults = {};

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    await act(async () => {
      const pcResult = await result.current.getPCResult('NONEXISTENT', 'Tamil Nadu', 2024);
      expect(pcResult).toBeNull();
    });
  });

  it('uses latest year when no year specified', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = { availableYears: [2009, 2014, 2019, 2024] };
    const mockResults = {
      SALEM: {
        pcName: 'SALEM',
        winner: { name: 'Test', party: 'INC', votes: 400000 },
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    await act(async () => {
      await result.current.getPCResult('Salem', 'Tamil Nadu');
    });

    // Should load latest year (2024)
    expect(result.current.selectedYear).toBe(2024);
  });
});

describe('useParliamentResults - getACContribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('loads AC contribution successfully with acWiseResults', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = { availableYears: [2024] };
    const mockResults = {
      SALEM: {
        pcName: 'SALEM',
        candidates: [
          {
            name: 'Test Candidate',
            party: 'DMK',
            votes: 500000,
          },
        ],
        acWiseResults: {
          OMALUR: {
            acName: 'OMALUR',
            acNo: 1,
            electors: 100000,
            validVotes: 80000,
            turnout: 80.0,
            candidates: [{ name: 'Test Candidate', party: 'DMK', votes: 50000 }],
          },
        },
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    await act(async () => {
      const contribution = await result.current.getACContribution(
        'OMALUR',
        'Salem',
        'Tamil Nadu',
        2024
      );
      expect(contribution).not.toBeNull();
      expect(contribution?.acName).toBe('OMALUR');
    });
  });

  it('loads AC contribution from assemblyConstituencies list', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = { availableYears: [2024] };
    const mockResults = {
      SALEM: {
        pcName: 'SALEM',
        candidates: [{ name: 'Test Candidate', party: 'DMK', votes: 500000 }],
        assemblyConstituencies: ['OMALUR', 'METTUR', 'YERCAUD'],
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    await act(async () => {
      const contribution = await result.current.getACContribution(
        'OMALUR',
        'Salem',
        'Tamil Nadu',
        2024
      );
      // Should return a placeholder contribution since AC is in the list
      expect(contribution).not.toBeNull();
    });
  });

  it('returns null when AC is not part of PC', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = { availableYears: [2024] };
    const mockResults = {
      SALEM: {
        pcName: 'SALEM',
        candidates: [{ name: 'Test Candidate', party: 'DMK', votes: 500000 }],
        assemblyConstituencies: ['OMALUR', 'METTUR'],
      },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockIndex })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResults });

    await act(async () => {
      const contribution = await result.current.getACContribution(
        'NONEXISTENT',
        'Salem',
        'Tamil Nadu',
        2024
      );
      expect(contribution).toBeNull();
    });
  });

  it('returns null when PC result cannot be loaded', async () => {
    const { result } = renderHook(() => useParliamentResults());

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await act(async () => {
      const contribution = await result.current.getACContribution(
        'OMALUR',
        'Salem',
        'Unknown State',
        2024
      );
      expect(contribution).toBeNull();
    });
  });
});

describe('useParliamentResults - hasPCElectionData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('returns true after loading state index', async () => {
    const { result } = renderHook(() => useParliamentResults());

    const mockIndex = {
      state: 'Tamil Nadu',
      availableYears: [2024],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockIndex,
    });

    await act(async () => {
      await result.current.loadStateIndex('Tamil Nadu');
    });

    expect(result.current.hasPCElectionData('Tamil Nadu')).toBe(true);
  });

  it('returns false for unloaded states', () => {
    const { result } = renderHook(() => useParliamentResults());
    expect(result.current.hasPCElectionData('Unknown State')).toBe(false);
  });
});
