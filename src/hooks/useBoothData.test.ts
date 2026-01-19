import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBoothData } from './useBoothData';
import type { BoothList, BoothResults } from './useBoothData';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample test data
const mockBoothList: BoothList = {
  acId: 'TN-001',
  acName: 'GUMMIDIPUNDI',
  state: 'Tamil Nadu',
  totalBooths: 3,
  lastUpdated: '2021-04-06',
  source: 'Tamil Nadu CEO',
  booths: [
    {
      id: 'TN-001-1',
      boothNo: '1',
      num: 1,
      type: 'regular',
      name: 'Panchayat Union Primary School',
      address: 'Panchayat Union Primary School, Egumadurai',
      area: 'Egumadurai',
    },
    {
      id: 'TN-001-2',
      boothNo: '2',
      num: 2,
      type: 'women',
      name: 'Government High School',
      address: 'Government High School, Naidu Kuppam',
      area: 'Naidu Kuppam',
    },
  ],
};

const mockBoothResults: BoothResults = {
  acId: 'TN-001',
  acName: 'GUMMIDIPUNDI',
  year: 2021,
  electionType: 'assembly',
  date: '2021-04-06',
  totalBooths: 2,
  source: 'ECI',
  candidates: [
    { slNo: 1, name: 'Candidate A', party: 'DMK', symbol: '' },
    { slNo: 2, name: 'Candidate B', party: 'AIADMK', symbol: '' },
    { slNo: 3, name: 'NOTA', party: 'NOTA', symbol: '' },
  ],
  results: {
    'TN-001-1': { votes: [500, 300, 10], total: 810, rejected: 5 },
    'TN-001-2': { votes: [400, 350, 15], total: 765, rejected: 3 },
  },
  summary: {
    totalVoters: 2000,
    totalVotes: 1575,
    turnoutPercent: 78.75,
    winner: { name: 'Candidate A', party: 'DMK', votes: 900 },
    runnerUp: { name: 'Candidate B', party: 'AIADMK', votes: 650 },
    margin: 250,
    marginPercent: 15.87,
  },
};

describe('useBoothData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('returns initial empty state', () => {
      const { result } = renderHook(() => useBoothData());
      expect(result.current.boothList).toBeNull();
      expect(result.current.boothResults).toBeNull();
      expect(result.current.boothsWithResults).toEqual([]);
      expect(result.current.availableYears).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loadBoothData', () => {
    it('loads booth list successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBoothList) })
        .mockResolvedValue({ ok: false });

      const { result } = renderHook(() => useBoothData());

      await act(async () => {
        await result.current.loadBoothData('TN', 'TN-001');
      });

      expect(result.current.boothList).toEqual(mockBoothList);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('handles fetch error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { result } = renderHook(() => useBoothData());

      await act(async () => {
        await result.current.loadBoothData('TN', 'TN-999');
      });

      expect(result.current.boothList).toBeNull();
      expect(result.current.error).toBe('Booth data not available for TN-999');
    });
  });

  describe('loadBoothResults', () => {
    it('loads booth results successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBoothResults),
      });

      const { result } = renderHook(() => useBoothData());

      await act(async () => {
        await result.current.loadBoothResults('TN', 'TN-001', 2021);
      });

      expect(result.current.boothResults).toEqual(mockBoothResults);
      expect(result.current.error).toBeNull();
    });

    it('handles missing year data', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { result } = renderHook(() => useBoothData());

      await act(async () => {
        await result.current.loadBoothResults('TN', 'TN-001', 2019);
      });

      expect(result.current.boothResults).toBeNull();
      expect(result.current.error).toBe('Results not available for 2019');
    });
  });

  describe('boothsWithResults', () => {
    it('merges booth list with results', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBoothList) })
        .mockResolvedValue({ ok: false });

      const { result } = renderHook(() => useBoothData());

      await act(async () => {
        await result.current.loadBoothData('TN', 'TN-001');
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBoothResults),
      });

      await act(async () => {
        await result.current.loadBoothResults('TN', 'TN-001', 2021);
      });

      const booths = result.current.boothsWithResults;
      expect(booths).toHaveLength(2);
      expect(booths[0].id).toBe('TN-001-1');
      expect(booths[0].name).toBe('Panchayat Union Primary School');
      expect(booths[0].winner?.party).toBe('DMK');
    });

    it('creates placeholder for booths not in list', async () => {
      const resultsWithExtraBooth: BoothResults = {
        ...mockBoothResults,
        results: {
          ...mockBoothResults.results,
          'TN-001-99': { votes: [200, 150, 5], total: 355, rejected: 2 },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(resultsWithExtraBooth),
      });

      const { result } = renderHook(() => useBoothData());

      await act(async () => {
        await result.current.loadBoothResults('TN', 'TN-001', 2021);
      });

      const booths = result.current.boothsWithResults;
      const extraBooth = booths.find((b) => b.id === 'TN-001-99');
      expect(extraBooth?.boothNo).toBe('99');
      expect(extraBooth?.name).toContain('Polling Station 99');
    });

    it('sorts booths by number', async () => {
      const unorderedResults: BoothResults = {
        ...mockBoothResults,
        results: {
          'TN-001-2': { votes: [400, 350, 15], total: 765, rejected: 3 },
          'TN-001-1': { votes: [500, 300, 10], total: 810, rejected: 5 },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unorderedResults),
      });

      const { result } = renderHook(() => useBoothData());

      await act(async () => {
        await result.current.loadBoothResults('TN', 'TN-001', 2021);
      });

      const booths = result.current.boothsWithResults;
      expect(booths[0].num).toBe(1);
      expect(booths[1].num).toBe(2);
    });
  });
});
