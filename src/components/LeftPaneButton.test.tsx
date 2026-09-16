import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { LeftPaneButton } from './LeftPaneButton';

describe('LeftPaneButton', () => {
  it('applies the base + variant classes', () => {
    render(<LeftPaneButton variant="back">Back</LeftPaneButton>);
    const btn = screen.getByRole('button', { name: 'Back' });
    expect(btn).toHaveClass('left-pane-btn', 'left-pane-btn--back');
  });

  it.each(['chrome', 'inline', 'row'] as const)('supports the %s variant', (variant) => {
    render(<LeftPaneButton variant={variant}>x</LeftPaneButton>);
    expect(screen.getByRole('button')).toHaveClass(`left-pane-btn--${variant}`);
  });

  it('merges a caller-provided className rather than replacing it', () => {
    render(
      <LeftPaneButton variant="row" className="custom-row">
        x
      </LeftPaneButton>
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('left-pane-btn', 'left-pane-btn--row', 'custom-row');
  });

  it('defaults type to "button" so it never submits a form', () => {
    render(<LeftPaneButton variant="inline">x</LeftPaneButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('respects an explicit type override', () => {
    render(
      <LeftPaneButton variant="inline" type="submit">
        x
      </LeftPaneButton>
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('forwards the ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <LeftPaneButton variant="back" ref={ref}>
        x
      </LeftPaneButton>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('spreads through arbitrary button attributes', () => {
    render(
      <LeftPaneButton variant="back" aria-label="Go back" disabled>
        x
      </LeftPaneButton>
    );
    const btn = screen.getByRole('button', { name: 'Go back' });
    expect(btn).toBeDisabled();
  });
});
