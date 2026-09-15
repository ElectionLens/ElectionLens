import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import type { Layer, LeafletMouseEvent as LLeafletMouseEvent } from 'leaflet';
import {
  getFeatureStyle,
  getHoverStyle,
  normalizeName,
  normalizePcNameCompact,
  getStateFileName,
  getElectionStateId,
} from '../utils/helpers';

/** Resolved stroke/fill strings for Leaflet paths (avoid `!` on `L.PathOptions` optional fields). */
const NEUTRAL_FILL_COLOR = '#9ca3af';
const NEUTRAL_STROKE_COLOR = '#6b7280';

/** App-wide neutral map style when no party data — same default color in all views (districts, background districts/PCs/states) */
const NEUTRAL_MAP_STYLE: L.PathOptions = {
  fillColor: NEUTRAL_FILL_COLOR,
  fillOpacity: 0.6,
  color: NEUTRAL_STROKE_COLOR,
  weight: 1,
  opacity: 1,
};
import { mergeDimmedNonFocusStyle } from '../utils/mapDimming';
import { isSummaryPartyPresent } from '../utils/summaryParty';

import { getPartyColor } from '../utils/partyData';
import {
  ELECTIONS,
  PC_ELECTIONS,
  STATE_WINNERS_AC_PATH,
  assemblyElectionFetchUrl,
} from '../constants/paths';
import type {
  BrowseListWinnersContext,
  ElectionResultsByConstituency,
  ElectionResultsFileMeta,
  PCElectionResultsByConstituency,
  StateElectionIndex,
} from '../types';
import { isAssemblyResultEntry, skipAssemblyWinnerColoring } from '../utils/electionResults';
import { defaultAssemblyDataYearFromIndex } from '../utils/electionSchedule';
import { isAssemblyFeatureSelected } from '../utils/mapSelection';
import {
  resolveAssemblyMapPolygonWinner,
  resolveDistrictPolygonParty,
  resolvePcMapPolygonWinner,
  assignWinnerNameKeys,
} from '../utils/mapPolygonWinners';
import {
  readLocation,
  rawYearParam,
  parseAssemblyYearParam,
  parsePcPrefixedYear,
  isPcPath,
  isStateLevelPcPath,
  isAssemblyMapDataPath,
  stateNameFromPath,
} from '../utils/mapUrlContext';
import type { PartyVoteRow } from '../utils/aggregateStateMapElectionStats';
import {
  aggregateAssemblyVotesForMappedFeatures,
  aggregateAssemblyPartyCandidatesForMappedFeatures,
  aggregateParliamentVotesStatewide,
  aggregatePcPartyCandidatesForMappedFeatures,
  aggregatePcVotesForMappedFeatures,
  aggregateSeatsFromPartyList,
} from '../utils/aggregateStateMapElectionStats';
import { FeedbackModal } from './FeedbackModal';
import { VectorTileLayer } from './VectorTileLayer';
import { useSchema } from '../hooks/useSchema';
import type {
  MapViewProps,
  MapLevel,
  GeoJSONData,
  Feature,
  StateProperties,
  DistrictProperties,
  ConstituencyProperties,
  AssemblyProperties,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  PartyCandidateRow,
} from '../types';
import {
  MapToolbar,
  MapControls,
  MapResizer,
  BackgroundPanes,
  FitBounds,
  pickNonNotaAcWinner,
  assignAcWinnerBySchemaId,
  LAYER_URLS,
  type LayerName,
} from './map-view';

interface FeatureLayer {
  feature?: Feature;
  setStyle: (style: object) => void;
  bringToFront: () => void;
  on: (eventMap: Record<string, (e: LLeafletMouseEvent) => void>) => void;
  bindTooltip: (content: string, options?: L.TooltipOptions) => FeatureLayer;
  unbindTooltip: () => FeatureLayer;
  openTooltip: () => FeatureLayer;
  closeTooltip: () => FeatureLayer;
  getTooltip: () => L.Tooltip | undefined;
}

/** Leaflet GeoJSON ref type */
type GeoJSONRef = L.GeoJSON | null;

