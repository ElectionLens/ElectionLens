import { describe, it, expect, vi } from 'vitest';
import { buildMapYearDropdownOptions } from './mapYearOptions';

describe('buildMapYearDropdownOptions', () => {
  it('merges assembly and parliament years in assemblies view', () => {
    const onYearChange = vi.fn();
    const onPCYearChange = vi.fn();

    const opts = buildMapYearDropdownOptions({
      currentView: 'assemblies',
      showACCheckbox: false,
      selectedAssembly: null,
      availableYears: [2021],
      selectedYear: 2021,
      selectedPCYear: null,
      availablePCYears: [2024],
      pcAvailableYears: [],
      pcSelectedYear: null,
      onYearChange,
      onPCYearChange,
    });

    expect(opts.some((o) => o.id === 'ac-2021')).toBe(true);
    expect(opts.some((o) => o.id === 'pc-2024')).toBe(true);
  });
});
