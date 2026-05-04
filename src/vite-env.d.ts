/// <reference types="vite/client" />

declare module '*.geojson' {
  const value: import('./types').GeoJSONData;
  export default value;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  /** Set to `1` during assembly counting night so JSON is refetched (~1 min buckets), no in-memory results cache */
  readonly VITE_ASSEMBLY_LIVE_REFRESH?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
