/// <reference types="vite/client" />

declare module '*.geojson' {
  const value: import('./types').GeoJSONData;
  export default value;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  /** Set to `1` during assembly counting night so assembly JSON is cache-busted and hooks skip static caches */
  readonly VITE_ASSEMBLY_LIVE_REFRESH?: string;
  /** Optional client poll interval (ms) when using live refresh helpers (default 45000, min 5000) */
  readonly VITE_ASSEMBLY_POLL_INTERVAL_MS?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
