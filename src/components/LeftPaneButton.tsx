import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type LeftPaneButtonVariant = 'back' | 'chrome' | 'inline' | 'row';

export interface LeftPaneButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: LeftPaneButtonVariant;
}

const variantClass: Record<LeftPaneButtonVariant, string> = {
  back: 'left-pane-btn left-pane-btn--back',
  chrome: 'left-pane-btn left-pane-btn--chrome',
  inline: 'left-pane-btn left-pane-btn--inline',
  row: 'left-pane-btn left-pane-btn--row',
};

/**
 * Shared left-pane control: consistent type="button", focus, and variant styling.
 * Pair variant `row` / `inline` with existing layout classes (e.g. `party-candidate-row`, `state-map-summary-party-link`).
 */
export const LeftPaneButton = forwardRef<HTMLButtonElement, LeftPaneButtonProps>(
  function LeftPaneButton({ variant, className = '', type = 'button', ...rest }, ref) {
    const merged = [variantClass[variant], className].filter(Boolean).join(' ');
    return <button ref={ref} type={type} className={merged} {...rest} />;
  }
);
