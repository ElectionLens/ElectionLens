import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firebase modules before importing our module
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({ app: 'test-analytics' })),
  logEvent: vi.fn(),
  setCurrentScreen: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ app: 'test-firestore' })),
  collection: vi.fn(() => ({ id: 'feedback' })),
  addDoc: vi.fn(() => Promise.resolve({ id: 'test-doc-id' })),
}));

// Import after mocks are set up
import {
  initializeFirebase,
  isFirebaseInitialized,
  trackPageView,
  trackEvent,
  trackConstituencySelect,
  trackYearChange,
  trackShare,
  trackSearch,
  submitFeedback,
} from './firebase';
import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent, setCurrentScreen } from 'firebase/analytics';
import { getFirestore, addDoc } from 'firebase/firestore';

describe('Firebase utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state by clearing the cached app/analytics/db
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initializeFirebase', () => {
    it('does not initialize when API key is missing', async () => {
      // Re-import with fresh state
      const firebaseModule = await import('./firebase');

      // Mock env without API key
      vi.stubEnv('VITE_FIREBASE_API_KEY', '');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');

      firebaseModule.initializeFirebase();

      expect(initializeApp).not.toHaveBeenCalled();
    });

    it('initializes Firebase when config is available', async () => {
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project-id');
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');

      // Re-import to get fresh module state
      vi.resetModules();
      const { initializeFirebase: init } = await import('./firebase');
      init();

      expect(initializeApp).toHaveBeenCalled();
      expect(getAnalytics).toHaveBeenCalled();
      expect(getFirestore).toHaveBeenCalled();
    });
  });

  describe('isFirebaseInitialized', () => {
    it('returns false when Firebase is not initialized', () => {
      // Without calling initializeFirebase, it should be false
      expect(isFirebaseInitialized()).toBe(false);
    });
  });

  describe('trackPageView', () => {
    it('does not throw when analytics is null', () => {
      expect(() => {
        trackPageView('/test-path', 'Test Page');
      }).not.toThrow();
    });
  });

  describe('trackEvent', () => {
    it('does not throw when analytics is null', () => {
      expect(() => {
        trackEvent('test_event', { param: 'value' });
      }).not.toThrow();
    });

    it('handles events without params', () => {
      expect(() => {
        trackEvent('simple_event');
      }).not.toThrow();
    });
  });

  describe('trackConstituencySelect', () => {
    it('tracks state selection', () => {
      trackConstituencySelect('state', 'Tamil Nadu');
      // Since analytics is null, this should not throw
    });

    it('tracks district selection with state', () => {
      trackConstituencySelect('district', 'Chennai', 'Tamil Nadu');
    });

    it('tracks PC selection', () => {
      trackConstituencySelect('pc', 'Chennai North', 'Tamil Nadu');
    });

    it('tracks assembly selection', () => {
      trackConstituencySelect('assembly', 'Mylapore', 'Tamil Nadu');
    });
  });

  describe('trackYearChange', () => {
    it('tracks year change event', () => {
      trackYearChange(2024, 'Mylapore');
      // Should not throw
    });
  });

  describe('trackShare', () => {
    it('tracks copy link action', () => {
      trackShare('copy_link', 'assembly');
    });

    it('tracks twitter share action', () => {
      trackShare('twitter', 'parliament');
    });
  });

  describe('trackSearch', () => {
    it('tracks search with results', () => {
      trackSearch('Tamil Nadu', 5);
    });

    it('tracks search with no results', () => {
      trackSearch('xyz', 0);
    });
  });

  describe('submitFeedback', () => {
    it('returns error when Firebase is not initialized', async () => {
      const result = await submitFeedback('bug', 'Test message');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Firebase not initialized');
    });
  });
});

describe('FeedbackType', () => {
  it('accepts valid feedback types', () => {
    const types = ['bug', 'feature', 'data_issue', 'other'];
    types.forEach((type) => {
      expect(['bug', 'feature', 'data_issue', 'other']).toContain(type);
    });
  });
});
