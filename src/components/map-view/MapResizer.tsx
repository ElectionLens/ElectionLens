import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Component to invalidate map size when panel state changes
 * Leaflet needs to be notified when its container size changes
 */
export function MapResizer({ hasPanelOpen }: { hasPanelOpen: boolean }): null {
  const map = useMap();

  useEffect(() => {
    // Delay to let CSS transition complete (0.5s map-container)
    const timer = setTimeout(() => {
      // Don't animate view on resize so borders don't shift during panel transition
      map.invalidateSize({ animate: false });
    }, 520);

    return () => clearTimeout(timer);
  }, [map, hasPanelOpen]);

  return null;
}
