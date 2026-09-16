import type { JSX } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { LeftPaneButton } from './LeftPaneButton';
import type { PanelMode } from '../utils/panelMode';

export interface PanelWidthToggleProps {
  /** The width currently in effect, whether inferred or overridden. */
  mode: PanelMode;
  /** Set an explicit width, or pass null to hand control back to inference. */
  onOverrideChange: (override: PanelMode | null) => void;
  /**
   * Whether the viewport can afford a wider panel. When false the control is
   * hidden entirely rather than disabled: on a narrow screen widening is not a
   * choice we can honour, and offering a dead button is worse than offering none.
   */
  canWiden: boolean;
}

/**
 * Lets the user overrule the inferred panel width (UI revamp section 3).
 *
 * The width normally follows intent - narrow while browsing, wider once a
 * constituency is selected, widest in booth tables. That inference is right
 * most of the time, but "most of the time" is not "always", so this is the
 * escape hatch: someone who wants the map back while reading booth data, or a
 * wide panel while browsing, can say so.
 */
export function PanelWidthToggle({
  mode,
  onOverrideChange,
  canWiden,
}: PanelWidthToggleProps): JSX.Element | null {
  if (!canWiden) return null;

  const isWide = mode !== 'browse';
  const label = isWide ? 'Narrow panel, show more map' : 'Widen panel, show more detail';

  return (
    <LeftPaneButton
      variant="chrome"
      className="panel-width-toggle"
      onClick={() => onOverrideChange(isWide ? 'browse' : 'analyse')}
      title={label}
      aria-label={label}
      aria-pressed={isWide}
    >
      {isWide ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
    </LeftPaneButton>
  );
}
