import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

export interface VirtualItem<T> {
  item: T;
  index: number;
  offsetTop: number;
}

export interface VisibleRange {
  start: number;
  end: number;
}

/**
 * Pure range math, split out from the hook so it's trivial to unit test
 * without mounting anything or faking a scroll container.
 *
 * Fixed row height only - every booth mini-card is the same size, so there is
 * no need for the measurement/estimation machinery a general-purpose virtual
 * list needs. That would be solving a problem we don't have (YAGNI); if a
 * second call site ever needs variable heights, upgrade then.
 */
export function computeVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  itemCount: number,
  overscan: number
): VisibleRange {
  if (itemCount <= 0 || itemHeight <= 0) return { start: 0, end: 0 };

  const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
  // Clamp against itemCount too, not just 0: a stale/overscrolled scrollTop
  // (e.g. from a just-swapped, shorter list) must not push `start` past the
  // end of the list, which would otherwise make `end` do the same.
  const rawStart = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const start = Math.min(rawStart, Math.max(0, itemCount - 1));
  const end = Math.min(itemCount, start + Math.max(visibleCount, 0));

  return { start, end };
}

/**
 * Windows a long, uniform-height list down to only the rows near the
 * viewport. Booth lists run from a few dozen to ~900 per constituency
 * (TN-027 alone has 909); rendering all of them as real DOM nodes is the
 * kind of thing that feels fine on a 2024 laptop and then jankily eats a
 * mid-range phone in the field on election day.
 *
 * Deliberately dependency-free rather than pulling in a virtualization
 * library for one call site - see `computeVisibleRange` for the actual
 * windowing logic.
 */
export function useVirtualList<T>(
  items: T[],
  itemHeight: number,
  overscan = 6
): {
  containerRef: RefObject<HTMLDivElement>;
  totalHeight: number;
  visibleItems: VirtualItem<T>[];
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const onScroll = (): void => setScrollTop(el.scrollTop);
    const onResize = (): void => setViewportHeight(el.clientHeight);

    onResize();
    el.addEventListener('scroll', onScroll, { passive: true });

    // jsdom/happy-dom (unit tests) have no ResizeObserver; the initial
    // onResize() call above still gives us a one-shot measurement there,
    // same defensive pattern as useElementWidth.
    if (typeof ResizeObserver === 'undefined') {
      return () => el.removeEventListener('scroll', onScroll);
    }

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, []);

  // Items changing (e.g. a new AC's booth list loads in) can leave scrollTop
  // pointing past the end of the new, shorter list. Reset rather than render
  // an empty window.
  useEffect(() => {
    setScrollTop(0);
    containerRef.current?.scrollTo({ top: 0 });
  }, [items]);

  const totalHeight = items.length * itemHeight;

  const visibleItems = useMemo(() => {
    const { start, end } = computeVisibleRange(
      scrollTop,
      viewportHeight,
      itemHeight,
      items.length,
      overscan
    );
    const out: VirtualItem<T>[] = [];
    for (let i = start; i < end; i++) {
      out.push({ item: items[i] as T, index: i, offsetTop: i * itemHeight });
    }
    return out;
  }, [items, scrollTop, viewportHeight, itemHeight, overscan]);

  return { containerRef, totalHeight, visibleItems };
}
