import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapToolbar } from './MapToolbar';

vi.mock('../../utils/db', () => ({ clearAllCache: vi.fn() }));

function baseProps() {
  return {
    showBackButton: false,
    onReset: vi.fn(),
    onGoBack: vi.fn(),
    onFeedbackClick: vi.fn(),
  };
}

describe('MapToolbar', () => {
  it('hides the back button when showBackButton is false', () => {
    render(<MapToolbar {...baseProps()} />);
    expect(screen.queryByTitle('Go back')).not.toBeInTheDocument();
  });

  it('shows and wires the back button when showBackButton is true', () => {
    const onGoBack = vi.fn();
    render(<MapToolbar {...baseProps()} showBackButton onGoBack={onGoBack} />);
    fireEvent.click(screen.getByTitle('Go back'));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it('calls onReset from the home button', () => {
    const onReset = vi.fn();
    render(<MapToolbar {...baseProps()} onReset={onReset} />);
    fireEvent.click(screen.getByTitle('Reset to India'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('calls onFeedbackClick from the feedback button', () => {
    const onFeedbackClick = vi.fn();
    render(<MapToolbar {...baseProps()} onFeedbackClick={onFeedbackClick} />);
    fireEvent.click(screen.getByTitle('Send feedback or report a bug'));
    expect(onFeedbackClick).toHaveBeenCalledTimes(1);
  });

  it('opens the layer menu and switches the active layer, dispatching a changeBaseLayer event', () => {
    const handler = vi.fn();
    window.addEventListener('changeBaseLayer', handler);
    render(<MapToolbar {...baseProps()} />);

    fireEvent.click(screen.getByTitle('Change map style'));
    fireEvent.click(screen.getByText('Satellite'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[0] as CustomEvent).detail).toBe('Satellite');
    window.removeEventListener('changeBaseLayer', handler);
  });

  it('marks the Vector option with a "Fast" badge', () => {
    render(<MapToolbar {...baseProps()} />);
    fireEvent.click(screen.getByTitle('Change map style'));
    expect(screen.getByText('Fast')).toBeInTheDocument();
  });

  it('shows the dev-only cache-clear button on localhost and wires it to clearAllCache', async () => {
    const { clearAllCache } = await import('../../utils/db');
    render(<MapToolbar {...baseProps()} />);
    // jsdom's default test origin resolves as localhost, matching the dev check.
    const btn = screen.getByTitle('Clear cache');
    fireEvent.click(btn);
    expect(clearAllCache).toHaveBeenCalledTimes(1);
  });
});
