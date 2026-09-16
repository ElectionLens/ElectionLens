import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { AssemblyFeature, GeoJSONData } from '../types';
import type { UrlUpdateInput } from './useUrlState';
import type { ACContribution } from '../utils/parliamentContributions';
import { viewSwitchUrlLocation } from '../utils/urlLocation';
import { readLocation, parseAssemblyYearParam } from '../utils/mapUrlContext';
import { resolveAssemblyYearSelection } from '../utils/assemblyYearSelection';
import { trackConstituencySelect } from '../utils/firebase';

/**
 * Where the user asked to go.
 *
 * A discriminated union rather than a bag of optional strings: selecting an
 * assembly genuinely requires a feature, and selecting a state genuinely does
 * not. Encoding that in the type means the compiler rejects a half-specified
 * target instead of it failing at runtime, which is how the previous
 * copy-pasted handlers drifted apart in the first place.
 */
export type SelectionTarget =
  | { level: 'state'; stateName: string }
  | { level: 'district'; stateName: string; districtName: string }
  | { level: 'pc'; stateName: string; pcName: string }
  | {
      level: 'assembly';
      stateName: string;
      acName: string;
      feature: AssemblyFeature;
      /**
       * Load the state's full assembly layer before selecting.
       *
       * Required when arriving from somewhere that is not already showing
       * assemblies (search, a ranked list). A map click inside a PC must NOT
       * set this: that view is deliberately scoped to the PC's ACs, and
       * swapping in the statewide layer would silently drop the PC context.
       * Callers know which case they are; the view alone cannot tell us.
       */
      ensureAssembliesView?: boolean;
    };

export interface SelectLocationOptions {
  /** Suppress analytics for programmatic moves (deep links, back/forward). */
  track?: boolean;
}

export interface UseSelectLocationParams {
  navigateToState: (stateName: string) => Promise<GeoJSONData | null>;
  navigateToPC: (pcName: string, stateName: string) => Promise<GeoJSONData>;
  navigateToDistrict: (districtName: string, stateName: string) => Promise<GeoJSONData>;
  navigateToAssemblies: (stateName: string) => Promise<GeoJSONData>;
  selectAssembly: (acName: string | null) => void;
  clearElectionResult: () => void;
  clearPCElectionResult: () => void;
  getACResult: (
    acName: string,
    stateName: string,
    year?: number,
    opts?: { schemaId?: string; canonicalName?: string }
  ) => Promise<unknown>;
  getPCResult: (pcName: string, stateName: string, year?: number) => Promise<unknown>;
  loadStateIndex: (stateName: string) => Promise<unknown>;
  loadPCStateIndex: (stateName: string) => Promise<{ availableYears?: number[] } | null>;
  setPCSelectedYear: (year: number) => void;
  setSelectedACPCYear: Dispatch<SetStateAction<number | null>>;
  setCurrentData: Dispatch<SetStateAction<GeoJSONData | null>>;
  setParliamentContributions: Dispatch<SetStateAction<Record<number, ACContribution>>>;
  loadAllParliamentContributions: (
    acName: string,
    pcName: string,
    stateName: string
  ) => Promise<void>;
  getAC: (schemaId: string) => { name: string } | null | undefined;
  resolveACName: (acName: string, stateId: string) => string | null;
  getStateIdFromName: (stateName: string) => string;
  closeSidebarAfterAction: () => void;
  /** Read-only snapshots of current selection, used for year resolution. */
  currentState: string | null;
  currentPC: string | null;
  selectedYear: number | null;
  selectedACPCYear: number | null;
  pcSelectedYear: number | null;
  updateUrlRef: MutableRefObject<(state: UrlUpdateInput) => void>;
}

/**
 * The single entry point for "the user picked a place".
 *
 * Before this existed, map clicks, search results and summary rows each had
 * their own hand-rolled sequence, and they had silently drifted: selecting a
 * PC from search skipped clearing the stale AC panel, skipped loading the PC
 * result, and skipped analytics, none of which the map-click path skipped.
 * Those are user-visible bugs that only reproduce on one of the two routes,
 * which is exactly the failure mode duplicated navigation logic produces.
 *
 * Every caller now funnels through here, so a fix lands once rather than
 * three times, and a new surface (card mode) gets correct behaviour for free.
 */
