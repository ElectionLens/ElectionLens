/**
 * Performance utilities for monitoring and optimization
 */

/**
 * Measure execution time of an async function
 */
export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
  log = false
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (log && import.meta.env.DEV) {
    console.log(`[Perf] ${label}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

/**
 * Measure execution time of a sync function
 */
export function measureSync<T>(
  label: string,
  fn: () => T,
  log = false
): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (log && import.meta.env.DEV) {
    console.log(`[Perf] ${label}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

/**
 * Debounce a function to prevent rapid successive calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function to limit call frequency
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Report Web Vitals metrics
 * Call from main.tsx to track LCP, FID, CLS, etc.
 */
export function reportWebVitals(onPerfEntry?: (metric: unknown) => void): void {
  if (onPerfEntry && typeof onPerfEntry === 'function') {
    import('web-vitals')
      .then(({ onCLS, onFCP, onLCP, onTTFB }) => {
        onCLS(onPerfEntry);
        onFCP(onPerfEntry);
        onLCP(onPerfEntry);
        onTTFB(onPerfEntry);
      })
      .catch(() => {
        // web-vitals not installed, skip
      });
  }
}

/**
 * Create a simple in-memory cache for expensive computations
 */
export function createCache<K, V>(
  maxSize = 100
): {
  get: (key: K) => V | undefined;
  set: (key: K, value: V) => void;
  has: (key: K) => boolean;
  clear: () => void;
  size: () => number;
} {
  const cache = new Map<K, V>();

  return {
    get: (key: K) => cache.get(key),
    set: (key: K, value: V) => {
      // LRU eviction: remove oldest entry if at capacity
      if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        }
      }
      cache.set(key, value);
    },
    has: (key: K) => cache.has(key),
    clear: () => cache.clear(),
    size: () => cache.size,
  };
}

/**
 * Preload an image to warm browser cache
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Prefetch a URL to warm browser cache
 */
export function prefetch(url: string): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    });
  }
}

/**
 * Check if the device has low memory or CPU
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  // Check device memory (in GB, if available)
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (deviceMemory && deviceMemory < 4) return true;

  // Check hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return true;

  // Check connection type if available
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection;
  if (connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') {
    return true;
  }

  return false;
}
