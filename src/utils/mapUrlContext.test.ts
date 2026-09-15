import { describe, it, expect } from 'vitest';
import {
  isAssemblyMapDataPath,
  isPcPath,
  isStateLevelPcPath,
  parseAssemblyYearParam,
  parsePcPrefixedYear,
  pathSegments,
  rawYearParam,
  stateNameFromPath,
} from './mapUrlContext';

describe('pathSegments', () => {
  it('drops empty segments from leading/trailing/double slashes', () => {
    expect(pathSegments('/tamil-nadu/pc/')).toEqual(['tamil-nadu', 'pc']);
    expect(pathSegments('/')).toEqual([]);
    expect(pathSegments('')).toEqual([]);
  });
});

describe('year params', () => {
  it('parses a plain assembly year', () => {
    expect(parseAssemblyYearParam('?year=2021')).toBe(2021);
  });

  it('rejects a pc-prefixed year as an assembly year', () => {
    expect(parseAssemblyYearParam('?year=pc-2024')).toBeNull();
  });

  it('returns null for missing or unparseable years', () => {
    expect(parseAssemblyYearParam('')).toBeNull();
    expect(parseAssemblyYearParam('?year=')).toBeNull();
    expect(parseAssemblyYearParam('?year=banana')).toBeNull();
  });

  it('parses the Lok Sabha year out of a pc- slot', () => {
    expect(parsePcPrefixedYear('?year=pc-2024')).toBe(2024);
  });

  it('returns null from pc parser for a plain assembly year', () => {
    expect(parsePcPrefixedYear('?year=2021')).toBeNull();
    expect(parsePcPrefixedYear('?year=pc-nope')).toBeNull();
  });

  it('rawYearParam distinguishes absent from unparseable', () => {
    expect(rawYearParam('?state=tn')).toBeNull();
    expect(rawYearParam('?year=banana')).toBe('banana');
  });
});

describe('path shapes', () => {
  it('detects the PC layer with and without a selected PC', () => {
    expect(isPcPath('/tamil-nadu/pc')).toBe(true);
    expect(isPcPath('/tamil-nadu/pc/chennai-south')).toBe(true);
    expect(isPcPath('/tamil-nadu/ac')).toBe(false);
    expect(isPcPath('/tamil-nadu')).toBe(false);
  });

  it('state-level PC means no PC selected', () => {
    expect(isStateLevelPcPath('/tamil-nadu/pc')).toBe(true);
    expect(isStateLevelPcPath('/tamil-nadu/pc/chennai-south')).toBe(false);
  });

  it('is case-insensitive on the layer segment', () => {
    expect(isPcPath('/tamil-nadu/PC')).toBe(true);
    expect(isAssemblyMapDataPath('/tamil-nadu/AC')).toBe(true);
  });

  it('recognises state-wide and district-scoped assembly paths', () => {
    expect(isAssemblyMapDataPath('/tamil-nadu/ac')).toBe(true);
    expect(isAssemblyMapDataPath('/tamil-nadu/ac/arani')).toBe(true);
    expect(isAssemblyMapDataPath('/tamil-nadu/district/vellore/ac/arani')).toBe(true);
  });

  it('requires a named AC on the district-scoped form', () => {
    // `/state/district/<d>/ac` (no AC name) is the district browse list, not an
    // assembly-coloured map, so it stays on the district data path.
    expect(isAssemblyMapDataPath('/tamil-nadu/district/vellore/ac')).toBe(false);
  });

  it('does not treat PC paths or over-long AC paths as assembly map data', () => {
    expect(isAssemblyMapDataPath('/tamil-nadu/pc')).toBe(false);
    expect(isAssemblyMapDataPath('/tamil-nadu/ac/arani/extra')).toBe(false);
    expect(isAssemblyMapDataPath('/tamil-nadu/district/vellore')).toBe(false);
  });
});

describe('stateNameFromPath', () => {
  it('turns the slug back into a readable state name', () => {
    expect(stateNameFromPath('/tamil-nadu/pc')).toBe('tamil nadu');
    expect(stateNameFromPath('/andhra-pradesh')).toBe('andhra pradesh');
  });

  it('decodes percent-encoding', () => {
    expect(stateNameFromPath('/jammu%20and%20kashmir')).toBe('jammu and kashmir');
  });

  it('returns null when there is no state slug', () => {
    expect(stateNameFromPath('/')).toBeNull();
  });
});
