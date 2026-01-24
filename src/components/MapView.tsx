import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import {
  Home,
  ChevronLeft,
  Maximize2,
  Trash2,
  Building2,
  Map,
  Layers,
  MessageSquare,
  Landmark,
} from 'lucide-react';
import type {
  Layer,
  LeafletMouseEvent as LLeafletMouseEvent,
  LatLngBoundsExpression,
} from 'leaflet';
import { getFeatureStyle, getHoverStyle, normalizeName, getStateFileName } from '../utils/helpers';
import { COLOR_PALETTES, isBoothDataAvailable } from '../constants';
import { clearAllCache } from '../utils/db';
import { FeedbackModal } from './FeedbackModal';
import { VectorTileLayer } from './VectorTileLayer';
import { useSchema } from '../hooks/useSchema';

// Lazy load panel components - only loaded when user clicks a constituency
const ElectionResultPanel = lazy(() =>
  import('./ElectionResultPanel').then((m) => ({ default: m.ElectionResultPanel }))
);
const PCElectionResultPanel = lazy(() =>
  import('./PCElectionResultPanel').then((m) => ({ default: m.PCElectionResultPanel }))
);
import { useBoothData } from '../hooks/useBoothData';

// Lightweight loading skeleton for panels
const PanelSkeleton = () => (
  <div className="election-panel" style={{ minHeight: '200px' }}>
    <div className="election-panel-header">
      <div style={{ height: '24px', width: '60%', background: '#e2e8f0', borderRadius: '4px' }} />
    </div>
    <div style={{ padding: '16px' }}>
      <div
        style={{
          height: '16px',
          width: '80%',
          background: '#e2e8f0',
          borderRadius: '4px',
          marginBottom: '8px',
        }}
      />
      <div style={{ height: '16px', width: '60%', background: '#e2e8f0', borderRadius: '4px' }} />
    </div>
  </div>
);
import type {
  MapViewProps,
  FitBoundsProps,
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
  HexColor,
  ViewMode,
} from '../types';

/** Map toolbar props */
interface MapToolbarProps {
  currentView: ViewMode;
  showViewToggle: boolean;
  showBackButton: boolean;
  onReset: () => void;
  onSwitchView: (view: ViewMode) => void;
  onGoBack: () => void;
  onFeedbackClick: () => void;
}

/** Layer option */
type LayerName = 'Streets' | 'Light' | 'Satellite' | 'Terrain' | 'Vector';

/**
 * Map Toolbar Component - Rendered as React overlay at top center
 */
