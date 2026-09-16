import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useMap } from 'react-leaflet';
import { MapResizer } from './MapResizer';

describe('MapResizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invalidates map size without animating, after the panel-transition delay', () => {
    const invalidateSize = vi.fn();
    vi.mocked(useMap).mockReturnValue({ invalidateSize } as never);

    render(<MapResizer hasPanelOpen={true} />);
    expect(invalidateSize).not.toHaveBeenCalled();

    vi.advanceTimersByTime(520);
    expect(invalidateSize).toHaveBeenCalledWith({ animate: false });
  });

  it('re-arms the timer when hasPanelOpen changes', () => {
    const invalidateSize = vi.fn();
    vi.mocked(useMap).mockReturnValue({ invalidateSize } as never);

    const { rerender } = render(<MapResizer hasPanelOpen={false} />);
    rerender(<MapResizer hasPanelOpen={true} />);

    vi.advanceTimersByTime(520);
    // Once per effect run that wasn't cleaned up before firing; here only the
    // latest (post-rerender) effect should have fired.
    expect(invalidateSize).toHaveBeenCalledTimes(1);
  });

  it('clears the pending timer on unmount', () => {
    const invalidateSize = vi.fn();
    vi.mocked(useMap).mockReturnValue({ invalidateSize } as never);

    const { unmount } = render(<MapResizer hasPanelOpen={false} />);
    unmount();
    vi.advanceTimersByTime(600);
    expect(invalidateSize).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    vi.mocked(useMap).mockReturnValue({ invalidateSize: vi.fn() } as never);
    const { container } = render(<MapResizer hasPanelOpen={false} />);
    expect(container.firstChild).toBeNull();
  });
});
