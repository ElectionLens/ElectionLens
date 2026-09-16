/**
 * Number formatting for display.
 *
 * Single source of truth: every user-visible number in the app goes through here.
 * The explicit `'en-IN'` locale is load-bearing — a bare `.toLocaleString()` uses the
 * *viewer's* machine locale, so the same vote count renders `232,630` in the US and
 * `2,32,630` in India. Indian digit grouping (lakh/crore) is correct for this data.
 */

/** Format a count with Indian digit grouping. Nullish renders as an em dash. */
export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return '—';
  return num.toLocaleString('en-IN');
}
