import { describe, it, expect } from 'vitest';
import {
  resolveAssemblyYearSelection,
  type AssemblyYearSelectionInput,
} from './assemblyYearSelection';

const base: AssemblyYearSelectionInput = {
  search: '',
  selectedACPCYear: null,
  selectedYear: null,
  currentPC: null,
  pcSelectedYear: null,
};

/** `undefined` means "leave selectedACPCYear alone", null means "turn it off". */
const LEAVE_ALONE = undefined;

describe('resolveAssemblyYearSelection', () => {
  describe('already in PC-contribution mode', () => {
    it('keeps the mode and reuses the current assembly year', () => {
      expect(
        resolveAssemblyYearSelection({ ...base, selectedACPCYear: 2024, selectedYear: 2021 })
      ).toEqual({ yearToUse: 2021, selectedACPCYear: LEAVE_ALONE });
    });

    it('is not fooled by a stale assembly year still sitting in the URL', () => {
      const out = resolveAssemblyYearSelection({
        ...base,
        search: '?year=2021',
        selectedACPCYear: 2024,
        selectedYear: 2016,
      });
      expect(out.selectedACPCYear).toBe(LEAVE_ALONE);
      expect(out.yearToUse).toBe(2016);
    });
  });

  describe('pc- prefixed year in the URL', () => {
    it('enters contribution mode for that Lok Sabha year', () => {
      expect(resolveAssemblyYearSelection({ ...base, search: '?year=pc-2024' })).toEqual({
        yearToUse: undefined,
        selectedACPCYear: 2024,
      });
    });

    it('leaves the mode untouched when the pc- value is malformed', () => {
      expect(
        resolveAssemblyYearSelection({ ...base, search: '?year=pc-banana' }).selectedACPCYear
      ).toBe(LEAVE_ALONE);
    });
  });

  describe('plain assembly year in the URL', () => {
    it('uses it and clears contribution mode outside a PC', () => {
      expect(resolveAssemblyYearSelection({ ...base, search: '?year=2021' })).toEqual({
        yearToUse: 2021,
        selectedACPCYear: null,
      });
    });

    it('keeps contribution mode inside a PC, since the AC contributes to it', () => {
      expect(
        resolveAssemblyYearSelection({
          ...base,
          search: '?year=2021',
          currentPC: 'Chennai South',
          pcSelectedYear: 2024,
        })
      ).toEqual({ yearToUse: 2021, selectedACPCYear: 2024 });
    });

    it('clears the mode inside a PC that has no parliament year yet', () => {
      expect(
        resolveAssemblyYearSelection({
          ...base,
          search: '?year=2021',
          currentPC: 'Chennai South',
          pcSelectedYear: null,
        }).selectedACPCYear
      ).toBeNull();
    });
  });

  describe('unparseable year in the URL', () => {
    it('does not fall through to the PC fallback', () => {
      // the whole point: a garbled year must not flip a view into contribution mode
      expect(
        resolveAssemblyYearSelection({
          ...base,
          search: '?year=banana',
          currentPC: 'Chennai South',
          pcSelectedYear: 2024,
        }).selectedACPCYear
      ).toBe(LEAVE_ALONE);
    });
  });

  describe('no year in the URL', () => {
    it('falls back to the parliament year when inside a PC', () => {
      expect(
        resolveAssemblyYearSelection({
          ...base,
          currentPC: 'Chennai South',
          pcSelectedYear: 2024,
        })
      ).toEqual({ yearToUse: undefined, selectedACPCYear: 2024 });
    });

    it('clears a stale PC year in a plain assembly or district view', () => {
      expect(resolveAssemblyYearSelection({ ...base, selectedYear: 2021 })).toEqual({
        yearToUse: 2021,
        selectedACPCYear: null,
      });
    });
  });
});
