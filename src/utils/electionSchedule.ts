/** Last completed Lok Sabha election year reflected in most state PC datasets */
export const LOK_SABHA_LAST_ELECTION_YEAR = 2024;
/** Expected next general election (indicative; ECI schedule is final) */
export const LOK_SABHA_NEXT_ELECTION_YEAR = 2029;

/**
 * Smallest assembly election year in the dataset on or after the reference year
 * (e.g. 2026 upcoming row in index).
 */
export function nextAssemblyElectionYearInData(
  availableYears: number[],
  referenceYear: number
): number | null {
  const sorted = [...new Set(availableYears)].sort((a, b) => a - b);
  const hit = sorted.find((y) => y >= referenceYear);
  return hit ?? null;
}

export interface DefaultAssemblyDataYearOptions {
  /** When set, years below this are treated as completed results for default map/panel year */
  nextAssemblyElectionYear?: number | null;
  referenceYear?: number;
}

/**
 * Latest assembly year that should be selected by default for maps and results
 * (avoids picking a future placeholder when the index lists a single upcoming year).
 */
export function defaultAssemblyDataYear(
  availableYears: number[],
  options?: DefaultAssemblyDataYearOptions
): number | null {
  const referenceYear = options?.referenceYear ?? new Date().getFullYear();
  const sorted = [...new Set(availableYears)].sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const cap =
    options?.nextAssemblyElectionYear ??
    sorted.find((y) => y >= referenceYear) ??
    Number.POSITIVE_INFINITY;

  const completed = sorted.filter((y) => y < cap);
  if (completed.length > 0) {
    return Math.max(...completed);
  }

  const throughRef = sorted.filter((y) => y <= referenceYear);
  if (throughRef.length > 0) {
    return Math.max(...throughRef);
  }

  return sorted[sorted.length - 1] ?? null;
}

export function defaultAssemblyDataYearFromIndex(
  index: {
    availableYears: number[];
    nextAssemblyElectionYear?: number | null;
  },
  referenceYear?: number
): number | null {
  const opts: DefaultAssemblyDataYearOptions = {
    nextAssemblyElectionYear: index.nextAssemblyElectionYear ?? null,
  };
  if (referenceYear !== undefined) {
    opts.referenceYear = referenceYear;
  }
  return defaultAssemblyDataYear(index.availableYears, opts);
}

export function latestParliamentYearInData(pcAvailableYears: number[]): number | null {
  if (!pcAvailableYears.length) return null;
  return Math.max(...pcAvailableYears);
}
