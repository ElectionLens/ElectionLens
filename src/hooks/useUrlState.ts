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
  // Replace hyphens with spaces, but preserve hyphens before numbers (e.g., indore-1)
  return decodeURIComponent(segment).replace(/-(?!\d)/g, ' ');
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
  isDataReady: boolean = true
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
      }
    }

    // Add query params for year and tab
    // - For AC view with pcYear: year=pc-YYYY (parliament contribution)
    // - For AC view with year: year=YYYY (assembly year)
    // - For PC view with year: year=YYYY (parliament year)
    // - Tab: tab=overview|candidates|booths|postal|analysis
    const params = new URLSearchParams();

    if (state.assembly) {
      if (state.pcYear) {
        params.set('year', `pc-${state.pcYear}`);
      } else if (state.year) {
        params.set('year', String(state.year));
      }
    } else if (state.pc && state.year) {
      // PC view - year is parliament year
      params.set('year', String(state.year));
    }

    if (state.tab) {
      params.set('tab', state.tab);
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
      }
    }

    // Add query params for year and tab
    // - For AC view with pcYear: year=pc-YYYY (parliament contribution)
    // - For AC view with year: year=YYYY (assembly year)
    // - For PC view with year: year=YYYY (parliament year)
    // - Tab: tab=overview|candidates|booths|postal|analysis
    const params = new URLSearchParams();

    if (state.assembly) {
      if (state.pcYear) {
        params.set('year', `pc-${state.pcYear}`);
      } else if (state.year) {
        params.set('year', String(state.year));
      }
    } else if (state.pc && state.year) {
      // PC view - year is parliament year
      params.set('year', String(state.year));
    }

    if (state.tab) {
      params.set('tab', state.tab);
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
      hasNavigatedFromUrl.current = true;
      const urlState = getUrlState();

      // Only navigate if URL has state info
      if (urlState.state) {
        // Mark that we're processing URL navigation to prevent URL updates during this time
        isProcessingUrlNavigation.current = true;

        // Use Promise.resolve to handle both sync and async navigation handlers
        void Promise.resolve(onNavigateRef.current(urlState)).finally(() => {
          // Small delay to ensure all state updates have been processed
          setTimeout(() => {
            isProcessingUrlNavigation.current = false;
            isInitialMount.current = false;
            // Now sync the URL with the final state (in case there were any normalization changes)
            lastUrl.current = window.location.pathname + window.location.search;
          }, 100);
        });
      } else {
        isInitialMount.current = false;
      }
    }
  }, [getUrlState, isDataReady]);

  // Update URL when state changes
  useEffect(() => {
    // Don't update URL during initial mount or while processing URL-based navigation
    if (!isInitialMount.current && !isProcessingUrlNavigation.current) {
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
        year: selectedYear,
        pcYear: selectedPCYear,
        tab: null, // Tab is managed in ElectionResultPanel component
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
