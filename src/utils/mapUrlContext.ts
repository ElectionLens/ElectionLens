/**
 * The map colours itself partly from the URL, because view state (`currentState`,
 * `pcSelectedYear`, ...) is committed asynchronously by `handleUrlNavigate` and can
 * still be stale on the first render after a navigation. Reading the address bar is
 * how the map avoids painting a frame with the wrong year's winners.
 *
 * These helpers are the single vocabulary for that. They are pure - callers pass in
 * `pathname`/`search` strings, obtained SSR-safely via {@link readLocation}.
 */

/** Current address-bar parts, or null when there is no DOM (SSR / tests). */
export function readLocation(): { pathname: string; search: string } | null {
  if (typeof window === 'undefined') return null;
  return { pathname: window.location.pathname, search: window.location.search };
}

/** Non-empty path segments, e.g. "/tamil-nadu/pc" -> ["tamil-nadu", "pc"]. */
export function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

/** Raw `?year=` value, untouched - use when "absent" and "unparseable" must differ. */
export function rawYearParam(search: string): string | null {
  return new URLSearchParams(search).get('year');
}

/**
 * The assembly-election year in `?year=`, e.g. `?year=2021` -> 2021.
 *
 * `?year=pc-2024` is deliberately rejected: that slot names a Lok Sabha year for
 * PC-contribution colouring, not an assembly year. See {@link parsePcPrefixedYear}.
 */
export function parseAssemblyYearParam(search: string): number | null {
  const raw = rawYearParam(search);
  if (!raw || raw.startsWith('pc-')) return null;
  const year = parseInt(raw, 10);
  return Number.isNaN(year) ? null : year;
}

/** The Lok Sabha year in a `?year=pc-YYYY` slot, e.g. `?year=pc-2024` -> 2024. */
export function parsePcPrefixedYear(search: string): number | null {
  const raw = rawYearParam(search);
  if (!raw?.startsWith('pc-')) return null;
  const year = parseInt(raw.slice(3), 10);
  return Number.isNaN(year) ? null : year;
}

/** `/<state>/pc...` - the parliament layer, with or without a specific PC selected. */
export function isPcPath(pathname: string): boolean {
  const segments = pathSegments(pathname);
  return segments.length >= 2 && segments[1]?.toLowerCase() === 'pc';
}

/** `/<state>/pc` exactly - all PCs in a state, none selected. */
export function isStateLevelPcPath(pathname: string): boolean {
  return isPcPath(pathname) && !pathSegments(pathname)[2];
}

/**
 * URL asks for assembly-layer colouring from AC election JSON:
 * `/<state>/ac[/<ac>]` or `/<state>/district/<district>/ac[/<ac>]`.
 *
 * Distinguishing this matters because `currentView` can still say `constituencies`
 * for a frame after navigating; routing such a URL to the Lok Sabha loader finds no
 * `pc/YYYY` file, leaves winners empty, and falls back to a past assembly year -
 * i.e. visibly wrong colours on the map.
 */
export function isAssemblyMapDataPath(pathname: string): boolean {
  const segments = pathSegments(pathname);
  const stateWideAc =
    segments.length >= 2 && segments[1]?.toLowerCase() === 'ac' && segments.length <= 3;
  const districtAc =
    segments.length >= 5 &&
    segments[1]?.toLowerCase() === 'district' &&
    segments[3]?.toLowerCase() === 'ac';
  return stateWideAc || districtAc;
}

/** Human-readable state name from the leading path slug, e.g. "tamil-nadu" -> "tamil nadu". */
export function stateNameFromPath(pathname: string): string | null {
  const slug = pathSegments(pathname)[0];
  if (!slug) return null;
  return decodeURIComponent(slug).replace(/-/g, ' ');
}
