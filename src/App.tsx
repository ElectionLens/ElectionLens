import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { BlogSection } from './components/BlogSection';
import { MetaTags } from './components/MetaTags';
import { useElectionData } from './hooks/useElectionData';
import { useElectionResults } from './hooks/useElectionResults';
import { useParliamentResults } from './hooks/useParliamentResults';
import { useUrlState, type UrlState } from './hooks/useUrlState';
import { useSchema } from './hooks/useSchema';
import { ELECTIONS, PC_ELECTIONS } from './constants/paths';
import { STATE_FILE_MAP } from './constants';
import { normalizeName, toTitleCase } from './utils/helpers';
import { trackPageView, trackConstituencySelect } from './utils/firebase';
import type {
  GeoJSONData,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  ViewMode,
  ElectionResultsByConstituency,
  PCElectionResultsByConstituency,
} from './types';

/**
 * All available parliament election years (post-delimitation)
 */
const PARLIAMENT_YEARS = [2009, 2014, 2019, 2024];

/** Get state ID from state display name (e.g. "Tamil Nadu" -> "TN") for PC path lookup */
function getStateIdFromName(stateName: string): string {
  const normalized = normalizeName(stateName);
  const byState = STATE_FILE_MAP[stateName as keyof typeof STATE_FILE_MAP];
  if (byState) return byState;
  const byNorm = STATE_FILE_MAP[normalized as keyof typeof STATE_FILE_MAP];
  if (byNorm) return byNorm;
  for (const [key, value] of Object.entries(STATE_FILE_MAP)) {
    if (normalizeName(key) === normalized) return value;
  }
  return normalized.toUpperCase().slice(0, 2);
}

/**
 * Main application component
 * Orchestrates data loading, navigation, and UI state
 */
