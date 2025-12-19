/// <reference types="vite/client" />

declare module '*.geojson' {
  const value: import('./types').GeoJSONData;
  export default value;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

