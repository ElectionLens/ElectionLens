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

describe('constants', () => {
  describe('STATE_FILE_MAP', () => {
    describe('coverage', () => {
      it('should have unique file names for unique states', () => {
        const uniqueFileNames = [...new Set(Object.values(STATE_FILE_MAP))];
        // 36 states/UTs but some names map to same file (variations)
        expect(uniqueFileNames.length).toBe(36);
      });

      it('should contain all major states', () => {
        const majorStates = [
          'Andhra Pradesh',
          'Bihar',
          'Gujarat',
          'Karnataka',
          'Kerala',
          'Madhya Pradesh',
          'Maharashtra',
          'Odisha',
          'Punjab',
          'Rajasthan',
          'Tamil Nadu',
          'Telangana',
          'Uttar Pradesh',
          'West Bengal',
        ];
        majorStates.forEach((state) => {
          expect(STATE_FILE_MAP[state]).toBeDefined();
        });
      });

      it('should contain all union territories', () => {
        const uts = [
          'Delhi',
          'Chandigarh',
          'Puducherry',
          'Lakshadweep',
          'Ladakh',
          'Andaman and Nicobar Islands',
        ];
        uts.forEach((ut) => {
          expect(STATE_FILE_MAP[ut]).toBeDefined();
        });
      });

      it('should contain northeastern states', () => {
        const neStates = [
          'Arunachal Pradesh',
          'Assam',
          'Manipur',
          'Meghalaya',
          'Mizoram',
          'Nagaland',
          'Sikkim',
          'Tripura',
        ];
        neStates.forEach((state) => {
          expect(STATE_FILE_MAP[state]).toBeDefined();
        });
      });
    });

    describe('alternate name mappings', () => {
      it('should map Delhi variations correctly', () => {
        expect(STATE_FILE_MAP['Delhi']).toBe('delhi');
        expect(STATE_FILE_MAP['NCT of Delhi']).toBe('delhi');
      });

      it('should map Jammu & Kashmir variations correctly', () => {
        expect(STATE_FILE_MAP['Jammu and Kashmir']).toBe('jammu-and-kashmir');
        expect(STATE_FILE_MAP['Jammu & Kashmir']).toBe('jammu-and-kashmir');
      });

      it('should map Andaman & Nicobar variations correctly', () => {
        expect(STATE_FILE_MAP['Andaman and Nicobar Islands']).toBe('andaman-and-nicobar-islands');
        expect(STATE_FILE_MAP['Andaman & Nicobar Islands']).toBe('andaman-and-nicobar-islands');
      });

      it('should map DNH and DD correctly', () => {
        expect(STATE_FILE_MAP['Dadra and Nagar Haveli and Daman and Diu']).toBe('dnh-and-dd');
      });
    });

    describe('file name format', () => {
      it('should map all entries to valid file names', () => {
        Object.values(STATE_FILE_MAP).forEach((fileName) => {
          expect(fileName).toMatch(/^[a-z-]+$/);
          expect(fileName).not.toContain(' ');
          expect(fileName).not.toContain('_');
          expect(fileName.length).toBeGreaterThan(0);
        });
      });

      it('should not have leading or trailing hyphens', () => {
        Object.values(STATE_FILE_MAP).forEach((fileName) => {
          expect(fileName).not.toMatch(/^-/);
          expect(fileName).not.toMatch(/-$/);
        });
      });

      it('should not have consecutive hyphens', () => {
        Object.values(STATE_FILE_MAP).forEach((fileName) => {
          expect(fileName).not.toMatch(/--/);
        });
      });
    });

    describe('specific file name verification', () => {
      it('should have correct file names for all states', () => {
        const expectedMappings = {
          'Tamil Nadu': 'tamil-nadu',
          Kerala: 'kerala',
          'Andhra Pradesh': 'andhra-pradesh',
          'Uttar Pradesh': 'uttar-pradesh',
          'Madhya Pradesh': 'madhya-pradesh',
          'Himachal Pradesh': 'himachal-pradesh',
          'Arunachal Pradesh': 'arunachal-pradesh',
          'West Bengal': 'west-bengal',
          'Jammu and Kashmir': 'jammu-and-kashmir',
          'Andaman and Nicobar Islands': 'andaman-and-nicobar-islands',
          'Dadra and Nagar Haveli and Daman and Diu': 'dnh-and-dd',
        };
        Object.entries(expectedMappings).forEach(([state, file]) => {
          expect(STATE_FILE_MAP[state]).toBe(file);
        });
      });
    });
  });

  describe('COLOR_PALETTES', () => {
    describe('structure', () => {
      it('should have 4 palettes', () => {
        expect(Object.keys(COLOR_PALETTES)).toHaveLength(4);
        expect(COLOR_PALETTES).toHaveProperty('states');
        expect(COLOR_PALETTES).toHaveProperty('districts');
        expect(COLOR_PALETTES).toHaveProperty('constituencies');
        expect(COLOR_PALETTES).toHaveProperty('assemblies');
      });

      it('should have 20 colors per palette', () => {
        Object.values(COLOR_PALETTES).forEach((palette) => {
          expect(palette).toHaveLength(20);
        });
      });
    });

    describe('color format', () => {
      it('should have valid hex colors', () => {
        const hexRegex = /^#[0-9a-f]{6}$/i;
        Object.values(COLOR_PALETTES).forEach((palette) => {
          palette.forEach((color) => {
            expect(color).toMatch(hexRegex);
          });
        });
      });

      it('should have lowercase hex colors', () => {
        Object.values(COLOR_PALETTES).forEach((palette) => {
          palette.forEach((color) => {
            expect(color).toMatch(/^#[0-9a-f]{6}$/);
          });
        });
      });
    });

    describe('color uniqueness', () => {
      it('should have some unique colors within each palette', () => {
        Object.values(COLOR_PALETTES).forEach((palette) => {
          const uniqueColors = new Set(palette);
          // At least 15 unique colors per palette
          expect(uniqueColors.size).toBeGreaterThanOrEqual(15);
        });
      });

      it('should have distinct palettes', () => {
        const stateColors = new Set(COLOR_PALETTES.states);
        const districtColors = new Set(COLOR_PALETTES.districts);
        const pcColors = new Set(COLOR_PALETTES.constituencies);
        const acColors = new Set(COLOR_PALETTES.assemblies);

        // Check that first colors are different between palettes
        expect(COLOR_PALETTES.states[0]).not.toBe(COLOR_PALETTES.districts[0]);
        expect(COLOR_PALETTES.districts[0]).not.toBe(COLOR_PALETTES.constituencies[0]);
        expect(COLOR_PALETTES.constituencies[0]).not.toBe(COLOR_PALETTES.assemblies[0]);
      });
    });

    describe('palette themes', () => {
      it('should have earthy tones for states palette', () => {
        // States palette uses browns/tans
        expect(COLOR_PALETTES.states[0]).toBe('#c2956e');
      });

      it('should have blue tones for districts palette', () => {
        // Districts palette uses teals/blues
        expect(COLOR_PALETTES.districts[0]).toBe('#5c9ead');
      });

      it('should have purple tones for constituencies palette', () => {
        // Constituencies palette uses purples
        expect(COLOR_PALETTES.constituencies[0]).toBe('#9b7bb8');
      });

      it('should have green tones for assemblies palette', () => {
        // Assemblies palette uses greens
        expect(COLOR_PALETTES.assemblies[0]).toBe('#6b9b78');
      });
    });
  });

  describe('ASM_STATE_ALIASES', () => {
    describe('historical name mappings', () => {
      it('should map Odisha to Orissa (old name)', () => {
        expect(ASM_STATE_ALIASES['ODISHA']).toBe('ORISSA');
      });

      it('should map Uttarakhand spelling variation', () => {
        expect(ASM_STATE_ALIASES['UTTARAKHAND']).toBe('UTTARKHAND');
      });

      it('should map Telangana to Andhra Pradesh (pre-2014 data)', () => {
        expect(ASM_STATE_ALIASES['TELANGANA']).toBe('ANDHRA PRADESH');
      });
    });

    describe('format', () => {
      it('should use uppercase keys', () => {
        Object.keys(ASM_STATE_ALIASES).forEach((key) => {
          expect(key).toBe(key.toUpperCase());
        });
      });

      it('should use uppercase values', () => {
        Object.values(ASM_STATE_ALIASES).forEach((value) => {
          expect(value).toBe(value.toUpperCase());
        });
      });
    });
  });

  describe('DISTRICT_NAME_MAPPINGS', () => {
    describe('format', () => {
      it('should follow KEY|STATE format', () => {
        Object.keys(DISTRICT_NAME_MAPPINGS).forEach((key) => {
          expect(key).toContain('|');
          const parts = key.split('|');
          expect(parts).toHaveLength(2);
          expect(parts[0].length).toBeGreaterThan(0);
          expect(parts[1].length).toBeGreaterThan(0);
        });
      });

      it('should have uppercase keys', () => {
        Object.keys(DISTRICT_NAME_MAPPINGS).forEach((key) => {
          expect(key).toBe(key.toUpperCase());
        });
      });

      it('should have uppercase values', () => {
        Object.values(DISTRICT_NAME_MAPPINGS).forEach((value) => {
          expect(value).toBe(value.toUpperCase());
        });
      });
    });

    describe('state coverage', () => {
      it('should have Tamil Nadu mappings', () => {
        const tnMappings = Object.keys(DISTRICT_NAME_MAPPINGS).filter((k) =>
          k.includes('|TAMIL NADU')
        );
        expect(tnMappings.length).toBeGreaterThan(5);
      });

      it('should have Karnataka mappings', () => {
        const kaMappings = Object.keys(DISTRICT_NAME_MAPPINGS).filter((k) =>
          k.includes('|KARNATAKA')
        );
        expect(kaMappings.length).toBeGreaterThan(5);
      });

      it('should have Telangana mappings', () => {
        const tsMappings = Object.keys(DISTRICT_NAME_MAPPINGS).filter((k) =>
          k.includes('|TELANGANA')
        );
        expect(tsMappings.length).toBeGreaterThan(10);
      });

      it('should have Andhra Pradesh mappings', () => {
        const apMappings = Object.keys(DISTRICT_NAME_MAPPINGS).filter((k) =>
          k.includes('|ANDHRA PRADESH')
        );
        expect(apMappings.length).toBeGreaterThan(5);
      });
    });

    describe('specific mappings', () => {
      it('should map renamed districts correctly', () => {
        expect(DISTRICT_NAME_MAPPINGS['NILGIRIS|TAMIL NADU']).toBe('THE NILGIRIS');
        expect(DISTRICT_NAME_MAPPINGS['BENGALURU URBAN|KARNATAKA']).toBe('BANGALORE');
        expect(DISTRICT_NAME_MAPPINGS['MYSURU|KARNATAKA']).toBe('MYSORE');
        expect(DISTRICT_NAME_MAPPINGS['CHHATRAPATI SAMBHAJINAGAR|MAHARASHTRA']).toBe('AURANGABAD');
      });

      it('should map new districts to parent districts', () => {
        // Tamil Nadu new districts
        expect(DISTRICT_NAME_MAPPINGS['MAYILADUTHURAI|TAMIL NADU']).toBe('NAGAPATTINAM');
        expect(DISTRICT_NAME_MAPPINGS['KALLAKURICHI|TAMIL NADU']).toBe('VILUPPURAM');

        // Telangana new districts
        expect(DISTRICT_NAME_MAPPINGS['BHADRADRI KOTHAGUDEM|TELANGANA']).toBe('KHAMMAM');
        expect(DISTRICT_NAME_MAPPINGS['SANGAREDDY|TELANGANA']).toBe('MEDAK');
      });
    });
  });

  describe('PC_NAME_MAPPINGS', () => {
    describe('format', () => {
      it('should follow KEY|STATE format', () => {
        Object.keys(PC_NAME_MAPPINGS).forEach((key) => {
          expect(key).toContain('|');
          const parts = key.split('|');
          expect(parts).toHaveLength(2);
        });
      });
    });

    describe('specific mappings', () => {
      it('should map Assam PC names correctly', () => {
        expect(PC_NAME_MAPPINGS['NAGAON|ASSAM']).toBe('NOWGONG');
        expect(PC_NAME_MAPPINGS['DIPHU (EX AUTONOMOUS DISTRICT)|ASSAM']).toBe(
          'AUTONOMOUS DISTRICT'
        );
        expect(PC_NAME_MAPPINGS['KAZIRANGA (EX KALIABOR)|ASSAM']).toBe('KALIABOR');
      });

      it('should map J&K PC names correctly', () => {
        expect(PC_NAME_MAPPINGS['ANANTNAG|JAMMU & KASHMIR']).toBe('ANANTANAG');
        expect(PC_NAME_MAPPINGS['ANANTNAG-RAJOURI|JAMMU & KASHMIR']).toBe('ANANTANAG');
      });

      it('should handle truncated names', () => {
        expect(PC_NAME_MAPPINGS['THIRUVANANTHAPURAM|KERALA']).toBe('THIRUVANANTHAPURA');
        expect(PC_NAME_MAPPINGS['NAINITAL-UDHAMSINGH NAGAR|UTTARAKHAND']).toBe(
          'NAINITAL-UDHAMSINGH NAG'
        );
      });
    });
  });

  describe('PC_STATE_ALIASES', () => {
    describe('mappings', () => {
      it('should map NCT of Delhi to Delhi', () => {
        expect(PC_STATE_ALIASES['NCT of Delhi']).toBe('Delhi');
      });

      it('should map Andaman & Nicobar variations', () => {
        expect(PC_STATE_ALIASES['Andaman & Nicobar']).toBe('Andaman and Nicobar Islands');
        expect(PC_STATE_ALIASES['Andaman & Nicobar Islands']).toBe('Andaman and Nicobar Islands');
      });

      it('should map Jammu & Kashmir', () => {
        expect(PC_STATE_ALIASES['Jammu & Kashmir']).toBe('Jammu and Kashmir');
      });
    });

    describe('case preservation', () => {
      it('should maintain original case in keys', () => {
        expect(PC_STATE_ALIASES).toHaveProperty('NCT of Delhi');
        expect(PC_STATE_ALIASES).toHaveProperty('Andaman & Nicobar');
      });

      it('should maintain original case in values', () => {
        expect(PC_STATE_ALIASES['NCT of Delhi']).toBe('Delhi');
        expect(PC_STATE_ALIASES['Andaman & Nicobar']).toBe('Andaman and Nicobar Islands');
      });
    });
  });

  describe('IndexedDB constants', () => {
    describe('database configuration', () => {
      it('should have correct DB name', () => {
        expect(DB_NAME).toBe('IndiaElectionMapDB');
      });

      it('should have correct DB version', () => {
        expect(DB_VERSION).toBe(1);
        expect(typeof DB_VERSION).toBe('number');
      });

      it('should have correct store name', () => {
        expect(STORE_NAME).toBe('geojson');
      });
    });

    describe('naming conventions', () => {
      it('should use PascalCase for DB name', () => {
        expect(DB_NAME).toMatch(/^[A-Z][a-zA-Z]+$/);
      });

      it('should use lowercase for store name', () => {
        expect(STORE_NAME).toMatch(/^[a-z]+$/);
      });
    });
  });

  describe('data integrity', () => {
    describe('cross-reference validation', () => {
      it('should have consistent state names across mappings', () => {
        // States mentioned in DISTRICT_NAME_MAPPINGS should be in STATE_FILE_MAP
        const statesInDistrictMappings = new Set(
          Object.keys(DISTRICT_NAME_MAPPINGS).map((k) => k.split('|')[1])
        );

        // These states should have entries (directly or via alias)
        const expectedStates = [
          'TAMIL NADU',
          'KARNATAKA',
          'TELANGANA',
          'ANDHRA PRADESH',
          'MAHARASHTRA',
          'MADHYA PRADESH',
          'ODISHA',
          'CHHATTISGARH',
          'GUJARAT',
          'RAJASTHAN',
          'UTTAR PRADESH',
          'BIHAR',
          'JHARKHAND',
          'ASSAM',
          'MANIPUR',
        ];

        expectedStates.forEach((state) => {
          expect(statesInDistrictMappings.has(state)).toBe(true);
        });
      });

      it('should have consistent state names in PC mappings', () => {
        const statesInPcMappings = new Set(
          Object.keys(PC_NAME_MAPPINGS).map((k) => k.split('|')[1])
        );

        // Verify key states are present
        expect(statesInPcMappings.has('ASSAM')).toBe(true);
        expect(statesInPcMappings.has('KERALA')).toBe(true);
      });
    });
  });
});
