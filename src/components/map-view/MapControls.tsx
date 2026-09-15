import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { COLOR_PALETTES } from '../../constants';
import type { MapLevel, HexColor } from '../../types';
import { LAYER_URLS } from './layerUrls';

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
export function MapControls({ level, name, count }: MapControlsProps): null {
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
