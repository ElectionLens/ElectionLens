import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PathOptions } from 'leaflet';
import { createStandardHoverHandlers } from './hoverHandlers';
import type { FeatureLayer } from './backgroundLayerHandlers';

const HOVER: PathOptions = { weight: 3, color: '#333', fillOpacity: 0.8 };
const BASE: PathOptions = {
  fillColor: '#abc',
  fillOpacity: 0.6,
  color: '#fff',
  weight: 1,
  opacity: 0.85,
};

/** Fake layer whose `options` track setStyle, the way Leaflet's do. */
function makeLayer(initial: PathOptions = BASE): FeatureLayer & {
  options: PathOptions;
  styles: PathOptions[];
} {
  const layer = {
    options: { ...initial },
    styles: [] as PathOptions[],
    setStyle(style: PathOptions) {
      this.styles.push(style);
      Object.assign(this.options, style);
    },
    bringToFront: vi.fn(),
    on: vi.fn(),
    bindTooltip: vi.fn(),
    unbindTooltip: vi.fn(),
    openTooltip: vi.fn(),
    closeTooltip: vi.fn(),
    getTooltip: vi.fn(),
  };
  return layer as unknown as FeatureLayer & { options: PathOptions; styles: PathOptions[] };
}

describe('createStandardHoverHandlers', () => {
  let hoveredLayerRef: { current: FeatureLayer | null };

  beforeEach(() => {
    hoveredLayerRef = { current: null };
  });

  it('applies the hover style and claims the hovered ref', () => {
    const layer = makeLayer();
    const { mouseover } = createStandardHoverHandlers(layer, HOVER, hoveredLayerRef);
    mouseover();
    expect(layer.styles.at(-1)).toEqual(HOVER);
    expect(hoveredLayerRef.current).toBe(layer);
  });

  it('restores the pre-hover appearance on mouseout', () => {
    const layer = makeLayer();
    const { mouseover, mouseout } = createStandardHoverHandlers(layer, HOVER, hoveredLayerRef);
    mouseover();
    mouseout();
    expect(layer.styles.at(-1)).toEqual(BASE);
    expect(hoveredLayerRef.current).toBeNull();
  });

  it('reads the base style off live options, not a style function', () => {
    // the focused layer can be restyled imperatively (selection, dimming),
    // so whatever is currently on the layer is what must come back
    const layer = makeLayer({ ...BASE, fillColor: '#f00' });
    const { mouseover, mouseout } = createStandardHoverHandlers(layer, HOVER, hoveredLayerRef);
    mouseover();
    mouseout();
    expect(layer.styles.at(-1)).toMatchObject({ fillColor: '#f00' });
  });

  it('does not memoise the hover style as the base on repeated mouseover', () => {
    // guards the isAlreadyHover check: without it the polygon would be
    // stuck looking hovered forever
    const layer = makeLayer();
    const { mouseover, mouseout } = createStandardHoverHandlers(layer, HOVER, hoveredLayerRef);
    mouseover();
    mouseover();
    mouseout();
    expect(layer.styles.at(-1)).toEqual(BASE);
  });

  it('restores the previously hovered layer when another is hovered', () => {
    const first = makeLayer();
    const second = makeLayer();
    createStandardHoverHandlers(first, HOVER, hoveredLayerRef).mouseover();
    createStandardHoverHandlers(second, HOVER, hoveredLayerRef).mouseover();

    expect(first.styles.at(-1)).toEqual(BASE);
    expect(hoveredLayerRef.current).toBe(second);
  });

  it('leaves the ref alone on mouseout if another layer now owns it', () => {
    const layer = makeLayer();
    const other = makeLayer();
    const { mouseout } = createStandardHoverHandlers(layer, HOVER, hoveredLayerRef);
    hoveredLayerRef.current = other;
    mouseout();
    expect(hoveredLayerRef.current).toBe(other);
  });

  it('does nothing on mouseout if no base style was ever stashed', () => {
    const layer = makeLayer();
    const { mouseout } = createStandardHoverHandlers(layer, HOVER, hoveredLayerRef);
    mouseout();
    expect(layer.styles).toHaveLength(0);
  });
});
