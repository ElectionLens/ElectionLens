import { useEffect, useCallback, useRef } from 'react';
import type { ViewMode } from '../types';

/** URL state shape */
export interface UrlState {
  state: string | null;
  view: ViewMode;
  pc: string | null;
  district: string | null;
  assembly: string | null;
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
 * Encode a value for URL path segment
 */
function encodePathSegment(value: string): string {
  return encodeURIComponent(value.toLowerCase().replace(/\s+/g, '-'));
}

/**
 * Decode a URL path segment
 */
function decodePathSegment(segment: string): string {
  return decodeURIComponent(segment).replace(/-/g, ' ');
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
  onNavigate: (state: UrlState) => void | Promise<void>,
  isDataReady: boolean = true
): UseUrlStateReturn {
  const isInitialMount = useRef(true);
  const hasNavigatedFromUrl = useRef(false);
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

    const result: UrlState = {
      state: null,
      view: 'constituencies',
      pc: null,
      district: null,
      assembly: null,
    };

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
    } else if (secondSegment === 'pc' && segments[2]) {
      result.pc = decodePathSegment(segments[2]);
      // Check for assembly: /state/pc/pc-name/ac/ac-name
      if (segments[3]?.toLowerCase() === 'ac' && segments[4]) {
        result.assembly = decodePathSegment(segments[4]);
      }
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
      } else if (state.view === 'districts') {
        path += '/districts';
      }
    }

    // Only update if path changed
    if (path !== lastUrl.current) {
      lastUrl.current = path;
      window.history.pushState({ ...state }, '', path);
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
      } else if (state.view === 'districts') {
        path += '/districts';
      }
    }

    return `${base}${path}`;
  }, []);

  // Handle initial URL on mount - wait for data to be ready
  useEffect(() => {
    if (isDataReady && !hasNavigatedFromUrl.current) {
      hasNavigatedFromUrl.current = true;
      isInitialMount.current = false;
      const urlState = getUrlState();

      // Only navigate if URL has state info
      if (urlState.state) {
        onNavigateRef.current(urlState);
      }
    }
  }, [getUrlState, isDataReady]);

  // Update URL when state changes
  useEffect(() => {
    if (!isInitialMount.current) {
      updateUrl({
        state: currentState,
        view: currentView,
        pc: currentPC,
        district: currentDistrict,
        assembly: currentAssembly,
      });
    }
  }, [currentState, currentView, currentPC, currentDistrict, currentAssembly, updateUrl]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (): void => {
      const urlState = getUrlState();
      onNavigateRef.current(urlState);
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
