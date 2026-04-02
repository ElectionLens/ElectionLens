import { useEffect, useState, useMemo } from 'react';
import { Landmark, Building2 } from 'lucide-react';
import { ELECTIONS } from '../constants/paths';
import { getElectionStateId } from '../utils/helpers';
import { isAssemblyResultEntry } from '../utils/electionResults';
import type { ElectionResultsByConstituency, StateElectionIndex } from '../types';
import {
  LOK_SABHA_LAST_ELECTION_YEAR,
  LOK_SABHA_NEXT_ELECTION_YEAR,
  latestParliamentYearInData,
  nextAssemblyElectionYearInData,
} from '../utils/electionSchedule';

interface DistrictElectionsInfoProps {
  stateName: string;
  assemblyAvailableYears: number[];
  /** When set (from AC index), overrides inferring next year from availableYears */
  assemblyNextElectionYear?: number | null;
  pcAvailableYears: number[];
  /** From state AC index (total constituencies) */
  assemblySeatCount?: number | null;
}

interface AssemblyFetchState {
  loading: boolean;
  error: boolean;
  announcedAcCount: number | null;
  totalConstituencies: number | null;
}

/**
 * Sidebar block for state-level districts map: next assembly & parliament context,
 * with real counts from JSON when the upcoming-year file has candidate rows.
 */
export function DistrictElectionsInfo({
  stateName,
  assemblyAvailableYears,
  assemblyNextElectionYear = null,
  pcAvailableYears,
  assemblySeatCount,
}: DistrictElectionsInfoProps): JSX.Element {
  const stateId = useMemo(() => getElectionStateId(stateName), [stateName]);
  const refYear = useMemo(() => new Date().getFullYear(), []);

  /** Fetched locally so the scheduled year shows even when App has not run loadStateIndex yet (e.g. districts view). */
  const [fetchedIndex, setFetchedIndex] = useState<Partial<StateElectionIndex> | null>(null);

  useEffect(() => {
    if (!stateId) {
      setFetchedIndex(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(ELECTIONS.getIndexPath(stateId));
        if (!res.ok || cancelled) return;
        const idx = (await res.json()) as StateElectionIndex;
        if (!cancelled) setFetchedIndex(idx);
      } catch {
        if (!cancelled) setFetchedIndex(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stateId]);

  const nextAssemblyYear = useMemo(() => {
    if (assemblyNextElectionYear != null) return assemblyNextElectionYear;
    if (typeof fetchedIndex?.nextAssemblyElectionYear === 'number') {
      return fetchedIndex.nextAssemblyElectionYear;
    }
    const years = fetchedIndex?.availableYears ?? assemblyAvailableYears;
    return nextAssemblyElectionYearInData(years, refYear);
  }, [assemblyAvailableYears, assemblyNextElectionYear, fetchedIndex, refYear]);

  const lastPcYear = useMemo(
    () => latestParliamentYearInData(pcAvailableYears),
    [pcAvailableYears]
  );

  const [acStats, setAcStats] = useState<AssemblyFetchState>({
    loading: false,
    error: false,
    announcedAcCount: null,
    totalConstituencies: null,
  });

  useEffect(() => {
    if (!stateId || nextAssemblyYear == null) {
      setAcStats({
        loading: false,
        error: false,
        announcedAcCount: null,
        totalConstituencies: fetchedIndex?.totalConstituencies ?? assemblySeatCount ?? null,
      });
      return;
    }

    let cancelled = false;
    setAcStats((s) => ({
      ...s,
      loading: true,
      error: false,
      announcedAcCount: null,
    }));

    void (async () => {
      try {
        const yearRes = await fetch(ELECTIONS.getYearPath(stateId, nextAssemblyYear));

        const total =
          typeof fetchedIndex?.totalConstituencies === 'number'
            ? fetchedIndex.totalConstituencies
            : (assemblySeatCount ?? null);

        if (!yearRes.ok) {
          if (!cancelled) {
            setAcStats({
              loading: false,
              error: true,
              announcedAcCount: null,
              totalConstituencies: total,
            });
          }
          return;
        }

        const data = (await yearRes.json()) as ElectionResultsByConstituency;
        let announced = 0;
        for (const [key, val] of Object.entries(data)) {
          if (key.startsWith('_')) continue;
          if (!isAssemblyResultEntry(key, val)) continue;
          if (val.candidates && val.candidates.length > 0) announced += 1;
        }

        if (!cancelled) {
          setAcStats({
            loading: false,
            error: false,
            announcedAcCount: announced,
            totalConstituencies: total,
          });
        }
      } catch {
        if (!cancelled) {
          setAcStats({
            loading: false,
            error: true,
            announcedAcCount: null,
            totalConstituencies: assemblySeatCount ?? null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stateId, nextAssemblyYear, assemblySeatCount, fetchedIndex?.totalConstituencies]);

  const assemblyCandidatesLine = (() => {
    if (nextAssemblyYear == null) return 'None (no upcoming year in index)';
    if (acStats.loading) return 'Loading…';
    if (acStats.error) return 'None (could not load year file)';
    if (acStats.announcedAcCount != null && acStats.announcedAcCount > 0) {
      const tot = acStats.totalConstituencies;
      return tot != null
        ? `${acStats.announcedAcCount} / ${tot} ACs with candidate lists`
        : `${acStats.announcedAcCount} ACs with candidate lists`;
    }
    return 'None';
  })();

  const parliamentLine = (() => {
    if (lastPcYear != null) {
      return `Latest results in app: ${lastPcYear}. Next Lok Sabha (expected): ${LOK_SABHA_NEXT_ELECTION_YEAR}. Candidate lists for that election: None.`;
    }
    return `Typical last cycle: ${LOK_SABHA_LAST_ELECTION_YEAR}. Next (expected): ${LOK_SABHA_NEXT_ELECTION_YEAR}. Candidate data: None.`;
  })();

  return (
    <div className="district-elections-info">
      <div className="district-elections-info-block">
        <div className="district-elections-info-title">
          <Landmark size={14} aria-hidden />
          Assembly (Vidhan Sabha)
        </div>
        <p className="district-elections-info-row">
          <span className="district-elections-info-label">Next assembly (scheduled)</span>
          <span className="district-elections-info-value">
            {nextAssemblyYear != null ? String(nextAssemblyYear) : 'None'}
          </span>
        </p>
        <p className="district-elections-info-row district-elections-info-detail">
          <span className="district-elections-info-label">Candidate lists (next assembly)</span>
          <span>{assemblyCandidatesLine}</span>
        </p>
      </div>
      <div className="district-elections-info-block">
        <div className="district-elections-info-title">
          <Building2 size={14} aria-hidden />
          Parliament (Lok Sabha)
        </div>
        <p className="district-elections-info-detail">{parliamentLine}</p>
      </div>
    </div>
  );
}
