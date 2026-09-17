import { useCallback, useRef, useState } from 'react';

import type { HoveredFeature } from '../utils/mapHoverLink';

export interface HoverLink {
  hovered: HoveredFeature | null;
  onRowEnter: (feature: HoveredFeature) => void;
  onRowLeave: () => void;
}

/**
 * Shared hover state linking sidebar rows to map polygons.
 *
 * Leaving one row and entering the next fires `leave` then `enter` in that
 * order, so clearing immediately would blank the highlight for a frame and
 * make a run down the list flicker. The clear is therefore deferred by a
 * frame and cancelled if another row is entered first.
 */
export function useHoverLink(): HoverLink {
  const [hovered, setHovered] = useState<HoveredFeature | null>(null);
  const clearTimer = useRef<number | null>(null);

  const cancelPendingClear = (): void => {
    if (clearTimer.current !== null) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  };

  const onRowEnter = useCallback((feature: HoveredFeature) => {
    cancelPendingClear();
    setHovered(feature);
  }, []);

  const onRowLeave = useCallback(() => {
    cancelPendingClear();
    clearTimer.current = window.setTimeout(() => {
      clearTimer.current = null;
      setHovered(null);
    }, 0);
  }, []);

  return { hovered, onRowEnter, onRowLeave };
}
