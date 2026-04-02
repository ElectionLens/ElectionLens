import { describe, it, expect } from 'vitest';
import {
  nextAssemblyElectionYearInData,
  defaultAssemblyDataYear,
  defaultAssemblyDataYearFromIndex,
  latestParliamentYearInData,
  LOK_SABHA_NEXT_ELECTION_YEAR,
} from './electionSchedule';

describe('electionSchedule', () => {
  it('nextAssemblyElectionYearInData picks smallest year >= reference', () => {
    expect(nextAssemblyElectionYearInData([2011, 2016, 2021, 2026], 2026)).toBe(2026);
    expect(nextAssemblyElectionYearInData([2011, 2016, 2021], 2026)).toBeNull();
    expect(nextAssemblyElectionYearInData([2023], 2022)).toBe(2023);
  });

  it('latestParliamentYearInData returns max', () => {
    expect(latestParliamentYearInData([2009, 2014, 2019, 2024])).toBe(2024);
    expect(latestParliamentYearInData([])).toBeNull();
  });

  it('exports indicative next Lok Sabha year', () => {
    expect(LOK_SABHA_NEXT_ELECTION_YEAR).toBe(2029);
  });

  it('defaultAssemblyDataYear picks last completed before nextAssemblyElectionYear', () => {
    expect(
      defaultAssemblyDataYear([2011, 2016, 2021, 2026], {
        nextAssemblyElectionYear: 2026,
        referenceYear: 2026,
      })
    ).toBe(2021);
    expect(
      defaultAssemblyDataYear([2008, 2013, 2018, 2023, 2028], {
        nextAssemblyElectionYear: 2028,
        referenceYear: 2026,
      })
    ).toBe(2023);
  });

  it('defaultAssemblyDataYearFromIndex reads nextAssemblyElectionYear from index shape', () => {
    expect(
      defaultAssemblyDataYearFromIndex(
        { availableYears: [2011, 2016, 2021, 2026], nextAssemblyElectionYear: 2026 },
        2026
      )
    ).toBe(2021);
  });
});
