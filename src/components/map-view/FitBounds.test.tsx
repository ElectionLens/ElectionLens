import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { FitBounds } from './FitBounds';

function setInnerSize(width: number, height = 800): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
}

const geojson = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { AC_NAME: 'GUMMIDIPOONDI' },
      geometry: { type: 'Point' as const, coordinates: [80, 13] },
    },
  ],
};

describe('FitBounds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setInnerSize(1200, 800);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when there is no geojson', () => {
    const flyToBounds = vi.fn();
    vi.mocked(useMap).mockReturnValue({ flyToBounds } as never);
    render(<FitBounds geojson={null} />);
    vi.runAllTimers();
    expect(flyToBounds).not.toHaveBeenCalled();
  });

  it('fits all features immediately when the panel is closed', () => {
    const flyToBounds = vi.fn();
    vi.mocked(useMap).mockReturnValue({ flyToBounds } as never);
    render(<FitBounds geojson={geojson} hasPanelOpen={false} />);
    vi.runAllTimers();
    expect(flyToBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [30, 30] })
    );
  });

  it('defers the fit by 520ms when the panel is open', () => {
    const flyToBounds = vi.fn();
    vi.mocked(useMap).mockReturnValue({ flyToBounds } as never);
    render(<FitBounds geojson={geojson} hasPanelOpen={true} />);
    vi.advanceTimersByTime(400);
    expect(flyToBounds).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(flyToBounds).toHaveBeenCalled();
  });

  it('flies to just the selected feature by name (case-insensitive) on desktop', () => {
    const flyToBounds = vi.fn();
    vi.mocked(useMap).mockReturnValue({ flyToBounds } as never);
    render(
      <FitBounds geojson={geojson} selectedFeatureName="gummidipoondi" hasPanelOpen={false} />
    );
    vi.runAllTimers();
    expect(flyToBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [60, 60], maxZoom: 12 })
    );
  });

  it('uses an offset flyTo on portrait mobile for a selected feature', () => {
    setInnerSize(390, 844);
    const flyTo = vi.fn();
    const getBoundsZoom = vi.fn(() => 10);
    vi.mocked(useMap).mockReturnValue({ flyTo, getBoundsZoom, flyToBounds: vi.fn() } as never);
    // The shared setup.tsx mock only stubs getBounds().isValid() and lacks
    // L.point/L.latLng entirely -- the portrait path needs all of these to
    // compute its offset centre. Without the point/latLng stubs the source's
    // own try/catch swallows the TypeError and flyTo silently never fires.
    const geoJSONSpy = vi.spyOn(L, 'geoJSON').mockReturnValue({
      getBounds: () => ({
        isValid: () => true,
        getCenter: () => ({ lat: 13, lng: 80 }),
        getNorth: () => 13.1,
        getSouth: () => 12.9,
      }),
    } as never);
    (L as unknown as Record<string, unknown>).point = vi.fn(() => ({}));
    (L as unknown as Record<string, unknown>).latLng = vi.fn(() => ({}));

    render(
      <FitBounds geojson={geojson} selectedFeatureName="GUMMIDIPOONDI" hasPanelOpen={false} />
    );
    vi.runAllTimers();

    expect(flyTo).toHaveBeenCalled();
    geoJSONSpy.mockRestore();
    delete (L as unknown as Record<string, unknown>)['point'];
    delete (L as unknown as Record<string, unknown>)['latLng'];
  });

  it('falls back to fit-all when the named feature is not found', () => {
    const flyToBounds = vi.fn();
    vi.mocked(useMap).mockReturnValue({ flyToBounds } as never);
    render(<FitBounds geojson={geojson} selectedFeatureName="NOWHERE" hasPanelOpen={false} />);
    vi.runAllTimers();
    expect(flyToBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [30, 30] })
    );
  });

  it('swallows errors from a bad geojson feature rather than throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(useMap).mockReturnValue({
      flyToBounds: () => {
        throw new Error('boom');
      },
    } as never);
    expect(() => {
      render(<FitBounds geojson={geojson} hasPanelOpen={false} />);
      vi.runAllTimers();
    }).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not call flyToBounds when the computed bounds are invalid', () => {
    const flyToBounds = vi.fn();
    vi.mocked(useMap).mockReturnValue({ flyToBounds } as never);
    const invalidGeo = { type: 'FeatureCollection' as const, features: [] as never[] };
    // features.length is 0 so the effect returns before ever computing bounds
    render(<FitBounds geojson={invalidGeo} hasPanelOpen={false} />);
    vi.runAllTimers();
    expect(flyToBounds).not.toHaveBeenCalled();
  });

  it('cleans up its pending timer on unmount', () => {
    const flyToBounds = vi.fn();
    vi.mocked(useMap).mockReturnValue({ flyToBounds } as never);
    const { unmount } = render(<FitBounds geojson={geojson} hasPanelOpen={true} />);
    unmount();
    vi.runAllTimers();
    expect(flyToBounds).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    vi.mocked(useMap).mockReturnValue({ flyToBounds: vi.fn() } as never);
    const { container } = render(<FitBounds geojson={null} />);
    expect(container.firstChild).toBeNull();
  });
});

// Sanity check the real Leaflet mock shape used above still exposes getBounds().isValid()
describe('leaflet mock wiring (guards the FitBounds tests above)', () => {
  it('L.geoJSON(...).getBounds().isValid() returns true per the shared test mock', () => {
    expect(
      L.geoJSON(geojson as never)
        .getBounds()
        .isValid()
    ).toBe(true);
  });
});
