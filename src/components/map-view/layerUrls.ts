/** Shared basemap layer config used by MapToolbar, MapControls, and MapView's TileLayer. */

/** Layer option */
export type LayerName = 'Streets' | 'Light' | 'Satellite' | 'Terrain' | 'Vector';

/** Layer URLs - 'Vector' is handled separately by VectorTileLayer */
export const LAYER_URLS: Record<
  string,
  { url: string; maxZoom: number; subdomains?: string; isVector?: boolean; attribution?: string }
> = {
  Streets: {
    // CARTO's public raster endpoint now returns an API-key watermark.
    // OpenStreetMap is keyless and keeps the default map usable offline after
    // tiles have been cached by the browser.
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    subdomains: 'abc',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  Light: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
  },
  Satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: '&copy; Esri',
  },
  Terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    subdomains: 'abc',
    attribution: '&copy; OpenTopoMap contributors',
  },
  Vector: {
    url: '', // Handled by VectorTileLayer component
    maxZoom: 19,
    isVector: true,
    subdomains: 'abc',
  },
};
