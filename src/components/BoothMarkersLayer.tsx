import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { BoothWithResult } from '../hooks/useBoothData';
import { getPartyColor } from '../utils/partyData';

interface BoothMarkersLayerProps {
  booths: BoothWithResult[];
  onBoothClick?: (boothId: string) => void;
  visible?: boolean;
}

/**
 * Layer component that renders booth markers on the map
 * Uses CircleMarkers colored by winning party
 */
export function BoothMarkersLayer({
  booths,
  onBoothClick,
  visible = true,
}: BoothMarkersLayerProps): null {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!visible) {
      // Remove layer if not visible
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
      return;
    }

    // Create layer group if it doesn't exist
    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup();
      layerGroupRef.current.addTo(map);
    }

    const layerGroup = layerGroupRef.current;

    // Clear existing markers
    layerGroup.clearLayers();

    // Add markers for each booth with location
    booths.forEach((booth) => {
      if (!booth.location) return;

      const { lat, lng } = booth.location;
      const color = booth.winner ? getPartyColor(booth.winner.party) : '#6b7280';
      const isWomen = booth.type === 'women';

      // Create circle marker
      const marker = L.circleMarker([lat, lng], {
        radius: isWomen ? 8 : 6,
        fillColor: color,
        fillOpacity: 0.8,
        color: isWomen ? '#ec4899' : '#ffffff', // Pink border for women booths
        weight: isWomen ? 2 : 1,
      });

      // Create popup content
      const popupContent = `
        <div style="min-width: 180px; font-family: system-ui, -apple-system, sans-serif;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            Booth ${booth.boothNo}
            ${isWomen ? '<span style="color: #ec4899;" title="Women\'s Booth">👩</span>' : ''}
          </div>
          <div style="font-size: 12px; color: #4b5563; margin-bottom: 8px;">
            ${booth.name}
            ${booth.address && booth.address !== booth.name ? `<br/><span style="color: #6b7280;">${booth.address}</span>` : ''}
          </div>
          ${
            booth.winner
              ? `
            <div style="font-size: 12px; padding: 6px; background: ${color}15; border-radius: 4px; border-left: 3px solid ${color};">
              <div style="font-weight: 600; color: ${color};">
                ${booth.winner.party} - ${booth.winner.percent.toFixed(1)}%
              </div>
              <div style="color: #4b5563; margin-top: 2px;">
                ${booth.result ? `Total: ${booth.result.total.toLocaleString()} votes` : ''}
              </div>
            </div>
          `
              : ''
          }
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'booth-popup',
        maxWidth: 250,
      });

      // Add tooltip for quick view
      marker.bindTooltip(
        `<strong>${booth.boothNo}</strong>${booth.winner ? ` · ${booth.winner.party}` : ''}`,
        {
          direction: 'top',
          offset: [0, -8],
          className: 'booth-tooltip',
        }
      );

      // Add click handler
      if (onBoothClick) {
        marker.on('click', () => {
          onBoothClick(booth.id);
        });
      }

      // Add to layer group
      layerGroup.addLayer(marker);
    });

    // Cleanup on unmount
    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [map, booths, onBoothClick, visible]);

  return null;
}

export default BoothMarkersLayer;
