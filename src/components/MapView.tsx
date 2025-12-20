import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import { Home, ChevronLeft, Maximize2, Trash2, Building2, Map, Layers } from 'lucide-react';
import type {
  Layer,
  LeafletMouseEvent as LLeafletMouseEvent,
  LatLngBoundsExpression,
} from 'leaflet';
import { getFeatureStyle, getHoverStyle, normalizeName } from '../utils/helpers';
import { COLOR_PALETTES } from '../constants';
import { clearAllCache } from '../utils/db';
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
}

/** Layer option */
type LayerName = 'Streets' | 'Light' | 'Satellite' | 'Terrain';

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
}: MapToolbarProps): JSX.Element {
  const [activeLayer, setActiveLayer] = useState<LayerName>('Streets');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  const handleFullscreen = (): void => {
    const mapContainer = document.querySelector('.map-container');
    if (!document.fullscreenElement) {
      mapContainer?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
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
        <button className="toolbar-btn" onClick={onReset} title="Reset to India">
          <Home size={18} />
        </button>
        {showBackButton && (
          <button className="toolbar-btn" onClick={onGoBack} title="Go back">
            <ChevronLeft size={18} />
          </button>
        )}
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
        </div>
      )}

      {/* Right section - layer switcher */}
      <div className="toolbar-section toolbar-right">
        <div className="toolbar-dropdown">
          <button
            className="toolbar-btn toolbar-dropdown-btn"
            onClick={() => setLayerMenuOpen(!layerMenuOpen)}
            title="Change map style"
          >
            <Layers size={18} />
          </button>
          <div className={`toolbar-dropdown-menu ${layerMenuOpen ? 'visible' : ''}`}>
            {(['Streets', 'Light', 'Satellite', 'Terrain'] as LayerName[]).map((layer) => (
              <button
                key={layer}
                className={`toolbar-dropdown-item ${activeLayer === layer ? 'active' : ''}`}
                onClick={() => handleLayerChange(layer)}
              >
                {layer}
              </button>
            ))}
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
  bindTooltip: (content: string, options?: object) => FeatureLayer;
  on: (eventMap: Record<string, (e: LLeafletMouseEvent) => void>) => void;
}

/** Leaflet GeoJSON ref type */
type GeoJSONRef = L.GeoJSON | null;

/** Layer URLs */
const LAYER_URLS: Record<string, { url: string; maxZoom: number; subdomains?: string }> = {
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
    subdomains: 'abc',
  },
};

/**
 * Map controls component (Leaflet-based)
 * Handles coordinates display, legend, and layer switching
 */
function MapControls(): null {
  const map = useMap();
  const baseLayerRef = useRef<L.TileLayer | null>(null);

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
      const layerConfig = LAYER_URLS[layerName] ?? LAYER_URLS['Streets']!;

      // Remove current base layer
      if (baseLayerRef.current) {
        map.removeLayer(baseLayerRef.current);
      }

      // Create and add new base layer
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

  // Coordinates display (bottom right)
  useEffect(() => {
    const CoordsControl = L.Control.extend({
      options: { position: 'bottomright' as const },
      onAdd: function (): HTMLElement {
        const container = L.DomUtil.create('div', 'coordinates-display');
        container.id = 'coordsDisplay';
        container.innerHTML = 'Lat: <span>--</span> | Lng: <span>--</span>';
        return container;
      },
    });

    const coordsControl = new CoordsControl();
    map.addControl(coordsControl);

    const updateCoords = (e: LLeafletMouseEvent): void => {
      const el = document.getElementById('coordsDisplay');
      if (el) {
        el.innerHTML = `Lat: <span>${e.latlng.lat.toFixed(4)}</span> | Lng: <span>${e.latlng.lng.toFixed(4)}</span>`;
      }
    };

    map.on('mousemove', updateCoords);

    return (): void => {
      map.off('mousemove', updateCoords);
      map.removeControl(coordsControl);
    };
  }, [map]);

  // Legend control (bottom right)
  useEffect(() => {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' as const },
      onAdd: function (): HTMLElement {
        const container = L.DomUtil.create('div', 'map-legend');
        container.id = 'mapLegend';
        container.innerHTML =
          '<h4 style="color: #f59e0b;">States View</h4><div class="legend-content"><div style="font-weight: 500; color: #1f2937;">India</div></div>';
        return container;
      },
    });

    const legendControl = new LegendControl();
    map.addControl(legendControl);

    return (): void => {
      map.removeControl(legendControl);
    };
  }, [map]);

  return null;
}

/**
 * Update the legend element with current map level info
 */
function updateLegend(level: MapLevel, name: string, count: number): void {
  // Retry to find legend element (may not exist immediately)
  const tryUpdate = (): void => {
    const legend = document.getElementById('mapLegend');
    if (!legend) {
      setTimeout(tryUpdate, 100);
      return;
    }

    // Consistent colors matching sidebar/search
    const levelLabels: Record<MapLevel, { label: string; color: string }> = {
      states: { label: 'States View', color: '#f59e0b' },
      districts: { label: 'Districts View', color: '#f59e0b' },
      constituencies: { label: 'Parliament View', color: '#8b5cf6' },
      assemblies: { label: 'Assembly View', color: '#10b981' },
    };

    const { label, color } = levelLabels[level] ?? { label: 'Map', color: '#f59e0b' };
    const colors: HexColor[] = COLOR_PALETTES[level] ?? COLOR_PALETTES.states;
    const sampleColors = colors.slice(0, 5);

    // Context-aware count label
    const countLabels: Record<MapLevel, string> = {
      states: 'States & UTs',
      districts: 'Districts',
      constituencies: 'Parliamentary Constituencies',
      assemblies: 'Assembly Constituencies',
    };
    const countLabel = countLabels[level] ?? 'regions';

    legend.innerHTML = `
      <h4 style="color: ${color}; margin: 0 0 4px 0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px;">${label}</h4>
      <div class="legend-content">
        <div style="font-weight: 600; color: #1f2937; font-size: 0.85rem;">${name}</div>
        ${count ? `<div style="font-size: 0.7rem; color: #6b7280; margin: 2px 0 4px;">${count} ${countLabel}</div>` : '<div style="margin-bottom: 4px;"></div>'}
        <div id="legendHover" style="font-size: 0.75rem; color: #374151; min-height: 18px; padding: 2px 0; font-weight: 500; border-top: 1px solid #e5e7eb; margin-top: 4px;"></div>
        <div style="display: flex; gap: 2px; margin-top: 4px;">
          ${sampleColors.map((c) => `<div style="background: ${c}; width: 14px; height: 14px; border-radius: 2px;"></div>`).join('')}
        </div>
      </div>
    `;
  };

  tryUpdate();
}

