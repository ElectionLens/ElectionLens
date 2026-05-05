import { describe, it, expect } from 'vitest';
import { getElectionStateId } from './helpers';
import { resolveAssemblyMapPolygonWinner, resolvePcMapPolygonWinner } from './mapPolygonWinners';
import type { AssemblyProperties, ConstituencyProperties } from '../types';

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
});
