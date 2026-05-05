import { describe, it, expect } from 'vitest';
import type {
  ElectionResultsByConstituency,
  Feature,
  PCElectionResultsByConstituency,
} from '../types';
import {
  aggregateAssemblyVotesForMappedFeatures,
  aggregateParliamentVotesStatewide,
  aggregateSeatsFromPartyList,
  aggregatePcVotesForMappedFeatures,
} from './aggregateStateMapElectionStats';

describe('aggregateStateMapElectionStats', () => {
  it('aggregateSeatsFromPartyList counts empties separately', () => {
    expect(aggregateSeatsFromPartyList(['A', '', 'A', 'B']).map((r) => [r.party, r.seats])).toEqual(
      [
        ['A', 2],
        ['B', 1],
      ]
    );
  });

  it('aggregateAssemblyVotesForMappedFeatures sums by party across two ACs', () => {
    const results: ElectionResultsByConstituency = {
      'AS-001': {
        year: 2026,
        constituencyNo: 1,
        constituencyName: 'ALPHA',
        constituencyNameOriginal: 'ALPHA',
        constituencyType: 'GEN',
        districtName: 'D',
        validVotes: 100,
        electors: 100,
        turnout: 100,
        enop: 2,
        totalCandidates: 2,
        candidates: [
          {
            position: 1,
            name: 'W',
            party: 'PPP',
            votes: 60,
            voteShare: 60,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
          {
            position: 2,
            name: 'L',
            party: 'QQQ',
            votes: 40,
            voteShare: 40,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
        ],
      },
      'AS-002': {
        year: 2026,
        constituencyNo: 2,
        constituencyName: 'BETA',
        constituencyNameOriginal: 'BETA',
        constituencyType: 'GEN',
        districtName: 'D',
        validVotes: 200,
        electors: 200,
        turnout: 100,
        enop: 2,
        totalCandidates: 2,
        candidates: [
          {
            position: 1,
            name: 'W2',
            party: 'QQQ',
            votes: 200,
            voteShare: 100,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
        ],
      },
    };

    const features: Feature[] = [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { AC_NAME: 'ALPHA', schemaId: 'AS-001' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { AC_NAME: 'BETA', schemaId: 'AS-002' },
      },
    ];

    const agg = aggregateAssemblyVotesForMappedFeatures({
      results,
      features,
    });
    expect(agg).not.toBeNull();
    expect(agg!.totalValidVotes).toBe(300);
    const ppp = agg!.voteRows.find((r) => r.party === 'PPP');
    const qqq = agg!.voteRows.find((r) => r.party === 'QQQ');
    expect(ppp?.votes).toBe(60);
    expect(qqq?.votes).toBe(240);
  });

  it('aggregateParliamentVotesStatewide rolls up PC buckets', () => {
    const data: PCElectionResultsByConstituency = {
      'TN-01': {
        year: 2019,
        constituencyNo: 1,
        constituencyName: 'A',
        constituencyNameOriginal: 'A',
        constituencyType: 'GEN',
        stateName: 'Tamil Nadu',
        validVotes: 1000,
        electors: 1000,
        turnout: 100,
        enop: 3,
        totalCandidates: 2,
        candidates: [
          {
            position: 1,
            name: 'W',
            party: 'BBB',
            votes: 550,
            voteShare: 55,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
          {
            position: 2,
            name: 'L',
            party: 'CCC',
            votes: 450,
            voteShare: 45,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
        ],
        assemblyConstituencies: [],
      },
      'TN-02': {
        year: 2019,
        constituencyNo: 2,
        constituencyName: 'B',
        constituencyNameOriginal: 'B',
        constituencyType: 'GEN',
        stateName: 'Tamil Nadu',
        validVotes: 1000,
        electors: 1000,
        turnout: 100,
        enop: 3,
        totalCandidates: 2,
        candidates: [
          {
            position: 1,
            name: 'Wx',
            party: 'CCC',
            votes: 600,
            voteShare: 60,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
          {
            position: 2,
            name: 'Lx',
            party: 'BBB',
            votes: 400,
            voteShare: 40,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
        ],
        assemblyConstituencies: [],
      },
    };
    const agg = aggregateParliamentVotesStatewide(data);
    expect(agg?.pcsIncluded).toBe(2);
    expect(agg?.totalValidVotes).toBe(2000);
    const bVotes = agg?.voteRows.find((r) => r.party === 'BBB');
    expect(bVotes?.votes).toBe(950);
  });

  it('aggregatePcVotesForMappedFeatures restricts to polygons', () => {
    const pc: PCElectionResultsByConstituency = {
      'TN-01': {
        year: 2024,
        constituencyNo: 1,
        constituencyName: 'One',
        constituencyNameOriginal: 'One',
        constituencyType: 'GEN',
        stateName: 'Tamil Nadu',
        validVotes: 100,
        electors: 100,
        turnout: 100,
        enop: 2,
        totalCandidates: 1,
        candidates: [
          {
            position: 1,
            name: 'W',
            party: 'PX',
            votes: 100,
            voteShare: 100,
            margin: null,
            marginPct: null,
            sex: 'M',
            age: null,
            depositLost: false,
          },
        ],
        assemblyConstituencies: [],
        schemaId: 'TN-01',
      },
    };
    const features: Feature[] = [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { ls_seat_name: 'Two', schemaId: 'TN-02' },
      },
    ];
    const agg = aggregatePcVotesForMappedFeatures({
      results: pc,
      features,
      stateId: 'TN',
      resolvePCName: () => null,
    });
    expect(agg?.mappedConstituencies).toBe(0);
    expect(agg?.totalValidVotes).toBe(0);
  });
});
