import { describe, it, expect } from 'vitest';
import {
  GEO_DATA_BASE,
  ELECTION_DATA_BASE,
  BOUNDARIES,
  PARLIAMENT,
  ASSEMBLY,
  DISTRICTS,
  ELECTIONS,
  PC_ELECTIONS,
  CACHE_KEYS,
  DATA_VERSION,
} from './paths';

describe('Path Constants', () => {
  describe('Base Paths', () => {
    it('has correct GEO_DATA_BASE path', () => {
      expect(GEO_DATA_BASE).toBe('/data/geo');
    });

    it('has correct ELECTION_DATA_BASE path', () => {
      expect(ELECTION_DATA_BASE).toBe('/data/elections');
    });
  });

  describe('BOUNDARIES', () => {
    it('has correct states path', () => {
      expect(BOUNDARIES.STATES).toBe('/data/geo/boundaries/states.geojson');
    });
  });

  describe('PARLIAMENT', () => {
    it('has correct constituencies path', () => {
      expect(PARLIAMENT.CONSTITUENCIES).toBe('/data/geo/parliament/constituencies.geojson');
    });
  });

  describe('ASSEMBLY', () => {
    it('has correct constituencies path', () => {
      expect(ASSEMBLY.CONSTITUENCIES).toBe('/data/geo/assembly/constituencies.geojson');
    });
  });

  describe('DISTRICTS', () => {
    it('has correct base path', () => {
      expect(DISTRICTS.BASE).toBe('/data/geo/districts');
    });

    it('generates correct path for state', () => {
      expect(DISTRICTS.getPath('tamil-nadu')).toBe('/data/geo/districts/tamil-nadu.geojson');
      expect(DISTRICTS.getPath('andhra-pradesh')).toBe(
        '/data/geo/districts/andhra-pradesh.geojson'
      );
    });

    it('handles various state slugs', () => {
      expect(DISTRICTS.getPath('kerala')).toBe('/data/geo/districts/kerala.geojson');
      expect(DISTRICTS.getPath('nct-of-delhi')).toBe('/data/geo/districts/nct-of-delhi.geojson');
    });
  });

  describe('ELECTIONS (Assembly)', () => {
    it('has correct base path', () => {
      expect(ELECTIONS.AC_BASE).toBe('/data/elections/ac');
    });

    it('has correct master index path', () => {
      expect(ELECTIONS.MASTER_INDEX).toBe('/data/elections/ac/index.json');
    });

    it('generates correct index path for state', () => {
      expect(ELECTIONS.getIndexPath('tamil-nadu')).toBe('/data/elections/ac/tamil-nadu/index.json');
      expect(ELECTIONS.getIndexPath('karnataka')).toBe('/data/elections/ac/karnataka/index.json');
    });

    it('generates correct year path for state and year', () => {
      expect(ELECTIONS.getYearPath('tamil-nadu', 2021)).toBe(
        '/data/elections/ac/tamil-nadu/2021.json'
      );
      expect(ELECTIONS.getYearPath('karnataka', 2023)).toBe(
        '/data/elections/ac/karnataka/2023.json'
      );
    });

    it('handles various years', () => {
      expect(ELECTIONS.getYearPath('maharashtra', 2019)).toBe(
        '/data/elections/ac/maharashtra/2019.json'
      );
      expect(ELECTIONS.getYearPath('rajasthan', 2018)).toBe(
        '/data/elections/ac/rajasthan/2018.json'
      );
    });
  });

  describe('PC_ELECTIONS (Parliament)', () => {
    it('has correct base path', () => {
      expect(PC_ELECTIONS.PC_BASE).toBe('/data/elections/pc');
    });

    it('generates correct index path for state', () => {
      expect(PC_ELECTIONS.getIndexPath('tamil-nadu')).toBe(
        '/data/elections/pc/tamil-nadu/index.json'
      );
      expect(PC_ELECTIONS.getIndexPath('west-bengal')).toBe(
        '/data/elections/pc/west-bengal/index.json'
      );
    });

    it('generates correct year path for state and year', () => {
      expect(PC_ELECTIONS.getYearPath('tamil-nadu', 2024)).toBe(
        '/data/elections/pc/tamil-nadu/2024.json'
      );
      expect(PC_ELECTIONS.getYearPath('kerala', 2019)).toBe('/data/elections/pc/kerala/2019.json');
    });

    it('handles post-delimitation years', () => {
      expect(PC_ELECTIONS.getYearPath('bihar', 2009)).toBe('/data/elections/pc/bihar/2009.json');
      expect(PC_ELECTIONS.getYearPath('bihar', 2014)).toBe('/data/elections/pc/bihar/2014.json');
      expect(PC_ELECTIONS.getYearPath('bihar', 2019)).toBe('/data/elections/pc/bihar/2019.json');
      expect(PC_ELECTIONS.getYearPath('bihar', 2024)).toBe('/data/elections/pc/bihar/2024.json');
    });
  });

  describe('CACHE_KEYS', () => {
    it('has correct static cache keys', () => {
      expect(CACHE_KEYS.STATES).toBe('geo_boundaries_states');
      expect(CACHE_KEYS.PARLIAMENT).toBe('geo_parliament_constituencies');
      expect(CACHE_KEYS.ASSEMBLY).toBe('geo_assembly_constituencies');
    });

    it('generates correct district cache keys', () => {
      expect(CACHE_KEYS.getDistrictKey('tamil-nadu')).toBe('geo_districts_tamil-nadu');
      expect(CACHE_KEYS.getDistrictKey('andhra-pradesh')).toBe('geo_districts_andhra-pradesh');
    });
  });

  describe('DATA_VERSION', () => {
    it('has correct version string', () => {
      expect(DATA_VERSION).toBe('1.0.0');
    });

    it('follows semver format', () => {
      expect(DATA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
