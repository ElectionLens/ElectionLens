import { memo, type JSX } from 'react';

import { getPartyColor } from '../../utils/partyData';

export interface CandidateBarProps {
  /** Share of the vote, 0-100. */
  voteShare: number;
  party: string;
  /**
   * Largest share in the field. Bars are drawn relative to the leader rather
   * than to 100%, so a 38%-vs-35% contest reads as a near-tie instead of two
   * short stubs against mostly empty space.
   */
  leaderShare: number;
  /** Suppress the bar when vote figures are hidden (pre-poll rows). */
  hidden?: boolean;
}

/**
 * Sub-pixel bars are not bars. Below this width the fill reads as a coloured
 * smudge behind the rank digit rather than a magnitude, so tiny shares are
 * dropped entirely - the `%` column already states them precisely. Measured
 * against the real panel: the rank column is 24px, and anything under it looks
 * like a badge rather than a bar.
 */
const MIN_VISIBLE_PERCENT = 6;

/**
 * A ranked horizontal bar sitting behind the candidate row (UI revamp S4).
 *
 * The old `.vote-bar` was a 3px, 50%-opacity underline - technically present,
 * visually inert. This gives the row real weight so the shape of the contest
 * is scannable, while the exact numbers stay in the adjacent columns: scan
 * *and* precision, which is the whole point of S4.
 *
 * Rendered as a background fill rather than a separate chart column so it
 * costs no horizontal space - the panel is 360px in browse mode and a second
 * column would squeeze the names that matter.
 */
export const CandidateBar = memo(function CandidateBar({
  voteShare,
  party,
  leaderShare,
  hidden = false,
}: CandidateBarProps): JSX.Element | null {
  if (hidden || !Number.isFinite(voteShare) || voteShare <= 0) return null;

  // Guard against a zero/absent leader so we never divide by zero.
  const denominator = leaderShare > 0 ? leaderShare : 100;
  const relative = Math.min((voteShare / denominator) * 100, 100);

  // A 0.45px fill is not a bar. Rather than round tiny shares up to a visible
  // width - which would overstate them - drop them; the % column is exact.
  if (relative < MIN_VISIBLE_PERCENT) return null;

  return (
    <div
      className="candidate-bar"
      // scaleX rather than width: the CSS pins the bar to a track that starts
      // after the rank column, so a percentage width would be measured against
      // the wrong box. Scaling also animates on the compositor.
      style={{
        transform: `scaleX(${relative / 100})`,
        backgroundColor: getPartyColor(party),
      }}
      // Decorative: the adjacent columns already state the votes and share,
      // so announcing this again would just be noise for a screen reader.
      aria-hidden
    />
  );
});