export function useSelectLocation(params: UseSelectLocationParams): {
  selectLocation: (target: SelectionTarget, options?: SelectLocationOptions) => Promise<void>;
} {
  const {
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    selectAssembly,
    clearElectionResult,
    clearPCElectionResult,
    getACResult,
    getPCResult,
    loadStateIndex,
    loadPCStateIndex,
    setPCSelectedYear,
    setSelectedACPCYear,
    setCurrentData,
    setParliamentContributions,
    loadAllParliamentContributions,
    getAC,
    resolveACName,
    getStateIdFromName,
    closeSidebarAfterAction,
    currentPC,
    selectedYear,
    selectedACPCYear,
    pcSelectedYear,
    updateUrlRef,
  } = params;

  /**
   * Land on a state. Shared by the direct state selection and by the
   * search paths, which previously reached a state without ever fixing up
   * the PC year and so rendered an uncoloured map.
   */
  const commitState = useCallback(
    async (stateName: string): Promise<void> => {
      const data = await navigateToState(stateName);
      setCurrentData(data);
      void loadStateIndex(stateName);

      const pcIndex = await loadPCStateIndex(stateName);
      const years = pcIndex?.availableYears;
      if (years?.length && (pcSelectedYear == null || !years.includes(pcSelectedYear))) {
        const latestYear = years[years.length - 1];
        if (latestYear !== undefined) {
          setPCSelectedYear(latestYear);
          updateUrlRef.current(
            viewSwitchUrlLocation({
              state: stateName,
              view: 'constituencies',
              year: latestYear,
            })
          );
        }
      }
    },
    [
      navigateToState,
      setCurrentData,
      loadStateIndex,
      loadPCStateIndex,
      pcSelectedYear,
      setPCSelectedYear,
      updateUrlRef,
    ]
  );

  const selectLocation = useCallback(
    async (target: SelectionTarget, options: SelectLocationOptions = {}): Promise<void> => {
      const { track = true } = options;
      closeSidebarAfterAction();

      switch (target.level) {
        case 'state': {
          clearElectionResult();
          clearPCElectionResult();
          selectAssembly(null);
          await commitState(target.stateName);
          if (track) trackConstituencySelect('state', target.stateName);
          return;
        }

        case 'district': {
          clearElectionResult();
          clearPCElectionResult();
          selectAssembly(null);
          const data = await navigateToDistrict(target.districtName, target.stateName);
          setCurrentData(data);
          if (track) {
            trackConstituencySelect('district', target.districtName, target.stateName);
          }
          return;
        }

        case 'pc': {
          clearElectionResult();
          selectAssembly(null);
          const data = await navigateToPC(target.pcName, target.stateName);
          setCurrentData(data);
          // Year may not have committed to state yet on a fresh navigation, so
          // fall back to the URL rather than loading the wrong year's result.
          const yearToLoad =
            pcSelectedYear ?? parseAssemblyYearParam(readLocation()?.search ?? '') ?? undefined;
          await getPCResult(target.pcName, target.stateName, yearToLoad);
          if (track) trackConstituencySelect('pc', target.pcName, target.stateName);
          return;
        }

        case 'assembly': {
          clearPCElectionResult();
          setParliamentContributions({});

          if (target.ensureAssembliesView) {
            const data = await navigateToAssemblies(target.stateName);
            setCurrentData(data);
          }

          selectAssembly(target.acName);

          const yearSelection = resolveAssemblyYearSelection({
            search: readLocation()?.search ?? '',
            selectedACPCYear,
            selectedYear,
            currentPC,
            pcSelectedYear,
          });
          if (yearSelection.selectedACPCYear !== undefined) {
            setSelectedACPCYear(yearSelection.selectedACPCYear);
          }

          const stateId = getStateIdFromName(target.stateName);
          const schemaId =
            target.feature.properties.schemaId ?? resolveACName(target.acName, stateId);
          const schemaAC = schemaId ? getAC(schemaId) : null;

          // Built conditionally rather than with `undefined` values, because
          // exactOptionalPropertyTypes distinguishes "absent" from "undefined".
          const hints: { schemaId?: string; canonicalName?: string } = {};
          if (schemaId) hints.schemaId = schemaId;
          if (schemaAC?.name) hints.canonicalName = schemaAC.name;

          await getACResult(target.acName, target.stateName, yearSelection.yearToUse, hints);

          const pcName = target.feature.properties.PC_NAME;
          if (pcName) {
            await loadAllParliamentContributions(target.acName, pcName, target.stateName);
          }

          if (track) {
            trackConstituencySelect('assembly', target.acName, target.stateName);
          }
          return;
        }
      }
    },
    [
      closeSidebarAfterAction,
      clearElectionResult,
      clearPCElectionResult,
      selectAssembly,
      commitState,
      navigateToDistrict,
      navigateToPC,
      navigateToAssemblies,
      setCurrentData,
      getPCResult,
      pcSelectedYear,
      setParliamentContributions,
      selectedACPCYear,
      selectedYear,
      currentPC,
      setSelectedACPCYear,
      getStateIdFromName,
      resolveACName,
      getAC,
      getACResult,
      loadAllParliamentContributions,
    ]
  );

  return { selectLocation };
}
