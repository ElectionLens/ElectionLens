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
