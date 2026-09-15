import type { CSSProperties, KeyboardEvent } from 'react';
import type { PartyCandidateRow } from '../../types';
import { formatOrdinal } from '../../utils/helpers';

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
