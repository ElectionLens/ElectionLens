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
  let yearOptions: YearOption[] = [];

  if (p.currentView === 'assemblies' && p.showACCheckbox) {
    yearOptions = (p.pcAvailableYears?.length ? p.pcAvailableYears : p.availablePCYears || []).map(
      (year) => ({
        id: `pc-${year}`,
        label: `${year}`,
        title: `Parliament Election ${year}`,
        isActive: p.selectedPCYear === year,
        onClick: () => p.onPCYearChange?.(year),
      })
    );
  } else if (p.currentView === 'assemblies' || p.currentView === 'districts') {
    type YearItem = { year: number; type: 'assembly' | 'parliament' };
    const allYearItems: YearItem[] = [
      ...(p.availableYears || []).map((y) => ({ year: y, type: 'assembly' as const })),
      ...(p.availablePCYears || []).map((y) => ({
        year: y,
        type: 'parliament' as const,
      })),
    ].sort((a, b) => a.year - b.year);

    yearOptions = allYearItems.map((item) =>
      item.type === 'assembly'
        ? {
            id: `ac-${item.year}`,
            label: `${item.year}`,
            title: `Assembly Election ${item.year}`,
            isActive: p.selectedYear === item.year && p.selectedPCYear === null,
            onClick: () => {
              if (p.onPCYearChange) {
                (p.onPCYearChange as (year: number | null) => void)(null);
              }
              p.onYearChange?.(item.year);
            },
          }
        : {
            id: `pc-${item.year}`,
            label: `${item.year}-PC`,
            title: `Parliament Election ${item.year}`,
            isActive: p.selectedPCYear === item.year,
            onClick: () => p.onPCYearChange?.(item.year),
            tone: 'parliament' as const,
          }
    );
  } else if (p.pcAvailableYears && p.pcAvailableYears.length > 0) {
    const isACWithinPC = p.showACCheckbox && p.selectedAssembly != null;
    const displayYear = isACWithinPC ? p.selectedPCYear : p.pcSelectedYear;
    const onYearClick = isACWithinPC
      ? (y: number) => p.onPCYearChange?.(y)
      : (y: number) => p.onPCYearChangeForPC?.(y);

    yearOptions = p.pcAvailableYears.map((year) => ({
      id: `pc-${year}`,
      label: `${year}`,
      title: `Parliament Election ${year}`,
      isActive: displayYear === year,
      onClick: () => onYearClick(year),
    }));
  }

  return yearOptions;
}
