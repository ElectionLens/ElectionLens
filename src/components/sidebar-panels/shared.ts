import type { CSSProperties, KeyboardEvent } from 'react';
import type { PartyCandidateRow } from '../../types';
import { formatOrdinal } from '../../utils/helpers';
import type { HoveredFeature } from '../../utils/mapHoverLink';

/** Handlers a browse list threads down to link its rows to map polygons. */
export interface RowHoverHandlers {
  onRowEnter?: ((feature: HoveredFeature) => void) | undefined;
  onRowLeave?: (() => void) | undefined;
}

/**
 * Spread onto a browse-list row to highlight its map polygon on hover.
 *
 * Focus is wired alongside pointer events, so tabbing through the list drives
 * the same highlight - otherwise the link would be a mouse-only feature and
 * keyboard users would get nothing.
 */
export function rowHoverProps(
  handlers: RowHoverHandlers,
  feature: HoveredFeature
): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const enter = (): void => handlers.onRowEnter?.(feature);
  const leave = (): void => handlers.onRowLeave?.();
  return { onMouseEnter: enter, onMouseLeave: leave, onFocus: enter, onBlur: leave };
}

/** Extended CSS properties to allow the custom `--item-color` CSS variable used by list rows. */
export interface ExtendedCSSProperties extends CSSProperties {
  '--item-color'?: string;
}

/** Enter / Space activates sidebar list rows rendered as div[role="button"]. */
export function sidebarListRowKeyDown(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

/** Result label for party candidate rows (votes pane): Won / Lost (Nth) / — */
export function partyCandidateOutcomeLabel(row: PartyCandidateRow): string {
  const pos = row.position;
  if (typeof pos !== 'number' || pos < 1) return '—';
  if (pos === 1) return 'Won';
  return `Lost (${formatOrdinal(pos)})`;
}

/** Shared "en-IN" grouped-number formatter used across sidebar summary panels. */
export function formatIn(num: number): string {
  if (!Number.isFinite(num)) return '—';
  return Math.round(num).toLocaleString('en-IN');
}
