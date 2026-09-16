/**
 * Panel width modes (UI revamp §3).
 *
 * The sidebar is not a fixed 360px column any more. Its width follows *what the
 * user is doing*, because a 360px panel cannot host a podium (4-across would be
 * 74px per card) and a 900px panel would leave the map too narrow to explore.
 *
 * | mode      | width | when                                              |
 * |-----------|-------|---------------------------------------------------|
 * | browse    | 360px | picking a place; the map is the interface          |
 * | analyse   | 520px | a constituency is selected; podium + KPIs fit      |
 * | deep-dive | 900px | booth/analysis tables; the map has nothing to say  |
 *
 * 520px is the measured sweet spot: 236px podium cards while the map keeps
 * 920px at a 1440px viewport, so it stays the dominant element.
 */
export type PanelMode = 'browse' | 'analyse' | 'deep-dive';

/**
 * Below this viewport width the map cannot afford to give up 520px, so every
 * mode collapses back to the browse width. 1152 = 520 panel + ~632 map, the
 * point at which widening starts eating into the map's ~720px working minimum.
 */
export const PANEL_WIDEN_MIN_VIEWPORT = 1152;

/** Tabs that mean "the user is reading tables, not looking at the map". */
const DEEP_DIVE_TABS = new Set(['booths', 'postal', 'analysis']);

export interface PanelModeInput {
  /** A constituency (AC or PC) is selected and its panel is open. */
  hasSelection: boolean;
  /** The active tab within the result panel, if a panel is open. */
  activeTab?: string | null | undefined;
  /**
   * Whether the viewport is wide enough to afford a wider panel, i.e. it
   * matches `(min-width: ${PANEL_WIDEN_MIN_VIEWPORT}px)`.
   *
   * A boolean rather than a raw pixel width because that is genuinely all the
   * decision needs, and because the caller already has the answer from
   * `matchMedia` - which fires only when it changes, rather than on every
   * resize frame.
   */
  canWiden: boolean;
  /**
   * User's explicit override. Once someone drags or toggles the width they have
   * told us what they want, and that beats our inference until they clear it.
   */
  override?: PanelMode | null | undefined;
}

/**
 * Decide the panel mode from what the user is doing.
 *
 * Deliberately a pure function of inputs rather than component state: the width
 * is derived from selection + tab + viewport, so anything that can compute
 * those (including a future card surface) gets the same answer without
 * duplicating the rules.
 */
export function resolvePanelMode(input: PanelModeInput): PanelMode {
  const { hasSelection, activeTab, canWiden, override } = input;

  // Narrow viewports never widen: the map would stop being explorable, and the
  // mobile bottom sheet owns the layout below the breakpoint anyway. This is a
  // hard constraint, so it outranks an explicit override.
  if (!canWiden) return 'browse';

  if (override) return override;

  if (!hasSelection) return 'browse';

  return activeTab && DEEP_DIVE_TABS.has(activeTab) ? 'deep-dive' : 'analyse';
}
