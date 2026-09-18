import type { YearOption } from '../components/YearSelector';
import type { ViewMode } from '../types';

/** Params mirror the former map toolbar year dropdown logic (assembly / district / PC). */
export interface BuildMapYearDropdownOptionsParams {
  currentView: ViewMode;
  /** True when viewing a PC route (`currentPC` set) — parliament years for AC-within-PC. */
  showACCheckbox: boolean;
  selectedAssembly: string | null;
  availableYears: number[];
  selectedYear: number | null;
  availablePCYears: number[];
  /** Assembly-context parliament year (`selectedACPCYear`). */
  selectedPCYear: number | null;
  pcAvailableYears: number[];
  pcSelectedYear: number | null;
  onYearChange?: (year: number) => void;
  onPCYearChange?: ((year: number) => void) | ((year: number | null) => void);
  onPCYearChangeForPC?: (year: number) => void;
}

/**
 * Builds year dropdown options for the sidebar (same behavior as the legacy map toolbar).
 */
export function buildMapYearDropdownOptions(p: BuildMapYearDropdownOptionsParams): YearOption[] {
  const assemblyYears = [...new Set(p.availableYears ?? [])].sort((a, b) => a - b);
  const parliamentYears = [
    ...new Set([...(p.availablePCYears ?? []), ...(p.pcAvailableYears ?? [])]),
  ].sort((a, b) => a - b);

  const onParliamentYearChange = (year: number): void => {
    if (p.showACCheckbox && p.selectedAssembly != null) {
      p.onPCYearChange?.(year);
      return;
    }
    if (p.currentView === 'constituencies') {
      if (p.onPCYearChangeForPC) p.onPCYearChangeForPC(year);
      else p.onPCYearChange?.(year);
      return;
    }
    if (p.onPCYearChange) p.onPCYearChange(year);
    else p.onPCYearChangeForPC?.(year);
  };

  const yearOptions: YearOption[] = [
    ...assemblyYears.map((year) => ({
      id: `ac-${year}`,
      label: `${year}`,
      title: `Assembly Election ${year}`,
      isActive: p.selectedYear === year && p.selectedPCYear === null && p.pcSelectedYear === null,
      onClick: () => {
        if (p.onPCYearChange) {
          (p.onPCYearChange as (year: number | null) => void)(null);
        }
        p.onYearChange?.(year);
      },
    })),
    ...parliamentYears.map((year) => ({
      id: `pc-${year}`,
      label: `${year}-PC`,
      title: `Parliament Election ${year}`,
      isActive: p.selectedPCYear === year || p.pcSelectedYear === year,
      onClick: () => onParliamentYearChange(year),
      tone: 'parliament' as const,
    })),
  ];

  return yearOptions;
}
