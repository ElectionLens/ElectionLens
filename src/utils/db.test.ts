import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getFromDB, saveToDB, getDBStats, getDB, setDB } from './db';
import type { GeoJSONData } from '../types';

// Mock IndexedDB for node environment
const createMockStore = () => {
  const storage: Record<string, unknown> = {};
  return {
    get: vi.fn((key: string) => {
      const request = {
        result: storage[key],
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    put: vi.fn((item: { id: string; data: unknown }) => {
      storage[item.id] = item;
    }),
    count: vi.fn(() => {
      const request = {
        result: Object.keys(storage).length,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
  };
};

const createMockTransaction = (store: ReturnType<typeof createMockStore>) => ({
  objectStore: vi.fn(() => store),
  oncomplete: null as (() => void) | null,
  onerror: null as (() => void) | null,
});

const createMockDB = () => {
  const store = createMockStore();
  const transaction = createMockTransaction(store);

  return {
    transaction: vi.fn(() => {
      // Trigger oncomplete after a small delay
      setTimeout(() => transaction.oncomplete?.(), 0);
      return transaction;
    }),
    close: vi.fn(),
    objectStoreNames: {
      contains: vi.fn(() => true),
    },
    createObjectStore: vi.fn(),
    _store: store,
    _transaction: transaction,
  };
};

describe('db module', () => {
  beforeEach(() => {
    // Reset DB before each test
    setDB(null);
  });

  afterEach(() => {
    setDB(null);
    vi.restoreAllMocks();
  });

  describe('getDB / setDB', () => {
    it('should return null initially', () => {
      expect(getDB()).toBeNull();
    });

    it('should set and get the database', () => {
      const mockDB = createMockDB();
      setDB(mockDB as unknown as IDBDatabase);
      expect(getDB()).toBe(mockDB);
    });

    it('should allow setting to null', () => {
      const mockDB = createMockDB();
      setDB(mockDB as unknown as IDBDatabase);
      expect(getDB()).toBe(mockDB);
      setDB(null);
      expect(getDB()).toBeNull();
    });
  });

  describe('getFromDB', () => {
    it('should return null when db is not initialized', async () => {
      const result = await getFromDB('some-key');
      expect(result).toBeNull();
    });

    it('should retrieve data from the store when db is initialized', async () => {
      const mockDB = createMockDB();
      const mockData: GeoJSONData = {
        type: 'FeatureCollection',
        features: [],
      };

      // Preset data in the mock store
      mockDB._store.get.mockImplementation(() => {
        const request = {
          result: { id: 'test-key', data: mockData, timestamp: Date.now() },
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      setDB(mockDB as unknown as IDBDatabase);

      const result = await getFromDB('test-key');
      expect(result).toEqual(mockData);
    });

    it('should return null when key is not found', async () => {
      const mockDB = createMockDB();
      mockDB._store.get.mockImplementation(() => {
        const request = {
          result: undefined,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      setDB(mockDB as unknown as IDBDatabase);

      const result = await getFromDB('non-existent-key');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const mockDB = createMockDB();
      mockDB._store.get.mockImplementation(() => {
        const request = {
          result: undefined,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        setTimeout(() => request.onerror?.(), 0);
        return request;
      });

      setDB(mockDB as unknown as IDBDatabase);

      const result = await getFromDB('error-key');
      expect(result).toBeNull();
    });

    it('should handle transaction errors gracefully', async () => {
      const mockDB = createMockDB();
      mockDB.transaction.mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      setDB(mockDB as unknown as IDBDatabase);

      const result = await getFromDB('any-key');
      expect(result).toBeNull();
    });
  });

  describe('saveToDB', () => {
    it('should return false when db is not initialized', async () => {
      const mockData: GeoJSONData = {
        type: 'FeatureCollection',
        features: [],
      };

      const result = await saveToDB('test-key', mockData);
      expect(result).toBe(false);
    });

    it('should save data successfully', async () => {
      const mockDB = createMockDB();
      const mockData: GeoJSONData = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Test' },
            geometry: { type: 'Point', coordinates: [0, 0] },
          },
        ],
      };

      setDB(mockDB as unknown as IDBDatabase);

      const result = await saveToDB('test-key', mockData);
      expect(result).toBe(true);
      expect(mockDB._store.put).toHaveBeenCalled();
    });

    it('should return false on transaction error', async () => {
      const mockDB = createMockDB();
      const mockTransaction = createMockTransaction(mockDB._store);
      mockDB.transaction.mockImplementation(() => {
        setTimeout(() => mockTransaction.onerror?.(), 0);
        return mockTransaction;
      });

      setDB(mockDB as unknown as IDBDatabase);

      const mockData: GeoJSONData = {
        type: 'FeatureCollection',
        features: [],
      };

      const result = await saveToDB('test-key', mockData);
      expect(result).toBe(false);
    });

    it('should handle exceptions gracefully', async () => {
      const mockDB = createMockDB();
      mockDB.transaction.mockImplementation(() => {
        throw new Error('Transaction creation failed');
      });

      setDB(mockDB as unknown as IDBDatabase);

      const mockData: GeoJSONData = {
        type: 'FeatureCollection',
        features: [],
      };

      const result = await saveToDB('test-key', mockData);
      expect(result).toBe(false);
    });
  });

  describe('getDBStats', () => {
    it('should return zero count when db is not initialized', async () => {
      const stats = await getDBStats();
      expect(stats).toEqual({ count: 0 });
    });

    it('should return count from database', async () => {
      const mockDB = createMockDB();
      mockDB._store.count.mockImplementation(() => {
        const request = {
          result: 5,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      setDB(mockDB as unknown as IDBDatabase);

      const stats = await getDBStats();
      expect(stats).toEqual({ count: 5 });
    });

    it('should return zero count on error', async () => {
      const mockDB = createMockDB();
      mockDB._store.count.mockImplementation(() => {
        const request = {
          result: 0,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        setTimeout(() => request.onerror?.(), 0);
        return request;
      });

      setDB(mockDB as unknown as IDBDatabase);

      const stats = await getDBStats();
      expect(stats).toEqual({ count: 0 });
    });

    it('should handle exceptions gracefully', async () => {
      const mockDB = createMockDB();
      mockDB.transaction.mockImplementation(() => {
        throw new Error('Transaction error');
      });

      setDB(mockDB as unknown as IDBDatabase);

      const stats = await getDBStats();
      expect(stats).toEqual({ count: 0 });
    });
  });
});
