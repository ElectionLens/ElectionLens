import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { FitBoundsProps, AssemblyProperties } from '../../types';

interface ExtendedFitBoundsProps extends FitBoundsProps {
  selectedFeatureName?: string | null;
  /** When true, defer fit until after panel transition so borders don't shift during animation */
  hasPanelOpen?: boolean;
}

/**
 * Get padding for map bounds based on screen size
 * Portrait mobile: panel overlays map, need offset to push feature up
 * Landscape/Desktop: map shrinks, standard padding works
 */
function getMapPadding(hasSelectedFeature: boolean): L.FitBoundsOptions['padding'] {
  const isMobile = window.innerWidth <= 768;

  if (hasSelectedFeature) {
    // Landscape & Desktop: map shrinks with margin-right, standard padding
    return isMobile ? ([40, 40] as [number, number]) : ([60, 60] as [number, number]);
  }

  // Default padding for fitting all features
  return isMobile ? ([20, 20] as [number, number]) : ([30, 30] as [number, number]);
}

/** Wait for panel/map-container transition before fitting so borders don't shift in any view */
const FIT_DEFER_MS_WHEN_PANEL_OPEN = 520;

/**
 * Component to fit map bounds to GeoJSON data or selected feature.
 * When the panel is open, defers the fly until after the panel transition (all views:
 * states, constituencies, districts, assemblies) so the map container is stable and borders don't shift.
 */
export function FitBounds({
  geojson,
  selectedFeatureName,
  hasPanelOpen = false,
}: ExtendedFitBoundsProps): null {
  const map = useMap();

  useEffect(() => {
    if (!geojson?.features?.length) return;

    const runFit = (): void => {
      try {
        // If a feature is selected, zoom to just that feature
        if (selectedFeatureName) {
          const selectedFeature = geojson.features.find((f) => {
            const props = f.properties as AssemblyProperties;
            return props.AC_NAME?.toUpperCase() === selectedFeatureName.toUpperCase();
          });

          if (selectedFeature) {
            const featureLayer = L.geoJSON(selectedFeature as GeoJSON.Feature);
            const bounds = featureLayer.getBounds();
            if (bounds.isValid()) {
              const isMobile = window.innerWidth <= 768;
              const isLandscape = window.innerWidth > window.innerHeight;

              if (isMobile && !isLandscape) {
                // Portrait mobile: offset center to push feature into top portion
                const center = bounds.getCenter();
                const latSpan = bounds.getNorth() - bounds.getSouth();
                const offsetCenter = L.latLng(center.lat - latSpan * 0.4, center.lng);

                const zoom = map.getBoundsZoom(bounds, false, L.point(30, 30));
                const targetZoom = Math.min(zoom - 0.5, 11);

                map.flyTo(offsetCenter, targetZoom, { duration: 0.5 });
              } else {
                map.flyToBounds(bounds as LatLngBoundsExpression, {
                  padding: [60, 60],
                  duration: 0.5,
                  maxZoom: 12,
                });
              }
            }
            return;
          }
        }

        // Default: fit to all features
        const layer = L.geoJSON(geojson as GeoJSON.FeatureCollection);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          const padding = getMapPadding(false);
          map.flyToBounds(bounds as LatLngBoundsExpression, { padding, duration: 0.5 });
        }
      } catch (e) {
        console.warn('Failed to fit bounds:', e);
      }
    };

    // In all views: when panel is open, wait for panel transition so borders don't shift
    const delayMs = hasPanelOpen ? FIT_DEFER_MS_WHEN_PANEL_OPEN : 0;
    const timer = setTimeout(runFit, delayMs);
    return () => clearTimeout(timer);
  }, [map, geojson, selectedFeatureName, hasPanelOpen]);

  return null;
}