function MapToolbar({
  currentView,
  showViewToggle,
  showBackButton,
  onReset,
  onSwitchView,
  onGoBack,
  onFeedbackClick,
}: MapToolbarProps): JSX.Element {
  const [activeLayer, setActiveLayer] = useState<LayerName>('Streets');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  const handleFullscreen = (): void => {
    const mapContainer = document.querySelector('.map-container');
    if (!document.fullscreenElement) {
      void mapContainer?.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  const handleClearCache = async (): Promise<void> => {
    await clearAllCache();
  };

  const handleLayerChange = (layer: LayerName): void => {
    setActiveLayer(layer);
    setLayerMenuOpen(false);
    // Dispatch custom event for the map to handle
    window.dispatchEvent(new CustomEvent('changeBaseLayer', { detail: layer }));
  };

  const isDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className="map-toolbar">
      {/* Left section - navigation */}
      <div className="toolbar-section toolbar-left">
        {showBackButton && (
          <button className="toolbar-btn" onClick={onGoBack} title="Go back">
            <ChevronLeft size={18} />
          </button>
        )}
        <button className="toolbar-btn" onClick={onReset} title="Reset to India">
          <Home size={18} />
        </button>
        <button className="toolbar-btn" onClick={handleFullscreen} title="Toggle fullscreen">
          <Maximize2 size={18} />
        </button>
        {isDev && (
          <button className="toolbar-btn" onClick={handleClearCache} title="Clear cache">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Center section - view toggle */}
      {showViewToggle && (
        <div className="toolbar-section toolbar-center">
          <button
            className={`toolbar-btn toolbar-toggle ${currentView === 'constituencies' ? 'active' : ''}`}
            onClick={() => onSwitchView('constituencies')}
            title="Parliamentary Constituencies"
          >
            <Building2 size={14} /> PC
          </button>
          <button
            className={`toolbar-btn toolbar-toggle ${currentView === 'districts' ? 'active' : ''}`}
            onClick={() => onSwitchView('districts')}
            title="Districts"
          >
            <Map size={14} /> Dist
          </button>
          <button
            className={`toolbar-btn toolbar-toggle ${currentView === 'assemblies' ? 'active' : ''}`}
            onClick={() => onSwitchView('assemblies')}
            title="Assembly Constituencies"
          >
            <Landmark size={14} /> AC
          </button>
        </div>
      )}

      {/* Right section - feedback and layer switcher */}
      <div className="toolbar-section toolbar-right">
        <button
          className="toolbar-btn feedback-btn"
          onClick={onFeedbackClick}
          title="Send feedback or report a bug"
        >
          <MessageSquare size={18} />
        </button>
        <div className="toolbar-dropdown">
          <button
            className="toolbar-btn toolbar-dropdown-btn"
            onClick={() => setLayerMenuOpen(!layerMenuOpen)}
            title="Change map style"
          >
            <Layers size={18} />
          </button>
          <div className={`toolbar-dropdown-menu ${layerMenuOpen ? 'visible' : ''}`}>
            {(['Streets', 'Light', 'Satellite', 'Terrain', 'Vector'] as LayerName[]).map(
              (layer) => (
                <button
                  key={layer}
                  className={`toolbar-dropdown-item ${activeLayer === layer ? 'active' : ''}`}
                  onClick={() => handleLayerChange(layer)}
                >
                  {layer}
                  {layer === 'Vector' && <span className="layer-badge">Fast</span>}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Leaflet layer with feature property */
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

/** Layer URLs - 'Vector' is handled separately by VectorTileLayer */
const LAYER_URLS: Record<
  string,
  { url: string; maxZoom: number; subdomains?: string; isVector?: boolean }
> = {
  Streets: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    maxZoom: 19,
    subdomains: 'abcd',
  },
  Light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    maxZoom: 19,
    subdomains: 'abcd',
  },
  Satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
  },
  Terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  Vector: {
    url: '', // Handled by VectorTileLayer component
    maxZoom: 19,
    isVector: true,
    subdomains: 'abc',
  },
};

/** Props for MapControls component */
interface MapControlsProps {
  level: MapLevel;
  name: string;
  count: number;
}

/**
 * Map controls component (Leaflet-based)
 * Handles coordinates display, legend, and layer switching
 */
function MapControls({ level, name, count }: MapControlsProps): null {
  const map = useMap();
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const legendControlRef = useRef<L.Control | null>(null);

  // Initialize and handle base layer switching
  useEffect(() => {
    // Find and store reference to the initial TileLayer
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer && !baseLayerRef.current) {
        baseLayerRef.current = layer;
      }
    });

    const handleLayerChange = (e: Event): void => {
      const layerName = (e as CustomEvent).detail as string;

      // Vector tiles are handled by React component, skip Leaflet layer logic
      if (layerName === 'Vector') {
        if (baseLayerRef.current) {
          map.removeLayer(baseLayerRef.current);
          baseLayerRef.current = null;
        }
        return;
      }

      const defaultLayer = LAYER_URLS['Streets'];
      const layerConfig = LAYER_URLS[layerName] ?? defaultLayer;

      if (!layerConfig || !layerConfig.url) return;

      // Remove current base layer
      if (baseLayerRef.current) {
        map.removeLayer(baseLayerRef.current);
      }

      // Create and add new raster tile layer
      const newLayer = L.tileLayer(layerConfig.url, {
        maxZoom: layerConfig.maxZoom,
        subdomains: layerConfig.subdomains ?? 'abc',
      });

      newLayer.addTo(map);
      newLayer.bringToBack();
      baseLayerRef.current = newLayer;
    };

    window.addEventListener('changeBaseLayer', handleLayerChange);

    return (): void => {
      window.removeEventListener('changeBaseLayer', handleLayerChange);
    };
  }, [map]);

  // Legend control (bottom left)
  useEffect(() => {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomleft' as const },
      onAdd: function (): HTMLElement {
        const container = L.DomUtil.create('div', 'map-legend');
        container.id = 'mapLegend';
        return container;
      },
    });

    const legendControl = new LegendControl();
    legendControlRef.current = legendControl;
    map.addControl(legendControl);

    return (): void => {
      map.removeControl(legendControl);
    };
  }, [map]);

  // Update legend content when props change
  useEffect(() => {
    const legend = document.getElementById('mapLegend');
    if (!legend) return;

    const levelLabels: Record<MapLevel, { label: string; color: string }> = {
      states: { label: 'States View', color: '#f59e0b' },
      districts: { label: 'Districts View', color: '#f59e0b' },
      constituencies: { label: 'Parliament View', color: '#8b5cf6' },
      assemblies: { label: 'Assembly View', color: '#10b981' },
    };

    const { label, color } = levelLabels[level] ?? { label: 'Map', color: '#f59e0b' };
    const colors: HexColor[] = COLOR_PALETTES[level] ?? COLOR_PALETTES.states;
    const sampleColors = colors.slice(0, 5);

    const countLabels: Record<MapLevel, string> = {
      states: 'states/UTs',
      districts: 'districts',
      constituencies: 'parliamentary',
      assemblies: 'assembly',
    };
    const countLabel = countLabels[level] ?? 'areas';

    legend.innerHTML = `
      <h4 style="color: ${color}; margin: 0 0 4px 0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px;">${label}</h4>
      <div class="legend-content">
        <div style="font-weight: 600; color: #1f2937; font-size: 0.85rem;">${name}</div>
        ${count ? `<div style="font-size: 0.7rem; color: #6b7280; margin: 2px 0 4px;">${count} ${countLabel}</div>` : '<div style="margin-bottom: 4px;"></div>'}
        <div style="display: flex; gap: 2px; margin-top: 4px;">
          ${sampleColors.map((c) => `<div style="background: ${c}; width: 14px; height: 14px; border-radius: 2px;"></div>`).join('')}
        </div>
      </div>
    `;
  }, [level, name, count]);

  return null;
}

