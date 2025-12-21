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
});
