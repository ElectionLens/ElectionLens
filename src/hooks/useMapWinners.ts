/**
 * Loads the party-winner lookups that colour the map.
 *
 * Four cooperating effects, extracted wholesale from MapView because they are
 * one concern: every piece of state here is written only by this hook and read
 * only as styling input.
 *
 *  1. state winners      - one colour per state for the India view / backdrop
 *  2. loadResults        - the main loader, keyed on view + year + selection
 *  3. URL preload        - paints PC colours on first frame, before
 *                          `currentState` has been committed by navigation
 *  4. state-level PC fix - covers the race where (2) ran too early to see a year
 *
 * (3) and (4) exist because view state arrives asynchronously; without them the
 * first paint after a deep link shows grey or last year's colours. They read the
 * address bar directly via mapUrlContext for exactly that reason.
 *
 * Concurrency: overlapping runs of (2) are common (picking an AC in the sidebar
 * also moves the year). `loadResultsRunIdRef` stamps each run and every await
 * boundary re-checks it, so a slow earlier run cannot clobber a newer one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ELECTIONS,
  PC_ELECTIONS,
  STATE_WINNERS_AC_PATH,
  assemblyElectionFetchUrl,
} from '../constants/paths';
import type {
  ElectionResultsByConstituency,
  ElectionResultsFileMeta,
  PCElectionResultsByConstituency,
  StateElectionIndex,
  StatesGeoJSON,
  ViewMode,
} from '../types';
import type { MasterSchema } from '../types/schema';
import { getElectionStateId, normalizeName, normalizePcNameCompact } from '../utils/helpers';
import { defaultAssemblyDataYearFromIndex } from '../utils/electionSchedule';
import { isAssemblyResultEntry, skipAssemblyWinnerColoring } from '../utils/electionResults';
import { pickNonNotaAcWinner, assignAcWinnerBySchemaId } from '../components/map-view';
import {
  assignWinnerNameKeys,
  buildPcWinnersFromResults,
  buildPcWinnersFromAssemblyResults,
} from '../utils/mapPolygonWinners';
import {
  readLocation,
  rawYearParam,
  parseAssemblyYearParam,
  parsePcPrefixedYear,
  isStateLevelPcPath,
  isAssemblyMapDataPath,
  stateNameFromPath,
} from '../utils/mapUrlContext';

/** Winner lookups + the raw files they came from, consumed by map styling. */
export interface MapWinners {
  /** AC or PC name/schemaId -> winning party, depending on the active layer. */
  constituencyWinners: Record<string, { party: string; candidate: string }>;
  /** Bumped on each completed load so the GeoJSON layer remounts with new colours. */
  winnersVersion: number;
  /** `_meta` of the loaded AC file; pre-poll files must not be colour-coded. */
  acFileMetaForMapColors: ElectionResultsFileMeta | null;
  stateWinners: Record<string, { party: string; year: number }>;
  /** PC winners for dimmed neighbouring PCs when viewing ACs inside one. */
  backgroundPCWinners: Record<string, { party: string; candidate: string }>;
  persistedAssemblyElections: {
    stateId: string;
    year: number;
    data: ElectionResultsByConstituency;
  } | null;
  persistedParliamentElections: {
    stateId: string;
    year: number;
    data: PCElectionResultsByConstituency;
  } | null;
  getStateId: (stateName: string) => string;
}

export interface UseMapWinnersParams {
  currentState: string | null;
  currentView: ViewMode;
  currentDistrict: string | null;
  currentPC: string | null;
  selectedAssembly: string | null;
  selectedYear?: number | null | undefined;
  pcSelectedYear?: number | null | undefined;
  selectedACPCYear?: number | null | undefined;
  statesGeoJSON: StatesGeoJSON | null;
  availableYears?: number[] | undefined;
  /**
   * Schema accessors, injected rather than obtained from useSchema() here:
   * the only caller already holds a schema instance, and useSchema keeps
   * per-instance state, so calling it again would mean a second fetch and two
   * copies of the same data that could briefly disagree.
   */
  resolveACName: (acName: string, stateId: string) => string | null;
  resolvePCName: (pcName: string, stateId: string) => string | null;
  schema: MasterSchema | null;
}

