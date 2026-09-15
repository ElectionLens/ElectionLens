/** Shared basemap layer config used by MapToolbar, MapControls, and MapView's TileLayer. */

/** Layer option */
export type LayerName = 'Streets' | 'Light' | 'Satellite' | 'Terrain' | 'Vector';

/** Layer URLs - 'Vector' is handled separately by VectorTileLayer */
export const LAYER_URLS: Record<
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
