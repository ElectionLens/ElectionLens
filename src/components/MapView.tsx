import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import type { Layer, LeafletMouseEvent as LLeafletMouseEvent } from 'leaflet';
import { getFeatureStyle, getHoverStyle, normalizeName, getStateFileName } from '../utils/helpers';
import { matchesHoveredFeature } from '../utils/mapHoverLink';

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
import type { BrowseListWinnersContext } from '../types';
import { isAssemblyFeatureSelected } from '../utils/mapSelection';
import {
  resolveAssemblyMapPolygonWinner,
  resolveDistrictPolygonParty,
  resolvePcMapPolygonWinner,
} from '../utils/mapPolygonWinners';
import {
  readLocation,
  rawYearParam,
  parseAssemblyYearParam,
  parsePcPrefixedYear,
  isPcPath,
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
import { useMapWinners } from '../hooks/useMapWinners';
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
  LAYER_URLS,
  createBackgroundLayerHandler,
  BACKGROUND_LAYER_BASE_STYLE,
  createStandardHoverHandlers,
  SELECTED_ASSEMBLY_STYLE,
  SELECTED_ASSEMBLY_WEIGHT,
  partyFillStyle,
  toStateSummaryPanelData,
  type FeatureLayer,
  type LayerName,
} from './map-view';

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
  hoveredFeature,
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

  // Schema hook - used for resolveACName/resolvePCName and getAC for booth data
  const { resolveACName, resolvePCName, resolveDistrictName, getDistrict, schema } = useSchema();

  // All map colour-coding data (winners per AC/PC/state + the raw files behind it).
  const {
    constituencyWinners,
    winnersVersion,
    acFileMetaForMapColors,
    stateWinners,
    backgroundPCWinners,
    persistedAssemblyElections,
    persistedParliamentElections,
    getStateId,
  } = useMapWinners({
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
  });

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
    const stateDisplayName = normalizeName(currentState ?? 'State');
    if (assemblyLayerMapSummary && !electionResult) {
      onStateSummaryDataChange?.(
        toStateSummaryPanelData(assemblyLayerMapSummary, {
          variant: 'assembly',
          stateDisplayName,
          seatUnitLabel: 'ACs',
        })
      );
      return;
    }
    if (parliamentLayerMapSummary && !electionResult) {
      onStateSummaryDataChange?.(
        toStateSummaryPanelData(parliamentLayerMapSummary, {
          variant: 'parliament',
          stateDisplayName,
          seatUnitLabel: 'PCs',
        })
      );
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
      const base = BACKGROUND_LAYER_BASE_STYLE;
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
      const base = BACKGROUND_LAYER_BASE_STYLE;
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
  const onBackgroundPCClick = useMemo(
    () =>
      createBackgroundLayerHandler<ConstituencyFeature>({
        level: 'constituencies',
        getName: (feature) => {
          const props = feature.properties as ConstituencyProperties;
          return props.ls_seat_name ?? props.PC_NAME ?? '';
        },
        getStyle: backgroundPCStyle,
        onSelect: onConstituencyClick,
        hoveredLayerRef: lastHoveredLayerRef,
      }),
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
      const base = BACKGROUND_LAYER_BASE_STYLE;
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
  const onBackgroundDistrictClick = useMemo(
    () =>
      createBackgroundLayerHandler<DistrictFeature>({
        level: 'districts',
        getName: (feature) => {
          const props = feature.properties as DistrictProperties;
          return props.district ?? props.NAME ?? props.DISTRICT ?? '';
        },
        getStyle: backgroundDistrictStyle,
        onSelect: onDistrictClick,
        hoveredLayerRef: lastHoveredLayerRef,
      }),
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
        typedLayer.setStyle(SELECTED_ASSEMBLY_STYLE);
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

      if (level === 'assemblies') {
        const hoverStyle = getHoverStyle('assemblies');
        const greenStyle = SELECTED_ASSEMBLY_STYLE;
        const layerWithOpts = typedLayer as unknown as { options: L.PathOptions };
        // Assemblies hover exactly like every other focused layer, then add
        // two rules of their own: the selected AC never hovers, and it must
        // stay green even if another code path repainted it.
        const shared = createStandardHoverHandlers(typedLayer, hoverStyle, lastHoveredLayerRef);
        typedLayer.on({
          mouseover: (): void => {
            if (isSelected) return;
            shared.mouseover();
          },
          mouseout: (): void => {
            if (isSelected) return;
            // Don't restore if layer has selected (green) style — weight 4 is unique to selected in assemblies
            if (layerWithOpts.options.weight === SELECTED_ASSEMBLY_WEIGHT) return;
            shared.mouseout();
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
      } else if (level === 'states' || level === 'districts' || level === 'constituencies') {
        // Identical hover for all three - only the level's border colour differs.
        const shared = createStandardHoverHandlers(
          typedLayer,
          getHoverStyle(level),
          lastHoveredLayerRef
        );
        typedLayer.on({ ...shared, click: clickHandler });
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
              typedLayer.setStyle(SELECTED_ASSEMBLY_STYLE);
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
          baseStyle = partyFillStyle(winner.party ?? '');
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
          baseStyle = partyFillStyle(party);
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
          baseStyle = partyFillStyle(asmWinner.party ?? '');
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
          baseStyle = partyFillStyle(pcWinner.party ?? '');
        }
        if (
          selectedSummaryParty &&
          parliamentLayerMapSummary &&
          (!pcWinner || pcWinner.party !== selectedSummaryParty)
        ) {
          baseStyle = mergeDimmedNonFocusStyle(baseStyle);
        }
      }

      // Sidebar row ↔ map polygon link. Apply after party/dimming styles so
      // hover is visible without losing the underlying winner colour.
      if (
        hoveredFeature &&
        feature &&
        matchesHoveredFeature({
          hovered: hoveredFeature,
          level,
          props: feature.properties as Record<string, unknown>,
          assemblyNameCounts,
        })
      ) {
        baseStyle = { ...baseStyle, ...getHoverStyle(level) };
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
          return { ...baseStyle, ...SELECTED_ASSEMBLY_STYLE };
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
      hoveredFeature,
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
      const greenStyle = SELECTED_ASSEMBLY_STYLE;
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
      <main className="map-container" aria-label="Interactive election map">
        <div className="loading-overlay active">
          <div className="spinner"></div>
        </div>
      </main>
    );
  }

  // Right pane panels moved into sidebar; map should not reserve right-panel space.
  const hasPanelOpen = false;

  return (
    <main className="map-container" aria-label="Interactive election map">
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
              LAYER_URLS['Streets']?.url ||
              'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
            maxZoom={LAYER_URLS[baseLayer]?.maxZoom || LAYER_URLS['Streets']?.maxZoom || 19}
            subdomains={LAYER_URLS[baseLayer]?.subdomains || 'abc'}
            attribution={LAYER_URLS[baseLayer]?.attribution || LAYER_URLS['Streets']?.attribution}
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
    </main>
  );
}
