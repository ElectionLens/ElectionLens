import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { PanelTabs } from './PanelTabs';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'booths', label: 'Booths' },
  { id: 'postal', label: 'Postal' },
  { id: 'analysis', label: 'Analysis' },
];

function setup(activeId = 'overview') {
  const onSelect = vi.fn();
  render(
    <PanelTabs
      tabs={tabs}
      activeId={activeId}
      onSelect={onSelect}
      panelId="test-panel"
      label="Result view"
    />
  );
  return { onSelect };
}

describe('PanelTabs', () => {
  describe('structure', () => {
    it('exposes a labelled tablist with one tab per view', () => {
      setup();
      expect(screen.getByRole('tablist', { name: 'Result view' })).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(4);
    });

    it('marks only the active tab as selected', () => {
      setup('booths');
      expect(screen.getByRole('tab', { name: 'Booths' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'false'
      );
    });

    it('points every tab at the panel it controls', () => {
      setup();
      for (const tab of screen.getAllByRole('tab')) {
        expect(tab).toHaveAttribute('aria-controls', 'test-panel');
      }
    });

    it('keeps only the active tab in the page tab order', () => {
      // Roving tabindex: a keyboard user should Tab past the bar, not through
      // all four options.
      setup('postal');
      expect(screen.getByRole('tab', { name: 'Postal' })).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('tab', { name: 'Booths' })).toHaveAttribute('tabindex', '-1');
    });

    it('renders nothing when there are no tabs', () => {
      const { container } = render(
        <PanelTabs tabs={[]} activeId="" onSelect={vi.fn()} panelId="p" label="Empty" />
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('pointer', () => {
    it('selects the clicked tab', () => {
      const { onSelect } = setup();
      fireEvent.click(screen.getByRole('tab', { name: 'Analysis' }));
      expect(onSelect).toHaveBeenCalledWith('analysis');
    });
  });

  describe('keyboard (APG tabs pattern)', () => {
    it('moves to the next tab on ArrowRight', () => {
      const { onSelect } = setup('overview');
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'ArrowRight' });
      expect(onSelect).toHaveBeenCalledWith('booths');
    });

    it('moves to the previous tab on ArrowLeft', () => {
      const { onSelect } = setup('booths');
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Booths' }), { key: 'ArrowLeft' });
      expect(onSelect).toHaveBeenCalledWith('overview');
    });

    it('wraps from the last tab to the first', () => {
      const { onSelect } = setup('analysis');
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Analysis' }), { key: 'ArrowRight' });
      expect(onSelect).toHaveBeenCalledWith('overview');
    });

    it('wraps backwards from the first tab to the last', () => {
      const { onSelect } = setup('overview');
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'ArrowLeft' });
      expect(onSelect).toHaveBeenCalledWith('analysis');
    });

    it('jumps to the last tab with End', () => {
      const { onSelect } = setup('booths');
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Booths' }), { key: 'End' });
      expect(onSelect).toHaveBeenCalledWith('analysis');
    });

    it('jumps to the first tab with Home', () => {
      // Separate renders: this component is controlled, so activeId does not
      // move on its own and a second key press would compute from a stale index.
      const { onSelect } = setup('analysis');
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Analysis' }), { key: 'Home' });
      expect(onSelect).toHaveBeenCalledWith('overview');
    });

    it('ignores unrelated keys', () => {
      const { onSelect } = setup();
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'ArrowDown' });
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
