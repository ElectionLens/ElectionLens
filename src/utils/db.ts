import { DB_NAME, DB_VERSION, STORE_NAME } from '../constants';
import type { GeoJSONData, DBStats, DBStoredItem } from '../types';

/** Module-level database reference */
let db: IDBDatabase | null = null;

/** Initialization timeout in milliseconds */
const INIT_TIMEOUT = 500;

/**
 * Initialize IndexedDB connection
 * Falls back to memory cache if IndexedDB is unavailable
 * @returns Database instance or null if initialization fails
 */
export async function initDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('IndexedDB timed out, using memory cache only');
      resolve(null);
    }, INIT_TIMEOUT);

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (): void => {
        clearTimeout(timeout);
        console.warn('IndexedDB not available, using memory cache only');
        resolve(null);
      };

      request.onsuccess = (event: Event): void => {
        clearTimeout(timeout);
        const target = event.target as IDBOpenDBRequest;
        db = target.result;
        console.log('IndexedDB initialized');
        resolve(db);
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent): void => {
        const target = event.target as IDBOpenDBRequest;
        const database = target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          console.log('Created object store:', STORE_NAME);
        }
      };
    } catch (e) {
      clearTimeout(timeout);
      console.warn('IndexedDB error:', e);
      resolve(null);
    }
  });
}

/**
 * Retrieve data from IndexedDB by key
 * @param key - The storage key to retrieve
 * @returns The stored GeoJSON data or null if not found
 */
export async function getFromDB(key: string): Promise<GeoJSONData | null> {
  if (!db) return null;
  
  return new Promise((resolve) => {
    try {
      const transaction = db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      
      request.onsuccess = (): void => {
        const result = request.result as DBStoredItem<GeoJSONData> | undefined;
        resolve(result?.data ?? null);
      };
      
      request.onerror = (): void => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Save data to IndexedDB
 * @param key - The storage key
 * @param data - The GeoJSON data to store
 * @returns True if save was successful, false otherwise
 */
export async function saveToDB(key: string, data: GeoJSONData): Promise<boolean> {
  if (!db) return false;
  
  return new Promise((resolve) => {
    try {
      const transaction = db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const item: DBStoredItem<GeoJSONData> = {
        id: key,
        data: data,
        timestamp: Date.now()
      };
      
      store.put(item);
      
      transaction.oncomplete = (): void => resolve(true);
      transaction.onerror = (): void => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Get database statistics
 * @returns Object containing item count
 */
export async function getDBStats(): Promise<DBStats> {
  if (!db) return { count: 0 };
  
  return new Promise((resolve) => {
    try {
      const transaction = db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();
      
      countRequest.onsuccess = (): void => {
        resolve({ count: countRequest.result });
      };
      
      countRequest.onerror = (): void => resolve({ count: 0 });
    } catch (e) {
      resolve({ count: 0 });
    }
  });
}

/**
 * Clear all cached data and reload the page
 * Closes database connection and deletes the entire database
 */
export async function clearAllCache(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      
      req.onsuccess = (): void => {
        console.log('IndexedDB deleted');
        resolve();
      };
      
      req.onerror = (): void => reject(req.error);
      
      req.onblocked = (): void => {
        console.log('Database delete blocked, forcing reload');
        resolve();
      };
    });
  } catch (e) {
    console.error('Failed to delete IndexedDB:', e);
  }

  alert('Cache cleared! Page will reload to fetch fresh data.');
  location.reload();
}

/**
 * Get the current database instance (for testing purposes)
 * @internal
 */
export function getDB(): IDBDatabase | null {
  return db;
}

/**
 * Set the database instance (for testing purposes)
 * @internal
 */
export function setDB(database: IDBDatabase | null): void {
  db = database;
}