function App(): JSX.Element {
  const {
    statesGeoJSON,
    parliamentGeoJSON,
    assemblyGeoJSON,
    districtsCache,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    loading,
    cacheStats,
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState,
    selectAssembly,
  } = useElectionData();

  // Assembly election results hook
  const {
    currentResult: electionResult,
    availableYears,
    selectedYear,
    getACResult,
    setSelectedYear,
    clearResult: clearElectionResult,
    loadStateIndex,
  } = useElectionResults();

  // Parliamentary election results hook
  const {
    currentResult: pcElectionResult,
    availableYears: pcAvailableYears,
    selectedYear: pcSelectedYear,
    getPCResult,
    setSelectedYear: setPCSelectedYear,
    clearResult: clearPCElectionResult,
    loadStateIndex: loadPCStateIndex,
  } = useParliamentResults();

  // Schema for canonical name resolution
  const { getAC, getPC, resolveACName, resolveStateName, resolvePCName, schema } = useSchema();

  // State for AC's parliament contributions (all years)
  const [parliamentContributions, setParliamentContributions] = useState<
    Record<
      number,
      {
        pcName: string;
        year: number;
        candidates: Array<{
          name: string;
          party: string;
          votes: number;
          voteShare: number;
          position: number;
        }>;
        validVotes: number;
      }
    >
  >({});

  // Selected parliament year in AC panel (for URL state)
  const [selectedACPCYear, setSelectedACPCYear] = useState<number | null>(null);

  // Available parliament years for the current AC: always show all PARLIAMENT_YEARS in toolbar/panel
  // (merged with any loaded contributions so 2019-PC etc. appear even before that year is loaded)
  const availablePCYears = useMemo(
    () =>
      [...new Set([...Object.keys(parliamentContributions).map(Number), ...PARLIAMENT_YEARS])].sort(
        (a, b) => a - b
      ),
    [parliamentContributions]
  );

  /**
   * Handle URL-based navigation (deep linking)
   */
  const handleUrlNavigate = useCallback(
    async (urlState: UrlState): Promise<void> => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'App.tsx:handleUrlNavigate',
          message: 'Entry',
          data: {
            state: urlState.state,
            district: urlState.district,
            assembly: urlState.assembly,
            year: urlState.year,
            pcYear: urlState.pcYear,
            branch: urlState.pc
              ? 'pc'
              : urlState.district
                ? 'district'
                : urlState.view === 'assemblies'
                  ? 'assemblies'
                  : 'other',
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'A',
        }),
      }).catch(() => {});
      // #endregion
      if (!urlState.state) {
        resetView();
        setCurrentData(null);
        setInitialPCWinners(null);
        // Redirect to clean root: /?year=2019 -> / (replace so back button doesn't restore params)
        if (window.location.pathname === '/' && window.location.search) {
          window.history.replaceState({}, '', '/');
        }
        return;
      }

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
        // #region agent log
        if (matchedState?.toLowerCase().includes('karnataka') && urlState.district) {
          fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'App.tsx:handleUrlNavigate district branch',
              message: 'acIndex and year validation',
              data: {
                matchedState,
                district: urlState.district,
                urlStateYear: urlState.year,
                availableYears: acIndex?.availableYears ?? [],
                yearValid: acIndex ? acIndex.availableYears.includes(urlState.year ?? 0) : false,
              },
              timestamp: Date.now(),
              sessionId: 'debug-session',
              hypothesisId: 'H4',
            }),
          }).catch(() => {});
        }
        // #endregion
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
          const latestYear = acIndex.availableYears[acIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
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
                tab: null,
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
          const latestYear = acIndex.availableYears[acIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'App.tsx:handleUrlNavigate district branch',
                message: 'Correcting invalid year to latest',
                data: { urlStateYear: urlState.year, latestYear, matchedState },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                hypothesisId: 'H4',
              }),
            }).catch(() => {});
            // #endregion
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
                tab: null,
                showACs: null,
                blog: false,
                blogPost: null,
              });
            }, 0);
          }
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'App.tsx:handleUrlNavigate district branch',
            message: 'After set year state',
            data: {
              urlStateYear: urlState.year,
              urlStatePcYear: urlState.pcYear,
              setSelectedACPCYearTo: urlState.pcYear ?? null,
              setSelectedYearTo: urlState.year ?? null,
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            hypothesisId: 'A',
          }),
        }).catch(() => {});
        // #endregion
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
          // Re-apply URL year so we win over any in-flight loadStateIndex() that overwrote it
          if (urlState.year != null) setSelectedYear(urlState.year);
          if (!urlState.pcYear) setSelectedACPCYear(null);
        }
      } else if (urlState.view === 'assemblies') {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'App.tsx:handleUrlNavigate assemblies branch entry',
            message: 'urlState year/pcYear and what we set',
            data: {
              urlStateYear: urlState.year,
              urlStatePcYear: urlState.pcYear,
              settingPcYear: !!urlState.pcYear,
              settingYearFromUrl: !!urlState.year,
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            hypothesisId: 'H1',
          }),
        }).catch(() => {});
        // #endregion
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
          const latestYear = acIndex.availableYears[acIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'App.tsx:handleUrlNavigate set latestYear (no year in URL)',
                message: 'default year for state-level AC view',
                data: { latestYear, state: matchedState },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                hypothesisId: 'H2',
              }),
            }).catch(() => {});
            // #endregion
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
                tab: null,
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
          const latestYear = acIndex.availableYears[acIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
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
                tab: null,
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
          // Re-apply URL year so we win over any in-flight loadStateIndex() that overwrote it
          if (urlState.year != null) setSelectedYear(urlState.year);
          if (!urlState.pcYear) setSelectedACPCYear(null);
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
          const latestYear = acIndex.availableYears[acIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
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
                tab: null,
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
          const latestYear = acIndex.availableYears[acIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
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
                tab: null,
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
          // Fetch state GeoJSON and PC results in parallel so first paint has party colors
          const [stateData, pcResults] = await Promise.all([
            navigateToState(matchedState),
            fetch(PC_ELECTIONS.getYearPath(stateId, urlState.year)).then((r) =>
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
                  const acIndexRes = await fetch(ELECTIONS.getIndexPath(stateId));
                  if (acIndexRes.ok) {
                    const acIndex = (await acIndexRes.json()) as { availableYears?: number[] };
                    const acYears = acIndex.availableYears ?? [];
                    const assemblyYear =
                      acYears.filter((y) => y <= urlState.year!).pop() ??
                      acYears[acYears.length - 1];
                    if (assemblyYear != null) {
                      const acRes = await fetch(ELECTIONS.getYearPath(stateId, assemblyYear));
                      if (acRes.ok) {
                        const acResults = (await acRes.json()) as ElectionResultsByConstituency;
                        const acWinners: Record<string, { party: string; candidate: string }> = {};
                        const schemaIdPattern = /^[A-Z]{2}-\d+$/;
                        for (const [key, result] of Object.entries(acResults)) {
                          if (result?.candidates?.length && result.candidates[0]) {
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
        void loadStateIndex(matchedState);
        const pcIndex = await loadPCStateIndex(matchedState);

        // If year in URL, set pcSelectedYear so toolbar and PC-click preserve it (fix: year no longer jumps to 2024)
        if (urlState.year != null) {
          setPCSelectedYear(urlState.year);
        }
        // If year in URL is not available for this state's PC data, correct to latest so map is colored
        if (
          urlState.year != null &&
          pcIndex &&
          pcIndex.availableYears.length > 0 &&
          !pcIndex.availableYears.includes(urlState.year)
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
                tab: null,
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
                tab: null,
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
      setSelectedYear,
      setPCSelectedYear,
      setSelectedACPCYear,
    ]
  );

  // URL state management for deep linking
  // Wait for statesGeoJSON to be loaded before processing URL
  const isDataReady = Boolean(statesGeoJSON);
  // When viewing a specific PC: true = show ACs within PC, false = show PC boundary only (synced to URL)
  const [showACsWithinPC, setShowACsWithinPC] = useState<boolean>(true);
  // Use the appropriate year based on context:
  // - For AC view (assemblies) or districts: use assembly year (selectedYear) or pcYear (selectedACPCYear)
  // - For PC view (constituencies): use parliament year (pcSelectedYear)
  const urlYear =
    currentView === 'assemblies' || currentView === 'districts' ? selectedYear : pcSelectedYear;
  const { getShareableUrl, updateUrl } = useUrlState(
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    urlYear,
    selectedACPCYear,
    handleUrlNavigate,
    isDataReady,
    showACsWithinPC
  );

  // Ref to store updateUrl for use in handleUrlNavigate
  const updateUrlRef = useRef(updateUrl);
  useEffect(() => {
    updateUrlRef.current = updateUrl;
  }, [updateUrl]);

  // Keep selectedYear in sync with URL when on AC page with ?year= (single source of truth)
  // Corrects any overwrite from loadStateIndex or other async updates after initial URL load
  const getACResultRef = useRef(getACResult);
  getACResultRef.current = getACResult;
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      currentView !== 'assemblies' ||
      !currentAssembly ||
      !currentState
    ) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get('year');
    if (!yearParam || yearParam.startsWith('pc-')) return;
    const urlYear = parseInt(yearParam, 10);
    if (isNaN(urlYear)) return;
    if (selectedYear !== urlYear) {
      setSelectedYear(urlYear);
      setSelectedACPCYear(null);
      const ac = currentAssembly;
      const state = currentState;
      const loadResult = (): void => {
        getACResultRef.current(ac, state, urlYear);
      };
      void Promise.resolve().then(loadResult);
    }
  }, [currentView, currentAssembly, currentState, selectedYear]);

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Desktop sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Blog section state
  const [blogOpen, setBlogOpen] = useState<boolean>(false);

  // Current displayed data
  const [currentData, setCurrentData] = useState<GeoJSONData | null>(null);

  // PC winners for state-level PC view first paint (set in handleUrlNavigate so map has colors before MapView loadResults)
  const [initialPCWinners, setInitialPCWinners] = useState<Record<
    string,
    { party: string; candidate: string }
  > | null>(null);

  /**
   * Update document title dynamically for SEO and browser tabs
   * Also track page views for analytics
   */
  useEffect(() => {
    let title = 'Election Lens - India Electoral Map';

    if (electionResult) {
      // Constituency selected with election result
      title = `${(electionResult.constituencyNameOriginal ?? electionResult.name ?? electionResult.constituencyName ?? 'Constituency').toUpperCase()} ${electionResult.year ?? ''} Results | Election Lens`;
    } else if (currentAssembly) {
      title = `${currentAssembly} | Election Lens`;
    } else if (currentPC) {
      title = `${currentPC} PC, ${currentState} | Election Lens`;
    } else if (currentDistrict) {
      title = `${currentDistrict} District, ${currentState} | Election Lens`;
    } else if (currentState) {
      title = `${currentState} Elections | Election Lens`;
    }

    document.title = title;

    // Track page view in Firebase Analytics
    trackPageView(window.location.pathname, title);
  }, [currentState, currentPC, currentDistrict, currentAssembly, electionResult]);

  /**
   * Toggle mobile sidebar visibility
   */
  const toggleSidebar = useCallback((): void => {
    setSidebarOpen((prev) => !prev);
  }, []);

  /**
   * Close mobile sidebar
   */
  const closeSidebar = useCallback((): void => {
    setSidebarOpen(false);
  }, []);

  /**
   * Toggle desktop sidebar collapsed state
   */
  const toggleSidebarCollapsed = useCallback((): void => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  /**
   * Auto-collapse sidebar on desktop when election panel opens
   */
  useEffect(() => {
    const hasPanelOpen = !!electionResult || !!pcElectionResult || blogOpen;
    if (hasPanelOpen && window.innerWidth > 768) {
      setSidebarCollapsed(true);
    }
  }, [electionResult, pcElectionResult, blogOpen]);

  /**
   * Close sidebar on mobile after action
   */
  const closeSidebarOnMobile = useCallback((): void => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }, [closeSidebar]);

  // Load initial data and update on state changes
  useEffect(() => {
    async function updateData(): Promise<void> {
      if (currentPC && currentState) {
        const data = await navigateToPC(currentPC, currentState);
        setCurrentData(data);
      } else if (currentDistrict && currentState) {
        const data = await navigateToDistrict(currentDistrict, currentState);
        setCurrentData(data);
      } else if (currentState) {
        if (currentView === 'constituencies') {
          const data = await navigateToState(currentState);
          setCurrentData(data);
        } else if (currentView === 'assemblies') {
          const data = await navigateToAssemblies(currentState);
          setCurrentData(data);
        } else if (currentView === 'districts') {
          const data = await loadDistrictsForState(currentState);
          setCurrentData(data);
        }
      } else {
        setCurrentData(null);
      }
    }
    void updateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState, currentView, currentPC, currentDistrict]);

  /**
   * Handle state click from map or sidebar
   */
  const handleStateClick = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarOnMobile();
      clearElectionResult();
      clearPCElectionResult();
      const data = await navigateToState(stateName);
      setCurrentData(data);
      // Pre-load election index for the state (both AC and PC)
      void loadStateIndex(stateName);
      const pcIndex = await loadPCStateIndex(stateName);
      // Landing on PC view: ensure valid PC year for this state so map is colored
      if (
        pcIndex?.availableYears?.length &&
        (pcSelectedYear == null || !pcIndex.availableYears.includes(pcSelectedYear))
      ) {
        const latestYear = pcIndex.availableYears[pcIndex.availableYears.length - 1];
        if (latestYear !== undefined) {
          setPCSelectedYear(latestYear);
          updateUrlRef.current({
            state: stateName,
            view: 'constituencies',
            pc: null,
            district: null,
            assembly: null,
            year: latestYear,
            pcYear: null,
            tab: null,
            showACs: null,
            blog: false,
            blogPost: null,
          });
        }
      }
      // Track analytics
      trackConstituencySelect('state', stateName);
    },
    [
      navigateToState,
      closeSidebarOnMobile,
      loadStateIndex,
      loadPCStateIndex,
      clearElectionResult,
      clearPCElectionResult,
      pcSelectedYear,
      setPCSelectedYear,
    ]
  );

  /**
   * Handle district click from map or sidebar
   */
  const handleDistrictClick = useCallback(
    async (districtName: string, _feature: DistrictFeature): Promise<void> => {
      closeSidebarOnMobile();
      if (!currentState) return;
      selectAssembly(null); // Clear assembly when navigating to new district
      clearElectionResult();
      clearPCElectionResult();
      const data = await navigateToDistrict(districtName, currentState);
      setCurrentData(data);
      // Track analytics
      trackConstituencySelect('district', districtName, currentState);
    },
    [
      navigateToDistrict,
      currentState,
      closeSidebarOnMobile,
      selectAssembly,
      clearElectionResult,
      clearPCElectionResult,
    ]
  );

  /**
   * Handle constituency click from map or sidebar
   */
  const handleConstituencyClick = useCallback(
    async (pcName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarOnMobile();
      if (!currentState) return;
      selectAssembly(null); // Clear assembly when navigating to new PC
      clearElectionResult();
      const data = await navigateToPC(pcName, currentState);
      setCurrentData(data);
      // Preserve year: use pcSelectedYear, or fallback to URL (handles stale closure / state not yet updated)
      let yearToLoad = pcSelectedYear ?? undefined;
      if (yearToLoad == null && typeof window !== 'undefined') {
        const yearParam = new URLSearchParams(window.location.search).get('year');
        if (yearParam && !yearParam.startsWith('pc-')) {
          const parsed = parseInt(yearParam, 10);
          if (!isNaN(parsed)) yearToLoad = parsed;
        }
      }
      await getPCResult(pcName, currentState, yearToLoad);
      // Track analytics
      trackConstituencySelect('pc', pcName, currentState);
    },
    [
      navigateToPC,
      currentState,
      pcSelectedYear,
      closeSidebarOnMobile,
      selectAssembly,
      clearElectionResult,
      getPCResult,
    ]
  );

  /**
   * Get related states to search (for boundary changes like AP-Telangana)
   */
  const getRelatedStates = (state: string): string[] => {
    const normalizedState = state.toUpperCase();
    const related: Record<string, string[]> = {
      'ANDHRA PRADESH': ['telangana'],
      TELANGANA: ['andhra-pradesh'],
      'MADHYA PRADESH': ['chhattisgarh'],
      CHHATTISGARH: ['madhya-pradesh'],
      BIHAR: ['jharkhand'],
      JHARKHAND: ['bihar'],
      'UTTAR PRADESH': ['uttarakhand'],
      UTTARAKHAND: ['uttar-pradesh'],
    };
    return related[normalizedState] || [];
  };

  /**
   * Load AC's contribution to all parliament elections
   */
  const loadAllParliamentContributions = useCallback(
    async (acName: string, pcName: string, stateName: string) => {
      // Use state ID for folder path (e.g., "RJ" instead of "rajasthan")
      const stateId = resolveStateName(stateName);
      const stateSlug =
        stateId ||
        stateName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(
            /[āīūṭḍṇṃ]/g,
            (c) => ({ ā: 'a', ī: 'i', ū: 'u', ṭ: 't', ḍ: 'd', ṇ: 'n', ṃ: 'm' })[c] || c
          );
      const relatedStates = getRelatedStates(stateName);

      const contributions: Record<
        number,
        {
          pcName: string;
          year: number;
          candidates: Array<{
            name: string;
            party: string;
            votes: number;
            voteShare: number;
            position: number;
          }>;
          validVotes: number;
        }
      > = {};

      // Load all parliament years in parallel
      await Promise.all(
        PARLIAMENT_YEARS.map(async (parliamentYear) => {
          try {
            const response = await fetch(`/data/elections/pc/${stateSlug}/${parliamentYear}.json`);

            if (!response.ok) return;

            const pcData = (await response.json()) as Record<
              string,
              {
                constituencyName?: string;
                constituencyNameOriginal?: string;
                candidates: Array<{
                  name: string;
                  party: string;
                  votes: number;
                  voteShare: number;
                  position: number;
                  acWiseVotes?: Array<{
                    acName: string;
                    votes: number;
                    voteShare: number;
                  }>;
                }>;
              }
            >;

            // Helper to find AC in a PC's candidates
            const findAcInPC = (
              pcCandidates: (typeof pcData)[string]['candidates'],
              acName: string,
              normalizeAcName: (n: string) => string,
              stripSpaces: (n: string) => string,
              createFuzzyKey: (n: string) => string,
              _similarityScore: (a: string, b: string) => number // Prefixed with _ to indicate intentionally unused
            ) => {
              const acKeyNormalized = normalizeAcName(acName);
              const acKeyStripped = stripSpaces(acName);
              const acKeyFuzzy = createFuzzyKey(acName);

              for (const candidate of pcCandidates) {
                if (!candidate.acWiseVotes) continue;

                let acVotes = candidate.acWiseVotes.find((av) => {
                  const avNameNormalized = normalizeAcName(av.acName);
                  const avNameStripped = stripSpaces(av.acName);
                  const avNameFuzzy = createFuzzyKey(av.acName);
                  return (
                    avNameNormalized === acKeyNormalized ||
                    avNameStripped === acKeyStripped ||
                    avNameFuzzy === acKeyFuzzy ||
                    avNameNormalized.includes(acKeyNormalized) ||
                    acKeyNormalized.includes(avNameNormalized)
                  );
                });

                if (!acVotes && acKeyStripped.length >= 5) {
                  let bestMatch: (typeof candidate.acWiseVotes)[0] | undefined;
                  let bestScore = 0.8;
                  for (const av of candidate.acWiseVotes) {
                    const avStripped = stripSpaces(av.acName);
                    const aChars = new Set(acKeyStripped.split(''));
                    const bChars = new Set(avStripped.split(''));
                    let common = 0;
                    for (const c of aChars) {
                      if (bChars.has(c)) common++;
                    }
                    const score = common / new Set([...aChars, ...bChars]).size;
                    if (score > bestScore) {
                      bestScore = score;
                      bestMatch = av;
                    }
                  }
                  acVotes = bestMatch;
                }

                if (acVotes) return { candidate, acVotes };
              }
              return null;
            };

            // Find the PC in the data - try multiple matching strategies
            const pcKey = pcName.toUpperCase();
            let pc = pcData[pcKey];

            if (!pc) {
              // Try finding by name fields
              pc = Object.values(pcData).find(
                (p) =>
                  p.constituencyName?.toUpperCase() === pcKey ||
                  p.constituencyNameOriginal?.toUpperCase() === pcKey ||
                  p.constituencyName?.toUpperCase().includes(pcKey) ||
                  pcKey.includes(p.constituencyName?.toUpperCase() || '')
              ) as typeof pc;
            }

            // Extract AC-wise results from each candidate's acWiseVotes
            // Normalize AC name for matching - handle spelling variations and format differences
            const normalizeAcName = (name: string): string => {
              return (
                name
                  .toUpperCase()
                  .trim()
                  // Remove reservation type suffixes like (BL), (SC), (ST), (GEN)
                  .replace(/\s*\((BL|SC|ST|GEN)\)\s*/gi, ' ')
                  .replace(/[()]/g, ' ') // Replace remaining parentheses with spaces
                  .replace(/-/g, ' ') // Replace hyphens with spaces (Hubli-Dharwad -> Hubli Dharwad)
                  .replace(/\s+/g, ' ') // Normalize multiple spaces
                  .replace(/TIRUCHIRAPALLI(?!P)/g, 'TIRUCHIRAPPALLI') // Normalize single P to double P
                  .replace(/VIJAYWADA/g, 'VIJAYAWADA') // Fix Vijayawada spelling
                  .trim()
              );
            };

            // Create a stripped version with no spaces for matching "Seelam Pur" vs "Seelampur"
            const stripSpaces = (name: string): string => {
              return normalizeAcName(name).replace(/\s+/g, '');
            };

            // Create a fuzzy key by removing vowels and normalizing consonants
            const createFuzzyKey = (name: string): string => {
              return stripSpaces(name)
                .replace(/[?-]/g, '') // Remove special chars
                .replace(/RURAL/g, 'GRAMIN') // Rural = Gramin
                .replace(/GANJ$/g, 'GUNGE') // Tollyganj -> Tollygunge
                .replace(/GUNGE$/g, 'GUNGE') // Standardize
                .replace(/PURBA$/g, 'EAST') // Purba = East
                .replace(/PASCHIM$/g, 'WEST') // Paschim = West
                .replace(/DAKSHIN$/g, 'SOUTH') // Dakshin = South
                .replace(/UTTAR$/g, 'NORTH') // Uttar = North
                .replace(/SH/g, 'S') // Normalize SH to S (Sikaripara vs Shikaripara)
                .replace(/PH/g, 'F') // Normalize PH to F
                .replace(/TH/g, 'T') // Normalize TH to T
                .replace(/Y/g, 'I') // Normalize Y to I
                .replace(/W/g, 'V') // Normalize W to V (Sumawali vs Sumaoli)
                .replace(/EE/g, 'I') // Normalize EE to I
                .replace(/OO/g, 'U') // Normalize OO to U
                .replace(/AA/g, 'A') // Normalize AA to A
                .replace(/[AEIOU]/g, '') // Remove vowels
                .substring(0, 12); // First 12 consonants for comparison
            };

            // Calculate similarity score between two strings using Levenshtein distance
            const similarityScore = (a: string, b: string): number => {
              if (a === b) return 1;
              if (a.length === 0 || b.length === 0) return 0;

              // Simple character-based similarity for speed
              const aChars = new Set(a.split(''));
              const bChars = new Set(b.split(''));
              let common = 0;
              for (const c of aChars) {
                if (bChars.has(c)) common++;
              }
              const unionSize = new Set([...aChars, ...bChars]).size;
              return unionSize > 0 ? common / unionSize : 0;
            };

            const acCandidates: Array<{
              name: string;
              party: string;
              votes: number;
              voteShare: number;
              position: number;
            }> = [];

            // Determine which PC to search - first try specified PC, then search all PCs
            const searchPCs: Array<{ pc: typeof pc; pcName: string }> = [];

            if (pc && pc.candidates) {
              searchPCs.push({ pc, pcName: pc.constituencyNameOriginal || pcName });
            }

            // If no match in specified PC, search ALL PCs in the state
            let foundInPC: string | null = null;

            for (const { pc: searchPC, pcName: searchPCName } of searchPCs) {
              if (!searchPC?.candidates) continue;
              searchPC.candidates.forEach((candidate) => {
                if (candidate.acWiseVotes) {
                  const result = findAcInPC(
                    [candidate],
                    acName,
                    normalizeAcName,
                    stripSpaces,
                    createFuzzyKey,
                    similarityScore
                  );
                  if (result) {
                    acCandidates.push({
                      name: result.candidate.name,
                      party: result.candidate.party,
                      votes: result.acVotes.votes,
                      voteShare: result.acVotes.voteShare,
                      position: 0,
                    });
                    foundInPC = searchPCName;
                  }
                }
              });
            }

            // If still not found, search ALL PCs in state data
            if (acCandidates.length === 0) {
              for (const [, otherPC] of Object.entries(pcData)) {
                if (!otherPC.candidates) continue;
                for (const candidate of otherPC.candidates) {
                  if (!candidate.acWiseVotes) continue;
                  const result = findAcInPC(
                    [candidate],
                    acName,
                    normalizeAcName,
                    stripSpaces,
                    createFuzzyKey,
                    similarityScore
                  );
                  if (result) {
                    acCandidates.push({
                      name: result.candidate.name,
                      party: result.candidate.party,
                      votes: result.acVotes.votes,
                      voteShare: result.acVotes.voteShare,
                      position: 0,
                    });
                    foundInPC = otherPC.constituencyNameOriginal || 'Unknown PC';
                  }
                }
                if (acCandidates.length > 0) break; // Found in another PC
              }
            }

            // If still not found, try related states (for boundary changes like AP-Telangana)
            if (acCandidates.length === 0 && relatedStates.length > 0) {
              for (const relatedState of relatedStates) {
                try {
                  const relatedResponse = await fetch(
                    `/data/elections/pc/${relatedState}/${parliamentYear}.json`
                  );
                  if (!relatedResponse.ok) continue;

                  const relatedPcData = (await relatedResponse.json()) as Record<
                    string,
                    {
                      constituencyName?: string;
                      constituencyNameOriginal?: string;
                      candidates: Array<{
                        name: string;
                        party: string;
                        votes: number;
                        voteShare: number;
                        position: number;
                        acWiseVotes?: Array<{
                          acName: string;
                          votes: number;
                          voteShare: number;
                        }>;
                      }>;
                    }
                  >;

                  for (const [, relatedPC] of Object.entries(relatedPcData)) {
                    if (!relatedPC.candidates) continue;
                    for (const candidate of relatedPC.candidates) {
                      if (!candidate.acWiseVotes) continue;
                      const result = findAcInPC(
                        [candidate],
                        acName,
                        normalizeAcName,
                        stripSpaces,
                        createFuzzyKey,
                        similarityScore
                      );
                      if (result) {
                        acCandidates.push({
                          name: result.candidate.name,
                          party: result.candidate.party,
                          votes: result.acVotes.votes,
                          voteShare: result.acVotes.voteShare,
                          position: 0,
                        });
                        foundInPC = relatedPC.constituencyNameOriginal || 'Unknown PC';
                      }
                    }
                    if (acCandidates.length > 0) break;
                  }
                  if (acCandidates.length > 0) break;
                } catch {
                  // Silently fail for related state
                }
              }
            }

            if (acCandidates.length === 0) return;

            // Sort by votes to get correct positions
            acCandidates.sort((a, b) => b.votes - a.votes);
            acCandidates.forEach((c, idx) => {
              c.position = idx + 1;
            });

            contributions[parliamentYear] = {
              pcName: foundInPC || pcName,
              year: parliamentYear,
              candidates: acCandidates,
              validVotes: acCandidates.reduce((sum, c) => sum + c.votes, 0),
            };
          } catch (err) {
            // Silently fail for individual years
          }
        })
      );

      setParliamentContributions(contributions);
    },
    [resolveStateName]
  );

  /**
   * Load parliament contributions when assembly is selected via deep link
   * This effect runs when there's a selected assembly but no parliament contributions yet
   * Uses assemblyGeoJSON or schema to find the PC name
   */
  useEffect(() => {
    if (currentAssembly && currentState && Object.keys(parliamentContributions).length === 0) {
      // Try to find the PC name from assemblyGeoJSON first
      let pcName: string | null = null;

      if (assemblyGeoJSON) {
        const acFeature = assemblyGeoJSON.features.find(
          (f) => f.properties.AC_NAME?.toUpperCase() === currentAssembly.toUpperCase()
        );
        pcName = acFeature?.properties.PC_NAME ?? null;
      }

      // Fallback to schema if assemblyGeoJSON doesn't have the feature
      if (!pcName) {
        const stateId = resolveStateName(currentState);
        if (stateId) {
          const acId = resolveACName(currentAssembly, stateId);
          if (acId) {
            const acEntity = getAC(acId);
            if (acEntity?.pcId) {
              const pcEntity = getPC(acEntity.pcId);
              if (pcEntity) {
                pcName = pcEntity.name.toUpperCase();
              }
            }
          }
        }
      }

      if (pcName) {
        void loadAllParliamentContributions(currentAssembly, pcName, currentState);
      }
    }
  }, [
    currentAssembly,
    currentState,
    assemblyGeoJSON,
    parliamentContributions,
    loadAllParliamentContributions,
    resolveStateName,
    resolveACName,
    getAC,
    getPC,
  ]);

  /**
   * Handle assembly click - select, zoom, and show election results
   */
  const handleAssemblyClick = useCallback(
    async (acName: string, feature: AssemblyFeature): Promise<void> => {
      closeSidebarOnMobile(); // Close sidebar on mobile to show map + panel
      selectAssembly(acName);
      clearPCElectionResult(); // Close PC panel to show AC panel
      setParliamentContributions({}); // Clear previous contributions

      // Preserve year parameters from URL when switching assemblies
      // Tab parameter is automatically preserved by useUrlState's updateUrl
      const urlParams = new URLSearchParams(window.location.search);
      const yearParam = urlParams.get('year');
      let yearToUse: number | undefined = undefined;

      // When toolbar is already in PC contribution mode, keep it — do not let a stale ?year=2021
      // (or a stale closure missing selectedACPCYear in deps) clear PC coloring after sidebar click/search.
      if (selectedACPCYear != null) {
        if (selectedYear !== null) {
          yearToUse = selectedYear;
        }
      } else if (yearParam) {
        if (yearParam.startsWith('pc-')) {
          // Parliament contribution year: year=pc-2024
          const parsed = parseInt(yearParam.slice(3), 10);
          if (!isNaN(parsed)) {
            setSelectedACPCYear(parsed);
          }
        } else {
          // Regular year (assembly or, in PC view, the PC year)
          const parsed = parseInt(yearParam, 10);
          if (!isNaN(parsed)) {
            yearToUse = parsed;
            // In PC view, show AC contribution to PC for this year; in district/AC view, show assembly result (clear PC year)
            if (currentPC && pcSelectedYear != null) {
              setSelectedACPCYear(pcSelectedYear);
            } else {
              setSelectedACPCYear(null); // Assembly year in URL — panel shows AC result, not PC contribution
            }
          }
        }
      } else if (currentPC && pcSelectedYear != null) {
        // PC view but no year in URL: use current PC year so panel shows AC contribution to PC
        setSelectedACPCYear(pcSelectedYear);
      } else {
        // District or state AC view, no year in URL — ensure panel shows assembly result, not stale PC year
        setSelectedACPCYear(null);
      }

      // If no year in URL, preserve current selectedYear if it exists
      if (yearToUse === undefined && selectedYear !== null) {
        yearToUse = selectedYear;
      }

      // Load election results for this AC - preserve year if available
      if (currentState) {
        // Try to use schema for direct lookup (avoids fuzzy matching)
        const schemaId = feature.properties.schemaId;
        const schemaAC = schemaId ? getAC(schemaId) : null;

        await getACResult(acName, currentState, yearToUse, {
          schemaId,
          canonicalName: schemaAC?.name,
        });

        // Load all parliament contributions if we have PC info
        const pcName = feature.properties.PC_NAME;
        if (pcName) {
          await loadAllParliamentContributions(acName, pcName, currentState);
        }

        // Tab parameter will be preserved automatically by useUrlState's updateUrl
        // which reads it from the current URL when updating

        // Track analytics
        trackConstituencySelect('assembly', acName, currentState);
      }
    },
    [
      closeSidebarOnMobile,
      selectAssembly,
      currentState,
      currentPC,
      pcSelectedYear,
      selectedACPCYear,
      getACResult,
      getAC,
      clearPCElectionResult,
      loadAllParliamentContributions,
      selectedYear,
      setSelectedACPCYear,
    ]
  );

  /**
   * Handle closing the election panel
   */
  const handleCloseElectionPanel = useCallback((): void => {
    selectAssembly(null);
    clearElectionResult();
    setSelectedACPCYear(null); // Reset PC year selection
    // Note: Don't clear PC result when closing AC panel in PC view
    // The PC panel should remain visible
  }, [selectAssembly, clearElectionResult]);

  /**
   * Handle closing the PC election panel
   */
  const handleClosePCElectionPanel = useCallback((): void => {
    clearPCElectionResult();
  }, [clearPCElectionResult]);

  /**
   * Handle search selection - state
   */
  const handleSearchStateSelect = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarOnMobile();
      const data = await navigateToState(stateName);
      setCurrentData(data);
    },
    [navigateToState, closeSidebarOnMobile]
  );

  /**
   * Handle search selection - constituency
   */
  const handleSearchConstituencySelect = useCallback(
    async (pcName: string, stateName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarOnMobile();
      // First navigate to the state
      await navigateToState(stateName);
      // Then navigate to the PC
      const data = await navigateToPC(pcName, stateName);
      setCurrentData(data);
    },
    [navigateToState, navigateToPC, closeSidebarOnMobile]
  );

  /**
   * Handle search selection - assembly
   * Navigate to the assemblies view and select the assembly
   * URL: /state/ac/ac-name?year=YYYY or year=pc-YYYY (same URL/year rules as map click)
   */
  const handleSearchAssemblySelect = useCallback(
    async (acName: string, stateName: string, feature: AssemblyFeature): Promise<void> => {
      closeSidebarOnMobile();
      clearPCElectionResult();
      setParliamentContributions({});

      const data = await navigateToAssemblies(stateName);
      setCurrentData(data);

      selectAssembly(acName);

      const urlParams = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : ''
      );
      const yearParam = urlParams.get('year');
      let yearToUse: number | undefined = undefined;

      if (selectedACPCYear != null) {
        if (selectedYear !== null) {
          yearToUse = selectedYear;
        }
      } else if (yearParam) {
        if (yearParam.startsWith('pc-')) {
          const parsed = parseInt(yearParam.slice(3), 10);
          if (!isNaN(parsed)) {
            setSelectedACPCYear(parsed);
          }
        } else {
          const parsed = parseInt(yearParam, 10);
          if (!isNaN(parsed)) {
            yearToUse = parsed;
            if (currentPC && pcSelectedYear != null) {
              setSelectedACPCYear(pcSelectedYear);
            } else {
              setSelectedACPCYear(null);
            }
          }
        }
      } else if (currentPC && pcSelectedYear != null) {
        setSelectedACPCYear(pcSelectedYear);
      } else {
        setSelectedACPCYear(null);
      }

      if (yearToUse === undefined && selectedYear !== null) {
        yearToUse = selectedYear;
      }

      const stateId = getStateIdFromName(stateName);
      const schemaId = feature.properties.schemaId ?? resolveACName(acName, stateId);
      const schemaAC = schemaId ? getAC(schemaId) : null;

      await getACResult(acName, stateName, yearToUse, {
        schemaId: schemaId ?? undefined,
        canonicalName: schemaAC?.name,
      });

      const pcName = feature.properties.PC_NAME;
      if (pcName) {
        await loadAllParliamentContributions(acName, pcName, stateName);
      }

      trackConstituencySelect('assembly', acName, stateName);
    },
    [
      navigateToAssemblies,
      selectAssembly,
      getACResult,
      closeSidebarOnMobile,
      clearPCElectionResult,
      getStateIdFromName,
      resolveACName,
      getAC,
      currentPC,
      pcSelectedYear,
      selectedYear,
      selectedACPCYear,
      setSelectedACPCYear,
      loadAllParliamentContributions,
    ]
  );

  /**
   * Handle search selection - district
   * Navigate to the district view
   * URL: /state/district/district-name
   */
  const handleSearchDistrictSelect = useCallback(
    async (districtName: string, stateName: string, _feature: DistrictFeature): Promise<void> => {
      closeSidebarOnMobile();
      clearElectionResult();
      clearPCElectionResult();

      // Navigate to the district
      const data = await navigateToDistrict(districtName, stateName);
      setCurrentData(data);

      // Track analytics
      trackConstituencySelect('district', districtName, stateName);
    },
    [navigateToDistrict, closeSidebarOnMobile, clearElectionResult, clearPCElectionResult]
  );

  /**
   * Copy shareable URL to clipboard
   */
  const handleShare = useCallback(async (): Promise<void> => {
    const url = getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: selectedYear,
      pcYear: null,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: blogOpen,
      blogPost: null,
    });

    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    showACsWithinPC,
    blogOpen,
  ]);

  /**
   * Handle year change in assembly election results
   */
  const handleYearChange = useCallback(
    async (year: number): Promise<void> => {
      setSelectedYear(year);
      // Sync year to URL in assemblies view (with or without assembly selected)
      if (currentState && currentView === 'assemblies') {
        const tab =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('tab')
            : null;
        const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
        const preservedTab = tab && validTabs.includes(tab) ? tab : null;
        updateUrlRef.current({
          state: currentState,
          view: currentView,
          pc: currentPC,
          district: currentDistrict,
          assembly: currentAssembly,
          year,
          pcYear: null,
          tab: preservedTab,
          showACs: currentPC ? (showACsWithinPC ?? true) : null,
          blog: false,
          blogPost: null,
        });
      }
      if (currentAssembly && currentState) {
        const stateId = getStateIdFromName(currentState);
        const schemaId = resolveACName(currentAssembly, stateId);
        await getACResult(currentAssembly, currentState, year, {
          schemaId: schemaId ?? undefined,
          canonicalName: schemaId ? getAC(schemaId)?.name : undefined,
        });
      }
    },
    [
      setSelectedYear,
      currentAssembly,
      currentPC,
      currentState,
      currentView,
      currentDistrict,
      getACResult,
      getStateIdFromName,
      resolveACName,
      getAC,
    ]
  );

  /**
   * Handle PC contribution year change in AC view (toolbar or sidepanel; syncs year=pc-YYYY to URL).
   * Pass null when switching to an assembly year to clear PC year.
   * Updates URL when in assemblies view OR when AC-within-PC (currentPC && currentAssembly).
   * When in AC-within-PC, also set pcSelectedYear so MapView loadResults and toolbar stay in sync.
   */
  const handleACPCYearChange = useCallback(
    (year: number | null): void => {
      setSelectedACPCYear(year);
      if (currentPC != null && currentAssembly != null && year != null) {
        setPCSelectedYear(year);
      }
      const inACViewOrACWithinPC =
        currentState &&
        (currentView === 'assemblies' || (currentPC != null && currentAssembly != null));
      if (!inACViewOrACWithinPC) return;
      const tab =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('tab')
          : null;
      const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
      const preservedTab = tab && validTabs.includes(tab) ? tab : null;
      updateUrlRef.current({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: null,
        pcYear: year,
        tab: preservedTab,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: false,
        blogPost: null,
      });
    },
    [currentAssembly, currentState, currentView, currentPC, currentDistrict]
  );

  /**
   * Handle year change in parliamentary election results (sync year to URL)
   */
  const handlePCYearChange = useCallback(
    async (year: number): Promise<void> => {
      setPCSelectedYear(year);
      if (currentState && (currentPC || currentView === 'constituencies')) {
        const tab =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('tab')
            : null;
        const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
        const preservedTab = tab && validTabs.includes(tab) ? tab : null;
        updateUrlRef.current({
          state: currentState,
          view: currentView,
          pc: currentPC,
          district: currentDistrict,
          assembly: currentAssembly,
          year,
          pcYear: null,
          tab: preservedTab,
          showACs: currentPC ? (showACsWithinPC ?? true) : null,
          blog: false,
          blogPost: null,
        });
      }
      if (currentPC && currentState) {
        await getPCResult(currentPC, currentState, year);
      }
    },
    [
      setPCSelectedYear,
      currentPC,
      currentState,
      currentView,
      currentDistrict,
      currentAssembly,
      getPCResult,
    ]
  );

  /**
   * Get current share URL for AC election results (matches URL: assembly year or year=pc-YYYY)
   */
  const currentShareUrl = useMemo(() => {
    if (!currentAssembly) return undefined;
    const pcYearActive = selectedACPCYear != null;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: pcYearActive ? null : selectedYear,
      pcYear: pcYearActive ? selectedACPCYear : null,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: blogOpen,
      blogPost: null,
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedACPCYear,
    showACsWithinPC,
    blogOpen,
  ]);

  /**
   * Get share URL for PC contribution in AC panel (year=pc-YYYY format)
   */
  const pcContributionShareUrl = useMemo(() => {
    if (!currentAssembly || !selectedACPCYear) return undefined;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: null,
      pcYear: selectedACPCYear,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: blogOpen,
      blogPost: null,
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedACPCYear,
    blogOpen,
  ]);

  /**
   * Get current share URL for PC election results
   */
  const currentPCShareUrl = useMemo(() => {
    if (!currentPC) return undefined;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: null,
      assembly: null,
      year: pcSelectedYear,
      pcYear: null,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: blogOpen,
      blogPost: null,
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    pcSelectedYear,
    showACsWithinPC,
    blogOpen,
  ]);

  /**
   * Handle view switch between constituencies and districts
   */
  const handleSwitchView = useCallback(
    async (view: ViewMode): Promise<void> => {
      if (!currentState) {
        switchView(view);
        return;
      }

      // Each navigation function sets the view internally
      if (view === 'constituencies') {
        const data = await navigateToState(currentState);
        setCurrentData(data);
        const pcIndex = await loadPCStateIndex(currentState);
        if (
          pcIndex?.availableYears?.length &&
          (pcSelectedYear == null || !pcIndex.availableYears.includes(pcSelectedYear))
        ) {
          const latestYear = pcIndex.availableYears[pcIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
            setPCSelectedYear(latestYear);
            const tab =
              typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('tab')
                : null;
            const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
            const preservedTab = tab && validTabs.includes(tab) ? tab : null;
            updateUrlRef.current({
              state: currentState,
              view: 'constituencies',
              pc: null,
              district: null,
              assembly: null,
              year: latestYear,
              pcYear: null,
              tab: preservedTab,
              showACs: null,
              blog: false,
              blogPost: null,
            });
          }
        }
      } else if (view === 'assemblies') {
        const data = await navigateToAssemblies(currentState);
        setCurrentData(data);
        const acIndex = await loadStateIndex(currentState);
        if (
          acIndex?.availableYears?.length &&
          selectedYear != null &&
          !acIndex.availableYears.includes(selectedYear)
        ) {
          const latestYear = acIndex.availableYears[acIndex.availableYears.length - 1];
          if (latestYear !== undefined) {
            setSelectedYear(latestYear);
            const tab =
              typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('tab')
                : null;
            const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
            const preservedTab = tab && validTabs.includes(tab) ? tab : null;
            updateUrlRef.current({
              state: currentState,
              view: 'assemblies',
              pc: null,
              district: null,
              assembly: currentAssembly,
              year: latestYear,
              pcYear: null,
              tab: preservedTab,
              showACs: null,
              blog: false,
              blogPost: null,
            });
          }
        }
      } else if (view === 'districts') {
        const data = await loadDistrictsForState(currentState);
        setCurrentData(data);
        const acIndex = await loadStateIndex(currentState);
        const years = acIndex?.availableYears ?? [];
        const latestYear = years.length > 0 ? years[years.length - 1] : undefined;
        // No year or invalid year: set to latest so districts get 100% party coloring
        const needsCorrection =
          latestYear !== undefined && (selectedYear == null || !years.includes(selectedYear));
        if (needsCorrection) {
          setSelectedYear(latestYear);
          const tab =
            typeof window !== 'undefined'
              ? new URLSearchParams(window.location.search).get('tab')
              : null;
          const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
          const preservedTab = tab && validTabs.includes(tab) ? tab : null;
          updateUrlRef.current({
            state: currentState,
            view: 'districts',
            pc: null,
            district: null,
            assembly: null,
            year: latestYear,
            pcYear: null,
            tab: preservedTab,
            showACs: null,
            blog: false,
            blogPost: null,
          });
        }
      }
    },
    [
      switchView,
      currentState,
      navigateToState,
      navigateToAssemblies,
      loadDistrictsForState,
      loadStateIndex,
      loadPCStateIndex,
      selectedYear,
      pcSelectedYear,
      currentAssembly,
      setSelectedYear,
      setPCSelectedYear,
    ]
  );

  /**
   * Handle reset to India view
   */
  const handleReset = useCallback((): void => {
    resetView();
    selectAssembly(null);
    clearElectionResult();
    clearPCElectionResult();
    setSelectedACPCYear(null);
    setCurrentData(null);
    setBlogOpen(false);
  }, [resetView, selectAssembly, clearElectionResult, clearPCElectionResult]);

  /**
   * Handle blog toggle
   */
  const handleBlogToggle = useCallback((): void => {
    const newBlogOpen = !blogOpen;
    setBlogOpen(newBlogOpen);
    if (newBlogOpen) {
      // Close election panels when opening blog
      clearElectionResult();
      clearPCElectionResult();
      // Update URL
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: selectedYear,
        pcYear: selectedACPCYear,
        tab: null,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: true,
        blogPost: null,
      });
    } else {
      // Update URL to remove blog params
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: selectedYear,
        pcYear: selectedACPCYear,
        tab: null,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: false,
        blogPost: null,
      });
    }
  }, [
    blogOpen,
    clearElectionResult,
    clearPCElectionResult,
    updateUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedACPCYear,
  ]);

  /**
   * Handle blog close
   */
  const handleBlogClose = useCallback((): void => {
    setBlogOpen(false);
    // Update URL to remove blog params
    updateUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: selectedYear,
      pcYear: selectedACPCYear,
      tab: null,
      showACs: currentPC ? (showACsWithinPC ?? true) : null,
      blog: false,
      blogPost: null,
    });
  }, [
    updateUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedACPCYear,
  ]);

  /**
   * Handle go back to state from PC/district
   */
  const handleGoBackToState = useCallback(async (): Promise<void> => {
    goBackToState();
    clearElectionResult();
    clearPCElectionResult();
    if (currentState) {
      if (currentView === 'constituencies') {
        const data = await navigateToState(currentState);
        setCurrentData(data);
      } else if (currentView === 'assemblies') {
        const data = await navigateToAssemblies(currentState);
        setCurrentData(data);
      } else if (currentView === 'districts') {
        const data = await loadDistrictsForState(currentState);
        setCurrentData(data);
      }
    }
  }, [
    goBackToState,
    currentState,
    currentView,
    navigateToState,
    navigateToAssemblies,
    loadDistrictsForState,
    clearElectionResult,
    clearPCElectionResult,
  ]);

  /**
   * Handle go back one navigation level
   * Assembly selected -> PC/District view -> State view -> India view
   */
  const handleGoBack = useCallback(async (): Promise<void> => {
    if (currentAssembly) {
      // If assembly is selected, deselect it and stay in current view
      selectAssembly(null);
      clearElectionResult();
      setParliamentContributions({});
      setSelectedACPCYear(null); // Reset PC year selection

      // If we're in PC view, reload the PC election result to show the parliament panel
      if (currentPC && currentState) {
        await getPCResult(currentPC, currentState);
      }
    } else if (currentPC || currentDistrict) {
      // In PC or district view (no assembly selected), go back to state
      await handleGoBackToState();
    } else if (currentState) {
      // In state view, go back to India
      handleReset();
    }
  }, [
    currentAssembly,
    currentPC,
    currentDistrict,
    currentState,
    handleGoBackToState,
    handleReset,
    selectAssembly,
    clearElectionResult,
    getPCResult,
  ]);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className={`mobile-toggle ${sidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <div className="container">
        <Sidebar
          statesGeoJSON={statesGeoJSON}
          parliamentGeoJSON={parliamentGeoJSON}
          assemblyGeoJSON={assemblyGeoJSON}
          districtsCache={districtsCache}
          currentState={currentState}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          cacheStats={cacheStats}
          currentData={currentData}
          onStateClick={handleStateClick}
          onDistrictClick={handleDistrictClick}
          onConstituencyClick={handleConstituencyClick}
          onAssemblyClick={handleAssemblyClick}
          onSwitchView={handleSwitchView}
          onReset={handleReset}
          onGoBackToState={handleGoBackToState}
          onSearchStateSelect={handleSearchStateSelect}
          onSearchConstituencySelect={handleSearchConstituencySelect}
          onSearchAssemblySelect={handleSearchAssemblySelect}
          onSearchDistrictSelect={handleSearchDistrictSelect}
          onShare={handleShare}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
          onBlogClick={handleBlogToggle}
        />

        <MapView
          statesGeoJSON={statesGeoJSON}
          parliamentGeoJSON={parliamentGeoJSON}
          districtsCache={districtsCache}
          currentData={currentData}
          currentState={currentState}
          initialPCWinners={initialPCWinners}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          selectedAssembly={currentAssembly}
          electionResult={electionResult}
          shareUrl={currentShareUrl}
          availableYears={availableYears}
          selectedYear={selectedYear}
          parliamentContributions={parliamentContributions}
          availablePCYears={availablePCYears}
          selectedACPCYear={selectedACPCYear}
          pcContributionShareUrl={pcContributionShareUrl}
          pcElectionResult={pcElectionResult}
          pcShareUrl={currentPCShareUrl}
          pcAvailableYears={pcAvailableYears}
          pcSelectedYear={pcSelectedYear}
          onStateClick={handleStateClick}
          onDistrictClick={handleDistrictClick}
          onConstituencyClick={handleConstituencyClick}
          onAssemblyClick={handleAssemblyClick}
          onSwitchView={handleSwitchView}
          onReset={handleReset}
          onGoBack={handleGoBack}
          onCloseElectionPanel={handleCloseElectionPanel}
          onYearChange={handleYearChange}
          onACPCYearChange={handleACPCYearChange}
          onClosePCElectionPanel={handleClosePCElectionPanel}
          onPCYearChange={handlePCYearChange}
          showACsWithinPC={showACsWithinPC}
          onShowACsWithinPCChange={setShowACsWithinPC}
        />
      </div>

      {/* Dynamic Meta Tags for Social Media */}
      <MetaTags
        title={
          blogOpen
            ? 'NDA Alliance for 2026: Constituencies That Will Flip with AMMK | Election Lens'
            : electionResult
              ? `${electionResult.constituencyNameOriginal || electionResult.name} (${electionResult.year}) | Election Lens`
              : pcElectionResult
                ? `${pcElectionResult.constituencyNameOriginal || pcElectionResult.name} (${pcElectionResult.year}) | Election Lens`
                : currentState
                  ? `${currentState} Election Results | Election Lens`
                  : 'Election Lens - India Electoral Map & Results'
        }
        description={
          blogOpen
            ? 'Analysis of how the NDA alliance (ADMK + BJP + PMK + AMMK) will impact Tamil Nadu assembly constituencies based on 2021 election data. Interactive analysis with booth-wise breakdowns.'
            : electionResult
              ? `${electionResult.constituencyNameOriginal || electionResult.name} ${electionResult.year} election results. Winner: ${electionResult.candidates[0]?.name || 'N/A'} (${electionResult.candidates[0]?.party || 'N/A'}) with ${electionResult.candidates[0]?.voteShare?.toFixed(1) || '0'}% vote share. View detailed booth-wise results, postal votes, and analysis.`
              : pcElectionResult
                ? `${pcElectionResult.constituencyNameOriginal || pcElectionResult.name} ${pcElectionResult.year} parliamentary election results. View detailed constituency-wise breakdown and analysis.`
                : currentState
                  ? `Explore ${currentState} election results with detailed Assembly and Parliamentary constituency data. Historical election results, vote shares, margins, and turnout.`
                  : 'Interactive map with detailed Assembly and Parliament election results. Historical data, vote shares, margins and turnout for every constituency.'
        }
        {...(typeof window !== 'undefined' && { url: window.location.href })}
        type={blogOpen ? 'article' : 'website'}
      />

      {/* Blog Section */}
      <BlogSection
        isOpen={blogOpen}
        onClose={handleBlogClose}
        onAssemblyClick={handleAssemblyClick}
        onNavigateToState={async (stateName: string) => {
          const data = await navigateToState(stateName);
          setCurrentData(data);
          // Switch to assemblies view for Tamil Nadu
          if (stateName === 'Tamil Nadu') {
            const assembliesData = await navigateToAssemblies(stateName);
            setCurrentData(assembliesData);
          }
        }}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay active">
          <div className="spinner"></div>
        </div>
      )}
    </>
  );
}

export default App;
