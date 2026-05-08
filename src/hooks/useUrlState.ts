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
  /** When set, one of `booths` | `postal` | `analysis` (Overview is the default and omits `tab=`) */
  tab: string | null;
  /** When viewing a specific PC: true = show ACs within PC, false = show PC boundary only */
  showACs: boolean | null;
  blog: boolean; // Whether blog section is open
  blogPost: string | null; // Selected blog post ID (e.g., 'ammk-admk-alliance')
  pane?: 'root' | 'region' | 'summary' | 'party' | 'ac' | 'pc';
  paneView?: 'seats' | 'votes' | null;
  paneParty?: string | null;
}

/**
 * `tab` is optional: omit it to keep the current `tab` query on the same pathname;
 * pass `null` to remove `tab=`; pass a string to set it.
 */
export type UrlUpdateInput = Omit<UrlState, 'tab'> & { tab?: string | null };

/** Hook return type */
export interface UseUrlStateReturn {
  /** Parse current URL to get state */
  getUrlState: () => UrlState;
  /** Update URL with new state (doesn't trigger navigation) */
  updateUrl: (state: UrlUpdateInput) => void;
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

function isPersistedElectionTabValue(value: string): value is 'booths' | 'postal' | 'analysis' {
  return value === 'booths' || value === 'postal' || value === 'analysis';
}

/** Remove legacy or invalid `tab=` values; keep only booth/postal/analysis sub-views. */
function stripStaleElectionTabQueryParam(params: URLSearchParams): void {
  const raw = params.get('tab');
  if (raw !== null && raw !== '' && !isPersistedElectionTabValue(raw)) {
    params.delete('tab');
  }
}

function buildPathFromUrlState(
  state: Pick<UrlState, 'state' | 'view' | 'pc' | 'district' | 'assembly'>
): string {
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
      path += '/pc';
    }
  }

  return path;
}

function applyYearAndScopedQueryParams(params: URLSearchParams, state: UrlUpdateInput): void {
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
}

/**
 * Merge canonical navigation query keys from {@link state}.
 * Caller must clone or create `params` first.
 */
function applyCanonicalQueryKeys(params: URLSearchParams, state: UrlUpdateInput): void {
  params.delete('year');
  params.delete('showACs');
  params.delete('blog');
  params.delete('blogPost');
  params.delete('pane');
  params.delete('paneView');
  params.delete('paneParty');

  applyYearAndScopedQueryParams(params, state);

  if (state.pc != null && state.showACs != null) {
    params.set('showACs', state.showACs ? 'true' : 'false');
  }

  if (state.blog) {
    params.set('blog', 'true');
    if (state.blogPost) {
      params.set('blogPost', state.blogPost);
    }
  }

  if (state.pane) {
    params.set('pane', state.pane);
  }
  if (state.paneView) {
    params.set('paneView', state.paneView);
  }
  if (state.paneParty) {
    params.set('paneParty', state.paneParty);
  }

  stripStaleElectionTabQueryParam(params);

  const hasExplicitTabProp = Object.prototype.hasOwnProperty.call(state, 'tab');

  if (hasExplicitTabProp) {
    const t = state.tab;
    if (t === null || t === undefined || t === '' || t === 'overview' || t === 'candidates') {
      params.delete('tab');
    } else {
      params.set('tab', t);
    }
  }
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
  showACsWithinPC: boolean | null = null,
  blogOpen: boolean = false,
  leftPane: UrlState['pane'] = 'root',
  leftPaneView: UrlState['paneView'] = null,
  leftPaneParty: string | null = null
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
      pane: 'root',
      paneView: null,
      paneParty: null,
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

    const tabParam = searchParams.get('tab');
    if (tabParam && isPersistedElectionTabValue(tabParam)) {
      result.tab = tabParam;
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

    const paneParam = searchParams.get('pane');
    if (
      paneParam === 'root' ||
      paneParam === 'region' ||
      paneParam === 'summary' ||
      paneParam === 'party' ||
      paneParam === 'ac' ||
      paneParam === 'pc'
    ) {
      result.pane = paneParam;
    }
    const paneViewParam = searchParams.get('paneView');
    if (paneViewParam === 'seats' || paneViewParam === 'votes') {
      result.paneView = paneViewParam;
    }
    const panePartyParam = searchParams.get('paneParty');
    if (panePartyParam) {
      result.paneParty = panePartyParam;
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

    return result;
  }, []);

  /**
   * Update browser URL without triggering navigation
   */
  const updateUrl = useCallback((state: UrlUpdateInput): void => {
    const path = buildPathFromUrlState(state);

    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const samePath = pathname === path;
    const params =
      samePath && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();

    applyCanonicalQueryKeys(params, state);

    const fullPath = params.toString() ? `${path}?${params.toString()}` : path;

    if (fullPath !== lastUrl.current) {
      lastUrl.current = fullPath;
      const historySnapshot: UrlState = {
        ...(state as UrlState),
        tab: params.get('tab'),
        blog: params.get('blog') === 'true' || Boolean(params.get('blogPost')),
        blogPost: params.get('blogPost'),
      };
      const pathChanged = path !== pathname;
      window.history[pathChanged ? 'pushState' : 'replaceState'](historySnapshot, '', fullPath);
    }
  }, []);

  /**
   * Generate a shareable URL for a given state
   */
  const getShareableUrl = useCallback((state: UrlState): string => {
    const base = window.location.origin;
    let path = buildPathFromUrlState(state);

    const params = new URLSearchParams();

    if (state.state) {
      applyYearAndScopedQueryParams(params, state);
    }

    if (state.tab && isPersistedElectionTabValue(state.tab)) {
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

    if (state.pane) {
      params.set('pane', state.pane);
    }
    if (state.paneView) {
      params.set('paneView', state.paneView);
    }
    if (state.paneParty) {
      params.set('paneParty', state.paneParty);
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
      const searchParams =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const blogPostToSync =
        blogOpen && searchParams?.get('blogPost') ? searchParams.get('blogPost') : null;

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
        // Parliament-contribution mode (toolbar / selectedACPCYear): React must win over a stale
        // numeric ?year= in the address bar. Otherwise getACResult sets assembly year (e.g. 2021),
        // the effect re-runs with ?year=2021, and this branch used to force pcYearToUse=null —
        // replacing ?year=pc-2024 with ?year=2021.
        if (selectedPCYear != null) {
          pcYearToUse = selectedPCYear;
          yearToUse = null;
        } else {
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
      }
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: yearToUse,
        pcYear: pcYearToUse,
        showACs: currentPC ? (showACsWithinPC ?? true) : null,
        blog: blogOpen,
        blogPost: blogPostToSync,
        pane: leftPane,
        paneView: leftPaneView,
        paneParty: leftPaneParty,
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
    blogOpen,
    leftPane,
    leftPaneView,
    leftPaneParty,
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