/**
 * Update the legend hover text when hovering over a feature
 */
function updateLegendHover(name: string): void {
  const hoverEl = document.getElementById('legendHover');
  if (hoverEl) {
    hoverEl.textContent = name;
  }
}

/**
 * Clear the legend hover text
 */
function clearLegendHover(): void {
  const hoverEl = document.getElementById('legendHover');
  if (hoverEl) {
    hoverEl.textContent = '';
  }
}

/**
 * Component to fit map bounds to GeoJSON data
 */
function FitBounds({ geojson }: FitBoundsProps): null {
  const map = useMap();

  useEffect(() => {
    if (geojson?.features?.length) {
      try {
        const layer = L.geoJSON(geojson as GeoJSON.FeatureCollection);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds as LatLngBoundsExpression, { padding: [30, 30], duration: 0.5 });
        }
      } catch (e) {
        console.warn('Failed to fit bounds:', e);
      }
    }
  }, [map, geojson]);

  return null;
}

/**
 * Main map component
 * Renders the Leaflet map with GeoJSON layers
 */
export function MapView({
  statesGeoJSON,
  currentData,
  currentState,
  currentView,
  currentPC,
  currentDistrict,
  onStateClick,
  onDistrictClick,
  onConstituencyClick,
  onAssemblyClick,
  onSwitchView,
  onReset,
  onGoBack,
}: MapViewProps): JSX.Element {
  const geoJsonRef = useRef<GeoJSONRef>(null);

  // Determine the level for styling
  const level = useMemo((): MapLevel => {
    if (currentPC ?? currentDistrict) return 'assemblies';
    if (currentState) return currentView === 'constituencies' ? 'constituencies' : 'districts';
    return 'states';
  }, [currentState, currentView, currentPC, currentDistrict]);

  // Create unique key for GeoJSON to force re-render
  const geoJsonKey = useMemo((): string => {
    const dataHash = currentData?.features?.length ?? 0;
    return `${level}-${currentState ?? 'india'}-${currentPC ?? ''}-${currentDistrict ?? ''}-${dataHash}`;
  }, [level, currentState, currentPC, currentDistrict, currentData]);

  // Get the data to display
  const displayData = useMemo((): GeoJSONData | null => {
    if (currentPC ?? currentDistrict) return currentData;
    if (currentState) return currentData;
    return statesGeoJSON;
  }, [statesGeoJSON, currentData, currentState, currentPC, currentDistrict]);

  // Update legend when view changes
  useEffect(() => {
    const name =
      currentPC ?? currentDistrict ?? (currentState ? normalizeName(currentState) : 'India');
    const count = displayData?.features?.length ?? 0;

    // Update immediately and also after a short delay to ensure DOM is ready
    updateLegend(level, name, count);
    const timer = setTimeout(() => updateLegend(level, name, count), 200);

    return () => clearTimeout(timer);
  }, [level, currentState, currentView, currentPC, currentDistrict, displayData]);

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

      // Bind tooltip
      typedLayer.bindTooltip(name, {
        permanent: false,
        direction: 'center',
        sticky: false,
      });

      // Event handlers
      typedLayer.on({
        mouseover: (e: LLeafletMouseEvent): void => {
          const l = e.target as FeatureLayer;
          l.setStyle(getHoverStyle(level));
          l.bringToFront();
          updateLegendHover(name);
        },
        mouseout: (e: LLeafletMouseEvent): void => {
          if (geoJsonRef.current) {
            geoJsonRef.current.resetStyle(e.target as Layer);
          }
          clearLegendHover();
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

  const style = useCallback(() => {
    const idx = styleIndex.current++;
    return getFeatureStyle(idx, level) as object;
  }, [level]);

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

  return (
    <div className="map-container">
      {/* Top center toolbar */}
      <MapToolbar
        currentView={currentView}
        showViewToggle={showViewToggle}
        showBackButton={showBackButton}
        onReset={onReset}
        onSwitchView={onSwitchView}
        onGoBack={onGoBack}
      />

      <MapContainer
        center={[22, 82]}
        zoom={5}
        minZoom={4}
        maxZoom={18}
        zoomControl={true}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
          subdomains="abcd"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />

        <ScaleControl position="bottomleft" imperial={false} />

        <MapControls />

        {displayData && (
          <>
            <GeoJSON
              key={geoJsonKey}
              ref={geoJsonRef as unknown as React.Ref<L.GeoJSON>}
              data={displayData as GeoJSON.FeatureCollection}
              style={style}
              onEachFeature={onEachFeature as (feature: GeoJSON.Feature, layer: Layer) => void}
            />
            <FitBounds geojson={displayData} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
