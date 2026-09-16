import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapControls } from './MapControls';

function mockMap(overrides: Record<string, unknown> = {}) {
  const map = {
    eachLayer: vi.fn(),
    removeLayer: vi.fn(),
    // Real Leaflet invokes control.onAdd(map) and appends the returned
    // element to the DOM; the mock has to do the same or MapControls'
    // `document.getElementById('mapLegend')` lookup always misses.
    addControl: vi.fn((control: { onAdd: (map: unknown) => HTMLElement }) => {
      document.body.appendChild(control.onAdd(map));
    }),
    removeControl: vi.fn(),
    ...overrides,
  };
  vi.mocked(useMap).mockReturnValue(map as never);
  return map;
}

describe('MapControls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('registers and cleans up the legend control', () => {
    const map = mockMap();
    const { unmount } = render(<MapControls level="states" name="India" count={36} />);
    expect(map.addControl).toHaveBeenCalledTimes(1);
    unmount();
    expect(map.removeControl).toHaveBeenCalledTimes(1);
  });

  it('populates the legend with the level label, name and count', () => {
    mockMap();
    render(<MapControls level="assemblies" name="Tamil Nadu" count={234} />);
    const legend = document.getElementById('mapLegend');
    expect(legend?.innerHTML).toContain('Assembly View');
    expect(legend?.innerHTML).toContain('Tamil Nadu');
    expect(legend?.innerHTML).toContain('234');
    expect(legend?.innerHTML).toContain('assembly');
  });

  it('omits the count line when count is 0', () => {
    mockMap();
    render(<MapControls level="districts" name="Kerala" count={0} />);
    const legend = document.getElementById('mapLegend');
    expect(legend?.innerHTML).not.toMatch(/0 districts/);
  });

  it('swaps the raster base layer on a changeBaseLayer event', () => {
    const removeLayer = vi.fn();
    const newLayer = { addTo: vi.fn(), bringToBack: vi.fn() };
    vi.spyOn(L, 'tileLayer').mockReturnValue(newLayer as never);
    mockMap({
      eachLayer: (cb: (layer: unknown) => void) => cb(new L.TileLayer()),
      removeLayer,
    });

    render(<MapControls level="states" name="India" count={36} />);
    window.dispatchEvent(new CustomEvent('changeBaseLayer', { detail: 'Satellite' }));

    expect(removeLayer).toHaveBeenCalled();
    expect(newLayer.addTo).toHaveBeenCalled();
    expect(newLayer.bringToBack).toHaveBeenCalled();
  });

  it('removes the raster layer without adding a new one when switching to Vector', () => {
    const removeLayer = vi.fn();
    mockMap({
      eachLayer: (cb: (layer: unknown) => void) => cb(new L.TileLayer()),
      removeLayer,
    });
    render(<MapControls level="states" name="India" count={36} />);
    window.dispatchEvent(new CustomEvent('changeBaseLayer', { detail: 'Vector' }));
    expect(removeLayer).toHaveBeenCalledTimes(1);
  });

  it('falls back to Streets for an unknown layer name', () => {
    const newLayer = { addTo: vi.fn(), bringToBack: vi.fn() };
    vi.spyOn(L, 'tileLayer').mockReturnValue(newLayer as never);
    mockMap({ eachLayer: vi.fn() });
    render(<MapControls level="states" name="India" count={36} />);
    window.dispatchEvent(new CustomEvent('changeBaseLayer', { detail: 'Bogus' }));
    expect(newLayer.addTo).toHaveBeenCalled();
  });

  it('unregisters its window event listener on unmount', () => {
    mockMap();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<MapControls level="states" name="India" count={36} />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('changeBaseLayer', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('renders nothing to the DOM itself (legend is a Leaflet control, not React output)', () => {
    mockMap();
    const { container } = render(<MapControls level="states" name="India" count={36} />);
    expect(container.firstChild).toBeNull();
  });
});
