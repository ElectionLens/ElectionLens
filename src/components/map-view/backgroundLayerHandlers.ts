/**
 * Shared behaviour for the "background" map layers - the other PCs or
 * districts drawn around whichever one you're currently looking at.
 *
 * The PC and district versions of this were byte-for-byte identical apart
 * from three substitutions (how the name is read off the feature, which
 * hover colour the level uses, and which navigation callback fires), so
 * they are built from one factory here.
 *
 * The background *states* layer deliberately does NOT use this: it has
 * tooltip and click but no hover styling at all. Routing it through here
 * would mean either adding hover it never had, or a `withHover` flag that
 * exists only to switch off the thing the factory is for.
 */
import L from 'leaflet';
import type { Layer, LeafletMouseEvent as LLeafletMouseEvent } from 'leaflet';
import type { Feature } from 'geojson';
import type { MutableRefObject } from 'react';
import { getHoverStyle } from '../../utils/helpers';
import type { MapLevel } from '../../types';

/** The subset of Leaflet's layer API these handlers actually touch. */
export interface FeatureLayer {
  feature?: Feature;
  setStyle: (style: object) => void;
  bringToFront: () => void;
  on: (eventMap: Record<string, (e: LLeafletMouseEvent) => void>) => void;
  bindTooltip: (content: string, options?: L.TooltipOptions) => FeatureLayer;
  unbindTooltip: () => FeatureLayer;
  openTooltip: () => FeatureLayer;
  closeTooltip: () => FeatureLayer;
  getTooltip: () => L.Tooltip | undefined;
}

/**
 * Fill/stroke shared by every background layer. Was repeated inline as a
 * local `base` object in all three background style callbacks.
 */
export const BACKGROUND_LAYER_BASE_STYLE: L.PathOptions = {
  fillOpacity: 0.6,
  color: '#fff',
  weight: 1,
  opacity: 0.85,
};

/** Where the previously-hovered layer is remembered so it can be restored. */
type HoveredLayerRef = MutableRefObject<FeatureLayer | null>;

interface BackgroundLayerHandlerConfig<F extends Feature> {
  /** Drives the hover border colour via getHoverStyle. */
  level: MapLevel;
  /** Pull the display/navigation name out of the feature. */
  getName: (feature: Feature) => string;
  /** Base style to restore on mouseout, and to stash before hovering. */
  getStyle: (feature: Feature) => L.PathOptions;
  /** Navigate to the clicked region. */
  onSelect: (name: string, feature: F) => void;
  /** Shared across layers so only one can be hovered at a time. */
  hoveredLayerRef: HoveredLayerRef;
}

/** Leaflet stashes the pre-hover style on the layer so mouseout can restore it. */
type StyleCache = { _baseStyle?: L.PathOptions };

export function createBackgroundLayerHandler<F extends Feature>({
  level,
  getName,
  getStyle,
  onSelect,
  hoveredLayerRef,
}: BackgroundLayerHandlerConfig<F>): (feature: Feature, layer: Layer) => void {
  return (feature: Feature, layer: Layer): void => {
    const typedLayer = layer as unknown as FeatureLayer;
    const name = getName(feature);

    typedLayer.bindTooltip(`Go to ${name}`, {
      permanent: false,
      direction: 'center',
      className: 'hover-tooltip background-state-tooltip',
    });

    const hoverStyle = getHoverStyle(level);
    typedLayer.on({
      mouseover: (): void => {
        // Restore whichever layer was hovered before this one - layers are
        // separate Leaflet panes, so they get no mouseout from each other.
        const prev = hoveredLayerRef.current;
        if (prev && prev !== typedLayer) {
          const baseStyle = (prev as unknown as StyleCache)._baseStyle;
          if (baseStyle) prev.setStyle(baseStyle);
        }
        hoveredLayerRef.current = typedLayer;
        (typedLayer as unknown as StyleCache)._baseStyle = getStyle(feature);
        typedLayer.setStyle(hoverStyle);
        typedLayer.bringToFront();
      },
      mouseout: (): void => {
        typedLayer.setStyle(getStyle(feature));
        if (hoveredLayerRef.current === typedLayer) hoveredLayerRef.current = null;
      },
      click: (e: LLeafletMouseEvent): void => {
        // Stop propagation so the focused layer underneath doesn't also fire.
        L.DomEvent.stopPropagation(e);
        onSelect(name, feature as F);
      },
    });
  };
}
