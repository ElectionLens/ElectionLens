import type { PathOptions } from 'leaflet';

/** Fill opacity for polygons that are de-emphasized (party filter or non-focused AC / background context). */
export const DIMMED_MAP_FILL_OPACITY = 0.2;

/** Match party-filter dimming: low fill, muted stroke — used for focus dimming and background district/PC layers. */
export function mergeDimmedNonFocusStyle(base: PathOptions): PathOptions {
  return {
    ...base,
    fillOpacity: DIMMED_MAP_FILL_OPACITY,
    opacity: 0.75,
    color: '#94a3b8',
  };
}
