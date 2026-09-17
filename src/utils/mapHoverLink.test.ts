import { describe, it, expect } from 'vitest';

import { matchesHoveredFeature, type HoveredFeature } from './mapHoverLink';

const ac = (name: string, no?: string, schemaId?: string): Record<string, unknown> => ({
  AC_NAME: name,
  ...(no !== undefined ? { AC_NO: no } : {}),
  ...(schemaId !== undefined ? { schemaId } : {}),
});

const hovered = (over: Partial<HoveredFeature> = {}): HoveredFeature => ({
  level: 'assemblies',
  name: 'BARGUR',
  ...over,
});

describe('matchesHoveredFeature', () => {
  it('returns false when nothing is hovered', () => {
    expect(matchesHoveredFeature({ hovered: null, level: 'assemblies', props: ac('BARGUR') })).toBe(
      false
    );
  });

  it('ignores features from a different level', () => {
    // A district named the same as an AC must not light up while an AC row is
    // hovered.
    expect(
      matchesHoveredFeature({
        hovered: hovered({ level: 'districts', name: 'BARGUR' }),
        level: 'assemblies',
        props: ac('BARGUR'),
      })
    ).toBe(false);
  });

  describe('assemblies', () => {
    // Keyed exactly as MapView builds it: normalizeName -> UPPERCASE. Using
    // lowercase keys here silently made every lookup miss and every match
    // fail, which is precisely the bug this fixture must not hide.
    const counts = new Map([
      ['BARGUR', 1],
      ['TIRUPPATTUR', 2],
    ]);

    it('matches a uniquely named AC', () => {
      expect(
        matchesHoveredFeature({
          hovered: hovered(),
          level: 'assemblies',
          props: ac('BARGUR'),
          assemblyNameCounts: counts,
        })
      ).toBe(true);
    });

    it('refuses a name-only match when the name is ambiguous', () => {
      // TN has two Tiruppattur ACs. Highlighting both - or the wrong one -
      // would be worse than highlighting neither.
      expect(
        matchesHoveredFeature({
          hovered: hovered({ name: 'TIRUPPATTUR' }),
          level: 'assemblies',
          props: ac('TIRUPPATTUR'),
          assemblyNameCounts: counts,
        })
      ).toBe(false);
    });

    it('disambiguates duplicate names by AC number', () => {
      const props = ac('TIRUPPATTUR', '48');
      expect(
        matchesHoveredFeature({
          hovered: hovered({ name: 'TIRUPPATTUR', no: 48 }),
          level: 'assemblies',
          props,
          assemblyNameCounts: counts,
        })
      ).toBe(true);
      expect(
        matchesHoveredFeature({
          hovered: hovered({ name: 'TIRUPPATTUR', no: 176 }),
          level: 'assemblies',
          props,
          assemblyNameCounts: counts,
        })
      ).toBe(false);
    });

    it('does not match a different AC', () => {
      expect(
        matchesHoveredFeature({
          hovered: hovered(),
          level: 'assemblies',
          props: ac('OMALUR'),
          assemblyNameCounts: counts,
        })
      ).toBe(false);
    });
  });

  describe('other levels', () => {
    it('matches a PC on either name key', () => {
      const h = hovered({ level: 'constituencies', name: 'KRISHNAGIRI' });
      expect(
        matchesHoveredFeature({
          hovered: h,
          level: 'constituencies',
          props: { ls_seat_name: 'Krishnagiri' },
        })
      ).toBe(true);
      // Some sources only carry PC_NAME; the browse list falls back to it, so
      // the matcher must too or the row would highlight nothing.
      expect(
        matchesHoveredFeature({
          hovered: h,
          level: 'constituencies',
          props: { PC_NAME: 'Krishnagiri' },
        })
      ).toBe(true);
    });

    it('matches a district across its fallback keys', () => {
      const h = hovered({ level: 'districts', name: 'Krishnagiri' });
      for (const props of [
        { district: 'Krishnagiri' },
        { NAME: 'Krishnagiri' },
        { DISTRICT: 'Krishnagiri' },
      ]) {
        expect(matchesHoveredFeature({ hovered: h, level: 'districts', props })).toBe(true);
      }
    });

    it('matches a state on shapeName or ST_NM', () => {
      const h = hovered({ level: 'states', name: 'Tamil Nadu' });
      expect(
        matchesHoveredFeature({ hovered: h, level: 'states', props: { shapeName: 'Tamil Nadu' } })
      ).toBe(true);
      expect(
        matchesHoveredFeature({ hovered: h, level: 'states', props: { ST_NM: 'TAMIL NADU' } })
      ).toBe(true);
    });

    it('ignores case and surrounding whitespace', () => {
      expect(
        matchesHoveredFeature({
          hovered: hovered({ level: 'districts', name: '  krishnagiri ' }),
          level: 'districts',
          props: { district: 'KRISHNAGIRI' },
        })
      ).toBe(true);
    });

    it('does not match on an empty name', () => {
      expect(
        matchesHoveredFeature({
          hovered: hovered({ level: 'districts', name: '' }),
          level: 'districts',
          props: { district: '' },
        })
      ).toBe(false);
    });
  });
});
