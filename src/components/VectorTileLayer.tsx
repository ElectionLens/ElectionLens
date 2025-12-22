/**
 * Vector Tile Layer using Protomaps
 *
 * Benefits over raster tiles:
 * - 10x smaller file size (~160MB vs 1.6GB for India)
 * - Crisp at any zoom level
 * - Dynamic styling (can change colors without re-downloading)
 * - Better offline support
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import {
  leafletLayer,
  PolygonSymbolizer,
  LineSymbolizer,
  TextSymbolizer,
  type PaintRule,
  type LabelRule,
} from 'protomaps-leaflet';
import type L from 'leaflet';

// Light theme optimized for election data overlay
const LIGHT_PAINT_RULES: PaintRule[] = [
  {
    dataLayer: 'water',
    symbolizer: new PolygonSymbolizer({ fill: '#d4e6f1' }),
  },
  {
    dataLayer: 'earth',
    symbolizer: new PolygonSymbolizer({ fill: '#f8f9fa' }),
  },
  {
    dataLayer: 'landuse',
    symbolizer: new PolygonSymbolizer({ fill: '#e8f5e9' }),
  },
  {
    dataLayer: 'natural',
    symbolizer: new PolygonSymbolizer({ fill: '#e8f5e9' }),
  },
  {
    dataLayer: 'roads',
    symbolizer: new LineSymbolizer({ color: '#e0e0e0', width: 1 }),
    minzoom: 8,
  },
  {
    dataLayer: 'boundaries',
    symbolizer: new LineSymbolizer({
      color: '#9e9e9e',
      width: 1,
      dash: [4, 2],
    }),
  },
];

const LIGHT_LABEL_RULES: LabelRule[] = [
  {
    dataLayer: 'places',
    symbolizer: new TextSymbolizer({
      fill: '#424242',
      font: '12px sans-serif',
    }),
    minzoom: 6,
  },
];

// Dark theme for potential dark mode
const DARK_PAINT_RULES: PaintRule[] = [
  {
    dataLayer: 'water',
    symbolizer: new PolygonSymbolizer({ fill: '#1a237e' }),
  },
  {
    dataLayer: 'earth',
    symbolizer: new PolygonSymbolizer({ fill: '#1e1e2e' }),
  },
  {
    dataLayer: 'landuse',
    symbolizer: new PolygonSymbolizer({ fill: '#2d2d44' }),
  },
  {
    dataLayer: 'natural',
    symbolizer: new PolygonSymbolizer({ fill: '#2d2d44' }),
  },
  {
    dataLayer: 'roads',
    symbolizer: new LineSymbolizer({ color: '#3d3d5c', width: 1 }),
    minzoom: 8,
  },
  {
    dataLayer: 'boundaries',
    symbolizer: new LineSymbolizer({
      color: '#5c5c7a',
      width: 1,
      dash: [4, 2],
    }),
  },
];

const DARK_LABEL_RULES: LabelRule[] = [
  {
    dataLayer: 'places',
    symbolizer: new TextSymbolizer({
      fill: '#b0b0b0',
      font: '12px sans-serif',
    }),
    minzoom: 6,
  },
];

// Minimal theme - just boundaries for election focus (no labels)
const MINIMAL_PAINT_RULES: PaintRule[] = [
  {
    dataLayer: 'water',
    symbolizer: new PolygonSymbolizer({ fill: '#e3f2fd' }),
  },
  {
    dataLayer: 'earth',
    symbolizer: new PolygonSymbolizer({ fill: '#fafafa' }),
  },
  {
    dataLayer: 'boundaries',
    symbolizer: new LineSymbolizer({
      color: '#bdbdbd',
      width: 0.5,
    }),
    minzoom: 4,
  },
];

const MINIMAL_LABEL_RULES: LabelRule[] = [];

export type VectorTheme = 'light' | 'dark' | 'minimal';

interface VectorTileLayerProps {
  theme?: VectorTheme;
  url?: string;
}

interface ThemeRules {
  paint: PaintRule[];
  label: LabelRule[];
}

const THEMES: Record<VectorTheme, ThemeRules> = {
  light: { paint: LIGHT_PAINT_RULES, label: LIGHT_LABEL_RULES },
  dark: { paint: DARK_PAINT_RULES, label: DARK_LABEL_RULES },
  minimal: { paint: MINIMAL_PAINT_RULES, label: MINIMAL_LABEL_RULES },
};

/**
 * Vector tile layer component for Leaflet
 * Uses Protomaps for efficient vector tile rendering
 */
export function VectorTileLayer({
  theme = 'minimal',
  url = 'https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=1003762824b9687f',
}: VectorTileLayerProps): null {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // Remove existing layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    const themeRules = THEMES[theme];

    // Create new vector tile layer
    const layer = leafletLayer({
      url,
      paintRules: themeRules.paint,
      labelRules: themeRules.label,
      maxDataZoom: 15,
      maxZoom: 19,
    });

    // Cast to L.Layer for TypeScript compatibility
    const leafletLayerInstance = layer as unknown as L.Layer;
    leafletLayerInstance.addTo(map);
    layerRef.current = leafletLayerInstance;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map, theme, url]);

  return null;
}

/**
 * Hook to preload vector tiles for a bounding box
 * Useful for offline caching
 */
export function usePreloadTiles(): {
  preloadIndiaTiles: (maxZoom?: number) => string[];
} {
  // India bounding box: [6, 68, 36, 98] (south, west, north, east)
  const preloadIndiaTiles = (maxZoom = 8): string[] => {
    const bounds = {
      south: 6,
      west: 68,
      north: 36,
      east: 98,
    };

    const tiles: string[] = [];

    for (let z = 4; z <= maxZoom; z++) {
      const minX = Math.floor(((bounds.west + 180) / 360) * Math.pow(2, z));
      const maxX = Math.floor(((bounds.east + 180) / 360) * Math.pow(2, z));
      const minY = Math.floor(
        ((1 -
          Math.log(
            Math.tan((bounds.north * Math.PI) / 180) + 1 / Math.cos((bounds.north * Math.PI) / 180)
          ) /
            Math.PI) /
          2) *
          Math.pow(2, z)
      );
      const maxY = Math.floor(
        ((1 -
          Math.log(
            Math.tan((bounds.south * Math.PI) / 180) + 1 / Math.cos((bounds.south * Math.PI) / 180)
          ) /
            Math.PI) /
          2) *
          Math.pow(2, z)
      );

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tiles.push(`${z}/${x}/${y}`);
        }
      }
    }

    return tiles;
  };

  return { preloadIndiaTiles };
}
