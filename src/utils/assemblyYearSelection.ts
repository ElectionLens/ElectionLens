/**
 * Decides which year a newly-selected assembly should be shown at, and whether
 * the panel is in PC-contribution mode.
 *
 * Selecting an AC can happen from the map, the sidebar or search, and each path
 * has to answer the same awkward question: `?year=` holds *either* an assembly
 * year (`2021`) or a Lok Sabha year (`pc-2024`), and the answer also depends on
 * the toolbar state that may not have committed yet.
 *
 * Pure so the branches can be tested directly; the caller applies the result.
 */
import { parsePcPrefixedYear, rawYearParam } from './mapUrlContext';

export interface AssemblyYearSelectionInput {
  /** Raw `window.location.search` at click time. */
  search: string;
  /** Toolbar's current PC-contribution year, if it is already in that mode. */
  selectedACPCYear: number | null;
  /** Toolbar's current assembly year. */
  selectedYear: number | null;
  /** The PC being viewed, if any. */
  currentPC: string | null;
  /** Parliament year for the PC view. */
  pcSelectedYear: number | null;
}

export interface AssemblyYearSelection {
  /** Year to fetch the AC result for; undefined means "let the loader decide". */
  yearToUse: number | undefined;
  /**
   * New PC-contribution year: a number enables it, null turns it off, and
   * `undefined` means "leave it exactly as it is" (distinct from turning it
   * off - a malformed `pc-` value must not silently clear the mode).
   */
  selectedACPCYear: number | null | undefined;
}

export function resolveAssemblyYearSelection({
  search,
  selectedACPCYear,
  selectedYear,
  currentPC,
  pcSelectedYear,
}: AssemblyYearSelectionInput): AssemblyYearSelection {
  const yearParam = rawYearParam(search);

  // Already in PC-contribution mode: keep it. A stale `?year=2021` (or a stale
  // closure missing selectedACPCYear in its deps) must not clear PC colouring
  // out from under a sidebar click or search result.
  if (selectedACPCYear != null) {
    return { yearToUse: selectedYear ?? undefined, selectedACPCYear: undefined };
  }

  if (yearParam) {
    if (yearParam.startsWith('pc-')) {
      // `year=pc-2024` - contribution mode. A malformed `pc-` value yields
      // undefined, i.e. leave the current mode alone rather than guessing.
      const pcYear = parsePcPrefixedYear(search);
      return {
        yearToUse: selectedYear ?? undefined,
        selectedACPCYear: pcYear ?? undefined,
      };
    }

    const parsed = parseInt(yearParam, 10);
    if (!Number.isNaN(parsed)) {
      // A plain year inside a PC still means "AC contribution to this PC";
      // anywhere else it means "the assembly result", so PC mode is cleared.
      return {
        yearToUse: parsed,
        selectedACPCYear: currentPC && pcSelectedYear != null ? pcSelectedYear : null,
      };
    }

    // Unparseable `?year=` (e.g. `?year=banana`). Note this does NOT fall
    // through to the PC fallback below: a garbled year is not a reason to
    // switch a plain assembly view into contribution mode.
    return { yearToUse: selectedYear ?? undefined, selectedACPCYear: undefined };
  }

  // No year in the URL at all: inside a PC fall back to the PC year, otherwise
  // make sure a stale PC year cannot leak into an assembly view.
  return {
    yearToUse: selectedYear ?? undefined,
    selectedACPCYear: currentPC && pcSelectedYear != null ? pcSelectedYear : null,
  };
}
