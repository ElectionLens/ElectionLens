import { DB_NAME, DB_VERSION, STORE_NAME } from '../constants';

let db = null;

// Initialize IndexedDB
export async function initDB() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('IndexedDB timed out, using memory cache only');
      resolve(null);
    }, 500);

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        clearTimeout(timeout);
        console.warn('IndexedDB not available, using memory cache only');
        resolve(null);
      };

      request.onsuccess = (event) => {
        clearTimeout(timeout);
        db = event.target.result;
        console.log('IndexedDB initialized');
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
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

// Get data from IndexedDB
export async function getFromDB(key) {
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// Save data to IndexedDB
export async function saveToDB(key, data) {
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ id: key, data: data, timestamp: Date.now() });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// Get database statistics
export async function getDBStats() {
  if (!db) return { count: 0 };
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        resolve({ count: countRequest.result });
      };
      countRequest.onerror = () => resolve({ count: 0 });
    } catch (e) {
      resolve({ count: 0 });
    }
  });
}

// Clear all cache
export async function clearAllCache() {
  if (db) {
    db.close();
    db = null;
  }

  try {
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => {
        console.log('IndexedDB deleted');
        resolve();
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        console.log('Database delete blocked, forcing reload');
        resolve();
      };
    });
  } catch (e) {
    console.error('Failed to delete IndexedDB:', e);
  }

  alert('Cache cleared! Page will reload to fetch fresh data.');
  location.reload(true);
}

