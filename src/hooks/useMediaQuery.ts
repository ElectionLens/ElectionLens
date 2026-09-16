import { useEffect, useState } from 'react';

/**
 * Track whether the viewport currently satisfies a media query.
 *
 * Replaces the hand-rolled `useState(window.innerWidth <= 768)` +
 * `addEventListener('resize')` pairs that had been copied into several
 * components. Beyond the duplication, those copies fired on *every* resize
 * frame; `matchMedia` only notifies when the answer actually changes.
 *
 * SSR-safe: returns `false` when there is no `window`, and re-syncs on mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQueryList = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);

    // Re-sync in case the viewport changed between render and effect, or the
    // query string itself changed.
    setMatches(mediaQueryList.matches);

    mediaQueryList.addEventListener('change', onChange);
    return () => mediaQueryList.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