export function MapView({
  statesGeoJSON,
  parliamentGeoJSON,
  districtsCache,
  currentData,
  currentState,
  initialPCWinners = null,
  currentView,
  currentPC,
  currentDistrict,
  selectedAssembly,
  electionResult,
  availableYears,
  selectedYear,
  selectedACPCYear,
  pcElectionResult,
  pcSelectedYear,
  onStateClick,
  onDistrictClick,
  onConstituencyClick,
  onAssemblyClick,
  onReset,
  onGoBack,
  showACsWithinPC = true,
  selectedSummaryParty = null,
  onSummaryPartyChange,
  onStateSummaryDataChange,
  onBrowseListWinnersContext,
}: MapViewProps): JSX.Element {
  const geoJsonRef = useRef<GeoJSONRef>(null);
  // Track pending selected assembly to handle click -> mouseout race condition
  const pendingSelectedAssembly = useRef<string | null>(null);
  // Ref to always have latest selectedAssembly value in callbacks
  const selectedAssemblyRef = useRef<string | null>(selectedAssembly);
  // Ref to store style function for use in hover handlers
  const styleRef = useRef<((feature?: GeoJSON.Feature) => L.PathOptions) | null>(null);
  // Only one feature (other than selected) may show hover at a time; clear previous on new hover
  const lastHoveredLayerRef = useRef<FeatureLayer | null>(null);
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

  // Schema hook - used for resolveACName/resolvePCName in loadResults and getAC for booth data
  const { resolveACName, resolvePCName, resolveDistrictName, getDistrict, schema } = useSchema();

  // Dominant party per district (from AC winners) for colouring neighbouring districts
  const districtWinners = useMemo((): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!schema?.assemblyConstituencies || Object.keys(constituencyWinners).length === 0)
      return out;
    const districtCounts: Record<string, Record<string, number>> = {};
    for (const [acId, ac] of Object.entries(schema.assemblyConstituencies)) {
      const districtId = ac.districtId;
      if (!districtId) continue;
      const winner =
        constituencyWinners[acId] ??
        constituencyWinners[ac.name] ??
        (ac.name &&
          constituencyWinners[
            normalizeName(ac.name)
              .toUpperCase()
              .replace(/\s*\([^)]*\)\s*/g, '')
              .replace(/\s+/g, ' ')
              .trim()
          ]);
      if (!winner) continue;
      if (!districtCounts[districtId]) districtCounts[districtId] = {};
      districtCounts[districtId][winner.party] =
        (districtCounts[districtId][winner.party] || 0) + 1;
    }
    for (const [districtId, counts] of Object.entries(districtCounts)) {
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) out[districtId] = top[0];
    }
    return out;
  }, [schema?.assemblyConstituencies, constituencyWinners]);

  /**
   * Grey out misleading colours when the assembly JSON is pre-poll / announced-only.
   * Bypass when map colours come from Lok Sabha data: `year=pc-*` (selectedACPCYear), plain
   * `?year=YYYY` on a PC route (toolbar / URL before hooks sync), or pcSelectedYear from parliament hook.
   */
  const suppressAssemblyFilePartyMapColors = useMemo(() => {
    const metaBad = Boolean(
      acFileMetaForMapColors &&
      (acFileMetaForMapColors.resultsPending ||
        acFileMetaForMapColors.candidatesPolicy === 'announced_only')
    );
    if (!metaBad) return false;
    if (selectedACPCYear != null) return false;
    if (pcSelectedYear != null) return false;
    if (currentView === 'constituencies') {
      const loc = readLocation();
      if (loc && isPcPath(loc.pathname) && parseAssemblyYearParam(loc.search) != null) return false;
    }
    return true;
  }, [selectedACPCYear, pcSelectedYear, acFileMetaForMapColors, currentView]);

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
        const yearToLoad = pcSelectedYear ?? selectedACPCYear ?? urlYear ?? urlDerivedPcYear;
        let hadPCResultForSelectedPC = false; // true when selected PC exists in PC file (so we have acWiseResults)
        if (yearToLoad) {
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
              const pcSchemaIdPattern = /^[A-Z]{2}-\d+$/; // e.g. TN-01, UP-1
              Object.entries(results).forEach(([key, result]) => {
                if (result.candidates && result.candidates.length > 0) {
                  const winner = result.candidates[0]; // First candidate is winner (sorted by votes)
                  if (winner) {
                    const entry = { party: winner.party, candidate: winner.name };
                    if (key && pcSchemaIdPattern.test(key)) winners[key] = entry;
                    const pcName =
                      result.constituencyNameOriginal ||
                      result.constituencyName ||
                      result.name ||
                      '';
                    if (pcName) {
                      assignWinnerNameKeys(winners, pcName, entry, { style: 'pc' });
                      const sid = resolvePCName(pcName, stateId);
                      if (sid) winners[sid] = entry;
                    }
                  }
                }
              });
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
        const winners: Record<string, { party: string; candidate: string }> = {};
        const pcSchemaIdPattern = /^[A-Z]{2}-\d+$/;
        Object.entries(results).forEach(([key, result]) => {
          if (result.candidates && result.candidates.length > 0) {
            const winner = result.candidates[0];
            if (winner) {
              const entry = { party: winner.party, candidate: winner.name };
              if (key && pcSchemaIdPattern.test(key)) winners[key] = entry;
              const pcName =
                result.constituencyNameOriginal || result.constituencyName || result.name || '';
              if (pcName) {
                assignWinnerNameKeys(winners, pcName, entry, { style: 'pcSeatSuffix' });
                const sid = resolvePCName(pcName, stateId);
                if (sid) winners[sid] = entry;
              }
            }
          }
        });
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
        const winners: Record<string, { party: string; candidate: string }> = {};
        const pcSchemaIdPattern = /^[A-Z]{2}-\d+$/;
        Object.entries(results).forEach(([key, result]) => {
          if (result.candidates && result.candidates.length > 0) {
            const winner = result.candidates[0];
            if (winner) {
              const entry = { party: winner.party, candidate: winner.name };
              if (key && pcSchemaIdPattern.test(key)) winners[key] = entry;
              const pcName =
                result.constituencyNameOriginal || result.constituencyName || result.name || '';
              if (pcName) {
                assignWinnerNameKeys(winners, pcName, entry, { style: 'pcSeatSuffix' });
                const sid = resolvePCName(pcName, stateId);
                if (sid) winners[sid] = entry;
              }
            }
          }
        });
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

  // Feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  // Base layer state - 'Vector' uses VectorTileLayer, others use TileLayer
  const [baseLayer, setBaseLayer] = useState<LayerName>('Streets');
  // Listen for layer change events from toolbar
  useEffect(() => {
    const handleLayerChange = (e: Event): void => {
      const layerName = (e as CustomEvent).detail as LayerName;
      setBaseLayer(layerName);
    };
    window.addEventListener('changeBaseLayer', handleLayerChange);
    return () => window.removeEventListener('changeBaseLayer', handleLayerChange);
  }, []);

  // Sync refs with current selection state - must be synchronous before render
  selectedAssemblyRef.current = selectedAssembly;
  // Clear pending when selection is cleared to prevent stale tooltip
  if (!selectedAssembly) {
    pendingSelectedAssembly.current = null;
  }

  // When viewing a specific PC with "Show ACs" off: single PC feature from parliament GeoJSON
  const currentPCFeatureData = useMemo((): GeoJSONData | null => {
    if (!currentPC || !parliamentGeoJSON || !currentState) return null;
    const stateNorm = normalizeName(currentState).toLowerCase();
    const pcNorm = currentPC.toLowerCase().trim();
    const feature = parliamentGeoJSON.features.find((f) => {
      const props = f.properties;
      const st = normalizeName(props.STATE_NAME ?? props.state_ut_name ?? '').toLowerCase();
      const pc = (props.ls_seat_name ?? props.PC_NAME ?? '').toLowerCase().trim();
      return st === stateNorm && pc === pcNorm;
    });
    if (!feature) return null;
    return {
      type: 'FeatureCollection',
      features: [feature],
    };
  }, [currentPC, currentState, parliamentGeoJSON]);

  // Determine the level for styling (constituencies = single PC when Show ACs off)
  const level = useMemo((): MapLevel => {
    if (currentPC && !showACsWithinPC) return 'constituencies';
    if (currentPC ?? currentDistrict) return 'assemblies';
    if (currentView === 'assemblies') return 'assemblies';
    if (currentState) return currentView === 'constituencies' ? 'constituencies' : 'districts';
    return 'states';
  }, [currentState, currentView, currentPC, currentDistrict, showACsWithinPC]);

  // Use initialPCWinners on first paint for state-level PC view so party colors show before loadResults completes
  const effectiveConstituencyWinners = useMemo((): Record<
    string,
    { party: string; candidate: string }
  > => {
    if (
      level === 'constituencies' &&
      currentState &&
      !currentPC &&
      initialPCWinners &&
      Object.keys(initialPCWinners).length > 0 &&
      Object.keys(constituencyWinners).length === 0
    ) {
      return initialPCWinners;
    }
    return constituencyWinners;
  }, [level, currentState, currentPC, initialPCWinners, constituencyWinners]);

  // Dominant party in state-level PC winners (mode) — used as fallback for PCs missing from election file (e.g. Vellore in TN 2019)
  const dominantPCParty = useMemo((): string | null => {
    if (level !== 'constituencies' || !currentState || currentPC) return null;
    const winners = Object.values(effectiveConstituencyWinners);
    if (winners.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const { party } of winners) {
      counts[party] = (counts[party] ?? 0) + 1;
    }
    let maxParty: string | null = null;
    let maxCount = 0;
    for (const [party, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxParty = party;
      }
    }
    return maxParty;
  }, [level, currentState, currentPC, effectiveConstituencyWinners]);

  useEffect(() => {
    if (!onBrowseListWinnersContext) return;
    const payload: BrowseListWinnersContext = {
      stateWinners,
      constituencyWinners: effectiveConstituencyWinners,
      districtWinners,
      dominantPCParty,
      suppressAssemblyPartyMapColors: suppressAssemblyFilePartyMapColors,
    };
    onBrowseListWinnersContext(payload);
  }, [
    onBrowseListWinnersContext,
    stateWinners,
    effectiveConstituencyWinners,
    districtWinners,
    dominantPCParty,
    suppressAssemblyFilePartyMapColors,
  ]);

  useEffect(() => {
    return () => {
      onBrowseListWinnersContext?.(null);
    };
  }, [onBrowseListWinnersContext]);

  const resolvedPcYearForAcMap = useMemo((): number | null => {
    const loc = readLocation();
    if (!loc) return selectedACPCYear ?? null;
    // A pc- slot is authoritative even when malformed: it says "colour by PC
    // contribution", so fall through to null rather than an assembly year.
    if (rawYearParam(loc.search)?.startsWith('pc-')) return parsePcPrefixedYear(loc.search);
    return selectedACPCYear ?? null;
  }, [selectedACPCYear]);

  const assemblyLayerMapSummary = useMemo(() => {
    if (
      level !== 'assemblies' ||
      !currentState ||
      selectedAssembly ||
      !currentData?.features?.length
    ) {
      return null;
    }

    const stateId = getStateId(currentState);
    const parties: string[] = [];

    for (const f of currentData.features) {
      const props = f.properties as AssemblyProperties;
      if (!props.AC_NAME?.trim()) continue;
      const w = resolveAssemblyMapPolygonWinner({
        props,
        winners: effectiveConstituencyWinners,
        suppressAssemblyPartyMapColors: suppressAssemblyFilePartyMapColors,
        currentPC,
        currentDistrict,
        currentState,
        getStateId,
        districtWinners,
        resolveDistrictName,
      });
      parties.push(w?.party ?? '');
    }

    const seats = aggregateSeatsFromPartyList(parties);
    const featureCount = parties.length;

    const pcY = resolvedPcYearForAcMap;
    let voteRows: PartyVoteRow[] | null = null;
    let totalValidVotes = 0;
    let voteUnits = featureCount;
    let partyCandidateRowsByParty: Record<string, PartyCandidateRow[]> | undefined;

    if (
      pcY != null &&
      persistedParliamentElections?.stateId === stateId &&
      persistedParliamentElections.year === pcY
    ) {
      const agg = aggregateParliamentVotesStatewide(persistedParliamentElections.data);
      if (agg) {
        voteRows = agg.voteRows;
        totalValidVotes = agg.totalValidVotes;
        voteUnits = agg.pcsIncluded;
      }
      const partyRows = aggregatePcPartyCandidatesForMappedFeatures({
        results: persistedParliamentElections.data,
        features: currentData.features,
        stateId,
        stateName: normalizeName(currentState),
        resolvePCName,
      });
      if (partyRows) partyCandidateRowsByParty = partyRows;
    } else if (persistedAssemblyElections?.stateId === stateId) {
      const agg = aggregateAssemblyVotesForMappedFeatures({
        results: persistedAssemblyElections.data,
        features: currentData.features,
      });
      if (agg) {
        voteRows = agg.voteRows;
        totalValidVotes = agg.totalValidVotes;
        voteUnits = agg.mappedConstituencies;
      }
      const partyRows = aggregateAssemblyPartyCandidatesForMappedFeatures({
        results: persistedAssemblyElections.data,
        features: currentData.features,
        stateName: normalizeName(currentState),
      });
      if (partyRows) partyCandidateRowsByParty = partyRows;
    }

    const yearLabelAsm = persistedAssemblyElections?.year ?? selectedYear ?? null;
    const suppressMsg = suppressAssemblyFilePartyMapColors
      ? 'Pre-poll / announced-only data: treat seat and vote aggregates as provisional.'
      : null;

    const subtitleParts: string[] = [];
    if (pcY != null) {
      subtitleParts.push(`Mapped by Lok Sabha ${pcY}`);
      subtitleParts.push('Vote share · statewide parliamentary totals');
    } else if (yearLabelAsm != null) {
      subtitleParts.push(`Assembly ${yearLabelAsm}`);
    }

    return {
      seats,
      voteRows,
      totalValidVotes,
      voteUnits,
      subtitle: subtitleParts.join(' · ') || 'Assembly',
      suppressMsg,
      stateId,
      partyCandidateRowsByParty,
    };
  }, [
    level,
    currentState,
    selectedAssembly,
    currentData,
    effectiveConstituencyWinners,
    suppressAssemblyFilePartyMapColors,
    currentPC,
    currentDistrict,
    districtWinners,
    getStateId,
    resolveDistrictName,
    persistedParliamentElections,
    persistedAssemblyElections,
    resolvedPcYearForAcMap,
    selectedYear,
    resolvePCName,
  ]);

  const parliamentLayerMapSummary = useMemo(() => {
    if (
      level !== 'constituencies' ||
      currentPC ||
      pcElectionResult ||
      electionResult ||
      !currentState ||
      !currentData?.features?.length
    ) {
      return null;
    }

    const stateId = getStateId(currentState);
    const parties: string[] = [];

    for (const f of currentData.features) {
      const props = f.properties as ConstituencyProperties;
      if (!(props.ls_seat_name ?? props.PC_NAME)?.trim() && !props.schemaId) continue;
      const w = resolvePcMapPolygonWinner({
        props,
        winners: effectiveConstituencyWinners,
        dominantPCParty,
      });
      parties.push(w?.party ?? '');
    }

    const seats = aggregateSeatsFromPartyList(parties);
    const featureCount = parties.length;

    const votesAgg =
      persistedParliamentElections?.stateId === stateId
        ? aggregatePcVotesForMappedFeatures({
            results: persistedParliamentElections.data,
            features: currentData.features,
            stateId,
            resolvePCName,
          })
        : null;
    const partyCandidateRowsByParty =
      persistedParliamentElections?.stateId === stateId
        ? aggregatePcPartyCandidatesForMappedFeatures({
            results: persistedParliamentElections.data,
            features: currentData.features,
            stateId,
            stateName: normalizeName(currentState),
            resolvePCName,
          })
        : null;

    let pcYearHint: number | null = pcSelectedYear ?? null;
    const loc = readLocation();
    if (loc) {
      pcYearHint = parseAssemblyYearParam(loc.search) ?? pcYearHint;
    }

    return {
      seats,
      voteRows: votesAgg?.voteRows ?? null,
      totalValidVotes: votesAgg?.totalValidVotes ?? 0,
      voteUnits: votesAgg?.mappedConstituencies ?? featureCount,
      subtitle: pcYearHint != null ? `Lok Sabha ${pcYearHint}` : 'Parliament constituencies',
      stateId,
      partyCandidateRowsByParty: partyCandidateRowsByParty ?? undefined,
    };
  }, [
    level,
    currentPC,
    pcElectionResult,
    electionResult,
    currentState,
    currentData,
    effectiveConstituencyWinners,
    dominantPCParty,
    persistedParliamentElections,
    pcSelectedYear,
    resolvePCName,
    getStateId,
  ]);

  useEffect(() => {
    if (electionResult || pcElectionResult) {
      onSummaryPartyChange?.(null);
    }
  }, [electionResult, pcElectionResult, onSummaryPartyChange]);

  useEffect(() => {
    if (!selectedSummaryParty) return;
    const seats = assemblyLayerMapSummary?.seats ?? parliamentLayerMapSummary?.seats ?? [];
    const voteRows =
      assemblyLayerMapSummary?.voteRows ?? parliamentLayerMapSummary?.voteRows ?? null;
    if (!isSummaryPartyPresent(selectedSummaryParty, seats, voteRows)) {
      onSummaryPartyChange?.(null);
    }
  }, [
    assemblyLayerMapSummary,
    parliamentLayerMapSummary,
    selectedSummaryParty,
    onSummaryPartyChange,
  ]);

  useEffect(() => {
    if (assemblyLayerMapSummary && !electionResult) {
      onStateSummaryDataChange?.({
        variant: 'assembly',
        stateDisplayName: normalizeName(currentState ?? 'State'),
        subtitle: assemblyLayerMapSummary.subtitle,
        seatRows: assemblyLayerMapSummary.seats,
        voteRows: assemblyLayerMapSummary.voteRows,
        ...(assemblyLayerMapSummary.partyCandidateRowsByParty
          ? { partyCandidateRowsByParty: assemblyLayerMapSummary.partyCandidateRowsByParty }
          : {}),
        totalValidVotes: assemblyLayerMapSummary.totalValidVotes,
        constituenciesCounted: assemblyLayerMapSummary.voteUnits,
        seatUnitLabel: 'ACs',
        suppressSummaryMessage: assemblyLayerMapSummary.suppressMsg,
      });
      return;
    }
    if (parliamentLayerMapSummary && !electionResult) {
      onStateSummaryDataChange?.({
        variant: 'parliament',
        stateDisplayName: normalizeName(currentState ?? 'State'),
        subtitle: parliamentLayerMapSummary.subtitle,
        seatRows: parliamentLayerMapSummary.seats,
        voteRows: parliamentLayerMapSummary.voteRows,
        ...(parliamentLayerMapSummary.partyCandidateRowsByParty
          ? { partyCandidateRowsByParty: parliamentLayerMapSummary.partyCandidateRowsByParty }
          : {}),
        totalValidVotes: parliamentLayerMapSummary.totalValidVotes,
        constituenciesCounted: parliamentLayerMapSummary.voteUnits,
        seatUnitLabel: 'PCs',
        suppressSummaryMessage: null,
      });
      return;
    }
    onStateSummaryDataChange?.(null);
  }, [
    assemblyLayerMapSummary,
    parliamentLayerMapSummary,
    electionResult,
    currentState,
    onStateSummaryDataChange,
  ]);

  // Create unique key for GeoJSON to force re-render when data, selection, or coloring year changes
  // Include year so changing PC/AC year remounts the layer and applies new constituencyWinners style
  const geoJsonKey = useMemo((): string => {
    const dataHash = currentData?.features?.length ?? 0;
    const props = currentData?.features?.[0]?.properties as Record<string, unknown> | undefined;
    const firstFeatureName = (props?.['AC_NAME'] ?? props?.['PC_NAME'] ?? '') as string;
    const yearSuffix =
      level === 'constituencies'
        ? `-y${pcSelectedYear ?? ''}`
        : level === 'assemblies' && currentPC
          ? currentView === 'constituencies'
            ? `-y${pcSelectedYear ?? ''}`
            : `-pcy${selectedACPCYear ?? ''}`
          : level === 'assemblies'
            ? selectedACPCYear != null
              ? `-pcy${selectedACPCYear}`
              : `-y${selectedYear ?? ''}`
            : level === 'districts'
              ? selectedYear != null
                ? `-y${selectedYear}`
                : selectedACPCYear != null
                  ? `-pcy${selectedACPCYear}`
                  : ''
              : '';
    const selectedAssemblyIdentity =
      level === 'assemblies'
        ? `-ac${
            electionResult?.constituencyNo != null
              ? electionResult.constituencyNo
              : (electionResult?.schemaId ?? '')
          }`
        : '';
    return `${level}-${currentState ?? 'india'}-${currentPC ?? ''}-${currentDistrict ?? ''}-${selectedAssembly ?? ''}-${showACsWithinPC}-${dataHash}-${firstFeatureName}${yearSuffix}${selectedAssemblyIdentity}-v${winnersVersion}`;
  }, [
    level,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    selectedAssembly,
    showACsWithinPC,
    currentData,
    pcSelectedYear,
    selectedACPCYear,
    selectedYear,
    electionResult?.constituencyNo,
    electionResult?.schemaId,
    winnersVersion,
  ]);

  // Get the data to display (PC boundary, ACs within PC, or current sub-region)
  const displayData = useMemo((): GeoJSONData | null => {
    if (currentPC) {
      if (!showACsWithinPC && currentPCFeatureData) return currentPCFeatureData;
      return currentData;
    }
    if (currentDistrict) return currentData;
    if (currentState) return currentData;
    return statesGeoJSON;
  }, [
    statesGeoJSON,
    currentData,
    currentState,
    currentPC,
    currentDistrict,
    showACsWithinPC,
    currentPCFeatureData,
  ]);

  // Enrich assembly features with schemaId so style lookup by schemaId works (fixes name mismatches e.g. Mettur)
  // Enrich single PC feature (showACs=false) with schemaId so party color lookup works (e.g. Vellore → DMK)
  const displayDataForMap = useMemo((): GeoJSONData | null => {
    if (!displayData?.features?.length) return displayData;
    const stateId = currentState ? getStateId(currentState) : '';
    if (level === 'assemblies' && currentState && schema) {
      const acIdByNo = new Map<number, string>();
      Object.entries(schema.assemblyConstituencies || {}).forEach(([id, ac]) => {
        if (ac.stateId !== stateId || typeof ac.acNo !== 'number') return;
        acIdByNo.set(ac.acNo, id);
      });
      const enriched = {
        ...displayData,
        features: displayData.features.map((f) => {
          const props = f.properties as AssemblyProperties & { schemaId?: string };
          const acName = props.AC_NAME;
          const acNoRaw = props.AC_NO;
          const acNo =
            typeof acNoRaw === 'number'
              ? acNoRaw
              : typeof acNoRaw === 'string'
                ? parseInt(acNoRaw, 10)
                : NaN;
          const sidFromNo = Number.isFinite(acNo) ? acIdByNo.get(acNo) : undefined;
          const sid = sidFromNo ?? (acName ? resolveACName(acName, stateId) : null);
          if (!sid) return f;
          return {
            ...f,
            properties: { ...props, schemaId: sid },
          };
        }),
      };
      return enriched as GeoJSONData;
    }
    if (
      level === 'constituencies' &&
      currentPC &&
      currentState &&
      displayData.features.length === 1
    ) {
      const f = displayData.features[0];
      if (!f) return displayData;
      const props = f.properties as ConstituencyProperties & { schemaId?: string };
      const sid = props.schemaId || resolvePCName(currentPC, stateId);
      if (sid) {
        return {
          ...displayData,
          features: [{ ...f, properties: { ...props, schemaId: sid } }],
        } as GeoJSONData;
      }
    }
    return displayData;
  }, [
    displayData,
    level,
    currentState,
    currentPC,
    schema,
    getStateId,
    resolveACName,
    resolvePCName,
  ]);

  const assemblyNameCounts = useMemo((): Map<string, number> => {
    const counts = new Map<string, number>();
    if (level !== 'assemblies' || !displayDataForMap?.features?.length) return counts;
    for (const feature of displayDataForMap.features) {
      const props = feature.properties as AssemblyProperties;
      const key = normalizeName(props.AC_NAME ?? '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [level, displayDataForMap]);

  // Background states - shown dimmed when zoomed into a state for context
  const showBackgroundStates = Boolean(currentState) && statesGeoJSON;

  // Style for background states: color by state winner (party with most Lok Sabha seats) or app-wide neutral
  const backgroundStateStyle = useCallback(
    (feature?: GeoJSON.Feature): L.PathOptions => {
      const base = {
        fillOpacity: 0.6,
        color: '#fff',
        weight: 1,
        opacity: 0.85,
      };
      if (!feature || Object.keys(stateWinners).length === 0) {
        return {
          ...base,
          fillColor: NEUTRAL_FILL_COLOR,
          color: NEUTRAL_STROKE_COLOR,
        };
      }
      const props = feature.properties as StateProperties;
      const stateIdFromSchema = props.schemaId;
      const stateName = props.shapeName ?? props.ST_NM ?? '';
      const stateId = stateIdFromSchema ?? (stateName ? getStateId(stateName) : '');
      const winner = stateId ? stateWinners[stateId] : undefined;
      if (winner) {
        return { ...base, fillColor: getPartyColor(winner.party ?? '') };
      }
      return { ...base, fillColor: NEUTRAL_FILL_COLOR, color: NEUTRAL_STROKE_COLOR };
    },
    [stateWinners, getStateId]
  );

  // Click handler for background states (other states when zoomed into one)
  const onBackgroundStateClick = useCallback(
    (feature: Feature, layer: Layer): void => {
      const typedLayer = layer as unknown as FeatureLayer;
      const props = feature.properties as StateProperties;
      const stateName = props.shapeName ?? props.ST_NM ?? '';
      const normalizedName = normalizeName(stateName);

      // Tooltip on hover
      typedLayer.bindTooltip(`Go to ${normalizedName}`, {
        permanent: false,
        direction: 'center',
        className: 'hover-tooltip background-state-tooltip',
      });

      typedLayer.on({
        click: (e: LLeafletMouseEvent): void => {
          // Stop propagation to prevent other layers from receiving this click
          L.DomEvent.stopPropagation(e);
          // Navigate to clicked state
          onStateClick(stateName, feature as StateFeature);
        },
      });
    },
    [onStateClick]
  );

  // Background PCs - shown when viewing assemblies within a PC
  const showBackgroundPCs = Boolean(currentPC) && parliamentGeoJSON && currentState;

  // Get other PCs in the same state (excluding current PC)
  const backgroundPCsData = useMemo(() => {
    if (!showBackgroundPCs || !parliamentGeoJSON || !currentState) return null;

    const stateNormalized = normalizeName(currentState).toLowerCase();
    const currentPCNormalized = currentPC?.toLowerCase() ?? '';

    const otherPCs = parliamentGeoJSON.features.filter((f) => {
      const props = f.properties;
      const pcState = normalizeName(props.STATE_NAME ?? props.state_ut_name ?? '').toLowerCase();
      const pcName = (props.ls_seat_name ?? props.PC_NAME ?? '').toLowerCase();

      // Same state but different PC
      return pcState === stateNormalized && pcName !== currentPCNormalized;
    });

    if (otherPCs.length === 0) return null;

    return {
      type: 'FeatureCollection' as const,
      features: otherPCs,
    };
  }, [showBackgroundPCs, parliamentGeoJSON, currentState, currentPC]);

  // Style for background PCs: colour by PC winner (from backgroundPCWinners or constituencyWinners) or app-wide neutral
  const backgroundPCStyle = useCallback(
    (feature?: GeoJSON.Feature): L.PathOptions => {
      const base = {
        fillOpacity: 0.6,
        color: '#fff',
        weight: 1,
        opacity: 0.85,
      };
      if (!feature) {
        return mergeDimmedNonFocusStyle({
          ...base,
          fillColor: NEUTRAL_FILL_COLOR,
          color: NEUTRAL_STROKE_COLOR,
        });
      }
      const props = feature.properties as ConstituencyProperties;
      const pcName = (props.ls_seat_name ?? props.PC_NAME ?? '').trim();
      const schemaId = props.schemaId;
      const normalizedName = pcName
        ? normalizeName(pcName).toUpperCase().replace(/\s+/g, ' ').trim()
        : '';
      const winner =
        (schemaId && (backgroundPCWinners[schemaId] ?? effectiveConstituencyWinners[schemaId])) ??
        (normalizedName &&
          (backgroundPCWinners[normalizedName] ?? effectiveConstituencyWinners[normalizedName])) ??
        (pcName &&
          (backgroundPCWinners[pcName.toUpperCase()] ??
            effectiveConstituencyWinners[pcName.toUpperCase()]));
      if (winner) {
        return mergeDimmedNonFocusStyle({ ...base, fillColor: getPartyColor(winner.party ?? '') });
      }
      return mergeDimmedNonFocusStyle({
        ...base,
        fillColor: NEUTRAL_FILL_COLOR,
        color: NEUTRAL_STROKE_COLOR,
      });
    },
    [backgroundPCWinners, effectiveConstituencyWinners]
  );

  // Click and hover handler for background PCs
  const onBackgroundPCClick = useCallback(
    (feature: Feature, layer: Layer): void => {
      const typedLayer = layer as unknown as FeatureLayer;
      const props = feature.properties as ConstituencyProperties;
      const pcName = props.ls_seat_name ?? props.PC_NAME ?? '';

      // Tooltip on hover
      typedLayer.bindTooltip(`Go to ${pcName}`, {
        permanent: false,
        direction: 'center',
        className: 'hover-tooltip background-state-tooltip',
      });

      const hoverStyle = getHoverStyle('constituencies');
      typedLayer.on({
        mouseover: (): void => {
          const prev = lastHoveredLayerRef.current;
          if (prev && prev !== typedLayer) {
            const baseStyle = (prev as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
            if (baseStyle) prev.setStyle(baseStyle);
          }
          lastHoveredLayerRef.current = typedLayer;
          (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle =
            backgroundPCStyle(feature);
          typedLayer.setStyle(hoverStyle);
          typedLayer.bringToFront();
        },
        mouseout: (): void => {
          const baseStyle = backgroundPCStyle(feature);
          typedLayer.setStyle(baseStyle);
          if (lastHoveredLayerRef.current === typedLayer) lastHoveredLayerRef.current = null;
        },
        click: (e: LLeafletMouseEvent): void => {
          // Stop propagation to prevent other layers from receiving this click
          L.DomEvent.stopPropagation(e);
          // Navigate to clicked PC
          onConstituencyClick(pcName, feature as ConstituencyFeature);
        },
      });
    },
    [onConstituencyClick, backgroundPCStyle]
  );

  // Background Districts - shown when viewing assemblies within a district
  const showBackgroundDistricts = Boolean(currentDistrict) && districtsCache && currentState;

  // Get other districts in the same state (excluding current district)
  const backgroundDistrictsData = useMemo(() => {
    if (!showBackgroundDistricts || !districtsCache || !currentState) {
      return null;
    }

    // Get the state file name (e.g., "TN" for Tamil Nadu) to look up in cache
    const stateFileName = getStateFileName(currentState);

    if (!stateFileName || !districtsCache[stateFileName]) {
      return null;
    }

    const stateDistricts = districtsCache[stateFileName];
    const currentDistrictNormalized = currentDistrict?.toLowerCase() ?? '';

    const otherDistricts = stateDistricts.features.filter((f) => {
      const props = f.properties;
      const districtName = (props.district ?? props.NAME ?? props.DISTRICT ?? '').toLowerCase();

      // Different district
      return districtName !== currentDistrictNormalized;
    });

    if (otherDistricts.length === 0) return null;

    return {
      type: 'FeatureCollection' as const,
      features: otherDistricts,
    };
  }, [showBackgroundDistricts, districtsCache, currentState, currentDistrict]);

  // Current district boundary - single feature for highlighting selected district in district detail
  const currentDistrictBoundaryData = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!showBackgroundDistricts || !districtsCache || !currentState || !currentDistrict) {
      return null;
    }
    const stateFileName = getStateFileName(currentState);
    if (!stateFileName || !districtsCache[stateFileName]) return null;
    const stateDistricts = districtsCache[stateFileName];
    const currentDistrictNormalized = currentDistrict.trim().toLowerCase();
    const currentFeature = stateDistricts.features.find((f) => {
      const props = f.properties;
      const districtName = (props.district ?? props.NAME ?? props.DISTRICT ?? '')
        .toString()
        .trim()
        .toLowerCase();
      return districtName === currentDistrictNormalized;
    });
    if (!currentFeature) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [currentFeature],
    };
  }, [showBackgroundDistricts, districtsCache, currentState, currentDistrict]);

  // Current state boundary - single feature for highlighting selected state in all state-level views
  const currentStateBoundaryData = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!currentState || !statesGeoJSON) return null;
    const currentStateNorm = normalizeName(currentState).toLowerCase();
    const currentFeature = statesGeoJSON.features.find((f) => {
      const props = f.properties;
      const name = normalizeName(props.shapeName ?? props.ST_NM ?? '').toLowerCase();
      return name === currentStateNorm;
    });
    if (!currentFeature) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [currentFeature],
    };
  }, [currentState, statesGeoJSON]);

  // Style for background districts: colour by dominant party in district (from AC winners) or neutral
  const backgroundDistrictStyle = useCallback(
    (feature?: GeoJSON.Feature): L.PathOptions => {
      const base = {
        fillOpacity: 0.6,
        color: '#fff',
        weight: 1,
        opacity: 0.85,
      };
      const neutral = {
        ...base,
        fillColor: NEUTRAL_FILL_COLOR,
        color: NEUTRAL_STROKE_COLOR,
      };
      if (suppressAssemblyFilePartyMapColors) {
        return mergeDimmedNonFocusStyle(neutral);
      }
      if (!feature || !currentState || Object.keys(districtWinners).length === 0) {
        return mergeDimmedNonFocusStyle(neutral);
      }
      const props = feature.properties as DistrictProperties;
      const party = resolveDistrictPolygonParty(props, {
        districtWinners,
        currentState,
        getStateId,
        resolveDistrictName,
        getDistrict,
        suppressPartyColors: suppressAssemblyFilePartyMapColors,
      });
      if (party) {
        return mergeDimmedNonFocusStyle({ ...base, fillColor: getPartyColor(party) });
      }
      return mergeDimmedNonFocusStyle(neutral);
    },
    [
      currentState,
      districtWinners,
      getStateId,
      resolveDistrictName,
      getDistrict,
      suppressAssemblyFilePartyMapColors,
    ]
  );

  // Click and hover handler for background districts
  const onBackgroundDistrictClick = useCallback(
    (feature: Feature, layer: Layer): void => {
      const typedLayer = layer as unknown as FeatureLayer;
      const props = feature.properties as DistrictProperties;
      const districtName = props.district ?? props.NAME ?? props.DISTRICT ?? '';

      // Tooltip on hover
      typedLayer.bindTooltip(`Go to ${districtName}`, {
        permanent: false,
        direction: 'center',
        className: 'hover-tooltip background-state-tooltip',
      });

      const hoverStyle = getHoverStyle('districts');
      typedLayer.on({
        mouseover: (): void => {
          const prev = lastHoveredLayerRef.current;
          if (prev && prev !== typedLayer) {
            const baseStyle = (prev as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
            if (baseStyle) prev.setStyle(baseStyle);
          }
          lastHoveredLayerRef.current = typedLayer;
          (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle =
            backgroundDistrictStyle(feature);
          typedLayer.setStyle(hoverStyle);
          typedLayer.bringToFront();
        },
        mouseout: (): void => {
          const baseStyle = backgroundDistrictStyle(feature);
          typedLayer.setStyle(baseStyle);
          if (lastHoveredLayerRef.current === typedLayer) lastHoveredLayerRef.current = null;
        },
        click: (e: LLeafletMouseEvent): void => {
          // Stop propagation to prevent other layers from receiving this click
          L.DomEvent.stopPropagation(e);
          // Navigate to clicked district
          onDistrictClick(districtName, feature as DistrictFeature);
        },
      });
    },
    [onDistrictClick, backgroundDistrictStyle]
  );

  // Compute legend info
  const legendName =
    currentPC ?? currentDistrict ?? (currentState ? normalizeName(currentState) : 'India');
  const legendCount = displayData?.features?.length ?? 0;

  // Style function with index tracking
  const styleIndex = useRef<number>(0);

  const onEachFeature = useCallback(
    (feature: Feature, layer: Layer): void => {
      const typedLayer = layer as unknown as FeatureLayer;

      // Get feature name based on level
      let name: string;

      if (level === 'states') {
        const props = feature.properties as StateProperties;
        name = normalizeName(props.shapeName ?? props.ST_NM ?? '');
      } else if (level === 'districts') {
        const props = feature.properties as DistrictProperties;
        name = props.district ?? props.NAME ?? props.DISTRICT ?? 'Unknown';
      } else if (level === 'constituencies') {
        const props = feature.properties as ConstituencyProperties;
        name = props.ls_seat_name ?? props.PC_NAME ?? 'Unknown';
      } else {
        const props = feature.properties as AssemblyProperties;
        name = props.AC_NAME ?? 'Unknown';
      }

      // Apply selected style immediately when layer is added
      // Prefer prop so deep-link / URL load has correct selection before refs are synced
      const currentSelectedAssembly =
        selectedAssembly ?? selectedAssemblyRef.current ?? pendingSelectedAssembly.current;
      const selectedAssemblyNo =
        level === 'assemblies' ? (electionResult?.constituencyNo ?? undefined) : undefined;
      const selectedSchemaId =
        level === 'assemblies' ? (electionResult?.schemaId ?? undefined) : undefined;
      const featureSchemaId =
        level === 'assemblies'
          ? ((feature.properties as AssemblyProperties & { schemaId?: string }).schemaId ?? '')
          : '';
      const isSelected =
        level === 'assemblies' &&
        isAssemblyFeatureSelected({
          selectedAssembly: currentSelectedAssembly,
          selectedConstituencyNo: selectedAssemblyNo,
          selectedSchemaId,
          featureName: name,
          featureSchemaId,
          featureACNo: (feature.properties as AssemblyProperties & { AC_NO?: string | number })
            .AC_NO,
          assemblyNameCounts,
        });

      if (isSelected) {
        typedLayer.setStyle({
          weight: 4,
          color: '#065f46',
          fillOpacity: 0.75,
          opacity: 1,
        });
        typedLayer.bringToFront();
      }

      // Bind tooltip - permanent for selected assembly, hover for others
      typedLayer.bindTooltip(name, {
        permanent: Boolean(isSelected),
        direction: 'center',
        className: isSelected ? 'selected-tooltip' : 'hover-tooltip',
      });

      // Event handlers: India view (states) gets hover; others tooltip + click only
      const clickHandler = (): void => {
        if (level === 'states') {
          const props = feature.properties as StateProperties;
          const originalName = props.shapeName ?? props.ST_NM ?? name;
          onStateClick(originalName, feature as StateFeature);
        } else if (level === 'districts') {
          onDistrictClick(name, feature as DistrictFeature);
        } else if (level === 'constituencies') {
          onConstituencyClick(name, feature as ConstituencyFeature);
        } else if (onAssemblyClick) {
          // Set pending selected assembly immediately
          pendingSelectedAssembly.current = name;
          onAssemblyClick(name, feature as AssemblyFeature);
        }
      };

      if (level === 'states') {
        const hoverStyle = getHoverStyle('states');
        const layerWithOpts = typedLayer as unknown as { options: L.PathOptions };
        typedLayer.on({
          mouseover: (): void => {
            const prev = lastHoveredLayerRef.current;
            if (prev && prev !== typedLayer) {
              const baseStyle = (prev as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
              if (baseStyle) prev.setStyle(baseStyle);
            }
            lastHoveredLayerRef.current = typedLayer;
            const opts = layerWithOpts.options;
            const isAlreadyHover =
              opts.weight === hoverStyle.weight && opts.color === hoverStyle.color;
            if (!isAlreadyHover) {
              const stored = {
                fillColor: opts.fillColor,
                fillOpacity: opts.fillOpacity,
                color: opts.color,
                weight: opts.weight,
                opacity: opts.opacity,
              };
              (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle = stored;
            }
            typedLayer.setStyle(hoverStyle);
            typedLayer.bringToFront();
          },
          mouseout: (): void => {
            const baseStyle = (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
            if (baseStyle) typedLayer.setStyle(baseStyle);
            if (lastHoveredLayerRef.current === typedLayer) lastHoveredLayerRef.current = null;
          },
          click: clickHandler,
        });
      } else if (level === 'assemblies') {
        const hoverStyle = getHoverStyle('assemblies');
        const selectedGreenWeight = 4;
        const greenStyle = {
          weight: 4,
          color: '#065f46',
          fillOpacity: 0.75,
          opacity: 1,
        };
        const layerWithOpts = typedLayer as unknown as { options: L.PathOptions };
        typedLayer.on({
          mouseover: (): void => {
            if (isSelected) return;
            const prev = lastHoveredLayerRef.current;
            if (prev && prev !== typedLayer) {
              const baseStyle = (prev as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
              if (baseStyle) prev.setStyle(baseStyle);
            }
            lastHoveredLayerRef.current = typedLayer;
            const opts = layerWithOpts.options;
            const isAlreadyHover =
              opts.weight === hoverStyle.weight && opts.color === hoverStyle.color;
            if (!isAlreadyHover) {
              const stored = {
                fillColor: opts.fillColor,
                fillOpacity: opts.fillOpacity,
                color: opts.color,
                weight: opts.weight,
                opacity: opts.opacity,
              };
              (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle = stored;
            }
            typedLayer.setStyle(hoverStyle);
            typedLayer.bringToFront();
          },
          mouseout: (): void => {
            if (isSelected) return;
            // Don't restore if layer has selected (green) style — weight 4 is unique to selected in assemblies
            if (layerWithOpts.options.weight === selectedGreenWeight) return;
            const baseStyle = (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
            if (baseStyle) typedLayer.setStyle(baseStyle);
            if (lastHoveredLayerRef.current === typedLayer) lastHoveredLayerRef.current = null;
            // Re-apply green to selected AC so it stays green even if another code path overwrote it
            const sel =
              selectedAssembly ?? selectedAssemblyRef.current ?? pendingSelectedAssembly.current;
            const selectedNo = electionResult?.constituencyNo;
            const selectedId = electionResult?.schemaId ?? '';
            if (sel && geoJsonRef.current) {
              const geo = geoJsonRef.current;
              requestAnimationFrame(() => {
                geo.eachLayer((layer) => {
                  const f = (layer as unknown as { feature?: GeoJSON.Feature }).feature;
                  if (f) {
                    const props = f.properties as AssemblyProperties & { schemaId?: string };
                    const shouldSelect = isAssemblyFeatureSelected({
                      selectedAssembly: sel,
                      selectedConstituencyNo: selectedNo,
                      selectedSchemaId: selectedId,
                      featureName: props.AC_NAME,
                      featureSchemaId: props.schemaId,
                      featureACNo: props.AC_NO,
                      assemblyNameCounts,
                    });
                    if (shouldSelect) {
                      (layer as unknown as { setStyle: (s: object) => void }).setStyle(greenStyle);
                      (layer as unknown as { bringToFront: () => void }).bringToFront();
                    }
                  }
                });
              });
            }
          },
          click: clickHandler,
        });
      } else if (level === 'districts') {
        const hoverStyle = getHoverStyle('districts');
        const layerWithOpts = typedLayer as unknown as { options: L.PathOptions };
        typedLayer.on({
          mouseover: (): void => {
            const prev = lastHoveredLayerRef.current;
            if (prev && prev !== typedLayer) {
              const baseStyle = (prev as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
              if (baseStyle) prev.setStyle(baseStyle);
            }
            lastHoveredLayerRef.current = typedLayer;
            const opts = layerWithOpts.options;
            const isAlreadyHover =
              opts.weight === hoverStyle.weight && opts.color === hoverStyle.color;
            if (!isAlreadyHover) {
              const stored = {
                fillColor: opts.fillColor,
                fillOpacity: opts.fillOpacity,
                color: opts.color,
                weight: opts.weight,
                opacity: opts.opacity,
              };
              (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle = stored;
            }
            typedLayer.setStyle(hoverStyle);
            typedLayer.bringToFront();
          },
          mouseout: (): void => {
            const baseStyle = (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
            if (baseStyle) typedLayer.setStyle(baseStyle);
            if (lastHoveredLayerRef.current === typedLayer) lastHoveredLayerRef.current = null;
          },
          click: clickHandler,
        });
      } else if (level === 'constituencies') {
        const hoverStyle = getHoverStyle('constituencies');
        const layerWithOpts = typedLayer as unknown as { options: L.PathOptions };
        typedLayer.on({
          mouseover: (): void => {
            const prev = lastHoveredLayerRef.current;
            if (prev && prev !== typedLayer) {
              const baseStyle = (prev as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
              if (baseStyle) prev.setStyle(baseStyle);
            }
            lastHoveredLayerRef.current = typedLayer;
            const opts = layerWithOpts.options;
            const isAlreadyHover =
              opts.weight === hoverStyle.weight && opts.color === hoverStyle.color;
            if (!isAlreadyHover) {
              const stored = {
                fillColor: opts.fillColor,
                fillOpacity: opts.fillOpacity,
                color: opts.color,
                weight: opts.weight,
                opacity: opts.opacity,
              };
              (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle = stored;
            }
            typedLayer.setStyle(hoverStyle);
            typedLayer.bringToFront();
          },
          mouseout: (): void => {
            const baseStyle = (typedLayer as unknown as { _baseStyle?: L.PathOptions })._baseStyle;
            if (baseStyle) typedLayer.setStyle(baseStyle);
            if (lastHoveredLayerRef.current === typedLayer) lastHoveredLayerRef.current = null;
          },
          click: clickHandler,
        });
      } else {
        typedLayer.on({ click: clickHandler });
      }
    },
    [
      level,
      selectedAssembly,
      electionResult?.constituencyNo,
      electionResult?.schemaId,
      assemblyNameCounts,
      onStateClick,
      onDistrictClick,
      onConstituencyClick,
      onAssemblyClick,
    ]
  );

  // Reset style index when data changes
  useEffect(() => {
    styleIndex.current = 0;
  }, [geoJsonKey, effectiveConstituencyWinners]);

  // Apply selected style when assembly is selected (tooltips are handled in onEachFeature)
  useEffect(() => {
    if (selectedAssembly && level === 'assemblies') {
      // Sync pending ref with actual state
      pendingSelectedAssembly.current = selectedAssembly;

      const applyStyle = (): void => {
        if (!geoJsonRef.current) return;

        // Clear any previously forced selected style first. This is important when
        // switching between same-name ACs (e.g. Tiruppattur variants) where the
        // selectedAssembly string can remain unchanged.
        geoJsonRef.current.resetStyle();

        const selectedNo = electionResult?.constituencyNo;
        const selectedId = electionResult?.schemaId ?? '';
        geoJsonRef.current.eachLayer((layer) => {
          const feature = (layer as unknown as { feature?: GeoJSON.Feature }).feature;
          if (feature) {
            const props = feature.properties as AssemblyProperties & { schemaId?: string };
            const typedLayer = layer as unknown as {
              setStyle: (style: object) => void;
              bringToFront: () => void;
            };
            const shouldSelect = isAssemblyFeatureSelected({
              selectedAssembly,
              selectedConstituencyNo: selectedNo,
              selectedSchemaId: selectedId,
              featureName: props.AC_NAME,
              featureSchemaId: props.schemaId,
              featureACNo: props.AC_NO,
              assemblyNameCounts,
            });
            if (shouldSelect) {
              typedLayer.setStyle({
                weight: 4,
                color: '#065f46',
                fillOpacity: 0.75,
                opacity: 1,
              });
              typedLayer.bringToFront();
            }
          }
        });
      };

      applyStyle();
      const rafId = requestAnimationFrame(applyStyle);

      return () => cancelAnimationFrame(rafId);
    } else if (!selectedAssembly) {
      pendingSelectedAssembly.current = null;
      if (geoJsonRef.current) {
        geoJsonRef.current.resetStyle();
      }
    }
    return undefined;
  }, [
    selectedAssembly,
    electionResult?.constituencyNo,
    electionResult?.schemaId,
    level,
    geoJsonKey,
    assemblyNameCounts,
  ]);

  // Style function that highlights selected assembly with dark green border and color-codes by party
  const style = useCallback(
    (feature?: GeoJSON.Feature) => {
      const idx = styleIndex.current++;
      let baseStyle = getFeatureStyle(idx, level) as L.PathOptions;
      // Assemblies view: 100% party color coding — never use default/palette; neutral until party is found
      if (level === 'assemblies') {
        baseStyle = { ...NEUTRAL_MAP_STYLE };
      }
      // Constituencies (PC) view: 100% party or neutral — never palette (state-level and single-PC)
      if (level === 'constituencies') {
        baseStyle = { ...NEUTRAL_MAP_STYLE };
      }

      // Color-code India view states by party with most Lok Sabha seats (latest election)
      if (level === 'states' && feature && Object.keys(stateWinners).length > 0) {
        const props = feature.properties as StateProperties;
        const stateIdFromSchema = props.schemaId;
        const stateName = props.shapeName ?? props.ST_NM ?? '';
        const stateId = stateIdFromSchema ?? (stateName ? getStateId(stateName) : '');
        const winner = stateId ? stateWinners[stateId] : undefined;
        if (winner) {
          baseStyle = {
            fillColor: getPartyColor(winner.party ?? ''),
            fillOpacity: 0.7,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
          };
        }
      }

      // Color-code districts by dominant party; never use palette in districts view (100% party or neutral)
      if (level === 'districts' && feature && currentState) {
        baseStyle = { ...NEUTRAL_MAP_STYLE };
        const props = feature.properties as DistrictProperties;
        const party = resolveDistrictPolygonParty(props, {
          districtWinners,
          currentState,
          getStateId,
          resolveDistrictName,
          getDistrict,
          suppressPartyColors: suppressAssemblyFilePartyMapColors,
        });
        if (party && !suppressAssemblyFilePartyMapColors) {
          baseStyle = {
            fillColor: getPartyColor(party),
            fillOpacity: 0.7,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
          };
        }
      }

      // AC / Lok Sabha polygons: colouring matches StateMapSummaryPanel seat tallies via shared resolvers
      if (feature && level === 'assemblies') {
        const asmProps = feature.properties as AssemblyProperties;
        const suppressAssemblyPartyMapColorsLocal = suppressAssemblyFilePartyMapColors;
        const asmWinner = resolveAssemblyMapPolygonWinner({
          props: asmProps,
          winners: effectiveConstituencyWinners,
          suppressAssemblyPartyMapColors: suppressAssemblyPartyMapColorsLocal,
          currentPC,
          currentDistrict,
          currentState,
          getStateId,
          districtWinners,
          resolveDistrictName,
        });
        if (asmWinner && !suppressAssemblyPartyMapColorsLocal) {
          baseStyle = {
            fillColor: getPartyColor(asmWinner.party ?? ''),
            fillOpacity: 0.7,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
          };
        }
        if (
          selectedSummaryParty &&
          assemblyLayerMapSummary &&
          (!asmWinner || asmWinner.party !== selectedSummaryParty)
        ) {
          baseStyle = mergeDimmedNonFocusStyle(baseStyle);
        }
        if (selectedAssembly) {
          const asmFocusSelected = isAssemblyFeatureSelected({
            selectedAssembly,
            selectedConstituencyNo: electionResult?.constituencyNo,
            selectedSchemaId: electionResult?.schemaId ?? '',
            featureName: asmProps.AC_NAME,
            featureSchemaId: asmProps.schemaId,
            featureACNo: asmProps.AC_NO,
            assemblyNameCounts,
          });
          if (!asmFocusSelected) {
            baseStyle = mergeDimmedNonFocusStyle(baseStyle);
          }
        }
      } else if (feature && level === 'constituencies') {
        const pcProps = feature.properties as ConstituencyProperties;
        const pcWinner = resolvePcMapPolygonWinner({
          props: pcProps,
          winners: effectiveConstituencyWinners,
          dominantPCParty,
        });
        if (pcWinner) {
          baseStyle = {
            fillColor: getPartyColor(pcWinner.party ?? ''),
            fillOpacity: 0.7,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
          };
        }
        if (
          selectedSummaryParty &&
          parliamentLayerMapSummary &&
          (!pcWinner || pcWinner.party !== selectedSummaryParty)
        ) {
          baseStyle = mergeDimmedNonFocusStyle(baseStyle);
        }
      }

      // Highlight selected assembly with dark green border (same normalization as onEachFeature/reapply so name variants match)
      if (selectedAssembly && level === 'assemblies' && feature) {
        const props = feature.properties as AssemblyProperties & { schemaId?: string };
        const selectedNo = electionResult?.constituencyNo;
        const selectedId = electionResult?.schemaId ?? '';
        const shouldSelect = isAssemblyFeatureSelected({
          selectedAssembly,
          selectedConstituencyNo: selectedNo,
          selectedSchemaId: selectedId,
          featureName: props.AC_NAME,
          featureSchemaId: props.schemaId,
          featureACNo: props.AC_NO,
          assemblyNameCounts,
        });
        if (shouldSelect) {
          return {
            ...baseStyle,
            weight: 4,
            color: '#065f46',
            fillOpacity: 0.75,
            opacity: 1,
          };
        }
      }

      return baseStyle;
    },
    [
      level,
      selectedAssembly,
      electionResult?.constituencyNo,
      electionResult?.schemaId,
      assemblyNameCounts,
      effectiveConstituencyWinners,
      dominantPCParty,
      stateWinners,
      districtWinners,
      getStateId,
      getDistrict,
      currentState,
      currentDistrict,
      currentPC,
      resolveDistrictName,
      suppressAssemblyFilePartyMapColors,
      selectedSummaryParty,
      assemblyLayerMapSummary,
      parliamentLayerMapSummary,
    ]
  );

  // Update style ref whenever style function changes
  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  // Re-apply style to all GeoJSON layers when constituencyWinners/districtWinners changes (e.g. after year change and async load)
  // so colors update without requiring a GeoJSON remount
  useEffect(() => {
    if (level !== 'assemblies' && level !== 'constituencies' && level !== 'districts') return;
    const geo = geoJsonRef.current;
    const styleFn = styleRef.current;
    if (!geo || !styleFn) return;
    geo.eachLayer((layer) => {
      const typed = layer as unknown as {
        feature?: GeoJSON.Feature;
        setStyle: (opts: L.PathOptions) => void;
      };
      const feature = typed.feature;
      if (feature && typed.setStyle) {
        typed.setStyle(styleFn(feature));
      }
    });
    // Re-apply selected assembly green so it is not overwritten by the loop above (effect order: selectedAssembly effect runs first, then this one)
    if (level === 'assemblies' && selectedAssembly && geo) {
      const greenStyle = {
        weight: 4,
        color: '#065f46',
        fillOpacity: 0.75,
        opacity: 1,
      };
      const selectedNo = electionResult?.constituencyNo;
      const selectedId = electionResult?.schemaId ?? '';
      geo.eachLayer((layer) => {
        const feature = (layer as unknown as { feature?: GeoJSON.Feature }).feature;
        if (feature) {
          const props = feature.properties as AssemblyProperties & { schemaId?: string };
          const shouldSelect = isAssemblyFeatureSelected({
            selectedAssembly,
            selectedConstituencyNo: selectedNo,
            selectedSchemaId: selectedId,
            featureName: props.AC_NAME,
            featureSchemaId: props.schemaId,
            featureACNo: props.AC_NO,
            assemblyNameCounts,
          });
          if (shouldSelect) {
            (layer as unknown as { setStyle: (s: object) => void }).setStyle(greenStyle);
            (layer as unknown as { bringToFront: () => void }).bringToFront();
          }
        }
      });
    }
  }, [
    effectiveConstituencyWinners,
    level,
    selectedAssembly,
    electionResult?.constituencyNo,
    electionResult?.schemaId,
    assemblyNameCounts,
    acFileMetaForMapColors,
    selectedYear,
    selectedACPCYear,
  ]);

  // Show back button when not at home (India) level
  const showBackButton = Boolean(currentState);

  if (!displayData) {
    return (
      <div className="map-container">
        <div className="loading-overlay active">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  // Right pane panels moved into sidebar; map should not reserve right-panel space.
  const hasPanelOpen = false;

  return (
    <div className="map-container">
      {/* Top center toolbar */}
      <MapToolbar
        showBackButton={showBackButton}
        onReset={onReset}
        onGoBack={onGoBack}
        onFeedbackClick={() => setFeedbackModalOpen(true)}
      />

      <MapContainer
        center={[22, 82]}
        zoom={5}
        minZoom={4}
        maxZoom={18}
        zoomControl={true}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Base layer - Vector tiles or Raster tiles */}
        {baseLayer === 'Vector' ? (
          <VectorTileLayer theme="minimal" />
        ) : (
          <TileLayer
            key={baseLayer}
            url={
              LAYER_URLS[baseLayer]?.url ||
              'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
            }
            maxZoom={LAYER_URLS[baseLayer]?.maxZoom || 19}
            subdomains={LAYER_URLS[baseLayer]?.subdomains || 'abcd'}
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
        )}

        <ScaleControl position="bottomleft" imperial={false} />

        <MapResizer hasPanelOpen={hasPanelOpen} />
        <BackgroundPanes />

        <MapControls level={level} name={legendName} count={legendCount} />

        {/* Primary data layer - states, districts, PCs, or assemblies (displayDataForMap has schemaId on ACs for reliable color lookup) */}
        {displayData && (
          <>
            <GeoJSON
              key={geoJsonKey}
              ref={geoJsonRef as unknown as React.Ref<L.GeoJSON>}
              data={(displayDataForMap ?? displayData) as GeoJSON.FeatureCollection}
              style={style as L.StyleFunction}
              onEachFeature={onEachFeature as (feature: GeoJSON.Feature, layer: Layer) => void}
            />
            <FitBounds
              geojson={displayDataForMap ?? displayData}
              selectedFeatureName={selectedAssembly}
              hasPanelOpen={hasPanelOpen}
            />
          </>
        )}

        {/* Current district boundary - highlighted border when viewing assemblies in district view */}
        {currentDistrictBoundaryData && (
          <GeoJSON
            key={`current-district-boundary-${currentState ?? ''}-${currentDistrict ?? ''}`}
            data={currentDistrictBoundaryData}
            style={() => ({
              weight: 6,
              color: '#000000',
              fillOpacity: 0,
              opacity: 1,
              interactive: false,
            })}
          />
        )}

        {/* Current PC boundary - highlighted border when viewing a single PC (with or without ACs) */}
        {currentPCFeatureData && currentPC && (
          <GeoJSON
            key={`current-pc-boundary-${currentState ?? ''}-${currentPC ?? ''}`}
            data={currentPCFeatureData as GeoJSON.FeatureCollection}
            style={() => ({
              weight: 6,
              color: '#000000',
              fillOpacity: 0,
              opacity: 1,
              interactive: false,
            })}
          />
        )}

        {/* Current state boundary - highlighted border when viewing any state (PC, AC, districts, or within PC/district) */}
        {currentStateBoundaryData && (
          <GeoJSON
            key={`current-state-boundary-${currentState ?? ''}`}
            data={currentStateBoundaryData}
            style={() => ({
              weight: 6,
              color: '#000000',
              fillOpacity: 0,
              opacity: 1,
              interactive: false,
            })}
          />
        )}

        {/* Background states layer - uses backgroundPane for proper z-ordering */}
        {/* Shows all states OTHER than the current one (including in PC/district views) */}
        {showBackgroundStates && statesGeoJSON && (
          <GeoJSON
            key={`background-states-${currentState}-${Object.keys(stateWinners).length}`}
            data={
              {
                type: 'FeatureCollection',
                features: statesGeoJSON.features.filter((f) => {
                  const props = f.properties;
                  const name = normalizeName(props.shapeName ?? props.ST_NM ?? '');
                  return (
                    !currentState ||
                    name.toLowerCase() !== normalizeName(currentState).toLowerCase()
                  );
                }),
              } as GeoJSON.FeatureCollection
            }
            style={(feature) => ({
              ...backgroundStateStyle(feature),
              interactive: true,
            })}
            pane="backgroundPane"
            onEachFeature={
              onBackgroundStateClick as (feature: GeoJSON.Feature, layer: Layer) => void
            }
          />
        )}

        {/* Background PCs layer - shows other PCs in the state when viewing assemblies */}
        {backgroundPCsData && (
          <GeoJSON
            key={`background-pcs-${currentState}-${currentPC}-${selectedAssembly ?? 'none'}-${backgroundPCsData.features.length}-${Object.keys(backgroundPCWinners).length}`}
            data={backgroundPCsData as GeoJSON.FeatureCollection}
            style={(feature) => ({
              ...backgroundPCStyle(feature),
              interactive: true,
            })}
            pane="backgroundPane"
            onEachFeature={(feature: GeoJSON.Feature, layer: Layer) => {
              onBackgroundPCClick(feature as Feature, layer);
            }}
          />
        )}

        {/* Background Districts layer - shows other districts when viewing assemblies in district view */}
        {backgroundDistrictsData && (
          <GeoJSON
            key={`background-districts-${currentState}-${currentDistrict}-${selectedAssembly ?? 'none'}-${backgroundDistrictsData.features.length}-${Object.keys(districtWinners).length}-${suppressAssemblyFilePartyMapColors ? 'np' : 'p'}`}
            data={backgroundDistrictsData as GeoJSON.FeatureCollection}
            style={(feature) => ({
              ...backgroundDistrictStyle(feature),
              interactive: true,
            })}
            pane="backgroundPane"
            onEachFeature={(feature: GeoJSON.Feature, layer: Layer) => {
              onBackgroundDistrictClick(feature as Feature, layer);
            }}
          />
        )}
      </MapContainer>

      {/* Feedback Modal */}
      <FeedbackModal isOpen={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} />
    </div>
  );
}
