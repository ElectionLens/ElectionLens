import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from 'geojson';
import {
  createBackgroundLayerHandler,
  BACKGROUND_LAYER_BASE_STYLE,
  type FeatureLayer,
} from './backgroundLayerHandlers';

vi.mock('leaflet', () => ({
  default: { DomEvent: { stopPropagation: vi.fn() } },
}));

type Handlers = Record<string, (e: unknown) => void>;

/** Minimal stand-in for a Leaflet layer, recording what was done to it. */
function makeLayer(): FeatureLayer & { handlers: Handlers; styles: object[]; tooltip?: string } {
  const layer = {
    handlers: {} as Handlers,
    styles: [] as object[],
    tooltip: undefined as string | undefined,
    setStyle(style: object) {
      this.styles.push(style);
    },
    bringToFront: vi.fn(),
    on(map: Handlers) {
      Object.assign(this.handlers, map);
    },
    bindTooltip(content: string) {
      this.tooltip = content;
      return this as unknown as FeatureLayer;
    },
    unbindTooltip: vi.fn(),
    openTooltip: vi.fn(),
    closeTooltip: vi.fn(),
    getTooltip: vi.fn(),
  };
  return layer as unknown as FeatureLayer & {
    handlers: Handlers;
    styles: object[];
    tooltip?: string;
  };
}

const feature = { type: 'Feature', properties: { name: 'Jaipur' }, geometry: null } as Feature;
const baseStyle = { fillColor: '#abc' };

describe('createBackgroundLayerHandler', () => {
  let hoveredLayerRef: { current: FeatureLayer | null };
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hoveredLayerRef = { current: null };
    onSelect = vi.fn();
  });

  const build = (): ((feature: Feature, layer: never) => void) =>
    createBackgroundLayerHandler({
      level: 'constituencies',
      getName: (f) => String((f.properties as { name: string }).name),
      getStyle: () => baseStyle,
      onSelect,
      hoveredLayerRef,
    });

  it('binds a "Go to <name>" tooltip', () => {
    const layer = makeLayer();
    build()(feature, layer as never);
    expect(layer.tooltip).toBe('Go to Jaipur');
  });

  it('navigates on click with the feature', () => {
    const layer = makeLayer();
    build()(feature, layer as never);
    layer.handlers.click?.({});
    expect(onSelect).toHaveBeenCalledWith('Jaipur', feature);
  });

  it('applies the hover style and takes over the hovered ref', () => {
    const layer = makeLayer();
    build()(feature, layer as never);
    layer.handlers.mouseover?.({});
    expect(hoveredLayerRef.current).toBe(layer);
    // getHoverStyle('constituencies') supplies the purple border
    expect(layer.styles.at(-1)).toMatchObject({ weight: 3, color: '#5b21b6' });
  });

  it('restores the base style on mouseout and releases the ref', () => {
    const layer = makeLayer();
    build()(feature, layer as never);
    layer.handlers.mouseover?.({});
    layer.handlers.mouseout?.({});
    expect(layer.styles.at(-1)).toEqual(baseStyle);
    expect(hoveredLayerRef.current).toBeNull();
  });

  it('restores a previously hovered layer when hovering a different one', () => {
    // the reason the ref is shared: separate panes give each other no mouseout
    const handler = build();
    const first = makeLayer();
    const second = makeLayer();
    handler(feature, first as never);
    handler(feature, second as never);

    first.handlers.mouseover?.({});
    second.handlers.mouseover?.({});

    expect(first.styles.at(-1)).toEqual(baseStyle);
    expect(hoveredLayerRef.current).toBe(second);
  });

  it('leaves the ref alone if some other layer is hovered by mouseout time', () => {
    const handler = build();
    const layer = makeLayer();
    const other = makeLayer();
    handler(feature, layer as never);
    hoveredLayerRef.current = other;

    layer.handlers.mouseout?.({});

    expect(hoveredLayerRef.current).toBe(other);
  });

  it('uses the level to pick the hover colour', () => {
    const layer = makeLayer();
    createBackgroundLayerHandler({
      level: 'districts',
      getName: () => 'Baran',
      getStyle: () => baseStyle,
      onSelect,
      hoveredLayerRef,
    })(feature, layer as never);
    layer.handlers.mouseover?.({});
    expect(layer.styles.at(-1)).toMatchObject({ color: '#333' });
  });
});

describe('BACKGROUND_LAYER_BASE_STYLE', () => {
  it('matches the fill/stroke the background layers were using inline', () => {
    expect(BACKGROUND_LAYER_BASE_STYLE).toEqual({
      fillOpacity: 0.6,
      color: '#fff',
      weight: 1,
      opacity: 0.85,
    });
  });
});
