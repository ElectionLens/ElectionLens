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
    expect(urlState.pane).toBe('root');
    expect(urlState.paneView).toBeNull();
    expect(urlState.paneParty).toBeNull();
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

  it('parses assemblies view URL correctly', () => {
    window.location.pathname = '/tamil-nadu/ac';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.view).toBe('assemblies');
    expect(urlState.pc).toBeNull();
    expect(urlState.district).toBeNull();
    expect(urlState.assembly).toBeNull();
  });

  it('parses state-level districts map URL with year=pc-YYYY', () => {
    window.location.pathname = '/tamil-nadu/districts';
    window.location.search = '?year=pc-2024';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.view).toBe('districts');
    expect(urlState.pcYear).toBe(2024);
    expect(urlState.year).toBeNull();
  });

  it('parses /state/pc URL as constituencies view', () => {
    window.location.pathname = '/tamil-nadu/pc';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.view).toBe('constituencies');
    expect(urlState.pc).toBeNull();
    expect(urlState.district).toBeNull();
  });

  it('parses election panel tab=booths from query', () => {
    window.location.pathname = '/tamil-nadu/pc/salem/ac/omalur';
    window.location.search = '?year=2021&tab=booths';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );
    expect(result.current.getUrlState().tab).toBe('booths');
  });

  it('does not expose legacy tab=candidates as UrlState.tab', () => {
    window.location.pathname = '/tamil-nadu/pc/salem/ac/omalur';
    window.location.search = '?year=2021&tab=candidates';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );
    expect(result.current.getUrlState().tab).toBeNull();
  });

  it('parses left pane stack params from query string', () => {
    window.location.pathname = '/tamil-nadu/ac';
    window.location.search = '?year=2021&pane=party&paneView=seats&paneParty=DMK';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.pane).toBe('party');
    expect(urlState.paneView).toBe('seats');
    expect(urlState.paneParty).toBe('DMK');
  });

  it('ignores invalid pane query value (keeps root)', () => {
    window.location.search = '?pane=not-a-pane';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );
    expect(result.current.getUrlState().pane).toBe('root');
  });

  it('updateUrl merges same-path query and preserves tab when tab is omitted', () => {
    window.location.pathname = '/tamil-nadu/pc/salem/ac/omalur';
    window.location.search = '?year=2021&tab=booths';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(
        'Tamil Nadu',
        'constituencies',
        'Salem',
        null,
        'Omalur',
        2021,
        null,
        onNavigate,
        false,
        null,
        false
      )
    );

    act(() => {
      result.current.updateUrl({
        state: 'Tamil Nadu',
        view: 'constituencies',
        pc: 'Salem',
        district: null,
        assembly: 'Omalur',
        year: 2021,
        pcYear: null,
        showACs: null,
        blog: false,
        blogPost: null,
      });
    });

    const merged =
      mockHistory.replaceState.mock.calls.at(-1)?.[2] ??
      mockHistory.pushState.mock.calls.at(-1)?.[2];
    expect(String(merged)).toContain('tab=booths');
    expect(String(merged)).toContain('year=2021');
  });

  it('updateUrl removes tab when tab is explicitly null', () => {
    window.location.pathname = '/tamil-nadu/pc/salem/ac/omalur';
    window.location.search = '?year=2021&tab=booths';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(
        'Tamil Nadu',
        'constituencies',
        'Salem',
        null,
        'Omalur',
        2021,
        null,
        onNavigate,
        false,
        null,
        false
      )
    );

    act(() => {
      result.current.updateUrl({
        state: 'Tamil Nadu',
        view: 'constituencies',
        pc: 'Salem',
        district: null,
        assembly: 'Omalur',
        year: 2021,
        pcYear: null,
        tab: null,
        showACs: null,
        blog: false,
        blogPost: null,
      });
    });

    const merged =
      mockHistory.replaceState.mock.calls.at(-1)?.[2] ??
      mockHistory.pushState.mock.calls.at(-1)?.[2];
    expect(String(merged)).not.toContain('tab=');
  });

  it('parses assemblies view with specific AC URL correctly', () => {
    window.location.pathname = '/tamil-nadu/ac/anna-nagar';
    window.location.search = '?year=2021';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.view).toBe('assemblies');
    expect(urlState.assembly).toBe('anna nagar');
    expect(urlState.year).toBe(2021);
    expect(urlState.pcYear).toBeNull();
  });

  it('parses AC URL with PC year (year=pc-YYYY format)', () => {
    window.location.pathname = '/andhra-pradesh/pc/ongole/ac/darsi';
    window.location.search = '?year=pc-2024';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('andhra pradesh');
    expect(urlState.pc).toBe('ongole');
    expect(urlState.assembly).toBe('darsi');
    expect(urlState.year).toBeNull();
    expect(urlState.pcYear).toBe(2024);
  });

  it('generates shareable URL for home without year parameter', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, 2024, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: null,
      view: 'constituencies',
      pc: null,
      district: null,
      assembly: null,
      year: 2024,
      pcYear: null,
      tab: null,
      showACs: null,
      blog: false,
      blogPost: null,
    });

    expect(url).toBe('http://localhost:3000/');
    expect(url).not.toContain('year=');
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
      tab: null,
      showACs: null,
      blog: false,
      blogPost: null,
    });

    // Constituencies view appends /pc for state-level PC view
    expect(url).toBe('http://localhost:3000/tamil-nadu/pc');
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

  it('generates shareable URL for PC with year', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'constituencies', 'Salem', null, null, 2024, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: 'Salem',
      district: null,
      assembly: null,
      year: 2024,
      pcYear: null,
    });

    expect(url).toBe('http://localhost:3000/tamil-nadu/pc/salem?year=2024');
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

  it('generates shareable URL for assembly with PC year (year=pc-YYYY)', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(
        'Andhra Pradesh',
        'constituencies',
        'Ongole',
        null,
        'Darsi',
        null,
        2024,
        onNavigate
      )
    );

    const url = result.current.getShareableUrl({
      state: 'Andhra Pradesh',
      view: 'constituencies',
      pc: 'Ongole',
      district: null,
      assembly: 'Darsi',
      year: null,
      pcYear: 2024,
    });

    expect(url).toBe('http://localhost:3000/andhra-pradesh/pc/ongole/ac/darsi?year=pc-2024');
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

  it('generates shareable URL for state-level districts map with assembly year', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'districts', null, null, null, 2021, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'districts',
      pc: null,
      district: null,
      assembly: null,
      year: 2021,
      pcYear: null,
    });

    expect(url).toBe('http://localhost:3000/tamil-nadu/districts?year=2021');
  });

  it('generates shareable URL for state-level districts map with pc contribution year', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'districts', null, null, null, null, 2024, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'districts',
      pc: null,
      district: null,
      assembly: null,
      year: null,
      pcYear: 2024,
    });

    expect(url).toBe('http://localhost:3000/tamil-nadu/districts?year=pc-2024');
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

  it('parses showACs=true from URL', () => {
    window.location.pathname = '/tamil-nadu/pc/dharmapuri';
    window.location.search = '?showACs=true';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.pc).toBe('dharmapuri');
    expect(urlState.showACs).toBe(true);
  });

  it('parses showACs=false from URL', () => {
    window.location.pathname = '/tamil-nadu/pc/dharmapuri';
    window.location.search = '?showACs=false';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.showACs).toBe(false);
  });

  it('parses AC-within-PC URL with year=pc-YYYY and showACs', () => {
    window.location.pathname = '/tamil-nadu/pc/dharmapuri/ac/mettur';
    window.location.search = '?year=pc-2019&showACs=true';
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(null, 'constituencies', null, null, null, null, null, onNavigate)
    );

    const urlState = result.current.getUrlState();
    expect(urlState.state).toBe('tamil nadu');
    expect(urlState.pc).toBe('dharmapuri');
    expect(urlState.assembly).toBe('mettur');
    expect(urlState.year).toBeNull();
    expect(urlState.pcYear).toBe(2019);
    expect(urlState.showACs).toBe(true);
  });

  it('generates shareable URL for PC with showACs', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'constituencies', 'Dharmapuri', null, null, null, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: 'Dharmapuri',
      district: null,
      assembly: null,
      year: null,
      pcYear: null,
      tab: null,
      showACs: true,
      blog: false,
      blogPost: null,
    });

    expect(url).toContain('showACs=true');
  });

  it('generates shareable URL for AC-within-PC with year=pc-YYYY and showACs', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState(
        'Tamil Nadu',
        'constituencies',
        'Dharmapuri',
        null,
        'Mettur',
        null,
        2019,
        onNavigate
      )
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'constituencies',
      pc: 'Dharmapuri',
      district: null,
      assembly: 'Mettur',
      year: null,
      pcYear: 2019,
      tab: null,
      showACs: true,
      blog: false,
      blogPost: null,
    });

    expect(url).toContain('year=pc-2019');
    expect(url).toContain('showACs=true');
  });

  it('generates shareable URL with pane stack params', () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() =>
      useUrlState('Tamil Nadu', 'assemblies', null, null, null, 2021, null, onNavigate)
    );

    const url = result.current.getShareableUrl({
      state: 'Tamil Nadu',
      view: 'assemblies',
      pc: null,
      district: null,
      assembly: null,
      year: 2021,
      pcYear: null,
      tab: null,
      showACs: null,
      blog: false,
      blogPost: null,
      pane: 'party',
      paneView: 'votes',
      paneParty: 'Dravida Munnetra Kazhagam',
    });

    expect(url).toContain('pane=party');
    expect(url).toContain('paneView=votes');
    expect(url).toMatch(/paneParty=/);
  });
});
