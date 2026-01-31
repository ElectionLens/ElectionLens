import { useEffect, useCallback, useRef } from 'react';
import type { ViewMode } from '../types';

/** URL state shape */
export interface UrlState {
  state: string | null;
  view: ViewMode;
  pc: string | null;
  district: string | null;
  assembly: string | null;
  year: number | null;
  pcYear: number | null; // Parliament year for AC view (from year=pc-YYYY format)
  tab: string | null; // Active tab in election panel: 'overview', 'candidates', 'booths', 'postal', 'analysis'
  /** When viewing a specific PC: true = show ACs within PC, false = show PC boundary only */
  showACs: boolean | null;
  blog: boolean; // Whether blog section is open
  blogPost: string | null; // Selected blog post ID (e.g., 'ammk-admk-alliance')
}

/** Hook return type */
export interface UseUrlStateReturn {
  /** Parse current URL to get state */
  getUrlState: () => UrlState;
  /** Update URL with new state (doesn't trigger navigation) */
  updateUrl: (state: UrlState) => void;
  /** Generate a shareable URL */
  getShareableUrl: (state: UrlState) => string;
}

/**
 * Strip diacritics from text for clean URLs
 * Converts characters like ā, ī, ū to a, i, u
 */
function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Encode a value for URL path segment
 * Strips diacritics for clean, shareable ASCII-only URLs
 * Preserves parentheses since they're valid URL characters (RFC 3986)
 */
function encodePathSegment(value: string): string {
  const encoded = encodeURIComponent(stripDiacritics(value).toLowerCase().replace(/\s+/g, '-'));
  // Restore parentheses - they're valid sub-delimiters in URLs and look cleaner
  return encoded.replace(/%28/g, '(').replace(/%29/g, ')');
}

/**
 * Decode a URL path segment
 */