/**
 * Component to invalidate map size when panel state changes
 * Leaflet needs to be notified when its container size changes
 */
function MapResizer({ hasPanelOpen }: { hasPanelOpen: boolean }): null {
  const map = useMap();

  useEffect(() => {
    // Delay to let CSS transition complete (0.4s = 400ms)
    const timer = setTimeout(() => {
      map.invalidateSize({ animate: true });
    }, 450); // Slightly longer than the 0.4s CSS transition

    return () => clearTimeout(timer);
  }, [map, hasPanelOpen]);

  return null;
}

/**
 * Component to create custom panes for background layers
 * Higher z-index panes ensure background layers receive click events
 */
function BackgroundPanes(): null {
  const map = useMap();

  useEffect(() => {
    // Create pane for background context layers (states, PCs, districts)
    // z-index 450 is above overlayPane (400) but below markerPane (600)
    if (!map.getPane('backgroundPane')) {
      const pane = map.createPane('backgroundPane');
      pane.style.zIndex = '450';
      pane.style.pointerEvents = 'auto';
    }
  }, [map]);

  return null;
}

/** Extended FitBounds props with optional selected feature */
interface ExtendedFitBoundsProps extends FitBoundsProps {
  selectedFeatureName?: string | null;
}

/**
 * Get padding for map bounds based on screen size
 * Portrait mobile: panel overlays map, need offset to push feature up
 * Landscape/Desktop: map shrinks, standard padding works
 */
function getMapPadding(hasSelectedFeature: boolean): L.FitBoundsOptions['padding'] {
  const isMobile = window.innerWidth <= 768;

  if (hasSelectedFeature) {
    // Landscape & Desktop: map shrinks with margin-right, standard padding
    return isMobile ? ([40, 40] as [number, number]) : ([60, 60] as [number, number]);
  }

  // Default padding for fitting all features
  return isMobile ? ([20, 20] as [number, number]) : ([30, 30] as [number, number]);
}

/**
 * Component to fit map bounds to GeoJSON data or selected feature
 */
