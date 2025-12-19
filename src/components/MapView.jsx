import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getFeatureStyle, getHoverStyle, normalizeStateName, getFeatureColor } from '../utils/helpers';
import { COLOR_PALETTES } from '../constants';
import { clearAllCache } from '../utils/db';

// Map controls component
function MapControls({ 
  currentState, 
  currentView, 
  onReset, 
  onSwitchView,
  showViewToggle 
}) {
  const map = useMap();
  
  useEffect(() => {
    // Home button control
    const HomeControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'reset-control-container');
        
        const btn = L.DomUtil.create('button', 'reset-control', container);
        btn.innerHTML = '🏠';
        btn.title = 'Reset to full India map';
        btn.onclick = (e) => {
          L.DomEvent.stopPropagation(e);
          onReset();
        };
        
        // Dev mode: clear cache button
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          const clearBtn = L.DomUtil.create('button', 'reset-control', container);
          clearBtn.innerHTML = '🗑️';
          clearBtn.title = 'Clear cached map data';
          clearBtn.onclick = async (e) => {
            L.DomEvent.stopPropagation(e);
            await clearAllCache();
          };
        }
        
        return container;
      }
    });
    
    const homeControl = new HomeControl();
    map.addControl(homeControl);
    
    return () => {
      map.removeControl(homeControl);
    };
  }, [map, onReset]);
  
  // View toggle control
  useEffect(() => {
    if (!showViewToggle) return;
    
    const ViewToggleControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'map-view-toggle visible');
        container.id = 'mapViewToggle';
        
        const pcBtn = L.DomUtil.create('button', `map-toggle-btn ${currentView === 'constituencies' ? 'active' : ''}`, container);
        pcBtn.innerHTML = '🗳️ Constituencies';
        pcBtn.onclick = (e) => {
          L.DomEvent.stopPropagation(e);
          onSwitchView('constituencies');
        };
        
        const distBtn = L.DomUtil.create('button', `map-toggle-btn ${currentView === 'districts' ? 'active' : ''}`, container);
        distBtn.innerHTML = '🗺️ Districts';
        distBtn.onclick = (e) => {
          L.DomEvent.stopPropagation(e);
          onSwitchView('districts');
        };
        
        L.DomEvent.disableClickPropagation(container);
        
        return container;
      }
    });
    
    const viewToggle = new ViewToggleControl();
    map.addControl(viewToggle);
    
    return () => {
      map.removeControl(viewToggle);
    };
  }, [map, currentState, currentView, showViewToggle, onSwitchView]);
  
  // Coordinates display
  useEffect(() => {
    const CoordsControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'coordinates-display');
        container.id = 'coordsDisplay';
        container.innerHTML = 'Lat: <span>--</span> | Lng: <span>--</span>';
        return container;
      }
    });
    
    const coordsControl = new CoordsControl();
    map.addControl(coordsControl);
    
    const updateCoords = (e) => {
      const el = document.getElementById('coordsDisplay');
      if (el) {
        el.innerHTML = `Lat: <span>${e.latlng.lat.toFixed(4)}</span> | Lng: <span>${e.latlng.lng.toFixed(4)}</span>`;
      }
    };
    
    map.on('mousemove', updateCoords);
    
    return () => {
      map.off('mousemove', updateCoords);
      map.removeControl(coordsControl);
    };
  }, [map]);
  
  // Legend control
  useEffect(() => {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'map-legend');
        container.id = 'mapLegend';
        container.innerHTML = '<h4>Viewing</h4><div class="legend-content">India - States</div>';
        return container;
      }
    });
    
    const legendControl = new LegendControl();
    map.addControl(legendControl);
    
    return () => {
      map.removeControl(legendControl);
    };
  }, [map]);
  
  // Layer switcher
  useEffect(() => {
    const baseLayers = {
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
    
    let currentBaseLayer = null;
    
    const LayerControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'layer-switcher');
        
        Object.keys(baseLayers).forEach((name, idx) => {
          const btn = L.DomUtil.create('button', 'layer-btn' + (idx === 0 ? ' active' : ''), container);
          btn.textContent = name;
          btn.onclick = (e) => {
            L.DomEvent.stopPropagation(e);
            if (currentBaseLayer) {
              map.removeLayer(currentBaseLayer);
            }
            currentBaseLayer = baseLayers[name];
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
    
    return () => {
      map.removeControl(layerControl);
    };
  }, [map]);
  
  return null;
}

// Update legend helper
function updateLegend(level, name, count) {
  const legend = document.getElementById('mapLegend');
  if (!legend) return;
  
  const levelNames = {
    'states': '🇮🇳 States & UTs',
    'districts': '🗺️ Districts',
    'constituencies': '🗳️ Parliamentary',
    'assemblies': '🏛️ Assembly'
  };
  
  const colors = COLOR_PALETTES[level] || COLOR_PALETTES.states;
  const sampleColors = colors.slice(0, 4);
  
  legend.innerHTML = `
    <h4>${levelNames[level] || 'Map'}</h4>
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

// Fit bounds component
function FitBounds({ geojson }) {
  const map = useMap();
  
  useEffect(() => {
    if (geojson?.features?.length) {
      try {
        const layer = L.geoJSON(geojson);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [30, 30], duration: 0.5 });
        }
      } catch (e) {
        console.warn('Failed to fit bounds:', e);
      }
    }
  }, [map, geojson]);
  
  return null;
}

// Main map component
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
}) {
  const geoJsonRef = useRef(null);
  
  // Determine the level for styling
  const level = useMemo(() => {
    if (currentPC || currentDistrict) return 'assemblies';
    if (currentState) return currentView === 'constituencies' ? 'constituencies' : 'districts';
    return 'states';
  }, [currentState, currentView, currentPC, currentDistrict]);
  
  // Create unique key for GeoJSON to force re-render
  const geoJsonKey = useMemo(() => {
    const dataHash = currentData?.features?.length || 0;
    return `${level}-${currentState || 'india'}-${currentPC || ''}-${currentDistrict || ''}-${dataHash}`;
  }, [level, currentState, currentPC, currentDistrict, currentData]);
  
  // Get the data to display
  const displayData = useMemo(() => {
    if (currentPC || currentDistrict) return currentData;
    if (currentState) return currentData;
    return statesGeoJSON;
  }, [statesGeoJSON, currentData, currentState, currentPC, currentDistrict]);
  
  // Update legend when view changes
  useEffect(() => {
    const name = currentPC || currentDistrict || (currentState ? normalizeStateName(currentState) : 'India');
    const count = displayData?.features?.length || 0;
    updateLegend(level, name, count);
  }, [level, currentState, currentPC, currentDistrict, displayData]);
  
  // Style function with index tracking
  const styleIndex = useRef(0);
  
  const onEachFeature = useCallback((feature, layer) => {
    // Get feature name based on level
    let name, number;
    if (level === 'states') {
      name = normalizeStateName(feature.properties.shapeName || feature.properties.ST_NM);
    } else if (level === 'districts') {
      name = feature.properties.district || feature.properties.NAME || feature.properties.DISTRICT || 'Unknown';
    } else if (level === 'constituencies') {
      name = feature.properties.ls_seat_name || feature.properties.PC_NAME || 'Unknown';
      number = feature.properties.ls_seat_code || feature.properties.PC_No;
    } else {
      name = feature.properties.AC_NAME || 'Unknown';
      number = feature.properties.AC_NO;
    }
    
    // Bind tooltip
    layer.bindTooltip(name, {
      permanent: false,
      direction: 'center',
      sticky: false
    });
    
    // Event handlers
    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle(getHoverStyle(level));
        l.bringToFront();
      },
      mouseout: (e) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.resetStyle(e.target);
        }
      },
      click: () => {
        const originalName = feature.properties.shapeName || feature.properties.ST_NM || name;
        if (level === 'states') {
          onStateClick(originalName, feature);
        } else if (level === 'districts') {
          onDistrictClick(name, feature);
        } else if (level === 'constituencies') {
          onConstituencyClick(name, feature);
        } else if (onAssemblyClick) {
          onAssemblyClick(name, feature);
        }
      }
    });
  }, [level, onStateClick, onDistrictClick, onConstituencyClick, onAssemblyClick]);
  
  // Reset style index when data changes
  useEffect(() => {
    styleIndex.current = 0;
  }, [geoJsonKey]);
  
  const style = useCallback((feature) => {
    const idx = styleIndex.current++;
    return getFeatureStyle(idx, level);
  }, [level]);
  
  const showViewToggle = currentState && !currentPC && !currentDistrict;
  
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
              ref={geoJsonRef}
              data={displayData}
              style={style}
              onEachFeature={onEachFeature}
            />
            <FitBounds geojson={displayData} />
          </>
        )}
      </MapContainer>
    </div>
  );
}

