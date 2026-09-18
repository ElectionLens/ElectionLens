import { useCallback } from 'react';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import { normalizeName, toTitleCase, getStateIdFromName } from '../utils/helpers';
import { isAssemblyResultEntry, skipAssemblyWinnerColoring } from '../utils/electionResults';
import { defaultAssemblyDataYearFromIndex } from '../utils/electionSchedule';
import { ELECTIONS, PC_ELECTIONS, assemblyElectionFetchUrl } from '../constants/paths';
import type { ACContribution } from '../utils/parliamentContributions';
import type { UrlState, UrlUpdateInput } from './useUrlState';
import type { UseElectionDataReturn } from '../types';
import type { UseElectionResultsReturn } from './useElectionResults';
import type { UseParliamentResultsReturn } from './useParliamentResults';
import type { UseSchemaReturn } from './useSchema';
import type {
  GeoJSONData,
  ElectionResultsByConstituency,
  PCElectionResultsByConstituency,
} from '../types';

/**
 * Everything handleUrlNavigate needs from App's various data/schema hooks and
 * from App-local state that doesn't belong to any single hook (left-pane nav,
 * blog toggle, AC-within-PC year overlay, etc.)
 */
export interface UseUrlNavigateParams
  extends
    Pick<
      UseElectionDataReturn,
      | 'statesGeoJSON'
      | 'navigateToState'
      | 'navigateToPC'
      | 'navigateToDistrict'
      | 'navigateToAssemblies'
      | 'loadDistrictsForState'
      | 'resetView'
      | 'selectAssembly'
    >,
    Pick<
      UseElectionResultsReturn,
      'getACResult' | 'loadStateIndex' | 'setSelectedYear' | 'clearSelectedYear'
    >,
    Pick<UseSchemaReturn, 'resolvePCName' | 'resolveACName' | 'getAC' | 'schema'> {
  getPCResult: UseParliamentResultsReturn['getPCResult'];
  loadPCStateIndex: UseParliamentResultsReturn['loadStateIndex'];
  setPCSelectedYear: UseParliamentResultsReturn['setSelectedYear'];
  clearPCSelectedYear: UseParliamentResultsReturn['clearSelectedYear'];
  setSelectedACPCYear: Dispatch<SetStateAction<number | null>>;
  setShowACsWithinPC: Dispatch<SetStateAction<boolean>>;
  setCurrentData: Dispatch<SetStateAction<GeoJSONData | null>>;
  setInitialPCWinners: Dispatch<
    SetStateAction<Record<string, { party: string; candidate: string }> | null>
  >;
  setParliamentContributions: Dispatch<SetStateAction<Record<number, ACContribution>>>;
  setLeftPane: Dispatch<SetStateAction<NonNullable<UrlState['pane']>>>;
  setLeftPaneView: Dispatch<SetStateAction<NonNullable<UrlState['paneView']> | null>>;
  setLeftPaneParty: Dispatch<SetStateAction<string | null>>;
  setBlogOpen: Dispatch<SetStateAction<boolean>>;
  /** Ref to useUrlState's updateUrl - a ref because of the circular hook dependency
   *  (useUrlState needs handleUrlNavigate as its onNavigate callback). */
  updateUrlRef: MutableRefObject<(state: UrlUpdateInput) => void>;
}

/**
 * Handle URL-based navigation (deep linking). Extracted from App.tsx where this
 * was a single ~540-line useCallback - the app's core deep-link resolver, branching
 * on whether the URL points at a PC, a district, the all-assemblies view, the
 * districts view, or the default constituencies (PC) view.
 */
