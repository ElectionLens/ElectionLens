import { useEffect } from 'react';

interface MetaTagsProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string | undefined;
  type?: 'website' | 'article';
  siteName?: string;
}

const BASE_URL = 'https://electionlens.netlify.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const DEFAULT_TITLE = 'Election Lens - India Electoral Map & Results';
const DEFAULT_DESCRIPTION =
  'Interactive map with detailed Assembly and Parliament election results. Historical data, vote shares, margins and turnout for every constituency.';

/**
 * Update meta tags dynamically for better social media embeds
 */
export function MetaTags({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  siteName = 'Election Lens',
}: MetaTagsProps): null {
  useEffect(() => {
    // Get current URL if not provided
    const currentUrl = url ?? (typeof window !== 'undefined' ? window.location.href : BASE_URL);
    // Add cache-busting parameter to image URL to force refresh
    const imageWithCacheBust = image.startsWith('http')
      ? `${image}?v=1`
      : `${BASE_URL}${image}?v=1`;
    const fullImageUrl = imageWithCacheBust;

    // Update or create meta tags
    const updateMetaTag = (property: string, content: string, isProperty = true): void => {
      const selector = isProperty ? `meta[property="${property}"]` : `meta[name="${property}"]`;
      let element = document.querySelector(selector) as HTMLMetaElement;

      if (!element) {
        element = document.createElement('meta');
        if (isProperty) {
          element.setAttribute('property', property);
        } else {
          element.setAttribute('name', property);
        }
        document.head.appendChild(element);
      }

      element.setAttribute('content', content);
    };

    // Update title
    document.title = title;
    updateMetaTag('title', title, false);

    // Update description
    updateMetaTag('description', description, false);

    // Open Graph tags
    updateMetaTag('og:type', type);
    updateMetaTag('og:url', currentUrl);
    updateMetaTag('og:title', title);
    updateMetaTag('og:description', description);
    updateMetaTag('og:image', fullImageUrl);
    updateMetaTag('og:image:width', '1200');
    updateMetaTag('og:image:height', '630');
    updateMetaTag('og:image:alt', title);
    updateMetaTag('og:site_name', siteName);
    updateMetaTag('og:locale', 'en_IN');

    // Twitter Card tags
    updateMetaTag('twitter:card', 'summary_large_image', false);
    updateMetaTag('twitter:site', '@electionlens', false);
    updateMetaTag('twitter:creator', '@electionlens', false);
    updateMetaTag('twitter:title', title, false);
    updateMetaTag('twitter:description', description, false);
    updateMetaTag('twitter:image', fullImageUrl, false);
    updateMetaTag('twitter:image:alt', title, false);
  }, [title, description, image, url, type, siteName]);

  return null;
}
