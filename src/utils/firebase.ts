import { initializeApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getAnalytics, Analytics, logEvent, setCurrentScreen } from 'firebase/analytics';
import { getFirestore, collection, addDoc, Firestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let db: Firestore | null = null;

// Production Firebase config (safe to expose - security comes from Firestore rules)
const PROD_FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyCTgdX62xH-GTBucB1ebQ-wb4oFhWHa4tU',
  authDomain: 'electionlens.firebaseapp.com',
  projectId: 'electionlens',
  storageBucket: 'electionlens.firebasestorage.app',
  messagingSenderId: '1067390497294',
  appId: '1:1067390497294:web:2492e8b9839eb50eb8825f',
  measurementId: 'G-BZ4GKH5YDV',
};

/**
 * Initialize Firebase app and analytics
 * Uses environment variables if available, falls back to production config
 */
export function initializeFirebase(): void {
  // Try environment variables first, fall back to production config
  const apiKey = import.meta.env['VITE_FIREBASE_API_KEY'] || PROD_FIREBASE_CONFIG.apiKey;
  const projectId = import.meta.env['VITE_FIREBASE_PROJECT_ID'] || PROD_FIREBASE_CONFIG.projectId;

  // Only initialize if we have the required config
  if (!apiKey || !projectId) {
    console.log('Firebase config not found, analytics disabled');
    return;
  }

  const firebaseConfig: FirebaseOptions = {
    apiKey,
    authDomain: import.meta.env['VITE_FIREBASE_AUTH_DOMAIN'] || PROD_FIREBASE_CONFIG.authDomain,
    projectId,
    storageBucket:
      import.meta.env['VITE_FIREBASE_STORAGE_BUCKET'] || PROD_FIREBASE_CONFIG.storageBucket,
    messagingSenderId:
      import.meta.env['VITE_FIREBASE_MESSAGING_SENDER_ID'] ||
      PROD_FIREBASE_CONFIG.messagingSenderId,
    appId: import.meta.env['VITE_FIREBASE_APP_ID'] || PROD_FIREBASE_CONFIG.appId,
    measurementId:
      import.meta.env['VITE_FIREBASE_MEASUREMENT_ID'] || PROD_FIREBASE_CONFIG.measurementId,
  };

  try {
    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    db = getFirestore(app);
    console.log('Firebase initialized (Analytics + Firestore)');
  } catch (error) {
    console.warn('Failed to initialize Firebase:', error);
  }
}

/**
 * Check if Firebase is initialized
 */
export function isFirebaseInitialized(): boolean {
  return app !== null && db !== null;
}

/**
 * Track a page view event
 * @param pagePath - The path of the page (e.g., "/tamil-nadu/pc/chennai-north")
 * @param pageTitle - The title of the page
 */
export function trackPageView(pagePath: string, pageTitle: string): void {
  if (!analytics) return;

  try {
    setCurrentScreen(analytics, pageTitle);
    logEvent(analytics, 'page_view', {
      page_path: pagePath,
      page_title: pageTitle,
      page_location: window.location.href,
    });
  } catch (error) {
    console.warn('Failed to track page view:', error);
  }
}

/**
 * Track a custom event
 * @param eventName - Name of the event
 * @param eventParams - Optional parameters for the event
 */
export function trackEvent(
  eventName: string,
  eventParams?: Record<string, string | number | boolean>
): void {
  if (!analytics) return;

  try {
    logEvent(analytics, eventName, eventParams);
  } catch (error) {
    console.warn('Failed to track event:', error);
  }
}

/**
 * Track constituency selection
 */
export function trackConstituencySelect(
  type: 'state' | 'district' | 'pc' | 'assembly',
  name: string,
  state?: string
): void {
  trackEvent('select_content', {
    content_type: type,
    content_id: name,
    ...(state && { state }),
  });
}

/**
 * Track election year change
 */
export function trackYearChange(year: number, constituencyName: string): void {
  trackEvent('select_year', {
    year,
    constituency: constituencyName,
  });
}

/**
 * Track share action
 */
export function trackShare(method: 'copy_link' | 'twitter', contentType: string): void {
  trackEvent('share', {
    method,
    content_type: contentType,
  });
}

/**
 * Track search usage
 */
export function trackSearch(searchTerm: string, resultCount: number): void {
  trackEvent('search', {
    search_term: searchTerm,
    result_count: resultCount,
  });
}

/**
 * Feedback types
 */
export type FeedbackType = 'bug' | 'feature' | 'data_issue' | 'other';

export interface FeedbackData {
  type: FeedbackType;
  message: string;
  email?: string | undefined;
  currentUrl: string;
  userAgent: string;
  timestamp: Date;
}

/**
 * Submit feedback to Firestore
 */
export async function submitFeedback(
  type: FeedbackType,
  message: string,
  email?: string
): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: 'Firebase not initialized' };
  }

  try {
    const feedbackData: FeedbackData = {
      type,
      message,
      email: email || undefined,
      currentUrl: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date(),
    };

    await addDoc(collection(db, 'feedback'), feedbackData);

    // Track the feedback submission
    trackEvent('submit_feedback', { type });

    return { success: true };
  } catch (error) {
    console.error('Failed to submit feedback:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