export function useMapWinners({
  currentState,
  currentView,
  currentDistrict,
  currentPC,
  selectedAssembly,
  selectedYear,
  pcSelectedYear,
  selectedACPCYear,
  statesGeoJSON,
  availableYears,
  resolveACName,
  resolvePCName,
  schema,
}: UseMapWinnersParams): MapWinners {
  /** Invalidates in-flight loadResults when deps change again (sidebar AC pick + getACResult year often overlap). */
  const loadResultsRunIdRef = useRef(0);

  // Mapping of constituency names to winning party for color-coding
  const [constituencyWinners, setConstituencyWinners] = useState<
    Record<string, { party: string; candidate: string }>
  >({});
  // Increment when loadResults completes so GeoJSON remounts with new colors (fixes year-change not updating)
  const [winnersVersion, setWinnersVersion] = useState(0);
  /** Loaded AC year file _meta — when pre-poll/announced-only, skip party colouring on districts/ACs. */
  const [acFileMetaForMapColors, setAcFileMetaForMapColors] =
    useState<ElectionResultsFileMeta | null>(null);

  // State-level winners for India view and neighbouring states (party with most Lok Sabha seats per state)
  const [stateWinners, setStateWinners] = useState<Record<string, { party: string; year: number }>>(
    {}
  );

  // PC-level winners for colouring neighbouring (background) PCs when viewing assemblies within a PC
  const [backgroundPCWinners, setBackgroundPCWinners] = useState<
    Record<string, { party: string; candidate: string }>
  >({});

  /** Last-loaded raw JSON — state map summary vote shares (avoid second fetch drift). */
  const [persistedAssemblyElections, setPersistedAssemblyElections] = useState<{
    stateId: string;
    year: number;
    data: ElectionResultsByConstituency;
  } | null>(null);
  const [persistedParliamentElections, setPersistedParliamentElections] = useState<{
    stateId: string;
    year: number;
    data: PCElectionResultsByConstituency;
  } | null>(null);

  const getStateId = useCallback((stateName: string): string => getElectionStateId(stateName), []);

  // Load state-level winners for India view (latest AC election per state, not PC)
  useEffect(() => {
    if (!statesGeoJSON) return;
    let cancelled = false;
    fetch(STATE_WINNERS_AC_PATH)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.stateWinners) return;
        setStateWinners(data.stateWinners);
      })
      .catch(() => setStateWinners({}));
    return () => {
      cancelled = true;
    };
  }, [statesGeoJSON]);

  // Load election results for color-coding when year/state/view changes
  useEffect(() => {
    const runId = ++loadResultsRunIdRef.current;

    if (!currentState) {
      // Don't clear when URL is state-level PC with year= — preload/initialPCWinners may set winners;
      // clearing here wipes them before first paint (handleUrlNavigate sets currentState async).
      const loc = readLocation();
      if (loc && isStateLevelPcPath(loc.pathname) && parseAssemblyYearParam(loc.search) != null) {
        return;
      }
      setConstituencyWinners({});
      setAcFileMetaForMapColors(null);
      setPersistedAssemblyElections(null);
      setPersistedParliamentElections(null);
      setWinnersVersion((v) => v + 1);
      return;
    }

    const loadResults = async (): Promise<void> => {
      if (loadResultsRunIdRef.current !== runId) return;
      setAcFileMetaForMapColors(null);

      const stateId = getStateId(currentState);
      const winners: Record<string, { party: string; candidate: string }> = {};
      /** When selected assembly year file loads OK but yields no map winners (pre-poll / announced-only), do not backfill latest completed year — avoids wrong-year colours on neighbouring districts. */
      let skipLatestYearFallbackForAC = false;
      setBackgroundPCWinners({});
      const urlDerivedPcYear = parsePcPrefixedYear(readLocation()?.search ?? '');
      const pcYearForColoring = selectedACPCYear ?? urlDerivedPcYear;

      // `currentView` can still be constituencies briefly after handleUrlNavigate (before navigateToAssemblies commits).
      const urlLooksLikeAssemblyMapData = isAssemblyMapDataPath(readLocation()?.pathname ?? '');

      // District detail (currentDistrict) needs AC data for coloring; currentView can be stale (constituencies) on first run
      const needsACOrPCDistrictData =
        currentView === 'assemblies' ||
        currentView === 'districts' ||
        Boolean(currentDistrict) ||
        urlLooksLikeAssemblyMapData;
      if (needsACOrPCDistrictData) {
        // For AC/districts view (or district detail), check if we're viewing PC contribution year or assembly year
        if (pcYearForColoring) {
          // Load PC election results and map AC contributions
          try {
            const response = await fetch(PC_ELECTIONS.getYearPath(stateId, pcYearForColoring));
            if (response.ok) {
              const results = (await response.json()) as PCElectionResultsByConstituency;
              if (loadResultsRunIdRef.current === runId) {
                setPersistedParliamentElections({
                  stateId,
                  year: pcYearForColoring,
                  data: results,
                });
              }
              // Map each AC to its winner from PC contribution
              Object.entries(results).forEach(([_pcId, pcResult]) => {
                const addWinner = (acName: string, party: string, candidateName: string): void => {
                  // Opposite spellings are seeded too, so GeoJSON can match
                  // (e.g. PC 2024 has "Pappireddipatti", schema has "Pappireddippatti").
                  assignWinnerNameKeys(
                    winners,
                    acName,
                    { party, candidate: candidateName },
                    { style: 'assembly', applyVariants: true }
                  );
                };

                if (pcResult.acWiseResults) {
                  Object.entries(pcResult.acWiseResults).forEach(([acName, acContribution]) => {
                    if (acContribution.candidates && acContribution.candidates.length > 0) {
                      const winner = pickNonNotaAcWinner(acContribution.candidates);
                      if (winner) {
                        addWinner(acName, winner.party, winner.name);
                        assignAcWinnerBySchemaId(
                          winners,
                          resolveACName(acName, stateId),
                          winner.party,
                          winner.name
                        );
                      }
                    }
                  });
                } else if (pcResult.candidates?.length) {
                  // Data has candidates with acWiseVotes (no acWiseResults): derive AC winner per AC
                  // as the candidate with highest votes in that AC
                  const acToBest: Record<string, { party: string; name: string; votes: number }> =
                    {};
                  for (const candidate of pcResult.candidates) {
                    if (!candidate.acWiseVotes) continue;
                    for (const av of candidate.acWiseVotes) {
                      const acName = av.acName?.trim() ?? '';
                      if (!acName) continue;
                      const votes = av.votes ?? 0;
                      const current = acToBest[acName];
                      if (!current || votes > current.votes) {
                        acToBest[acName] = {
                          party: candidate.party,
                          name: candidate.name,
                          votes,
                        };
                      }
                    }
                  }
                  for (const [acName, best] of Object.entries(acToBest)) {
                    addWinner(acName, best.party, best.name);
                    assignAcWinnerBySchemaId(
                      winners,
                      resolveACName(acName, stateId),
                      best.party,
                      best.name
                    );
                  }
                }
              });
              // Fill in ACs missing from PC data with their PC winner (so no default-green)
              if (schema?.assemblyConstituencies) {
                for (const [acId, ac] of Object.entries(schema.assemblyConstituencies)) {
                  if (ac.stateId !== stateId || winners[acId]) continue;
                  const pcId = ac.pcId;
                  if (!pcId) continue;
                  const pcResult = results[pcId];
                  if (pcResult?.candidates?.length) {
                    const w = pcResult.candidates[0];
                    if (w) {
                      const entry = { party: w.party, candidate: w.name };
                      winners[acId] = entry;
                      // Also add name/aliases so GeoJSON without schemaId can match
                      const namesToAdd = [ac.name, ...(ac.aliases || [])].filter(Boolean);
                      for (const n of namesToAdd) {
                        const norm = normalizeName(n)
                          .toUpperCase()
                          .replace(/\s*\([^)]*\)\s*/g, '')
                          .replace(/\s+/g, ' ')
                          .trim();
                        if (norm && !winners[norm]) winners[norm] = entry;
                        const upper = n.toUpperCase().trim();
                        if (upper && upper !== norm && !winners[upper]) winners[upper] = entry;
                      }
                    }
                  }
                }
              }
              // Build PC-level winners for neighbouring (background) PCs colouring
              if (response.ok && results) {
                const pcWinnersMap: Record<string, { party: string; candidate: string }> = {};
                const pcIdPattern = /^[A-Z]{2}-\d+$/;
                Object.entries(results).forEach(([pcId, pcResult]) => {
                  if (pcResult?.candidates?.length) {
                    const w = pcResult.candidates[0];
                    if (!w) return;
                    const entry = { party: w.party, candidate: w.name };
                    if (pcId && pcIdPattern.test(pcId)) pcWinnersMap[pcId] = entry;
                    const pcName =
                      pcResult.constituencyNameOriginal ||
                      pcResult.constituencyName ||
                      pcResult.name ||
                      '';
                    if (pcName) {
                      const norm = normalizeName(pcName).toUpperCase().replace(/\s+/g, ' ').trim();
                      pcWinnersMap[norm] = entry;
                      const sid = resolvePCName(pcName, stateId);
                      if (sid) pcWinnersMap[sid] = entry;
                    }
                  }
                });
                if (loadResultsRunIdRef.current === runId) {
                  setBackgroundPCWinners(pcWinnersMap);
                }
              }
            } else {
              console.warn(
                `[Color-coding] Failed to load PC election results: HTTP ${response.status} for ${PC_ELECTIONS.getYearPath(stateId, pcYearForColoring)}`
              );
            }
          } catch (err) {
            console.error(
              `Failed to load PC election results for ${currentState} ${pcYearForColoring}:`,
              err
            );
          }
        } else if (selectedYear) {
          // Load AC election results
          try {
            const acPath = assemblyElectionFetchUrl(ELECTIONS.getYearPath(stateId, selectedYear));
            const response = await fetch(acPath);
            if (response.ok) {
              const results = (await response.json()) as ElectionResultsByConstituency;
              const acMainMeta = results._meta;
              if (loadResultsRunIdRef.current === runId) {
                setAcFileMetaForMapColors(acMainMeta ?? null);
                setPersistedAssemblyElections({
                  stateId,
                  year: selectedYear,
                  data: results,
                });
              }
              // Map each AC to its winner (store schemaId when key is schemaId, plus name variants)
              const schemaIdPattern = /^[A-Z]{2}-\d+$/;
              Object.entries(results).forEach(([key, result]) => {
                if (!isAssemblyResultEntry(key, result)) return;
                if (skipAssemblyWinnerColoring(result, acMainMeta)) return;
                if (result.candidates && result.candidates.length > 0) {
                  const winner = result.candidates[0]; // First candidate is winner (sorted by votes)
                  if (winner) {
                    const entry = { party: winner.party, candidate: winner.name };
                    if (key && schemaIdPattern.test(key)) winners[key] = entry;
                    const acName =
                      result.constituencyNameOriginal ||
                      result.constituencyName ||
                      result.name ||
                      '';
                    if (acName) {
                      assignWinnerNameKeys(winners, acName, entry, { style: 'assembly' });
                    }
                  }
                }
              });
              if (Object.keys(winners).length === 0) {
                skipLatestYearFallbackForAC = true;
              }
            }
          } catch (err) {
            console.error(
              `Failed to load AC election results for ${currentState} ${selectedYear}:`,
              err
            );
          }
        }
        // Fallback: if no winners (invalid/missing year), load latest AC year so districts/ACs get 100% party coloring
        if (
          Object.keys(winners).length === 0 &&
          !skipLatestYearFallbackForAC &&
          currentState &&
          (currentView === 'districts' || currentView === 'assemblies' || Boolean(currentDistrict))
        ) {
          try {
            const indexRes = await fetch(assemblyElectionFetchUrl(ELECTIONS.getIndexPath(stateId)));
            if (indexRes.ok) {
              const index = (await indexRes.json()) as StateElectionIndex;
              const years = index.availableYears ?? [];
              // Prefer last completed year, not the sole future slot (e.g. 2028 placeholder)
              const latestYear =
                defaultAssemblyDataYearFromIndex(index) ??
                (years.length > 0 ? years[years.length - 1] : null);
              if (latestYear != null) {
                const response = await fetch(
                  assemblyElectionFetchUrl(ELECTIONS.getYearPath(stateId, latestYear))
                );
                if (response.ok) {
                  const results = (await response.json()) as ElectionResultsByConstituency;
                  const acFileMeta = results._meta;
                  if (loadResultsRunIdRef.current === runId) {
                    setPersistedAssemblyElections({
                      stateId,
                      year: latestYear,
                      data: results,
                    });
                  }
                  const schemaIdPattern = /^[A-Z]{2}-\d+$/;
                  Object.entries(results).forEach(([key, result]) => {
                    if (!isAssemblyResultEntry(key, result)) return;
                    if (skipAssemblyWinnerColoring(result, acFileMeta)) return;
                    if (result.candidates && result.candidates.length > 0) {
                      const winner = result.candidates[0];
                      if (winner) {
                        const entry = { party: winner.party, candidate: winner.name };
                        if (key && schemaIdPattern.test(key)) winners[key] = entry;
                        const acName =
                          result.constituencyNameOriginal ||
                          result.constituencyName ||
                          result.name ||
                          '';
                        if (acName) {
                          assignWinnerNameKeys(winners, acName, entry, { style: 'assembly' });
                        }
                      }
                    }
                  });
                }
              }
            }
          } catch {
            // Ignore; App year correction will fix URL on next sync
          }
        }
      } else if (currentView === 'constituencies') {
        // State-level PC view: use pcSelectedYear, or year from URL when not set yet (avoids race with handleUrlNavigate)
        const urlYear = parseAssemblyYearParam(readLocation()?.search ?? '');
        // `year=pc-2024` is the Lok Sabha year for map coloring / acWiseVotes — urlYear above skips pc-* (assembly-only slot).
        // urlDerivedPcYear is parsed at loadResults start; selectedACPCYear mirrors URL pc year before parliament hook syncs.
        const assemblyYearInPcView =
          selectedYear != null &&
          availableYears?.includes(selectedYear) === true &&
          pcSelectedYear == null &&
          selectedACPCYear == null;
        const yearToLoad = pcSelectedYear ?? selectedACPCYear ?? urlYear ?? urlDerivedPcYear;
        let hadPCResultForSelectedPC = false; // true when selected PC exists in PC file (so we have acWiseResults)
        if (assemblyYearInPcView && schema) {
          try {
            const response = await fetch(
              assemblyElectionFetchUrl(ELECTIONS.getYearPath(stateId, selectedYear))
            );
            if (response.ok) {
              const results = (await response.json()) as ElectionResultsByConstituency;
              if (loadResultsRunIdRef.current === runId) {
                setPersistedAssemblyElections({
                  stateId,
                  year: selectedYear,
                  data: results,
                });
              }
              Object.assign(
                winners,
                buildPcWinnersFromAssemblyResults(results, schema, stateId, resolvePCName)
              );
            }
          } catch {
            // Keep the map neutral rather than falling back to a different election year.
          }
        } else if (yearToLoad) {
          try {
            const response = await fetch(PC_ELECTIONS.getYearPath(stateId, yearToLoad));
            if (response.ok) {
              const results = (await response.json()) as PCElectionResultsByConstituency;
              if (loadResultsRunIdRef.current === runId && yearToLoad != null) {
                setPersistedParliamentElections({
                  stateId,
                  year: yearToLoad,
                  data: results,
                });
              }
              // Map each PC to its winner (store schemaId when key is schemaId, plus name variants)
              Object.assign(
                winners,
                buildPcWinnersFromResults(results, stateId, resolvePCName, 'pc')
              );
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
                        acYears.filter((y) => y <= yearToLoad).pop() ?? acYears[acYears.length - 1];
                      if (assemblyYear != null) {
                        const acRes = await fetch(
                          assemblyElectionFetchUrl(ELECTIONS.getYearPath(stateId, assemblyYear))
                        );
                        if (acRes.ok) {
                          const acResults = (await acRes.json()) as ElectionResultsByConstituency;
                          const acFillMeta = acResults._meta;
                          const acWinners: Record<string, { party: string; candidate: string }> =
                            {};
                          const schemaIdPattern = /^[A-Z]{2}-\d+$/;
                          Object.entries(acResults).forEach(([key, result]) => {
                            if (!isAssemblyResultEntry(key, result)) return;
                            if (skipAssemblyWinnerColoring(result, acFillMeta)) return;
                            if (result?.candidates?.length && result.candidates[0]) {
                              const w = result.candidates[0];
                              const entry = { party: w.party, candidate: w.name };
                              if (key && schemaIdPattern.test(key)) acWinners[key] = entry;
                            }
                          });
                          for (const pcId of missingPCIds) {
                            const acsInPC = Object.entries(schema.assemblyConstituencies).filter(
                              ([, ac]) => ac.stateId === stateId && ac.pcId === pcId
                            );
                            const partyCounts: Record<string, number> = {};
                            for (const [acId] of acsInPC) {
                              const acWinner = acWinners[acId];
                              if (acWinner?.party) {
                                partyCounts[acWinner.party] =
                                  (partyCounts[acWinner.party] ?? 0) + 1;
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
                                assignWinnerNameKeys(winners, pcEntity.name, entry, {
                                  style: 'pcSeatSuffix',
                                });
                              }
                            }
                          }
                        }
                      }
                    }
                  } catch {
                    // Ignore; missing PCs stay uncolored or use dominant fallback
                  }
                }
              }
              if (loadResultsRunIdRef.current === runId) {
                setBackgroundPCWinners(winners);
              }
              // For the selected PC only: color each AC by who led in that AC within this PC election (acWiseResults / acWiseVotes)
              if (currentPC && response.ok && results) {
                const pcSchemaId = resolvePCName(currentPC, stateId);
                const pcNorm = normalizeName(currentPC)
                  .toUpperCase()
                  .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
                  .trim()
                  .replace(/\s+/g, ' ');
                const pcResult =
                  (pcSchemaId ? results[pcSchemaId] : undefined) ??
                  Object.entries(results).find(([, r]) => {
                    const name = (
                      r.constituencyNameOriginal ||
                      r.constituencyName ||
                      r.name ||
                      ''
                    ).trim();
                    const n = normalizeName(name)
                      .toUpperCase()
                      .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
                      .trim()
                      .replace(/\s+/g, ' ');
                    return (
                      name.toUpperCase() === currentPC.toUpperCase().trim() ||
                      n === pcNorm ||
                      normalizeName(name).toUpperCase().replace(/\s+/g, ' ') === pcNorm ||
                      normalizePcNameCompact(name) === normalizePcNameCompact(currentPC)
                    );
                  })?.[1];
                if (pcResult) {
                  hadPCResultForSelectedPC = true;
                  const addACWinner = (
                    acName: string,
                    party: string,
                    candidateName: string
                  ): void => {
                    const entry = { party, candidate: candidateName };
                    assignWinnerNameKeys(winners, acName, entry, { style: 'assembly' });
                    const sid = resolveACName(acName, stateId);
                    assignAcWinnerBySchemaId(winners, sid, party, candidateName);
                  };
                  if (pcResult.acWiseResults) {
                    Object.entries(pcResult.acWiseResults).forEach(([acName, acContribution]) => {
                      if (acContribution.candidates && acContribution.candidates.length > 0) {
                        const winner = pickNonNotaAcWinner(acContribution.candidates);
                        if (winner) addACWinner(acName, winner.party, winner.name);
                      }
                    });
                  } else if (pcResult.candidates?.length) {
                    const acToBest: Record<string, { party: string; name: string; votes: number }> =
                      {};
                    for (const candidate of pcResult.candidates) {
                      if (!candidate.acWiseVotes) continue;
                      for (const av of candidate.acWiseVotes) {
                        const acName = av.acName?.trim() ?? '';
                        if (!acName) continue;
                        const votes = av.votes ?? 0;
                        const current = acToBest[acName];
                        if (!current || votes > current.votes) {
                          acToBest[acName] = {
                            party: candidate.party,
                            name: candidate.name,
                            votes,
                          };
                        }
                      }
                    }
                    for (const [acName, best] of Object.entries(acToBest)) {
                      addACWinner(acName, best.party, best.name);
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error(
              `Failed to load PC election results for ${currentState} ${yearToLoad}:`,
              err
            );
          }
        }

        // When showing ACs within a PC, color only by AC contribution to PC (acWiseResults above).
        // Do not load assembly (MLA) election results in PC view - user sees who led in each AC in the PC election.
        if (currentPC && schema?.assemblyConstituencies) {
          const pcSchemaId = resolvePCName(currentPC, stateId);
          const pcWinner =
            (pcSchemaId ? winners[pcSchemaId] : undefined) ??
            winners[currentPC.toUpperCase().trim()] ??
            winners[
              normalizeName(currentPC)
                .toUpperCase()
                .replace(/\s*\(S[CT]\s*\)?\s*$/i, '')
                .trim()
                .replace(/\s+/g, ' ')
            ];
          // Fill ACs within this PC with the PC winner only when we have PC election data for this PC (acWiseResults).
          // When PC is missing from file (e.g. Vellore TN-08 in 2019), skip this so fallback colors each AC by assembly election.
          if (hadPCResultForSelectedPC && pcWinner && pcSchemaId) {
            for (const [acId, ac] of Object.entries(schema.assemblyConstituencies)) {
              if (ac.stateId !== stateId || ac.pcId !== pcSchemaId || winners[acId]) continue;
              winners[acId] = pcWinner;
              const namesToAdd = [ac.name, ...(ac.aliases || [])].filter(Boolean);
              for (const n of namesToAdd) {
                const norm = normalizeName(n)
                  .toUpperCase()
                  .replace(/\s*\([^)]*\)\s*/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (norm && !winners[norm]) winners[norm] = pcWinner;
                const upper = n.toUpperCase().trim();
                if (upper && upper !== norm && !winners[upper]) winners[upper] = pcWinner;
              }
            }
          }
          // When PC is missing from file (e.g. Vellore 2019), do not fill from assembly election — show no data / neutral color.
        }

        // When viewing AC within PC (currentPC && selectedAssembly), load assembly (MLA) results
        // only when NOT in PC-contribution mode (year=pc-YYYY). With year=pc-2019 we color by PC
        // contribution only and must not overwrite winners with assembly results.
        const acWithinPcLoc = readLocation();
        if (currentPC && selectedAssembly && acWithinPcLoc) {
          const urlYearParam = rawYearParam(acWithinPcLoc.search);
          if (!urlYearParam || !urlYearParam.startsWith('pc-')) {
            const acYear = urlYearParam ? parseInt(urlYearParam, 10) : selectedYear;
            if (!isNaN(acYear ?? NaN)) {
              try {
                const acResponse = await fetch(
                  assemblyElectionFetchUrl(ELECTIONS.getYearPath(stateId, acYear as number))
                );
                if (acResponse.ok) {
                  const contentType = acResponse.headers.get('content-type');
                  if (contentType?.includes('application/json')) {
                    const acResults = (await acResponse.json()) as ElectionResultsByConstituency;
                    if (loadResultsRunIdRef.current === runId) {
                      setPersistedAssemblyElections({
                        stateId,
                        year: acYear as number,
                        data: acResults,
                      });
                    }
                    const acPanelMeta = acResults._meta;
                    const acSchemaIdPattern = /^[A-Z]{2}-\d+$/;
                    Object.entries(acResults).forEach(([key, result]) => {
                      if (!isAssemblyResultEntry(key, result)) return;
                      if (skipAssemblyWinnerColoring(result, acPanelMeta)) return;
                      if (result.candidates && result.candidates.length > 0) {
                        const winner = result.candidates[0];
                        if (winner) {
                          const entry = { party: winner.party, candidate: winner.name };
                          if (key && acSchemaIdPattern.test(key)) winners[key] = entry;
                          const acName =
                            result.constituencyNameOriginal ||
                            result.constituencyName ||
                            result.name ||
                            '';
                          if (acName) {
                            assignWinnerNameKeys(winners, acName, entry, { style: 'assembly' });
                          }
                        }
                      }
                    });
                  }
                }
              } catch {
                // Ignore AC load errors; PC winners already set
              }
            }
          }
        }
      }

      // Don't overwrite with empty when state-level PC view and no year (fallback effect may have set winners from URL)
      const isStateLevelPC =
        currentView === 'constituencies' && currentPC == null && Object.keys(winners).length === 0;
      if (loadResultsRunIdRef.current !== runId) return;
      if (!isStateLevelPC) {
        setConstituencyWinners(winners);
        setWinnersVersion((v) => v + 1);
      }
      if (Object.keys(winners).length === 0 && pcYearForColoring) {
        console.warn(
          `[Color-coding] No winners loaded! Check if PC election data exists for ${currentState} ${pcYearForColoring}`
        );
      }
    };

    void loadResults();
  }, [
    currentState,
    currentView,
    currentDistrict,
    selectedYear,
    pcSelectedYear,
    selectedACPCYear,
    getStateId,
    currentPC,
    selectedAssembly,
    resolveACName,
    resolvePCName,
    schema,
    availableYears,
  ]);

  // Preload PC results from URL on first load when path is /state/pc?year= (before currentState is set)
  // so first paint of Tamil Nadu PCs already has party colors
  useEffect(() => {
    const loc = readLocation();
    if (!loc) return;
    if (!isStateLevelPcPath(loc.pathname)) return;
    const urlYear = parseAssemblyYearParam(loc.search);
    if (urlYear == null) return;
    const stateNameFromSlug = stateNameFromPath(loc.pathname);
    if (!stateNameFromSlug) return;
    const stateId = getStateId(stateNameFromSlug);

    let cancelled = false;
    fetch(PC_ELECTIONS.getYearPath(stateId, urlYear))
      .then((res) => (res.ok ? res.json() : null))
      .then((results: PCElectionResultsByConstituency | null) => {
        if (cancelled || !results) return;
        const winners = buildPcWinnersFromResults(results, stateId, resolvePCName);
        if (!cancelled) {
          setPersistedParliamentElections({ stateId, year: urlYear, data: results });
          setConstituencyWinners(winners);
          setWinnersVersion((v) => v + 1);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [getStateId, resolvePCName]);

  // State-level PC view fallback: load PC results when we have state + constituencies view + year in URL but no winners yet
  // (handles race where main loadResults ran with currentState null or year not set)
  useEffect(() => {
    if (
      !currentState ||
      currentView !== 'constituencies' ||
      currentPC != null ||
      typeof window === 'undefined'
    ) {
      return;
    }
    const loc = readLocation();
    if (!loc) return;
    const urlYear = parseAssemblyYearParam(loc.search);
    if (urlYear == null) return;

    let cancelled = false;
    const stateId = getStateId(currentState);
    fetch(PC_ELECTIONS.getYearPath(stateId, urlYear))
      .then((res) => (res.ok ? res.json() : null))
      .then((results: PCElectionResultsByConstituency | null) => {
        if (cancelled || !results) return;
        const winners = buildPcWinnersFromResults(results, stateId, resolvePCName);
        if (!cancelled) {
          setPersistedParliamentElections({ stateId, year: urlYear, data: results });
          setConstituencyWinners(winners);
          setWinnersVersion((v) => v + 1);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentState, currentView, currentPC, getStateId, resolvePCName]);

  return {
    constituencyWinners,
    winnersVersion,
    acFileMetaForMapColors,
    stateWinners,
    backgroundPCWinners,
    persistedAssemblyElections,
    persistedParliamentElections,
    getStateId,
  };
}
