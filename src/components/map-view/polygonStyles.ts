/**
 * The shared visual vocabulary of the map polygons.
 *
 * These two styles were written out as inline object literals all over
 * MapView - the selected-AC green in five separate places, plus a sixth
 * spot that hardcoded its `weight: 4` as a magic number used to detect
 * "is this layer currently selected?". A highlight colour copied six
 * times is a highlight colour that eventually disagrees with itself.
 */
import type { PathOptions } from 'leaflet';
import { getPartyColor } from '../../utils/partyData';

/**
 * Dark green outline marking the currently selected assembly constituency.
 *
 * Re-applied from several code paths on purpose: Leaflet restyles layers
 * imperatively, and different effects (hover restore, winner recolouring,
 * GeoJSON remount) can each repaint over the selection.
 *
 * Frozen because every call site now shares this one object rather than
 * building its own literal - a stray mutation would silently change the
 * selection highlight everywhere at once.
 */
export const SELECTED_ASSEMBLY_STYLE: Readonly<PathOptions> = Object.freeze({
  weight: 4,
  color: '#065f46',
  fillOpacity: 0.75,
  opacity: 1,
});

/**
 * How "is this layer the selected one?" is detected from live Leaflet
 * options. Weight 4 is unique to the selected AC within the assemblies
 * layer, so it doubles as a marker - kept next to the style that sets it
 * so the two cannot drift apart.
 */
export const SELECTED_ASSEMBLY_WEIGHT = SELECTED_ASSEMBLY_STYLE.weight;

/** Solid party-colour fill used once a polygon's winning party is known. */
export function partyFillStyle(party: string): PathOptions {
  return {
    fillColor: getPartyColor(party),
    fillOpacity: 0.7,
    color: '#fff',
    weight: 1.5,
    opacity: 1,
  };
}
