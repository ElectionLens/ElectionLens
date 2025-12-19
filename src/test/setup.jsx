import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IndexedDB
const indexedDB = {
  open: vi.fn(() => ({
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: {
      objectStoreNames: { contains: () => false },
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          get: vi.fn(() => ({ onsuccess: null, onerror: null, result: null })),
          put: vi.fn(),
          count: vi.fn(() => ({ onsuccess: null, onerror: null, result: 0 }))
        })),
        oncomplete: null,
        onerror: null
      })),
      close: vi.fn()
    }
  })),
  deleteDatabase: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onblocked: null
  }))
};

vi.stubGlobal('indexedDB', indexedDB);

// Mock fetch for GeoJSON files
global.fetch = vi.fn((url) => {
  if (url.includes('.geojson')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        type: 'FeatureCollection',
        features: []
      })
    });
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
      removeLayer: vi.fn()
    })),
    tileLayer: vi.fn(() => ({
      addTo: vi.fn(),
      bringToBack: vi.fn()
    })),
    geoJSON: vi.fn(() => ({
      addTo: vi.fn(),
      getBounds: vi.fn(() => ({
        isValid: () => true
      })),
      eachLayer: vi.fn(),
      resetStyle: vi.fn()
    })),
    Control: {
      extend: vi.fn(() => vi.fn())
    },
    DomUtil: {
      create: vi.fn(() => document.createElement('div'))
    },
    DomEvent: {
      stopPropagation: vi.fn(),
      disableClickPropagation: vi.fn()
    },
    control: {
      scale: vi.fn(() => ({ addTo: vi.fn() }))
    }
  },
  map: vi.fn(),
  tileLayer: vi.fn(),
  geoJSON: vi.fn(),
  Control: { extend: vi.fn(() => vi.fn()) },
  DomUtil: { create: vi.fn(() => document.createElement('div')) },
  DomEvent: { stopPropagation: vi.fn(), disableClickPropagation: vi.fn() },
  control: { scale: vi.fn(() => ({ addTo: vi.fn() })) }
}));

// Mock react-leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  GeoJSON: ({ data }) => <div data-testid="geojson-layer" data-features={data?.features?.length || 0} />,
  useMap: vi.fn(() => ({
    flyTo: vi.fn(),
    flyToBounds: vi.fn(),
    fitBounds: vi.fn(),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeLayer: vi.fn()
  }))
}));

// Suppress console warnings during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('IndexedDB')) return;
  originalWarn(...args);
};

