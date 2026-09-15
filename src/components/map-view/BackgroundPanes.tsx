import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Background context (other states / PCs / districts) must render *below* the primary
 * GeoJSON on overlayPane (z-index 400). A pane at 450 was above overlay and painted
 * neighbors on top of the current state’s constituencies.
 */
export function BackgroundPanes(): null {
  const map = useMap();

  useEffect(() => {
    let pane = map.getPane('backgroundPane');
    if (!pane) {
      pane = map.createPane('backgroundPane');
      pane.style.pointerEvents = 'auto';
    }
    pane.style.zIndex = '360';
  }, [map]);

  return null;
}