export function useUrlNavigate(params: UseUrlNavigateParams): {
  handleUrlNavigate: (urlState: UrlState) => Promise<void>;
} {
  const {
    statesGeoJSON,
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    loadDistrictsForState,
    resetView,
    selectAssembly,
    getACResult,
    getPCResult,
    loadStateIndex,
    loadPCStateIndex,
    resolvePCName,
    resolveACName,
    getAC,
    schema,
    setSelectedYear,
    clearSelectedYear,
    setPCSelectedYear,
    clearPCSelectedYear,
    setSelectedACPCYear,
    setShowACsWithinPC,
    setCurrentData,
    setInitialPCWinners,
    setParliamentContributions,
    setLeftPane,
    setLeftPaneView,
    setLeftPaneParty,
    setBlogOpen,
    updateUrlRef,
  } = params;

  const handleUrlNavigate = useCallback(
    async (urlState: UrlState): Promise<void> => {
      if (!urlState.state) {
        setLeftPane('root');
        setLeftPaneView(null);
        setLeftPaneParty(null);
        resetView();
        setCurrentData(null);
        setInitialPCWinners(null);
        // Redirect to clean root: /?year=2019 -> / (replace so back button doesn't restore params)
        if (window.location.pathname === '/' && window.location.search) {
          window.history.replaceState({}, '', '/');
        }
        return;
      }
      setLeftPane(urlState.pane ?? 'root');
      setLeftPaneView(urlState.paneView ?? null);
      setLeftPaneParty(urlState.paneParty ?? null);

      // Find matching state name (case insensitive)
      let matchedState = urlState.state;
      if (statesGeoJSON?.features) {
        const found = statesGeoJSON.features.find((f) => {
          const name = normalizeName(f.properties.shapeName ?? f.properties.ST_NM ?? '');
          return name.toLowerCase() === urlState.state?.toLowerCase().replace(/-/g, ' ');
        });
        if (found) {
          matchedState = found.properties.shapeName ?? found.properties.ST_NM ?? urlState.state;
        }
      }
      setInitialPCWinners(null);
      // Any deep link that selects an assembly must drop prior parliamentContributions (effect only fills when empty).
      if (urlState.assembly) {
        setParliamentContributions({});
      }

      // AC-within-PC: set selectedYear from URL before any await so Update URL effect
      // does not overwrite the URL when navigateToState/navigateToPC trigger re-renders
      if (urlState.pc && urlState.assembly && urlState.year != null) {
        setSelectedYear(urlState.year);
      }

      if (urlState.pc) {
        // Set PC year from URL first so toolbar and MapView loadResults use it (fix: AC colors update when year in URL)
        if (urlState.year != null) {
          setPCSelectedYear(urlState.year);
        }
        // Set parliament contribution year (year=pc-YYYY) before any await so map coloring uses correct year
        if (urlState.pcYear != null) {
          setSelectedACPCYear(urlState.pcYear);
          // Also set pcSelectedYear so MapView constituencies branch loads this year (view stays constituencies when AC within PC)
          setPCSelectedYear(urlState.pcYear);
        }
        // First navigate to state, then to PC
        await navigateToState(matchedState);
        const pcName = toTitleCase(urlState.pc.replace(/-/g, ' ')).toUpperCase();
        const data = await navigateToPC(pcName, matchedState);
        setCurrentData(data);
        if (urlState.showACs != null) {
          setShowACsWithinPC(urlState.showACs);
        }
        if (urlState.assembly) {
          // Convert assembly name to match GeoJSON format (Title Case, uppercase for comparison)
          const acName = toTitleCase(urlState.assembly).toUpperCase();
          selectAssembly(acName);
          const stateId = getStateIdFromName(matchedState);
          const schemaId = resolveACName(acName, stateId);
          await getACResult(acName, matchedState, urlState.year ?? undefined, {
            schemaId: schemaId ?? undefined,
            canonicalName: schemaId ? getAC(schemaId)?.name : undefined,
          });
          // Parliament contributions loaded by useEffect when currentAssembly changes
          // Set PC year if provided in URL (year=pc-YYYY format); otherwise show assembly year
          if (urlState.pcYear) {
            setSelectedACPCYear(urlState.pcYear);
          } else {
            setSelectedACPCYear(null);
          }
          // Re-apply URL year so we win over any in-flight loadStateIndex() that overwrote it
          if (urlState.year != null) setSelectedYear(urlState.year);
        } else {
          // No assembly selected - load PC election results for the PC view
          await getPCResult(pcName, matchedState, urlState.year ?? undefined);
        }
      } else if (urlState.district) {
        // First navigate to state districts, then to specific district
        await loadDistrictsForState(matchedState);
        const districtName = toTitleCase(urlState.district);
        const data = await navigateToDistrict(districtName, matchedState);
        setCurrentData(data);
        // Pre-load AC index so we can validate/correct year (avoid neutral district coloring)
        const acIndex = await loadStateIndex(
          matchedState,
          urlState.year != null ? { yearFromUrl: urlState.year } : undefined
        );
        if (urlState.pcYear) {
          setSelectedACPCYear(urlState.pcYear);
        } else {
          setSelectedACPCYear(null);
        }
        if (urlState.year != null) {
          setSelectedYear(urlState.year);
        }
        // If no year in URL, set latest AC year so districts/ACs are colored
        if (!urlState.year && !urlState.pcYear && acIndex && acIndex.availableYears.length > 0) {
          const latestYear = defaultAssemblyDataYearFromIndex(acIndex);
          if (latestYear != null) {
            setSelectedYear(latestYear);
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'districts',
                pc: null,
                district: urlState.district,
                assembly: urlState.assembly ?? null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
        // If year in URL is not available for this state's AC data, correct to latest (100% party coloring)
        if (
          urlState.year != null &&
          acIndex &&
          acIndex.availableYears.length > 0 &&
          !acIndex.availableYears.includes(urlState.year)
        ) {
          const latestYear = defaultAssemblyDataYearFromIndex(acIndex);
          if (latestYear != null) {
            setSelectedYear(latestYear);
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'districts',
                pc: null,
                district: urlState.district,
                assembly: urlState.assembly ?? null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
        if (urlState.assembly) {
          // Convert assembly name to match GeoJSON format (Title Case, uppercase for comparison)
          const acName = toTitleCase(urlState.assembly).toUpperCase();
          selectAssembly(acName);
          const stateId = getStateIdFromName(matchedState);
          const schemaId = resolveACName(acName, stateId);
          await getACResult(acName, matchedState, urlState.year ?? undefined, {
            schemaId: schemaId ?? undefined,
            canonicalName: schemaId ? getAC(schemaId)?.name : undefined,
          });
          if (urlState.pcYear) {
            setSelectedACPCYear(urlState.pcYear);
          } else {
            setSelectedACPCYear(null);
          }
          // Parliament contributions loaded by useEffect when currentAssembly changes
          // Re-apply URL year so we win over any in-flight loadStateIndex() that overwrote it
          if (urlState.year != null) setSelectedYear(urlState.year);
        }
      } else if (urlState.view === 'assemblies') {
        // Set PC year from URL immediately so useUrlState doesn't overwrite year=pc-YYYY
        if (urlState.pcYear) {
          setSelectedACPCYear(urlState.pcYear);
        } else {
          setSelectedACPCYear(null); // Assembly year in URL — show AC colors, not PC contribution
        }
        // Set assembly year from URL so loadResults can color all ACs
        if (urlState.year != null) {
          setSelectedYear(urlState.year);
        }
        // All assemblies view for a state
        const data = await navigateToAssemblies(matchedState);
        setCurrentData(data);
        // Pre-load election index (pass yearFromUrl so loadStateIndex doesn't overwrite URL year)
        const acIndex = await loadStateIndex(
          matchedState,
          urlState.year != null ? { yearFromUrl: urlState.year } : undefined
        );
        void loadPCStateIndex(matchedState);

        // If no year in URL (neither year nor pcYear), set to latest AC year so map is colored
        if (!urlState.year && !urlState.pcYear && acIndex && acIndex.availableYears.length > 0) {
          const latestYear = defaultAssemblyDataYearFromIndex(acIndex);
          if (latestYear != null) {
            setSelectedYear(latestYear);
            // Update URL immediately with latest year (preserve assembly if present)
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'assemblies',
                pc: null,
                district: null,
                assembly: urlState.assembly ?? null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
        // If year in URL is not available for this state's AC data, correct to latest so map is colored
        if (
          urlState.year != null &&
          acIndex &&
          acIndex.availableYears.length > 0 &&
          !acIndex.availableYears.includes(urlState.year)
        ) {
          const latestYear = defaultAssemblyDataYearFromIndex(acIndex);
          if (latestYear != null) {
            setSelectedYear(latestYear);
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'assemblies',
                pc: null,
                district: null,
                assembly: urlState.assembly ?? null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }

        if (urlState.assembly) {
          // Specific assembly selected — use schema for reliable lookup across states/years
          const acName = toTitleCase(urlState.assembly).toUpperCase();
          selectAssembly(acName);
          const stateId = getStateIdFromName(matchedState);
          const schemaId = resolveACName(acName, stateId);
          await getACResult(acName, matchedState, urlState.year ?? undefined, {
            schemaId: schemaId ?? undefined,
            canonicalName: schemaId ? getAC(schemaId)?.name : undefined,
          });
          if (urlState.pcYear) {
            setSelectedACPCYear(urlState.pcYear);
          } else {
            setSelectedACPCYear(null);
          }
          // Re-apply URL year so we win over any in-flight loadStateIndex() that overwrote it
          if (urlState.year != null) setSelectedYear(urlState.year);
        }
      } else if (urlState.view === 'districts') {
        const data = await loadDistrictsForState(matchedState);
        setCurrentData(data);
        // Pre-load election index for the state (both AC and PC)
        const acIndex = await loadStateIndex(
          matchedState,
          urlState.year != null ? { yearFromUrl: urlState.year } : undefined
        );
        void loadPCStateIndex(matchedState);
        // Set year from URL for map coloring (same as assemblies view)
        if (urlState.pcYear) {
          setSelectedACPCYear(urlState.pcYear);
        }
        if (urlState.year != null) {
          setSelectedYear(urlState.year);
        }
        // If no year in URL, set default to latest AC year so map is colored
        if (!urlState.year && !urlState.pcYear && acIndex && acIndex.availableYears.length > 0) {
          const latestYear = defaultAssemblyDataYearFromIndex(acIndex);
          if (latestYear != null) {
            setSelectedYear(latestYear);
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'districts',
                pc: null,
                district: null,
                assembly: null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
        // If year in URL is not available for this state's AC data, correct to latest so map is colored
        if (
          urlState.year != null &&
          acIndex &&
          acIndex.availableYears.length > 0 &&
          !acIndex.availableYears.includes(urlState.year)
        ) {
          const latestYear = defaultAssemblyDataYearFromIndex(acIndex);
          if (latestYear != null) {
            setSelectedYear(latestYear);
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'districts',
                pc: null,
                district: null,
                assembly: null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
      } else {
        // Default constituencies view (PC view)
        const stateId = getStateIdFromName(matchedState);
        let data: GeoJSONData | null = null;
        let pcWinners: Record<string, { party: string; candidate: string }> | null = null;

        if (urlState.year != null) {
          const urlPcElectionYear = urlState.year;
          // Fetch state GeoJSON and PC results in parallel so first paint has party colors
          const [stateData, pcResults] = await Promise.all([
            navigateToState(matchedState),
            fetch(PC_ELECTIONS.getYearPath(stateId, urlPcElectionYear)).then((r) =>
              r.ok ? (r.json() as Promise<PCElectionResultsByConstituency>) : null
            ),
          ]);
          data = stateData;
          if (pcResults) {
            const winners: Record<string, { party: string; candidate: string }> = {};
            const pcSchemaIdPattern = /^[A-Z]{2}-\d+$/;
            for (const [key, result] of Object.entries(pcResults)) {
              if (result?.candidates?.length) {
                const winner = result.candidates[0];
                if (winner) {
                  const entry = { party: winner.party, candidate: winner.name };
                  if (key && pcSchemaIdPattern.test(key)) winners[key] = entry;
                  const pcName =
                    result.constituencyNameOriginal || result.constituencyName || result.name || '';
                  if (pcName) {
                    const normalizedName = normalizeName(pcName)
                      .toUpperCase()
                      .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
                      .trim()
                      .replace(/\s+/g, ' ');
                    const fuzzyKey = normalizedName.replace(/[^A-Z0-9]/g, '');
                    winners[normalizedName] = entry;
                    if (fuzzyKey && fuzzyKey !== normalizedName) winners[fuzzyKey] = entry;
                    const originalUpper = pcName.toUpperCase().trim();
                    if (originalUpper !== normalizedName && originalUpper !== fuzzyKey) {
                      winners[originalUpper] = entry;
                    }
                    const sid = resolvePCName(pcName, stateId);
                    if (sid) winners[sid] = entry;
                  }
                }
              }
            }
            // Fill PCs missing from file (e.g. Vellore TN-08 in 2019) by deriving winner from AC data
            if (schema?.parliamentaryConstituencies && schema?.assemblyConstituencies) {
              const statePCIds = Object.values(schema.parliamentaryConstituencies)
                .filter((pc: { stateId: string; id: string }) => pc.stateId === stateId)
                .map((pc: { id: string }) => pc.id);
              const missingPCIds = statePCIds.filter((id) => !winners[id]);
              if (missingPCIds.length > 0) {
                try {
                  const acIndexRes = await fetch(
                    assemblyElectionFetchUrl(ELECTIONS.getIndexPath(stateId))
                  );
                  if (acIndexRes.ok) {
                    const acIndex = (await acIndexRes.json()) as { availableYears?: number[] };
                    const acYears = acIndex.availableYears ?? [];
                    const assemblyYear =
                      acYears.filter((y) => y <= urlPcElectionYear).pop() ??
                      acYears[acYears.length - 1];
                    if (assemblyYear != null) {
                      const acRes = await fetch(
                        assemblyElectionFetchUrl(ELECTIONS.getYearPath(stateId, assemblyYear))
                      );
                      if (acRes.ok) {
                        const acResults = (await acRes.json()) as ElectionResultsByConstituency;
                        const navigateAcFileMeta = acResults._meta;
                        const acWinners: Record<string, { party: string; candidate: string }> = {};
                        const schemaIdPattern = /^[A-Z]{2}-\d+$/;
                        for (const [key, result] of Object.entries(acResults)) {
                          if (!isAssemblyResultEntry(key, result)) continue;
                          if (skipAssemblyWinnerColoring(result, navigateAcFileMeta)) continue;
                          if (result.candidates?.length && result.candidates[0]) {
                            const w = result.candidates[0];
                            const entry = { party: w.party, candidate: w.name };
                            if (key && schemaIdPattern.test(key)) acWinners[key] = entry;
                          }
                        }
                        for (const pcId of missingPCIds) {
                          const acsInPC = Object.entries(schema.assemblyConstituencies).filter(
                            ([, ac]) => ac.stateId === stateId && ac.pcId === pcId
                          );
                          const partyCounts: Record<string, number> = {};
                          for (const [acId] of acsInPC) {
                            const acWinner = acWinners[acId];
                            if (acWinner?.party) {
                              partyCounts[acWinner.party] = (partyCounts[acWinner.party] ?? 0) + 1;
                            }
                          }
                          let modeParty: string | null = null;
                          let maxCount = 0;
                          for (const [party, count] of Object.entries(partyCounts)) {
                            if (count > maxCount) {
                              maxCount = count;
                              modeParty = party;
                            }
                          }
                          if (modeParty) {
                            const entry = { party: modeParty, candidate: '' };
                            winners[pcId] = entry;
                            const pcEntity = schema.parliamentaryConstituencies[pcId];
                            if (pcEntity?.name) {
                              const normalizedName = normalizeName(pcEntity.name)
                                .toUpperCase()
                                .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
                                .trim()
                                .replace(/\s+/g, ' ');
                              winners[normalizedName] = entry;
                              const fuzzyKey = normalizedName.replace(/[^A-Z0-9]/g, '');
                              if (fuzzyKey && fuzzyKey !== normalizedName)
                                winners[fuzzyKey] = entry;
                              winners[pcEntity.name.toUpperCase().trim()] = entry;
                            }
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // Ignore; missing PCs use dominant fallback in MapView
                }
              }
            }
            pcWinners = winners;
          }
        } else {
          data = await navigateToState(matchedState);
        }

        setCurrentData(data);
        if (pcWinners) setInitialPCWinners(pcWinners);
        // Pre-load election index for the state (both AC and PC)
        const acIndex = await loadStateIndex(matchedState);
        const pcIndex = await loadPCStateIndex(matchedState);

        if (urlState.year != null) {
          if (acIndex?.availableYears.includes(urlState.year)) {
            // Prefer a real Assembly year when both indexes expose the same
            // future slot (e.g. the 2026 PC placeholder alongside 2026 AC data).
            clearPCSelectedYear();
            setSelectedYear(urlState.year);
          } else if (pcIndex && pcIndex.availableYears.includes(urlState.year)) {
            setPCSelectedYear(urlState.year);
            clearSelectedYear();
          } else {
            clearPCSelectedYear();
            setSelectedYear(urlState.year);
          }
        }
        // If year in URL is not available for this state's PC data, correct to latest so map is colored
        if (
          urlState.year != null &&
          pcIndex &&
          pcIndex.availableYears.length > 0 &&
          !pcIndex.availableYears.includes(urlState.year) &&
          !acIndex?.availableYears.includes(urlState.year)
        ) {
          const latestYear = pcIndex.availableYears[pcIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
            setPCSelectedYear(latestYear);
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'constituencies',
                pc: null,
                district: null,
                assembly: null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
        // If no year in URL and no specific PC selected, set to latest PC year and update URL
        if (!urlState.year && !urlState.pc && pcIndex && pcIndex.availableYears.length > 0) {
          const latestYear = pcIndex.availableYears[pcIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
            setPCSelectedYear(latestYear);
            // Update URL immediately with latest year (use ref to avoid dependency issues)
            setTimeout(() => {
              updateUrlRef.current({
                state: matchedState,
                view: 'constituencies',
                pc: null,
                district: null,
                assembly: null,
                year: latestYear,
                pcYear: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
      }

      // Handle blog state from URL
      if (urlState.blog) {
        setBlogOpen(true);
        // blogPost will be read by BlogSection component from URL
      }
    },
    [
      statesGeoJSON,
      navigateToState,
      navigateToPC,
      navigateToDistrict,
      navigateToAssemblies,
      loadDistrictsForState,
      resetView,
      selectAssembly,
      getACResult,
      getPCResult,
      loadStateIndex,
      loadPCStateIndex,
      resolvePCName,
      schema,
      getAC,
      resolveACName,
      setSelectedYear,
      clearSelectedYear,
      setPCSelectedYear,
      clearPCSelectedYear,
      setSelectedACPCYear,
      // Stable React setState setters + a ref - included to satisfy exhaustive-deps now that
      // they arrive as hook parameters rather than being visibly destructured from useState().
      setShowACsWithinPC,
      setCurrentData,
      setInitialPCWinners,
      setParliamentContributions,
      setLeftPane,
      setLeftPaneView,
      setLeftPaneParty,
      setBlogOpen,
      updateUrlRef,
    ]
  );

  return { handleUrlNavigate };
}