function FitBounds({ geojson, selectedFeatureName }: ExtendedFitBoundsProps): null {
  const map = useMap();

  useEffect(() => {
    if (!geojson?.features?.length) return;

    try {
      // If a feature is selected, zoom to just that feature
      if (selectedFeatureName) {
        const selectedFeature = geojson.features.find((f) => {
          const props = f.properties as AssemblyProperties;
          return props.AC_NAME?.toUpperCase() === selectedFeatureName.toUpperCase();
        });

        if (selectedFeature) {
          const featureLayer = L.geoJSON(selectedFeature as GeoJSON.Feature);
          const bounds = featureLayer.getBounds();
          if (bounds.isValid()) {
            const isMobile = window.innerWidth <= 768;
            const isLandscape = window.innerWidth > window.innerHeight;

            if (isMobile && !isLandscape) {
              // Portrait mobile: offset center to push feature into top portion
              // Panel overlays bottom ~45vh, so offset center DOWN so feature appears UP
              const center = bounds.getCenter();
              const latSpan = bounds.getNorth() - bounds.getSouth();
              const offsetCenter = L.latLng(center.lat - latSpan * 0.4, center.lng);

              const zoom = map.getBoundsZoom(bounds, false, L.point(30, 30));
              const targetZoom = Math.min(zoom - 0.5, 11);

              map.flyTo(offsetCenter, targetZoom, { duration: 0.5 });
            } else {
              // Landscape & Desktop: map shrinks with margin-right, so standard fit
              map.flyToBounds(bounds as LatLngBoundsExpression, {
                padding: [60, 60],
                duration: 0.5,
                maxZoom: 12,
              });
            }
          }
          return;
        }
      }

      // Default: fit to all features
      const layer = L.geoJSON(geojson as GeoJSON.FeatureCollection);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        const padding = getMapPadding(false);
        map.flyToBounds(bounds as LatLngBoundsExpression, { padding, duration: 0.5 });
      }
    } catch (e) {
      console.warn('Failed to fit bounds:', e);
    }
  }, [map, geojson, selectedFeatureName]);

  return null;
}

/**
 * Main map component
 * Renders the Leaflet map with GeoJSON layers
 */
