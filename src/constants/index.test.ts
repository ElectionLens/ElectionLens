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
  it('contains state ID mappings for major states', () => {
    expect(STATE_FILE_MAP['Tamil Nadu']).toBe('TN');
    expect(STATE_FILE_MAP['Andhra Pradesh']).toBe('AP');
    expect(STATE_FILE_MAP['Maharashtra']).toBe('MH');
    expect(STATE_FILE_MAP['Karnataka']).toBe('KA');
  });

  it('handles diacritic variations', () => {
    expect(STATE_FILE_MAP['Tamil Nādu']).toBe('TN');
    expect(STATE_FILE_MAP['Mahārāshtra']).toBe('MH');
  });

  it('handles Delhi variations', () => {
    expect(STATE_FILE_MAP['Delhi']).toBe('DL');
    expect(STATE_FILE_MAP['NCT of Delhi']).toBe('DL');
  });

  it('handles union territories', () => {
    expect(STATE_FILE_MAP['Chandigarh']).toBe('CH');
    expect(STATE_FILE_MAP['Puducherry']).toBe('PY');
    expect(STATE_FILE_MAP['Lakshadweep']).toBe('LD');
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

  it('handles Karnataka name changes', () => {
    expect(DISTRICT_NAME_MAPPINGS['MYSURU|KARNATAKA']).toBe('MYSORE');
    expect(DISTRICT_NAME_MAPPINGS['BELAGAVI|KARNATAKA']).toBe('BELGAUM');
    expect(DISTRICT_NAME_MAPPINGS['KALABURAGI|KARNATAKA']).toBe('GULBARGA');
    expect(DISTRICT_NAME_MAPPINGS['VIJAYAPURA|KARNATAKA']).toBe('BIJAPUR');
    expect(DISTRICT_NAME_MAPPINGS['SHIVAMOGGA|KARNATAKA']).toBe('SHIMOGA');
    expect(DISTRICT_NAME_MAPPINGS['BALLARI|KARNATAKA']).toBe('BELLARY');
    expect(DISTRICT_NAME_MAPPINGS['CHAMARAJANAGARA|KARNATAKA']).toBe('CHAMRAJNAGAR');
    expect(DISTRICT_NAME_MAPPINGS['DAVANAGERE|KARNATAKA']).toBe('DAVANGERE');
    expect(DISTRICT_NAME_MAPPINGS['CHIKKAMAGALURU|KARNATAKA']).toBe('CHIKMAGALUR');
  });

  it('handles Karnataka new districts formed 2007-2010', () => {
    // Yadgir was carved from Gulbarga (now Kalaburagi) in 2010
    expect(DISTRICT_NAME_MAPPINGS['YADGIR|KARNATAKA']).toBe('GULBARGA');
    // Ramanagara was carved from Bangalore Rural in 2007
    expect(DISTRICT_NAME_MAPPINGS['RAMANAGARA|KARNATAKA']).toBe('BANGALORE RURAL');
    // Chikkaballapura was carved from Kolar in 2007
    expect(DISTRICT_NAME_MAPPINGS['CHIKKABALLAPURA|KARNATAKA']).toBe('KOLAR');
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
