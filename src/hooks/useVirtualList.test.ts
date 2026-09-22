import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { computeVisibleRange, useVirtualList } from './useVirtualList';

describe('computeVisibleRange', () => {
  it('returns an empty range for an empty list', () => {
    expect(computeVisibleRange(0, 400, 40, 0, 6)).toEqual({ start: 0, end: 0 });
  });

  it('returns an empty range when itemHeight is zero or negative', () => {
    expect(computeVisibleRange(0, 400, 0, 100, 6)).toEqual({ start: 0, end: 0 });
  });

  it('windows to roughly the visible viewport at the top of the list', () => {
    const range = computeVisibleRange(0, 400, 40, 900, 6);
    // 400/40 = 10 rows fit; +12 total overscan (6 each side), clamped to 0 at the start.
    expect(range.start).toBe(0);
    expect(range.end).toBe(22);
  });

  it('shifts the window down as scrollTop increases, with overscan on both ends', () => {
    const range = computeVisibleRange(2000, 400, 40, 900, 6);
    // scrollTop=2000 -> first fully visible row index 50, minus 6 overscan = 44.
    expect(range.start).toBe(44);
    // 10 visible rows + 12 total overscan = 22 rows from start.
    expect(range.end).toBe(44 + 22);
  });

  it('clamps the end of the window to itemCount at the very bottom of the list', () => {
    // scrollTop beyond the max native scroll position (900*40=36000) - browsers
    // clamp this themselves, but the function should be defensive regardless.
    const range = computeVisibleRange(40000, 400, 40, 900, 6);
    expect(range.end).toBe(900);
    expect(range.start).toBeLessThan(900);
  });

  it('never returns a start past the end of the list for a stale/overscrolled scrollTop', () => {
    // Simulates the exact bug this guards: a 900-item scrollTop applied to a
    // list that just shrank to 10 items.
    const range = computeVisibleRange(1_000_000, 400, 40, 10, 6);
    expect(range.start).toBeLessThanOrEqual(10);
    expect(range.end).toBe(10);
  });
});

/** Mounts the hook against a real (attached) DOM node so scroll/resize wiring actually runs. */
function TestHarness({
  items,
  itemHeight,
  onState,
}: {
  items: string[];
  itemHeight: number;
  onState: (state: ReturnType<typeof useVirtualList<string>>) => void;
}) {
  const state = useVirtualList(items, itemHeight, 2);
  onState(state);
  return createElement('div', {
    ref: state.containerRef,
    'data-testid': 'scroller',
  });
}

describe('useVirtualList', () => {
  it('renders only a windowed slice of a large list, not every item', () => {
    const items = Array.from({ length: 900 }, (_, i) => `booth-${i}`);
    let latest: ReturnType<typeof useVirtualList<string>> | null = null;

    render(
      createElement(TestHarness, {
        items,
        itemHeight: 40,
        onState: (s) => {
          latest = s;
        },
      })
    );

    // happy-dom reports 0 clientHeight by default (no real layout engine), so
    // the window is small rather than empty - and always far short of 900.
    expect(latest).not.toBeNull();
    expect(latest!.visibleItems.length).toBeLessThan(items.length);
    expect(latest!.totalHeight).toBe(900 * 40);
  });

  it('resets scroll when the item list is swapped for a shorter one', () => {
    const first = Array.from({ length: 50 }, (_, i) => `a-${i}`);
    let latest: ReturnType<typeof useVirtualList<string>> | null = null;

    const { rerender } = render(
      createElement(TestHarness, {
        items: first,
        itemHeight: 40,
        onState: (s) => {
          latest = s;
        },
      })
    );

    const scroller = screen.getByTestId('scroller');
    Object.defineProperty(scroller, 'scrollTop', { value: 1200, writable: true });
    fireEvent.scroll(scroller);

    const second = Array.from({ length: 3 }, (_, i) => `b-${i}`);
    rerender(
      createElement(TestHarness, {
        items: second,
        itemHeight: 40,
        onState: (s) => {
          latest = s;
        },
      })
    );

    // With only 3 items, the whole (short) list should be visible - proving
    // the stale scrollTop from the 50-item list didn't leave the window
    // pointing past the end of the new one.
    expect(latest).not.toBeNull();
    expect(latest!.visibleItems.length).toBeGreaterThan(0);
    expect(latest!.visibleItems.length).toBeLessThanOrEqual(3);
  });
});
