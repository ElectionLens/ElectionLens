import '@testing-library/jest-dom';
import { vi } from 'vitest';
import type { ReactNode } from 'react';

// Types for mock IndexedDB
interface MockIDBRequest {
  onerror: ((this: IDBRequest, ev: Event) => unknown) | null;
  onsuccess: ((this: IDBRequest, ev: Event) => unknown) | null;
  onupgradeneeded?: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null;
  result: unknown;
}

interface MockIDBObjectStore {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
}

interface MockIDBTransaction {
  objectStore: ReturnType<typeof vi.fn>;
  oncomplete: ((this: IDBTransaction, ev: Event) => unknown) | null;
  onerror: ((this: IDBTransaction, ev: Event) => unknown) | null;
}

interface MockIDBDatabase {
  objectStoreNames: { contains: (name: string) => boolean };
  createObjectStore: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockIndexedDB {
  open: ReturnType<typeof vi.fn>;
  deleteDatabase: ReturnType<typeof vi.fn>;
}

// Mock IndexedDB
const mockStore: MockIDBObjectStore = {
  get: vi.fn(() => ({ onsuccess: null, onerror: null, result: null })),
  put: vi.fn(),
  count: vi.fn(() => ({ onsuccess: null, onerror: null, result: 0 })),
};

const mockTransaction: MockIDBTransaction = {
  objectStore: vi.fn(() => mockStore),
  oncomplete: null,
  onerror: null,
};

const mockDatabase: MockIDBDatabase = {
  objectStoreNames: { contains: () => false },
  createObjectStore: vi.fn(),
  transaction: vi.fn(() => mockTransaction),
  close: vi.fn(),
};

const mockIndexedDB: MockIndexedDB = {
  open: vi.fn(
    () =>
      ({
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: mockDatabase,
      }) as MockIDBRequest
  ),
  deleteDatabase: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onblocked: null,
  })),
};

vi.stubGlobal('indexedDB', mockIndexedDB);

// Mock fetch for GeoJSON files
global.fetch = vi.fn((url: string | URL | Request): Promise<Response> => {
  const urlString = typeof url === 'string' ? url : url.toString();
  if (urlString.includes('.geojson')) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'FeatureCollection',
          features: [],
        }),
    } as Response);
  }
  return Promise.reject(new Error('Not found'));
});

// Mock Leaflet
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({
      setView: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      remove: vi.fn(),
      flyTo: vi.fn(),
      flyToBounds: vi.fn(),
      fitBounds: vi.fn(),
      addControl: vi.fn(),
      removeControl: vi.fn(),
      removeLayer: vi.fn(),
    })),
    tileLayer: vi.fn(() => ({
      addTo: vi.fn(),
      bringToBack: vi.fn(),
    })),
    geoJSON: vi.fn(() => ({
      addTo: vi.fn(),
      getBounds: vi.fn(() => ({
        isValid: () => true,
      })),
      eachLayer: vi.fn(),
      resetStyle: vi.fn(),
    })),
    Control: {
      extend: vi.fn(() => vi.fn()),
    },
    DomUtil: {
      create: vi.fn(() => document.createElement('div')),
    },
    DomEvent: {
      stopPropagation: vi.fn(),
      disableClickPropagation: vi.fn(),
    },
    control: {
      scale: vi.fn(() => ({ addTo: vi.fn() })),
    },
  },
  map: vi.fn(),
  tileLayer: vi.fn(),
  geoJSON: vi.fn(),
  Control: { extend: vi.fn(() => vi.fn()) },
  DomUtil: { create: vi.fn(() => document.createElement('div')) },
  DomEvent: { stopPropagation: vi.fn(), disableClickPropagation: vi.fn() },
  control: { scale: vi.fn(() => ({ addTo: vi.fn() })) },
}));

// Props types for mock components
interface MockMapContainerProps {
  children?: ReactNode;
}

interface MockGeoJSONProps {
  data?: { features?: unknown[] };
}

// Mock react-leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: MockMapContainerProps) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  GeoJSON: ({ data }: MockGeoJSONProps) => (
    <div data-testid="geojson-layer" data-features={data?.features?.length ?? 0} />
  ),
  ScaleControl: () => <div data-testid="scale-control" />,
  useMap: vi.fn(() => ({
    flyTo: vi.fn(),
    flyToBounds: vi.fn(),
    fitBounds: vi.fn(),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeLayer: vi.fn(),
    eachLayer: vi.fn(),
  })),
}));

// Suppress console warnings during tests
const originalWarn = console.warn;
console.warn = (...args: unknown[]): void => {
  const firstArg = args[0];
  if (typeof firstArg === 'string' && firstArg.includes('IndexedDB')) return;
  originalWarn(...args);
};
