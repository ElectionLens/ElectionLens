import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUrlState } from './useUrlState';

// Mock window.location
const mockLocation = {
  pathname: '/',
  search: '',
  origin: 'http://localhost:3000',
};

// Mock window.history
const mockHistory = {
  replaceState: vi.fn(),
  pushState: vi.fn(),
};

describe('useUrlState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mocking window.location
    delete window.location;
    // @ts-expect-error - mocking window.location
    window.location = { ...mockLocation };
    window.history.replaceState = mockHistory.replaceState;
    window.history.pushState = mockHistory.pushState;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with correct return types', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    expect(typeof result.current.getUrlState).toBe('function');
    expect(typeof result.current.updateUrl).toBe('function');
    expect(typeof result.current.getShareableUrl).toBe('function');
  });

  it('parses empty URL correctly', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBeNull();
    expect(urlState.pc).toBeNull();
    expect(urlState.district).toBeNull();
    expect(urlState.assembly).toBeNull();
    expect(urlState.year).toBeNull();
  });

  it('parses state-only URL correctly', () => {
    window.location.pathname = '/tamil-nadu';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
  });

  it('parses PC URL correctly', () => {
    window.location.pathname = '/tamil-nadu/pc/salem';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.pc).toBe('salem');
    expect(urlState.view).toBe('constituencies');
  });

  it('parses district URL correctly', () => {
    window.location.pathname = '/tamil-nadu/district/chennai';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.district).toBe('chennai');
    expect(urlState.view).toBe('districts');
  });

  it('parses assembly URL with year correctly', () => {
    window.location.pathname = '/tamil-nadu/pc/salem/ac/omalur';
    window.location.search = '?year=2021';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.pc).toBe('salem');
    expect(urlState.assembly).toBe('omalur');
    expect(urlState.year).toBe(2021);
  });

  it('generates shareable URL for state', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'constituencies', null, null, null, null, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: null,
      district: null,
      assembly: null,
      year: null,
      pcYear: null,
    });

    expect(url).toBe('http://localhost:3000/tamil-nadu');
  });

  it('generates shareable URL for PC', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'constituencies', 'Salem', null, null, null, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: 'Salem',
      district: null,
      assembly: null,
      year: null,
      pcYear: null,
    });

    expect(url).toBe('http://localhost:3000/tamil-nadu/pc/salem');
  });

  it('generates shareable URL for assembly with year', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'constituencies', 'Salem', null, 'Omalur', 2021, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: 'Salem',
      district: null,
      assembly: 'Omalur',
      year: 2021,
      pcYear: null,
    });

    expect(url).toBe('http://localhost:3000/tamil-nadu/pc/salem/ac/omalur?year=2021');
  });

  it('generates shareable URL for district', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'districts', null, 'Chennai', null, null, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'districts',
      pc: null,
      district: 'Chennai',
      assembly: null,
      year: null,
      pcYear: null,
    });

    expect(url).toBe('http://localhost:3000/tamil-nadu/district/chennai');
  });

  it('preserves parentheses in URL', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(
        'Tamil Nadu',
        'constituencies',
        'Salem',
        null,
        'Gangavalli (SC)',
        2021,
        null,
        onNavigate
      )
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: 'Salem',
      district: null,
      assembly: 'Gangavalli (SC)',
      year: 2021,
      pcYear: null,
    });

    expect(url).toContain('gangavalli-(sc)');
    expect(url).not.toContain('%28');
    expect(url).not.toContain('%29');
  });

  it('handles hyphens before numbers correctly', () => {
    window.location.pathname = '/madhya-pradesh/pc/indore/ac/indore-1';
    window.location.search = '?year=2018';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.assembly).toBe('indore-1');
  });
});

describe('useUrlState - Additional Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mocking window.location
    delete window.location;
    // @ts-expect-error - mocking window.location
    window.location = { ...mockLocation };
    window.history.replaceState = mockHistory.replaceState;
    window.history.pushState = mockHistory.pushState;
  });

  it('generates shareable URL with PC year', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'constituencies', 'Salem', null, 'Omalur', 2021, 2024, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: 'Salem',
      district: null,
      assembly: 'Omalur',
      year: 2021,
      pcYear: 2024,
    });

    expect(url).toContain('pcYear=2024');
  });

  it('handles special characters in names', () => {
    window.location.pathname = '/andhra-pradesh/pc/ntr/ac/vijayawada-(west)';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.assembly).toBe('vijayawada (west)');
  });

  it('handles SC/ST suffix in assembly names correctly', () => {
    // This is the exact URL pattern reported as breaking
    window.location.pathname = '/rajasthan/pc/nagaur/ac/jayal-(sc)';
    window.location.search = '?year=2023';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('rajasthan');
    expect(urlState.pc).toBe('nagaur');
    expect(urlState.assembly).toBe('jayal (sc)');
    expect(urlState.year).toBe(2023);
  });
});