function decodePathSegment(segment: string): string {
  let decoded = decodeURIComponent(segment).replace(/-(?!\d)/g, ' ');
  // Fix common typo: "name(sc" or "name(st" (missing ")") -> "name (sc)" so assembly matches GeoJSON
  if (/\(s[ct]$/i.test(decoded)) {
    decoded = decoded.replace(/\((s[ct])$/i, ' ($1)');
  }
  return decoded;
}

/**
 * Custom hook for managing URL state for deep linking
 * URL format: /[state]/[view]/[pc-or-district]/[assembly]
 * Examples:
 *   / - India view
 *   /tamil-nadu - Tamil Nadu constituencies
 *   /tamil-nadu/districts - Tamil Nadu districts
 *   /tamil-nadu/pc/chennai-north - Chennai North PC assemblies
 *   /tamil-nadu/pc/chennai-north/ac/anna-nagar - Specific assembly
 *   /tamil-nadu/district/chennai - Chennai district assemblies
 *   /tamil-nadu/district/chennai/ac/anna-nagar - Specific assembly in district
 */
export function useUrlState(
  currentState: string | null,
  currentView: ViewMode,
  currentPC: string | null,
  currentDistrict: string | null,
  currentAssembly: string | null,
  selectedYear: number | null,
  selectedPCYear: number | null,
  onNavigate: (state: UrlState) => void | Promise<void>,
  isDataReady: boolean = true,
  showACsWithinPC: boolean | null = null
): UseUrlStateReturn {
  const isInitialMount = useRef(true);
  const hasNavigatedFromUrl = useRef(false);
  const isProcessingUrlNavigation = useRef(false);
  const lastUrl = useRef<string>('');
  const onNavigateRef = useRef(onNavigate);

  // Keep callback ref updated
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  /**
   * Parse current URL to extract navigation state
   */
  const getUrlState = useCallback((): UrlState => {
    const path = window.location.pathname;
    const segments = path.split('/').filter(Boolean);
    const searchParams = new URLSearchParams(window.location.search);

    const result: UrlState = {
      state: null,
      view: 'constituencies',
      pc: null,
      district: null,
      assembly: null,
      year: null,
      pcYear: null,
      tab: null,
      showACs: null,
      blog: false,
      blogPost: null,
    };

    // Parse year from query params
    // Format: year=2024 (assembly/parliament) or year=pc-2024 (parliament contribution in AC view)
    const yearParam = searchParams.get('year');
    if (yearParam) {
      if (yearParam.startsWith('pc-')) {
        // Parliament contribution year: year=pc-2024
        const parsed = parseInt(yearParam.slice(3), 10);
        if (!isNaN(parsed)) {
          result.pcYear = parsed;
        }
      } else {
        // Regular year
        const parsed = parseInt(yearParam, 10);
        if (!isNaN(parsed)) {
          result.year = parsed;
        }
      }
    }

    // Parse tab from query params
    // Format: tab=overview, tab=candidates, tab=booths, tab=postal, tab=analysis
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
      if (validTabs.includes(tabParam)) {
        result.tab = tabParam;
      }
    }

    // Parse blog from query params
    // Format: blog=true or blog=1 to open blog, blogPost=post-id to open specific post
    const blogParam = searchParams.get('blog');
    if (blogParam === 'true' || blogParam === '1') {
      result.blog = true;
    }

    const blogPostParam = searchParams.get('blogPost');
    if (blogPostParam) {
      result.blogPost = blogPostParam;
      result.blog = true; // Opening a post implies blog is open
    }

    // showACs: when viewing a specific PC, showACs=true (show ACs) or false (show PC boundary)
    const showACsParam = searchParams.get('showACs');
    if (showACsParam === 'true' || showACsParam === '1') {
      result.showACs = true;
    } else if (showACsParam === 'false' || showACsParam === '0') {
      result.showACs = false;
    }

    if (segments.length === 0) {
      return result;
    }

    // First segment is always state
    const firstSegment = segments[0];
    if (firstSegment) {
      result.state = decodePathSegment(firstSegment);
    }

    if (segments.length === 1) {
      // /state-name -> constituencies view
      return result;
    }

    // Second segment determines view type
    const secondSegment = segments[1]?.toLowerCase() ?? '';

    if (secondSegment === 'districts') {
      result.view = 'districts';
    } else if (secondSegment === 'ac') {
      // /state/ac/ - All assemblies view
      result.view = 'assemblies';
      // Check for specific assembly: /state/ac/ac-name
      if (segments[2]) {
        result.assembly = decodePathSegment(segments[2]);
      }
    } else if (secondSegment === 'pc') {
      // /state/pc - constituencies view (same as /state)
      // /state/pc/pc-name - specific PC view
      if (segments[2]) {
        result.pc = decodePathSegment(segments[2]);
        // Check for assembly: /state/pc/pc-name/ac/ac-name
        if (segments[3]?.toLowerCase() === 'ac' && segments[4]) {
          result.assembly = decodePathSegment(segments[4]);
        }
      }
      // If no PC name, stays as constituencies view (default)
    } else if (secondSegment === 'district' && segments[2]) {
      result.view = 'districts';
      result.district = decodePathSegment(segments[2]);
      // Check for assembly: /state/district/dist-name/ac/ac-name
      if (segments[3]?.toLowerCase() === 'ac' && segments[4]) {
        result.assembly = decodePathSegment(segments[4]);
      }
    }

    // Default showACs to true when viewing a specific PC and no param in URL
    if (result.pc != null && result.showACs === null) {
      result.showACs = true;
    }

    // #region agent log
    if (result.state && (result.district || result.assembly)) {
      fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'useUrlState.ts:getUrlState',
          message: 'Parsed URL state',
          data: {
            state: result.state,
            view: result.view,
            district: result.district,
            assembly: result.assembly,
            year: result.year,
            pcYear: result.pcYear,
            path: typeof window !== 'undefined' ? window.location.pathname : '',
            search: typeof window !== 'undefined' ? window.location.search : '',
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'B',
        }),
      }).catch(() => {});
    }
    // #endregion
    return result;
  }, []);

  /**
   * Update browser URL without triggering navigation
   */
  const updateUrl = useCallback((state: UrlState): void => {
    let path = '/';

    if (state.state) {
      path = `/${encodePathSegment(state.state)}`;

      if (state.pc) {
        path += `/pc/${encodePathSegment(state.pc)}`;
        if (state.assembly) {
          path += `/ac/${encodePathSegment(state.assembly)}`;
        }
      } else if (state.district) {
        path += `/district/${encodePathSegment(state.district)}`;
        if (state.assembly) {
          path += `/ac/${encodePathSegment(state.assembly)}`;
        }
      } else if (state.view === 'assemblies') {
        path += '/ac';
        if (state.assembly) {
          path += `/${encodePathSegment(state.assembly)}`;
        }
      } else if (state.view === 'districts') {
        path += '/districts';
      } else if (state.view === 'constituencies') {
        // Always include /pc for constituencies view (state-level)
        path += '/pc';
      }
    }

    // Add query params for year and tab. When at home (no state), do not add year.
    const params = new URLSearchParams();

    if (state.state) {
      if (state.assembly) {
        if (state.pcYear) {
          params.set('year', `pc-${state.pcYear}`);
        } else if (state.year) {
          params.set('year', String(state.year));
        }
      } else if (state.pc && state.year) {
        params.set('year', String(state.year));
      } else if (state.view === 'constituencies' && state.year) {
        params.set('year', String(state.year));
      } else if (state.view === 'assemblies') {
        if (state.pcYear) {
          params.set('year', `pc-${state.pcYear}`);
        } else if (state.year) {
          params.set('year', String(state.year));
        }
      } else if (state.view === 'districts') {
        if (state.pcYear) {
          params.set('year', `pc-${state.pcYear}`);
        } else if (state.year) {
          params.set('year', String(state.year));
        }
      }
    }

    if (state.tab) {
      params.set('tab', state.tab);
    }

    if (state.pc != null && state.showACs != null) {
      params.set('showACs', state.showACs ? 'true' : 'false');
    }

    if (state.blog) {
      params.set('blog', 'true');
      if (state.blogPost) {
        params.set('blogPost', state.blogPost);
      }
    }

    const fullPath = params.toString() ? `${path}?${params.toString()}` : path;

    // Only update if path changed
    if (fullPath !== lastUrl.current) {
      lastUrl.current = fullPath;
      window.history.pushState({ ...state }, '', fullPath);
    }
  }, []);

  /**
   * Generate a shareable URL for a given state
   */
  const getShareableUrl = useCallback((state: UrlState): string => {
    const base = window.location.origin;
    let path = '/';

    if (state.state) {
      path = `/${encodePathSegment(state.state)}`;

      if (state.pc) {
        path += `/pc/${encodePathSegment(state.pc)}`;
        if (state.assembly) {
          path += `/ac/${encodePathSegment(state.assembly)}`;
        }
      } else if (state.district) {
        path += `/district/${encodePathSegment(state.district)}`;
        if (state.assembly) {
          path += `/ac/${encodePathSegment(state.assembly)}`;
        }
      } else if (state.view === 'assemblies') {
        path += '/ac';
        if (state.assembly) {
          path += `/${encodePathSegment(state.assembly)}`;
        }
      } else if (state.view === 'districts') {
        path += '/districts';
      } else if (state.view === 'constituencies') {
        // Always include /pc for constituencies view (state-level)
        path += '/pc';
      }
    }

    // Add query params for year and tab. When at home (no state), do not add year.
    const params = new URLSearchParams();

    if (state.state) {
      if (state.assembly) {
        if (state.pcYear) {
          params.set('year', `pc-${state.pcYear}`);
        } else if (state.year) {
          params.set('year', String(state.year));
        }
      } else if (state.pc && state.year) {
        params.set('year', String(state.year));
      } else if (state.view === 'constituencies' && state.year) {
        params.set('year', String(state.year));
      } else if (state.view === 'assemblies') {
        if (state.pcYear) {
          params.set('year', `pc-${state.pcYear}`);
        } else if (state.year) {
          params.set('year', String(state.year));
        }
      } else if (state.view === 'districts') {
        if (state.pcYear) {
          params.set('year', `pc-${state.pcYear}`);
        } else if (state.year) {
          params.set('year', String(state.year));
        }
      }
    }

    if (state.tab) {
      params.set('tab', state.tab);
    }

    if (state.pc != null && state.showACs != null) {
      params.set('showACs', state.showACs ? 'true' : 'false');
    }

    if (state.blog) {
      params.set('blog', 'true');
      if (state.blogPost) {
        params.set('blogPost', state.blogPost);
      }
    }

    if (params.toString()) {
      path = `${path}?${params.toString()}`;
    }

    return `${base}${path}`;
  }, []);

  // Handle initial URL on mount - wait for data to be ready
  useEffect(() => {
    if (isDataReady && !hasNavigatedFromUrl.current) {
      const urlState = getUrlState();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5b91ef4f-6f16-4f42-869d-1ba3b27dc151', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'useUrlState.ts:initialNav',
          message: 'About to call handleUrlNavigate',
          data: {
            hasNavigatedFromUrl: hasNavigatedFromUrl.current,
            isDataReady,
            urlStateYear: urlState.year,
            urlStatePcYear: urlState.pcYear,
            urlStateDistrict: urlState.district,
            urlStateAssembly: urlState.assembly,
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'D',
        }),
      }).catch(() => {});
      // #endregion
      // Only navigate if URL has state info
      if (urlState.state) {
        // Mark that we're processing URL navigation to prevent URL updates during this time
        isProcessingUrlNavigation.current = true;

        // Use Promise.resolve to handle both sync and async navigation handlers.
        // Set hasNavigatedFromUrl only after completion so React Strict Mode's second mount
        // still runs handleUrlNavigate (refs persist across strict double-mount).
        void Promise.resolve(onNavigateRef.current(urlState)).finally(() => {
          hasNavigatedFromUrl.current = true;
          // Small delay to ensure all state updates (e.g. setSelectedYear) have been committed
          setTimeout(() => {
            isProcessingUrlNavigation.current = false;
            isInitialMount.current = false;
            lastUrl.current = window.location.pathname + window.location.search;
          }, 150);
        });
      } else {
        hasNavigatedFromUrl.current = true;
        isInitialMount.current = false;
      }
    }
  }, [getUrlState, isDataReady]);

  // Update URL when state changes
  useEffect(() => {
    // Don't update URL during initial mount or while processing URL-based navigation
    if (!isInitialMount.current && !isProcessingUrlNavigation.current) {
      // Preserve tab from current URL when updating
      const currentTab =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('tab')
          : null;
      const validTabs = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
      const preservedTab = currentTab && validTabs.includes(currentTab) ? currentTab : null;

      // When at home (no state), do not add year to URL — home is always clean root
      const atHome = !currentState;
      // When viewing AC or districts, prefer year from current URL so we
      // don't overwrite with stale state before handleUrlNavigate has applied it.
      let yearToUse = atHome ? null : selectedYear;
      let pcYearToUse = atHome ? null : selectedPCYear;
      const inACOrDistrictsView =
        !atHome &&
        (currentView === 'assemblies' || currentView === 'districts') &&
        typeof window !== 'undefined';
      if (inACOrDistrictsView) {
        const urlParams = new URLSearchParams(window.location.search);
        const yearParam = urlParams.get('year');
        if (yearParam) {
          if (yearParam.startsWith('pc-')) {
            const parsed = parseInt(yearParam.slice(3), 10);
            if (!isNaN(parsed)) pcYearToUse = parsed;
          } else {
            const parsed = parseInt(yearParam, 10);
            if (!isNaN(parsed)) {
              yearToUse = parsed;
              pcYearToUse = null;
            }
          }
        }
      }
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: yearToUse,
        pcYear: pcYearToUse,
        tab: preservedTab, // Preserve tab from current URL
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: false, // Blog is managed in App component
        blogPost: null,
      });
    }
  }, [
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
    selectedPCYear,
    showACsWithinPC,
    updateUrl,
  ]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (): void => {
      const urlState = getUrlState();
      void Promise.resolve(onNavigateRef.current(urlState));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getUrlState]);

  return {
    getUrlState,
    updateUrl,
    getShareableUrl,
  };
}
