import { useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Layer, LeafletMouseEvent as LLeafletMouseEvent, LatLngBoundsExpression } from 'leaflet';
import { getFeatureStyle, getHoverStyle, normalizeStateName } from '../utils/helpers';
import { COLOR_PALETTES } from '../constants';
import { clearAllCache } from '../utils/db';
import type {
  MapViewProps,
  MapControlsProps,
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
  HexColor
} from '../types';

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

/**
 * Map controls component
 * Adds home button, clear cache button (dev mode), view toggle, coordinates, legend, and layer switcher
 */
function MapControls({ 
  currentState, 
  currentView, 
  onReset, 
  onSwitchView,
  showViewToggle 
}: MapControlsProps): null {
  const map = useMap();
  
  // Home button control
  useEffect(() => {
    const HomeControl = L.Control.extend({
      options: { position: 'topleft' as const },
      onAdd: function(): HTMLElement {
        const container = L.DomUtil.create('div', 'reset-control-container');
        
        const btn = L.DomUtil.create('button', 'reset-control', container);
        btn.innerHTML = '🏠';
        btn.title = 'Reset to full India map';
        btn.onclick = (e: MouseEvent): void => {
          L.DomEvent.stopPropagation(e);
          onReset();
        };
        
        // Dev mode: clear cache button
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          const clearBtn = L.DomUtil.create('button', 'reset-control', container);
          clearBtn.innerHTML = '🗑️';
          clearBtn.title = 'Clear cached map data';
          clearBtn.onclick = async (e: MouseEvent): Promise<void> => {
            L.DomEvent.stopPropagation(e);
            await clearAllCache();
          };
        }
        
        return container;
      }
    });
    
    const homeControl = new HomeControl();
    map.addControl(homeControl);
    
    return (): void => {
      map.removeControl(homeControl);
    };
  }, [map, onReset]);
  
  // View toggle control
  useEffect(() => {
    if (!showViewToggle) return;
    
    const ViewToggleControl = L.Control.extend({
      options: { position: 'topleft' as const },
      onAdd: function(): HTMLElement {
        const container = L.DomUtil.create('div', 'map-view-toggle visible');
        container.id = 'mapViewToggle';
        
        const pcBtn = L.DomUtil.create('button', `map-toggle-btn ${currentView === 'constituencies' ? 'active' : ''}`, container);
        pcBtn.innerHTML = '🗳️ Constituencies';
        pcBtn.onclick = (e: MouseEvent): void => {
          L.DomEvent.stopPropagation(e);
          onSwitchView('constituencies');
        };
        
        const distBtn = L.DomUtil.create('button', `map-toggle-btn ${currentView === 'districts' ? 'active' : ''}`, container);
        distBtn.innerHTML = '🗺️ Districts';
        distBtn.onclick = (e: MouseEvent): void => {
          L.DomEvent.stopPropagation(e);
          onSwitchView('districts');
        };
        
        L.DomEvent.disableClickPropagation(container);
        
        return container;
      }
    });
    
    const viewToggle = new ViewToggleControl();
    map.addControl(viewToggle);
    
    return (): void => {
      map.removeControl(viewToggle);
    };
  }, [map, currentState, currentView, showViewToggle, onSwitchView]);
  
  // Coordinates display
  useEffect(() => {
    const CoordsControl = L.Control.extend({
      options: { position: 'bottomright' as const },
      onAdd: function(): HTMLElement {
        const container = L.DomUtil.create('div', 'coordinates-display');
        container.id = 'coordsDisplay';
        container.innerHTML = 'Lat: <span>--</span> | Lng: <span>--</span>';
        return container;
      }
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
  
  // Legend control
  useEffect(() => {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' as const },
      onAdd: function(): HTMLElement {
        const container = L.DomUtil.create('div', 'map-legend');
        container.id = 'mapLegend';
        container.innerHTML = '<h4>Viewing</h4><div class="legend-content">India - States</div>';
        return container;
      }
    });
    
    const legendControl = new LegendControl();
    map.addControl(legendControl);
    
    return (): void => {
      map.removeControl(legendControl);
    };
  }, [map]);
  
  // Layer switcher
  useEffect(() => {
    const baseLayers: Record<string, L.TileLayer> = {
      'Streets': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }),
      'Light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }),
      'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      }),
      'Terrain': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17
      })
    };
    
    let currentBaseLayer: L.TileLayer | null = null;
    
    const LayerControl = L.Control.extend({
      options: { position: 'topright' as const },
      onAdd: function(): HTMLElement {
        const container = L.DomUtil.create('div', 'layer-switcher');
        
        Object.keys(baseLayers).forEach((name, idx) => {
          const btn = L.DomUtil.create('button', 'layer-btn' + (idx === 0 ? ' active' : ''), container);
          btn.textContent = name;
          btn.onclick = (e: MouseEvent): void => {
            L.DomEvent.stopPropagation(e);
            if (currentBaseLayer) {
              map.removeLayer(currentBaseLayer);
            }
            currentBaseLayer = baseLayers[name]!;
            currentBaseLayer.addTo(map);
            currentBaseLayer.bringToBack();
            container.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          };
        });
        
        L.DomEvent.disableClickPropagation(container);
        return container;
      }
    });
    
    const layerControl = new LayerControl();
    map.addControl(layerControl);
    
    return (): void => {
      map.removeControl(layerControl);
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
    'states': '🇮🇳 States & UTs',
    'districts': '🗺️ Districts',
    'constituencies': '🗳️ Parliamentary',
    'assemblies': '🏛️ Assembly'
  };
  
  const colors: HexColor[] = COLOR_PALETTES[level] ?? COLOR_PALETTES.states;
  const sampleColors = colors.slice(0, 4);
  
  legend.innerHTML = `
    <h4>${levelNames[level] ?? 'Map'}</h4>
    <div class="legend-content">
      <div style="font-weight: 500; margin-bottom: 6px; color: #1f2937;">${name}</div>
      ${count ? `<div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 8px;">${count} regions</div>` : ''}
      <div style="display: flex; gap: 3px;">
        ${sampleColors.map(c => `<div class="legend-color" style="background: ${c}; width: 12px; height: 12px;"></div>`).join('')}
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
  onReset
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
    const name = currentPC ?? currentDistrict ?? (currentState ? normalizeStateName(currentState) : 'India');
    const count = displayData?.features?.length ?? 0;
    updateLegend(level, name, count);
  }, [level, currentState, currentPC, currentDistrict, displayData]);
  
  // Style function with index tracking
  const styleIndex = useRef<number>(0);
  
  const onEachFeature = useCallback((feature: Feature, layer: Layer): void => {
    const typedLayer = layer as unknown as FeatureLayer;
    
    // Get feature name based on level
    let name: string;
    
    if (level === 'states') {
      const props = feature.properties as StateProperties;
      name = normalizeStateName(props.shapeName ?? props.ST_NM ?? '');
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
      sticky: false
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
      }
    });
  }, [level, onStateClick, onDistrictClick, onConstituencyClick, onAssemblyClick]);
  
  // Reset style index when data changes
  useEffect(() => {
    styleIndex.current = 0;
  }, [geoJsonKey]);
  
  const style = useCallback(() => {
    const idx = styleIndex.current++;
    return getFeatureStyle(idx, level) as object;
  }, [level]);
  
  const showViewToggle = Boolean(currentState && !currentPC && !currentDistrict);
  
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
        
        <MapControls
          currentState={currentState}
          currentView={currentView}
          onReset={onReset}
          onSwitchView={onSwitchView}
          showViewToggle={showViewToggle}
        />
        
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

