import { describe, it, expect } from 'vitest';
import { getElectionStateId } from './helpers';
import {
  resolveAssemblyMapPolygonWinner,
  resolveDistrictPolygonParty,
  resolvePcMapPolygonWinner,
} from './mapPolygonWinners';
import type { AssemblyProperties, ConstituencyProperties, DistrictProperties } from '../types';

describe('mapPolygonWinners', () => {
  describe('resolveAssemblyMapPolygonWinner', () => {
    const winners: Record<string, { party: string; candidate: string }> = {
      'TN-101': { party: 'PartyA', candidate: 'A' },
      DHARMAPURI: { party: 'PartyB', candidate: 'B' },
    };

    it('resolves schema id hit', () => {
      const props = {
        AC_NAME: 'X',
        DIST_NAME: '',
        schemaId: 'TN-101',
      } satisfies AssemblyProperties;
      const w = resolveAssemblyMapPolygonWinner({
        props,
        winners,
        suppressAssemblyPartyMapColors: false,
        currentPC: null,
        currentDistrict: null,
        currentState: null,
        getStateId: getElectionStateId,
        districtWinners: {},
        resolveDistrictName: () => null,
      });
      expect(w?.party).toBe('PartyA');
    });

    it('respects suppression (no colouring data)', () => {
      const props = {
        AC_NAME: 'Dharampuri',
        DIST_NAME: '',
        schemaId: 'TN-101',
      } satisfies AssemblyProperties;
      const w = resolveAssemblyMapPolygonWinner({
        props,
        winners,
        suppressAssemblyPartyMapColors: true,
        currentPC: null,
        currentDistrict: null,
        currentState: null,
        getStateId: getElectionStateId,
        districtWinners: {},
        resolveDistrictName: () => null,
      });
      expect(w).toBeNull();
    });
  });

  describe('resolvePcMapPolygonWinner', () => {
    it('falls back to dominant party when polygon has no winner', () => {
      const winners = { TN01: { party: 'X', candidate: '' } }; // mismatched keys
      const props = {
        ls_seat_name: 'UnknownSeat',
        PC_NAME: '',
        schemaId: 'TN-02',
      } satisfies ConstituencyProperties;
      const w = resolvePcMapPolygonWinner({
        props,
        winners,
        dominantPCParty: 'DominantNationalParty',
      });
      expect(w?.party).toBe('DominantNationalParty');
    });

    it('uses schema match before dominant fallback', () => {
      const winners = {
        'TN-01': { party: 'Direct', candidate: '' },
      };
      const props = {
        ls_seat_name: 'Chennai',
        PC_NAME: '',
        schemaId: 'TN-01',
      } satisfies ConstituencyProperties;
      const w = resolvePcMapPolygonWinner({
        props,
        winners,
        dominantPCParty: 'DominantNationalParty',
      });
      expect(w?.party).toBe('Direct');
    });
  });

  describe('resolveDistrictPolygonParty', () => {
    it('resolves party via resolveDistrictName -> district winners id', () => {
      const props = { district: 'Coimbatore' } satisfies DistrictProperties;
      const party = resolveDistrictPolygonParty(props, {
        districtWinners: { 'TN-D14': 'DravidianParty' },
        currentState: 'Tamil Nadu',
        getStateId: getElectionStateId,
        resolveDistrictName: () => 'TN-D14',
        suppressPartyColors: false,
      });
      expect(party).toBe('DravidianParty');
    });

    it('returns undefined when party colours are suppressed', () => {
      const props = { district: 'X' } satisfies DistrictProperties;
      expect(
        resolveDistrictPolygonParty(props, {
          districtWinners: { 'TN-D1': 'P' },
          currentState: 'Tamil Nadu',
          getStateId: getElectionStateId,
          resolveDistrictName: () => 'TN-D1',
          suppressPartyColors: true,
        })
      ).toBeUndefined();
    });

    it('fuzzy-matches schema district name when direct resolve fails', () => {
      const props = { district: 'Hill District Alpha' } satisfies DistrictProperties;
      const party = resolveDistrictPolygonParty(props, {
        districtWinners: { 'ST-D1': 'RegionalParty' },
        currentState: 'Sample State',
        getStateId: () => 'ST',
        resolveDistrictName: () => null,
        getDistrict: (id) => (id === 'ST-D1' ? { name: 'Hill District Alpha' } : null),
        suppressPartyColors: false,
      });
      expect(party).toBe('RegionalParty');
    });
  });

  it('sidebar-style browse row resolvers share one winner map shape', () => {
    const winners: Record<string, { party: string; candidate: string }> = {
      'PC-1': { party: 'LokParty', candidate: '' },
      'AC-9': { party: 'StateParty', candidate: '' },
    };
    const pcProps = {
      ls_seat_name: 'Somewhere',
      PC_NAME: '',
      schemaId: 'PC-1',
    } satisfies ConstituencyProperties;
    expect(
      resolvePcMapPolygonWinner({
        props: pcProps,
        winners,
        dominantPCParty: 'Other',
      })?.party
    ).toBe('LokParty');

    const acProps = {
      AC_NAME: 'AC Nine',
      DIST_NAME: '',
      schemaId: 'AC-9',
    } satisfies AssemblyProperties;
    expect(
      resolveAssemblyMapPolygonWinner({
        props: acProps,
        winners,
        suppressAssemblyPartyMapColors: false,
        currentPC: null,
        currentDistrict: null,
        currentState: null,
        getStateId: getElectionStateId,
        districtWinners: {},
        resolveDistrictName: () => null,
      })?.party
    ).toBe('StateParty');

    const distProps = { district: 'd' } satisfies DistrictProperties;
    expect(
      resolveDistrictPolygonParty(distProps, {
        districtWinners: { 'X-D0': 'DominantDistrictParty' },
        currentState: 'Place',
        getStateId: () => 'X',
        resolveDistrictName: () => 'X-D0',
        suppressPartyColors: false,
      })
    ).toBe('DominantDistrictParty');
  });
});