export function MapView({
  statesGeoJSON,
  parliamentGeoJSON,
  districtsCache,
  currentData,
  currentState,
  currentView,
  currentPC,
  currentDistrict,
  selectedAssembly,
  electionResult,
  shareUrl,
  availableYears,
  selectedYear,
  parliamentContributions,
  availablePCYears,
  selectedACPCYear,
  pcContributionShareUrl,
  pcElectionResult,
  pcShareUrl,
  pcAvailableYears,
  pcSelectedYear,
  onStateClick,
  onDistrictClick,
  onConstituencyClick,
  onAssemblyClick,
  onSwitchView,
  onReset,
  onGoBack,
  onCloseElectionPanel,
  onYearChange,
  onACPCYearChange,
  onClosePCElectionPanel,
  onPCYearChange,
}: MapViewProps): JSX.Element {
  const geoJsonRef = useRef<GeoJSONRef>(null);
  // Track pending selected assembly to handle click -> mouseout race condition
  const pendingSelectedAssembly = useRef<string | null>(null);
  // Ref to always have latest selectedAssembly value in callbacks
  const selectedAssemblyRef = useRef<string | null>(selectedAssembly);
  // Feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  // Base layer state - 'Vector' uses VectorTileLayer, others use TileLayer
  const [baseLayer, setBaseLayer] = useState<LayerName>('Streets');
  // Booth data hook - loads booth data for selected assembly
  const { boothResults, boothsWithResults, loadBoothData, loadBoothResults } = useBoothData();
  // Schema hook - used to get pcId for booth data availability check
  const { getAC } = useSchema();

  // Check if booth data is available for the current AC and year
  // Note: When viewing PC contribution (selectedACPCYear), booth data should still use assembly year
  // because booth data is assembly-level, not PC-level
  const acEntity = electionResult?.schemaId ? getAC(electionResult.schemaId) : null;
  // For booth data, always use assembly year (selectedYear), not PC contribution year
  // If selectedYear is null (when viewing PC contribution), use the election result's year
  // Booth data is assembly-level, so it should match the assembly election year
  const boothDataYear = selectedYear ?? electionResult?.year ?? undefined;
  const boothDataEnabled = acEntity
    ? isBoothDataAvailable(electionResult?.schemaId ?? '', acEntity.pcId, boothDataYear)
    : false;

  // Load booth data when a Tamil Nadu AC is selected
  // Try to load even if boothDataEnabled is false - let the availability check happen in ElectionResultPanel
  useEffect(() => {
    if (electionResult?.schemaId?.startsWith('TN-')) {
      // When viewing PC contribution (selectedACPCYear), use that year for booth data
      // Otherwise use selectedYear or election result's year
      const yearToLoad = selectedACPCYear ?? selectedYear ?? electionResult?.year;
      if (yearToLoad) {
        void loadBoothData('TN', electionResult.schemaId, yearToLoad);
      }
    }
  }, [
    electionResult?.schemaId,
    electionResult?.year,
    loadBoothData,
    selectedYear,
    selectedACPCYear,
    acEntity,
    boothDataYear,
    boothDataEnabled,
  ]);

  // Load booth results when year changes
  // Try to load even if boothDataEnabled is false - let the availability check happen in ElectionResultPanel
  useEffect(() => {
    if (electionResult?.schemaId?.startsWith('TN-')) {
      // When viewing PC contribution (selectedACPCYear), use that year for booth data
      // Otherwise use selectedYear or election result's year
      const yearToLoad = selectedACPCYear ?? selectedYear ?? electionResult?.year;
      if (yearToLoad) {
        void loadBoothResults('TN', electionResult.schemaId, yearToLoad);
      }
    }
  }, [
    electionResult?.schemaId,
    electionResult?.year,
    selectedYear,
    loadBoothResults,
    selectedACPCYear,
    boothDataEnabled,
  ]);

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

  // Determine the level for styling
  const level = useMemo((): MapLevel => {
    if (currentPC ?? currentDistrict) return 'assemblies';
    if (currentView === 'assemblies') return 'assemblies';
    if (currentState) return currentView === 'constituencies' ? 'constituencies' : 'districts';
    return 'states';
  }, [currentState, currentView, currentPC, currentDistrict]);

  // Create unique key for GeoJSON to force re-render when data or selection changes
  // Include first feature name to ensure uniqueness when different PCs have same assembly count
  const geoJsonKey = useMemo((): string => {
    const dataHash = currentData?.features?.length ?? 0;
    const props = currentData?.features?.[0]?.properties as Record<string, unknown> | undefined;
    const firstFeatureName = (props?.['AC_NAME'] ?? props?.['PC_NAME'] ?? '') as string;
    return `${level}-${currentState ?? 'india'}-${currentPC ?? ''}-${currentDistrict ?? ''}-${selectedAssembly ?? ''}-${dataHash}-${firstFeatureName}`;
  }, [level, currentState, currentPC, currentDistrict, selectedAssembly, currentData]);

  // Get the data to display (primary layer - either states or current sub-region)
  const displayData = useMemo((): GeoJSONData | null => {
    if (currentPC ?? currentDistrict) return currentData;
    if (currentState) return currentData;
    return statesGeoJSON;
  }, [statesGeoJSON, currentData, currentState, currentPC, currentDistrict]);

  // Background states - shown dimmed when zoomed into a state for context
  const showBackgroundStates = Boolean(currentState) && statesGeoJSON;

  // Style for background states (semi-transparent, clickable)
  const backgroundStateStyle = useCallback(
    (): L.PathOptions => ({
      fillColor: '#f3f4f6',
      fillOpacity: 0.7,
      color: '#9ca3af',
      weight: 1,
      opacity: 0.8,
    }),
    []
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
        mouseover: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          l.setStyle({
            fillColor: '#818cf8',
            fillOpacity: 0.6,
            color: '#6366f1',
            weight: 2,
          });
        },
        mouseout: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          l.setStyle(backgroundStateStyle());
        },
        click: (e: LLeafletMouseEvent): void => {
          // Stop propagation to prevent other layers from receiving this click
          L.DomEvent.stopPropagation(e);
          // Navigate to clicked state
          onStateClick(stateName, feature as StateFeature);
        },
      });
    },
    [onStateClick, backgroundStateStyle]
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

  // Style for background PCs (light orange tint - same as districts for consistency)
  const backgroundPCStyle = useCallback(
    (): L.PathOptions => ({
      fillColor: '#fed7aa',
      fillOpacity: 0.6,
      color: '#fdba74',
      weight: 1,
      opacity: 0.8,
    }),
    []
  );

  // Click handler for background PCs
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

      typedLayer.on({
        mouseover: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          l.setStyle({
            fillColor: '#818cf8',
            fillOpacity: 0.7,
            color: '#6366f1',
            weight: 2,
          });
        },
        mouseout: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          l.setStyle(backgroundPCStyle());
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

  // Style for background districts (light orange tint)
  const backgroundDistrictStyle = useCallback(
    (): L.PathOptions => ({
      fillColor: '#fed7aa',
      fillOpacity: 0.6,
      color: '#fdba74',
      weight: 1,
      opacity: 0.8,
    }),
    []
  );

  // Click handler for background districts
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

      typedLayer.on({
        mouseover: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          l.setStyle({
            fillColor: '#fb923c',
            fillOpacity: 0.7,
            color: '#f97316',
            weight: 2,
          });
        },
        mouseout: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          l.setStyle(backgroundDistrictStyle());
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
      // Use ref to get latest value since this callback might be called after state updates
      const currentSelectedAssembly =
        selectedAssemblyRef.current ?? pendingSelectedAssembly.current;
      const isSelected =
        currentSelectedAssembly &&
        level === 'assemblies' &&
        name.toUpperCase() === currentSelectedAssembly.toUpperCase();

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

      // Event handlers
      typedLayer.on({
        mouseover: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          // Check if THIS assembly is the selected one (use refs for latest values)
          const activeAssembly = pendingSelectedAssembly.current ?? selectedAssemblyRef.current;
          const isThisSelected =
            activeAssembly &&
            level === 'assemblies' &&
            name.toUpperCase() === activeAssembly.toUpperCase();

          // Skip hover style effects on the selected assembly only
          if (isThisSelected) {
            return;
          }

          l.setStyle(getHoverStyle(level));
          l.bringToFront();
        },
        mouseout: (e: LLeafletMouseEvent): void => {
          // Check if THIS assembly is the selected one (use refs for latest values)
          const activeAssembly = pendingSelectedAssembly.current ?? selectedAssemblyRef.current;
          const isThisSelected =
            activeAssembly &&
            level === 'assemblies' &&
            name.toUpperCase() === activeAssembly.toUpperCase();

          // Skip mouseout style effects on the selected assembly
          if (isThisSelected) {
            return;
          }

          if (geoJsonRef.current) {
            geoJsonRef.current.resetStyle(e.target as Layer);

            // Re-apply style to selected assembly to fix shared border issue
            if (activeAssembly && level === 'assemblies') {
              geoJsonRef.current.eachLayer((lyr) => {
                const feat = (lyr as unknown as { feature?: GeoJSON.Feature }).feature;
                if (feat) {
                  const props = feat.properties as AssemblyProperties;
                  if (props.AC_NAME?.toUpperCase() === activeAssembly.toUpperCase()) {
                    const typedLayer = lyr as unknown as {
                      setStyle: (style: object) => void;
                      bringToFront: () => void;
                    };
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
            }
          }
        },
        click: (): void => {
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
        },
      });
    },
    [level, onStateClick, onDistrictClick, onConstituencyClick, onAssemblyClick]
  );

  // Reset style index when data changes
  useEffect(() => {
    styleIndex.current = 0;
  }, [geoJsonKey]);

  // Apply selected style when assembly is selected (tooltips are handled in onEachFeature)
  useEffect(() => {
    if (selectedAssembly && level === 'assemblies') {
      // Sync pending ref with actual state
      pendingSelectedAssembly.current = selectedAssembly;

      // Apply dark green border style and bring to front
      const applyStyle = (): void => {
        if (!geoJsonRef.current) return;

        geoJsonRef.current.eachLayer((layer) => {
          const feature = (layer as unknown as { feature?: GeoJSON.Feature }).feature;
          if (feature) {
            const props = feature.properties as AssemblyProperties;
            const typedLayer = layer as unknown as {
              setStyle: (style: object) => void;
              bringToFront: () => void;
            };

            if (props.AC_NAME?.toUpperCase() === selectedAssembly.toUpperCase()) {
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

      // Apply immediately and on next frame
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
  }, [selectedAssembly, level, geoJsonKey]);

  // Style function that highlights selected assembly with dark green border
  const style = useCallback(
    (feature?: GeoJSON.Feature) => {
      const idx = styleIndex.current++;
      const baseStyle = getFeatureStyle(idx, level) as object;

      // Highlight selected assembly with dark green border on all sides
      if (selectedAssembly && level === 'assemblies' && feature) {
        const props = feature.properties as AssemblyProperties;
        if (props.AC_NAME?.toUpperCase() === selectedAssembly.toUpperCase()) {
          return {
            ...baseStyle,
            weight: 4,
            color: '#065f46', // Dark green border
            fillOpacity: 0.75,
            opacity: 1,
          };
        }
      }

      return baseStyle;
    },
    [level, selectedAssembly]
  );

  const showViewToggle = Boolean(currentState && !currentPC && !currentDistrict);
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

  // Determine if any panel is open (for desktop sidebar layout)
  const hasPanelOpen = !!electionResult || !!pcElectionResult;

  return (
    <div className={`map-container ${hasPanelOpen ? 'panel-open' : ''}`}>
      {/* Top center toolbar */}
      <MapToolbar
        currentView={currentView}
        showViewToggle={showViewToggle}
        showBackButton={showBackButton}
        onReset={onReset}
        onSwitchView={onSwitchView}
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

        {/* Primary data layer - states, districts, PCs, or assemblies */}
        {displayData && (
          <>
            <GeoJSON
              key={geoJsonKey}
              ref={geoJsonRef as unknown as React.Ref<L.GeoJSON>}
              data={displayData as GeoJSON.FeatureCollection}
              style={style as L.StyleFunction}
              onEachFeature={onEachFeature as (feature: GeoJSON.Feature, layer: Layer) => void}
            />
            <FitBounds geojson={displayData} selectedFeatureName={selectedAssembly} />
          </>
        )}

        {/* Background states layer - uses backgroundPane for proper z-ordering */}
        {/* Shows all states OTHER than the current one (including in PC/district views) */}
        {showBackgroundStates && statesGeoJSON && (
          <GeoJSON
            key={`background-states-${currentState}`}
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
            style={() => ({
              ...backgroundStateStyle(),
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
            key={`background-pcs-${currentState}-${currentPC}-${selectedAssembly ?? 'none'}-${backgroundPCsData.features.length}`}
            data={backgroundPCsData as GeoJSON.FeatureCollection}
            style={() => ({
              ...backgroundPCStyle(),
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
            key={`background-districts-${currentState}-${currentDistrict}-${selectedAssembly ?? 'none'}-${backgroundDistrictsData.features.length}-${String((backgroundDistrictsData.features[0]?.properties as Record<string, unknown>)?.['district'] ?? '')}`}
            data={backgroundDistrictsData as GeoJSON.FeatureCollection}
            style={() => ({
              ...backgroundDistrictStyle(),
              interactive: true,
            })}
            pane="backgroundPane"
            onEachFeature={(feature: GeoJSON.Feature, layer: Layer) => {
              onBackgroundDistrictClick(feature as Feature, layer);
            }}
          />
        )}
      </MapContainer>

      {/* AC Election Result Panel - Show when AC is selected */}
      {electionResult && onCloseElectionPanel && (
        <Suspense fallback={<PanelSkeleton />}>
          <ElectionResultPanel
            result={electionResult}
            onClose={onCloseElectionPanel}
            shareUrl={shareUrl}
            stateName={currentState ?? undefined}
            availableYears={availableYears ?? []}
            selectedYear={selectedYear ?? undefined}
            onYearChange={onYearChange}
            parliamentContributions={parliamentContributions}
            availablePCYears={availablePCYears}
            selectedPCYear={selectedACPCYear}
            onPCYearChange={onACPCYearChange}
            pcContributionShareUrl={pcContributionShareUrl}
            boothResults={boothResults}
            boothsWithResults={boothsWithResults}
          />
        </Suspense>
      )}

      {/* PC Election Result Panel - Show when in PC view and no AC selected */}
      {pcElectionResult && !electionResult && onClosePCElectionPanel && (
        <Suspense fallback={<PanelSkeleton />}>
          <PCElectionResultPanel
            result={pcElectionResult}
            onClose={onClosePCElectionPanel}
            shareUrl={pcShareUrl}
            stateName={currentState ?? undefined}
            availableYears={pcAvailableYears ?? []}
            selectedYear={pcSelectedYear ?? undefined}
            onYearChange={onPCYearChange}
          />
        </Suspense>
      )}

      {/* Feedback Modal */}
      <FeedbackModal isOpen={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} />
    </div>
  );
}
