import { describe, it, expect } from 'vitest';

import { resolvePanelMode } from './panelMode';

const WIDE = { canWiden: true };
const NARROW = { canWiden: false };

describe('resolvePanelMode', () => {
  describe('browse', () => {
    it('stays narrow when nothing is selected - a podium for a place you have not chosen is noise', () => {
      expect(resolvePanelMode({ hasSelection: false, ...WIDE })).toBe('browse');
    });

    it('ignores a stale tab when there is no selection', () => {
      expect(resolvePanelMode({ hasSelection: false, activeTab: 'booths', ...WIDE })).toBe(
        'browse'
      );
    });
  });

  describe('analyse', () => {
    it('widens once a constituency is selected', () => {
      expect(resolvePanelMode({ hasSelection: true, ...WIDE })).toBe('analyse');
    });

    it('treats the overview tab as analyse, not deep-dive', () => {
      expect(resolvePanelMode({ hasSelection: true, activeTab: 'overview', ...WIDE })).toBe(
        'analyse'
      );
    });

    it('treats an unknown tab as analyse rather than guessing deep-dive', () => {
      expect(resolvePanelMode({ hasSelection: true, activeTab: 'something-new', ...WIDE })).toBe(
        'analyse'
      );
    });
  });

  describe('deep-dive', () => {
    it.each(['booths', 'postal', 'analysis'])(
      'goes full width on the %s tab, where the map has nothing left to say',
      (tab) => {
        expect(resolvePanelMode({ hasSelection: true, activeTab: tab, ...WIDE })).toBe('deep-dive');
      }
    );
  });

  describe('viewport floor', () => {
    it('collapses to browse on a narrow viewport even with a selection', () => {
      expect(
        resolvePanelMode({
          hasSelection: true,
          activeTab: 'booths',
          ...NARROW,
        })
      ).toBe('browse');
    });

    it('widens once the viewport can afford it', () => {
      expect(resolvePanelMode({ hasSelection: true, ...WIDE })).toBe('analyse');
    });

    it('beats an explicit override, since the map still needs the room', () => {
      // The floor is a hard constraint, not a preference - honouring an override
      // here would squeeze the map below its usable minimum.
      expect(
        resolvePanelMode({
          hasSelection: true,
          ...NARROW,
          override: 'deep-dive',
        })
      ).toBe('browse');
    });
  });

  describe('user override', () => {
    it('wins over inference once the user has expressed a preference', () => {
      expect(resolvePanelMode({ hasSelection: false, ...WIDE, override: 'deep-dive' })).toBe(
        'deep-dive'
      );
    });

    it('can deliberately keep the panel narrow while a selection is open', () => {
      expect(
        resolvePanelMode({
          hasSelection: true,
          activeTab: 'booths',
          ...WIDE,
          override: 'browse',
        })
      ).toBe('browse');
    });

    it('falls back to inference when the override is cleared', () => {
      expect(resolvePanelMode({ hasSelection: true, ...WIDE, override: null })).toBe('analyse');
    });
  });
});
