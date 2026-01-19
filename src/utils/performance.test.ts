import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  measureAsync,
  measureSync,
  debounce,
  throttle,
  createCache,
  preloadImage,
  isLowEndDevice,
} from './performance';

describe('performance utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('measureAsync', () => {
    it('measures async function and returns result', async () => {
      vi.useRealTimers();
      const fn = async () => 'result';
      const { result, duration } = await measureAsync('test', fn);
      expect(result).toBe('result');
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureSync', () => {
    it('measures sync function and returns result', () => {
      const fn = () => 42;
      const { result, duration } = measureSync('test', fn);
      expect(result).toBe(42);
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('debounce', () => {
    it('delays function execution', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets delay on subsequent calls', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      vi.advanceTimersByTime(50);
      debouncedFn();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes arguments', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);
      debouncedFn('arg1', 'arg2');
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle', () => {
    it('calls function immediately on first call', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('ignores calls within throttle period', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);
      throttledFn();
      throttledFn();
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('allows calls after throttle period', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);
      throttledFn();
      vi.advanceTimersByTime(100);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('createCache', () => {
    it('stores and retrieves values', () => {
      const cache = createCache<string, number>();
      cache.set('key1', 100);
      expect(cache.get('key1')).toBe(100);
    });

    it('returns undefined for missing keys', () => {
      const cache = createCache<string, number>();
      expect(cache.get('missing')).toBeUndefined();
    });

    it('checks if key exists', () => {
      const cache = createCache<string, number>();
      cache.set('existing', 42);
      expect(cache.has('existing')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('clears all entries', () => {
      const cache = createCache<string, number>();
      cache.set('key1', 100);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('evicts oldest entry when at capacity', () => {
      const cache = createCache<string, number>(2);
      cache.set('key1', 100);
      cache.set('key2', 200);
      cache.set('key3', 300);
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key2')).toBe(200);
      expect(cache.get('key3')).toBe(300);
    });
  });

  describe('preloadImage', () => {
    it('resolves when image loads', async () => {
      vi.useRealTimers();
      const mockImage = { onload: null as (() => void) | null, onerror: null, src: '' };
      vi.spyOn(globalThis, 'Image').mockImplementation(
        () => mockImage as unknown as HTMLImageElement
      );
      const promise = preloadImage('test.jpg');
      mockImage.onload?.();
      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects when image fails', async () => {
      vi.useRealTimers();
      const mockImage = { onload: null, onerror: null as ((e: unknown) => void) | null, src: '' };
      vi.spyOn(globalThis, 'Image').mockImplementation(
        () => mockImage as unknown as HTMLImageElement
      );
      const promise = preloadImage('invalid.jpg');
      mockImage.onerror?.(new Error('Failed'));
      await expect(promise).rejects.toBeDefined();
    });
  });

  describe('isLowEndDevice', () => {
    const originalNavigator = globalThis.navigator;

    afterEach(() => {
      Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, writable: true });
    });

    it('returns false when navigator is undefined', () => {
      Object.defineProperty(globalThis, 'navigator', { value: undefined, writable: true });
      expect(isLowEndDevice()).toBe(false);
    });

    it('returns true for low device memory', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { deviceMemory: 2, hardwareConcurrency: 8 },
        writable: true,
      });
      expect(isLowEndDevice()).toBe(true);
    });

    it('returns true for low CPU cores', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { deviceMemory: 8, hardwareConcurrency: 2 },
        writable: true,
      });
      expect(isLowEndDevice()).toBe(true);
    });

    it('returns false for high-end device', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { deviceMemory: 8, hardwareConcurrency: 8 },
        writable: true,
      });
      expect(isLowEndDevice()).toBe(false);
    });
  });
});
