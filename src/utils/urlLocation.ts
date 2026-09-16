/**
 * Builds the URL-state object that describes "where the user currently is".
 *
 * Eight call sites in App.tsx used to spell this shape out by hand - the same
 * ten fields, with the same two quiet rules baked in each time. Restating it is
 * how the copies drifted; naming it once is how they stop.
 */
import type { UrlState, UrlUpdateInput } from '../hooks/useUrlState';
import type { ViewMode } from '../types';
/** The app-state fields every URL update is derived from. */
export interface UrlLocationInput {
  currentState: string | null;
  currentView: ViewMode;
  currentPC: string | null;
  currentDistrict: string | null;
  currentAssembly: string | null;
  selectedYear: number | null;
  selectedACPCYear: number | null;
  showACsWithinPC: boolean | null;
  blogOpen: boolean;
}

/**
 * Two rules are encoded here rather than at each call site:
 *
 * 1. `showACs` is only meaningful inside a PC, so it stays null elsewhere
 *    (a stray `showACs=` on a state-level URL would be noise).
 * 2. A PC year and an assembly year are mutually exclusive - `?year=` and
 *    `?year=pc-` occupy the same slot. When a PC year is active it wins, and
 *    the assembly year must be cleared or both would try to claim the slot.
 *
 * `tab` and `blogPost` are deliberately NOT defaulted: in UrlUpdateInput,
 * omitting `tab` preserves the existing `tab=` while passing null deletes it.
 * Callers must make that choice explicitly - see {@link withUrlLocation}.
 */
export function currentUrlLocation(
  input: UrlLocationInput
): Omit<UrlUpdateInput, 'tab' | 'blogPost'> {
  const {
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedACPCYear,
    showACsWithinPC,
    blogOpen,
  } = input;

  const pcYearActive = selectedACPCYear != null;

  return {
    state: currentState,
    view: currentView,
    pc: currentPC,
    district: currentDistrict,
    assembly: currentAssembly,
    year: pcYearActive ? null : selectedYear,
    pcYear: pcYearActive ? selectedACPCYear : null,
    showACs: currentPC ? (showACsWithinPC ?? true) : null,
    blog: blogOpen,
  };
}

/**
 * {@link currentUrlLocation} plus the explicit `tab` / `blogPost` decision and
 * any per-call overrides (e.g. forcing `blog: true` while opening the blog).
 *
 * Returns a full {@link UrlState} - `tab` is required here, so this satisfies
 * both `updateUrl` (which also accepts the looser UrlUpdateInput) and
 * `getShareableUrl` (which does not).
 */
export function withUrlLocation(
  input: UrlLocationInput,
  overrides: Partial<UrlState> & Pick<UrlState, 'tab' | 'blogPost'>
): UrlState {
  return { ...currentUrlLocation(input), ...overrides };
}

/**
 * URL shape for switching to a different top-level view (constituencies /
 * assemblies / districts) of the SAME state.
 *
 * Deliberately not built from {@link currentUrlLocation}: moving to a
 * different map layer resets PC/district scoping, any panel tab, and the
 * blog overlay, rather than carrying them over the way refining a position
 * within the current layer would.
 */
export function viewSwitchUrlLocation(params: {
  state: string | null;
  view: ViewMode;
  year: number | null;
  /** Assembly stays selected across a switch into the assemblies view; every other switch clears it. */
  assembly?: string | null;
}): UrlState {
  return {
    state: params.state,
    view: params.view,
    pc: null,
    district: null,
    assembly: params.assembly ?? null,
    year: params.year,
    pcYear: null,
    tab: null,
    showACs: null,
    blog: false,
    blogPost: null,
  };
}
