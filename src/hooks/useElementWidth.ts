import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Track an element's own width via `ResizeObserver`.
 *
 * The result panel needs this rather than `useMediaQuery` because its width is
 * not a pure function of the viewport: the panel-mode token and the user's
 * width override both change it independently. A viewport query would claim
 * there is room for a tab bar while the user has deliberately narrowed the
 * panel to 360px.
 *
 * Returns a callback ref, so it works on conditionally rendered nodes without
 * the caller wiring up an effect.
 */
export function useElementWidth<T extends HTMLElement>(): [
  (node: T | null) => void,
  number | null,
] {
  const [width, setWidth] = useState<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node || typeof ResizeObserver === 'undefined') {
      // jsdom and older browsers have no ResizeObserver. Null means "unknown",
      // which callers must treat as "assume narrow" rather than guessing wide.
      if (!node) setWidth(null);
      return;
    }

    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, width];
}
