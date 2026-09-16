/**
 * Hover behaviour for the focused (foreground) map layer.
 *
 * The states, districts and constituencies branches of onEachFeature each
 * carried a byte-identical ~33-line copy of this, differing only in which
 * level string they passed to getHoverStyle. The assemblies branch used
 * the same mouseover and then added guards of its own.
 *
 * This differs from the background-layer handler in one important way:
 * background layers recompute their base style from a style function,
 * whereas here the pre-hover appearance is read off the layer's live
 * Leaflet options and stashed, because the focused layer's style can have
 * been changed imperatively by other code paths (selection, dimming).
 */
import type { PathOptions } from 'leaflet';
import type { MutableRefObject } from 'react';
import type { FeatureLayer } from './backgroundLayerHandlers';

/** Leaflet keeps the live style here; we stash a copy to restore on mouseout. */
type LayerWithOptions = { options: PathOptions };
type StyleCache = { _baseStyle?: PathOptions };

export interface HoverHandlers {
  mouseover: () => void;
  mouseout: () => void;
}

export function createStandardHoverHandlers(
  typedLayer: FeatureLayer,
  hoverStyle: PathOptions,
  hoveredLayerRef: MutableRefObject<FeatureLayer | null>
): HoverHandlers {
  const layerWithOpts = typedLayer as unknown as LayerWithOptions;
  const styleCache = typedLayer as unknown as StyleCache;

  return {
    mouseover: (): void => {
      // Layers sit in separate panes and get no mouseout from one another,
      // so whoever was hovered last has to be put back manually.
      const prev = hoveredLayerRef.current;
      if (prev && prev !== typedLayer) {
        const prevBase = (prev as unknown as StyleCache)._baseStyle;
        if (prevBase) prev.setStyle(prevBase);
      }
      hoveredLayerRef.current = typedLayer;

      // Only stash when the live options aren't already the hover style -
      // re-entering during a hover would otherwise memoise the hover
      // appearance as the base and the polygon could never return.
      const opts = layerWithOpts.options;
      const isAlreadyHover = opts.weight === hoverStyle.weight && opts.color === hoverStyle.color;
      if (!isAlreadyHover) {
        styleCache._baseStyle = {
          fillColor: opts.fillColor,
          fillOpacity: opts.fillOpacity,
          color: opts.color,
          weight: opts.weight,
          opacity: opts.opacity,
        };
      }

      typedLayer.setStyle(hoverStyle);
      typedLayer.bringToFront();
    },

    mouseout: (): void => {
      const baseStyle = styleCache._baseStyle;
      if (baseStyle) typedLayer.setStyle(baseStyle);
      if (hoveredLayerRef.current === typedLayer) hoveredLayerRef.current = null;
    },
  };
}
