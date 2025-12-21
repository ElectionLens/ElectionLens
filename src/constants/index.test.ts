import { describe, it, expect } from 'vitest';
import {
  STATE_FILE_MAP,
  COLOR_PALETTES,
  ASM_STATE_ALIASES,
  DISTRICT_NAME_MAPPINGS,
  PC_NAME_MAPPINGS,
  PC_STATE_ALIASES,
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
} from './index';

describe('STATE_FILE_MAP', () => {
  it('contains mappings for major states', () => {
    expect(STATE_FILE_MAP['Tamil Nadu']).toBe('tamil-nadu');
    expect(STATE_FILE_MAP['Andhra Pradesh']).toBe('andhra-pradesh');
    expect(STATE_FILE_MAP['Maharashtra']).toBe('maharashtra');
    expect(STATE_FILE_MAP['Karnataka']).toBe('karnataka');
  });

  it('handles diacritic variations', () => {
    expect(STATE_FILE_MAP['Tamil Nādu']).toBe('tamil-nadu');
    expect(STATE_FILE_MAP['Mahārāshtra']).toBe('maharashtra');
  });

  it('handles Delhi variations', () => {
    expect(STATE_FILE_MAP['Delhi']).toBe('delhi');
    expect(STATE_FILE_MAP['NCT of Delhi']).toBe('delhi');
  });

  it('handles union territories', () => {
    expect(STATE_FILE_MAP['Chandigarh']).toBe('chandigarh');
    expect(STATE_FILE_MAP['Puducherry']).toBe('puducherry');
    expect(STATE_FILE_MAP['Lakshadweep']).toBe('lakshadweep');
  });
});

describe('COLOR_PALETTES', () => {
  it('has palettes for all map levels', () => {
    expect(COLOR_PALETTES).toHaveProperty('states');
    expect(COLOR_PALETTES).toHaveProperty('districts');
    expect(COLOR_PALETTES).toHaveProperty('constituencies');
    expect(COLOR_PALETTES).toHaveProperty('assemblies');
  });

  it('each palette has exactly 20 colors', () => {
    expect(COLOR_PALETTES.states).toHaveLength(20);
    expect(COLOR_PALETTES.districts).toHaveLength(20);
    expect(COLOR_PALETTES.constituencies).toHaveLength(20);
    expect(COLOR_PALETTES.assemblies).toHaveLength(20);
  });

  it('all colors are valid hex codes', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const palette of Object.values(COLOR_PALETTES)) {
      for (const color of palette) {
        expect(color).toMatch(hexPattern);
      }
    }
  });

  it('all colors are distinct enough for visual differentiation', () => {
    for (const palette of Object.values(COLOR_PALETTES)) {
      const uniqueColors = new Set(palette);
      // Allow some duplicates but most should be unique
      expect(uniqueColors.size).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('ASM_STATE_ALIASES', () => {
  it('maps modern state names to legacy names', () => {
    expect(ASM_STATE_ALIASES['ODISHA']).toBe('ORISSA');
    expect(ASM_STATE_ALIASES['UTTARAKHAND']).toBe('UTTARKHAND');
  });

  it('handles Telangana to Andhra Pradesh mapping', () => {
    expect(ASM_STATE_ALIASES['TELANGANA']).toBe('ANDHRA PRADESH');
  });
});

describe('DISTRICT_NAME_MAPPINGS', () => {
  it('maps new district names to old names', () => {
    expect(DISTRICT_NAME_MAPPINGS['BENGALURU URBAN|KARNATAKA']).toBe('BANGALORE');
    expect(DISTRICT_NAME_MAPPINGS['PRAYAGRAJ|UTTAR PRADESH']).toBe('ALLAHABAD');
  });

  it('handles Tamil Nadu new districts', () => {
    expect(DISTRICT_NAME_MAPPINGS['CHENGALPATTU|TAMIL NADU']).toBe('KANCHEEPURAM');
    expect(DISTRICT_NAME_MAPPINGS['KALLAKURICHI|TAMIL NADU']).toBe('VILUPPURAM');
  });

  it('handles Telangana new districts', () => {
    expect(DISTRICT_NAME_MAPPINGS['HYDERABAD|TELANGANA']).toBe('HYDERABAD');
    expect(DISTRICT_NAME_MAPPINGS['SANGAREDDY|TELANGANA']).toBe('MEDAK');
  });
});

describe('PC_NAME_MAPPINGS', () => {
  it('maps complex PC names to simpler versions', () => {
    expect(PC_NAME_MAPPINGS['NAGAON|ASSAM']).toBe('NOWGONG');
    expect(PC_NAME_MAPPINGS['THIRUVANANTHAPURAM|KERALA']).toBe('THIRUVANANTHAPURA');
  });

  it('handles renamed constituencies with (EX)', () => {
    expect(PC_NAME_MAPPINGS['KAZIRANGA (EX KALIABOR)|ASSAM']).toBe('KALIABOR');
    expect(PC_NAME_MAPPINGS['SONITPUR (EX TEZPUR)|ASSAM']).toBe('TEZPUR');
  });
});

describe('PC_STATE_ALIASES', () => {
  it('normalizes Delhi name variations', () => {
    expect(PC_STATE_ALIASES['NCT of Delhi']).toBe('Delhi');
  });

  it('normalizes Andaman name variations', () => {
    expect(PC_STATE_ALIASES['Andaman & Nicobar']).toBe('Andaman and Nicobar Islands');
    expect(PC_STATE_ALIASES['Andaman & Nicobar Islands']).toBe('Andaman and Nicobar Islands');
  });

  it('normalizes J&K name variations', () => {
    expect(PC_STATE_ALIASES['Jammu & Kashmir']).toBe('Jammu and Kashmir');
  });
});

describe('IndexedDB Configuration', () => {
  it('has correct database configuration', () => {
    expect(DB_NAME).toBe('IndiaElectionMapDB');
    expect(DB_VERSION).toBe(1);
    expect(STORE_NAME).toBe('geojson');
  });

  it('DB_VERSION is a positive integer', () => {
    expect(Number.isInteger(DB_VERSION)).toBe(true);
    expect(DB_VERSION).toBeGreaterThan(0);
  });
});
