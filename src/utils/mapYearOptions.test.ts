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

  it('uses pc-only years when assemblies + showACCheckbox (AC-within-PC)', () => {
    const onPC = vi.fn();
    const opts = buildMapYearDropdownOptions({
      currentView: 'assemblies',
      showACCheckbox: true,
      selectedAssembly: 'x',
      availableYears: [2021],
      selectedYear: 2021,
      selectedPCYear: 2024,
      availablePCYears: [2019, 2024],
      pcAvailableYears: [2019, 2024],
      pcSelectedYear: null,
      onPCYearChange: onPC,
    });

    expect(opts.every((o) => o.id.startsWith('pc-'))).toBe(true);
    const active = opts.find((o) => o.isActive);
    expect(active?.id).toBe('pc-2024');
    active?.onClick();
    expect(onPC).toHaveBeenCalledWith(2024);
  });

  it('falls back to availablePCYears when pcAvailableYears is empty in AC-within-PC mode', () => {
    const opts = buildMapYearDropdownOptions({
      currentView: 'assemblies',
      showACCheckbox: true,
      selectedAssembly: 'x',
      availableYears: [],
      selectedYear: null,
      selectedPCYear: null,
      availablePCYears: [2024],
      pcAvailableYears: [],
      pcSelectedYear: null,
    });
    expect(opts.map((o) => o.id)).toEqual(['pc-2024']);
  });

  it('merges years for districts view like assemblies', () => {
    const opts = buildMapYearDropdownOptions({
      currentView: 'districts',
      showACCheckbox: false,
      selectedAssembly: null,
      availableYears: [2021],
      selectedYear: null,
      selectedPCYear: 2024,
      availablePCYears: [2024],
      pcAvailableYears: [],
      pcSelectedYear: null,
    });
    expect(opts.some((o) => o.tone === 'parliament')).toBe(true);
  });

  it('assembly row clears PC year then sets assembly year', () => {
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
    const ac = opts.find((o) => o.id === 'ac-2021');
    ac?.onClick();
    expect(onPCYearChange).toHaveBeenCalledWith(null);
    expect(onYearChange).toHaveBeenCalledWith(2021);
  });

  it('constituencies view uses pcAvailableYears for PC map year control', () => {
    const onForPC = vi.fn();
    const opts = buildMapYearDropdownOptions({
      currentView: 'constituencies',
      showACCheckbox: false,
      selectedAssembly: null,
      availableYears: [],
      selectedYear: null,
      selectedPCYear: null,
      availablePCYears: [],
      pcAvailableYears: [2019, 2024],
      pcSelectedYear: 2019,
      onPCYearChangeForPC: onForPC,
    });
    expect(opts.map((o) => o.id)).toEqual(['pc-2019', 'pc-2024']);
    opts.find((o) => o.id === 'pc-2024')?.onClick();
    expect(onForPC).toHaveBeenCalledWith(2024);
  });

  it('uses onPCYearChange when AC-within-PC on constituency layer', () => {
    const onPC = vi.fn();
    const opts = buildMapYearDropdownOptions({
      currentView: 'constituencies',
      showACCheckbox: true,
      selectedAssembly: 'ac-1',
      availableYears: [],
      selectedYear: null,
      selectedPCYear: 2024,
      availablePCYears: [],
      pcAvailableYears: [2024],
      pcSelectedYear: null,
      onPCYearChange: onPC,
    });
    opts[0]?.onClick();
    expect(onPC).toHaveBeenCalledWith(2024);
  });
});
