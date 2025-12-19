import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
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
          🏠
        </button>
        {showBackButton && (
          <button className="toolbar-btn" onClick={onGoBack} title="Go back">
            ←
          </button>
        )}
        <button className="toolbar-btn" onClick={handleFullscreen} title="Toggle fullscreen">
          ⛶
        </button>
        {isDev && (
          <button className="toolbar-btn" onClick={handleClearCache} title="Clear cache">
            🗑️
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
            🗳️ PC
          </button>
          <button
            className={`toolbar-btn toolbar-toggle ${currentView === 'districts' ? 'active' : ''}`}
            onClick={() => onSwitchView('districts')}
            title="Districts"
          >
            🗺️ Dist
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
            🗺️
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
        container.innerHTML = '<h4>Viewing</h4><div class="legend-content">India - States</div>';
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
  const legend = document.getElementById('mapLegend');
  if (!legend) return;

  const levelNames: Record<MapLevel, string> = {
    states: '🇮🇳 States & UTs',
    districts: '🗺️ Districts',
    constituencies: '🗳️ Parliamentary',
    assemblies: '🏛️ Assembly',
  };

  const colors: HexColor[] = COLOR_PALETTES[level] ?? COLOR_PALETTES.states;
  const sampleColors = colors.slice(0, 4);

  legend.innerHTML = `
    <h4>${levelNames[level] ?? 'Map'}</h4>
    <div class="legend-content">
      <div style="font-weight: 500; margin-bottom: 6px; color: #1f2937;">${name}</div>
      ${count ? `<div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 8px;">${count} regions</div>` : ''}
      <div style="display: flex; gap: 3px;">
        ${sampleColors.map((c) => `<div class="legend-color" style="background: ${c}; width: 12px; height: 12px;"></div>`).join('')}
        <span style="font-size: 0.65rem; color: #9ca3af; margin-left: 4px;">+ more</span>
      </div>
    </div>
  `;
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
    updateLegend(level, name, count);
  }, [level, currentState, currentPC, currentDistrict, displayData]);

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
        },
        mouseout: (e: LLeafletMouseEvent): void => {
          if (geoJsonRef.current) {
            geoJsonRef.current.resetStyle(e.target as Layer);
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
