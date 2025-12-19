import { describe, it, expect } from 'vitest';
import {
  removeDiacritics,
  normalizeStateName,
  getStateFileName,
  getFeatureColor,
  getFeatureStyle,
  getHoverStyle,
  toTitleCase
} from './helpers';

describe('helpers', () => {
  describe('removeDiacritics', () => {
    describe('basic functionality', () => {
      it('should remove diacritics from text', () => {
        expect(removeDiacritics('Rājasthān')).toBe('Rajasthan');
        expect(removeDiacritics('Bihār')).toBe('Bihar');
        expect(removeDiacritics('Karnātaka')).toBe('Karnataka');
      });

      it('should not modify text without diacritics', () => {
        expect(removeDiacritics('Kerala')).toBe('Kerala');
        expect(removeDiacritics('Tamil Nadu')).toBe('Tamil Nadu');
        expect(removeDiacritics('Gujarat')).toBe('Gujarat');
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(removeDiacritics('')).toBe('');
      });

      it('should handle null and undefined', () => {
        expect(removeDiacritics(null)).toBe('');
        expect(removeDiacritics(undefined)).toBe('');
      });

      it('should handle strings with only diacritics', () => {
        expect(removeDiacritics('āēīōū')).toBe('aeiou');
      });

      it('should handle mixed text with numbers', () => {
        expect(removeDiacritics('Districṭ 123')).toBe('District 123');
      });

      it('should handle special characters', () => {
        expect(removeDiacritics('Jammu & Kashmir')).toBe('Jammu & Kashmir');
        expect(removeDiacritics('NCT of Delhi')).toBe('NCT of Delhi');
      });

      it('should preserve case while removing diacritics', () => {
        expect(removeDiacritics('RĀJASTHĀN')).toBe('RAJASTHAN');
        expect(removeDiacritics('rājasthān')).toBe('rajasthan');
      });

      it('should handle various diacritical marks', () => {
        // Macron
        expect(removeDiacritics('ā')).toBe('a');
        // Acute accent
        expect(removeDiacritics('á')).toBe('a');
        // Grave accent
        expect(removeDiacritics('à')).toBe('a');
        // Circumflex
        expect(removeDiacritics('â')).toBe('a');
        // Tilde
        expect(removeDiacritics('ã')).toBe('a');
        // Umlaut
        expect(removeDiacritics('ä')).toBe('a');
      });

      it('should handle Indian language diacritics commonly used', () => {
        expect(removeDiacritics('Arunāchal Pradesh')).toBe('Arunachal Pradesh');
        expect(removeDiacritics('Chandīgarh')).toBe('Chandigarh');
        expect(removeDiacritics('Chhattīsgarh')).toBe('Chhattisgarh');
        expect(removeDiacritics('Gujarāt')).toBe('Gujarat');
        expect(removeDiacritics('Haryāna')).toBe('Haryana');
        expect(removeDiacritics('Himāchal Pradesh')).toBe('Himachal Pradesh');
        expect(removeDiacritics('Jhārkhand')).toBe('Jharkhand');
        expect(removeDiacritics('Ladākh')).toBe('Ladakh');
        expect(removeDiacritics('Mahārāshtra')).toBe('Maharashtra');
        expect(removeDiacritics('Meghālaya')).toBe('Meghalaya');
        expect(removeDiacritics('Nāgāland')).toBe('Nagaland');
        expect(removeDiacritics('Tamil Nādu')).toBe('Tamil Nadu');
        expect(removeDiacritics('Telangāna')).toBe('Telangana');
        expect(removeDiacritics('Uttarākhand')).toBe('Uttarakhand');
      });
    });

    describe('unicode normalization', () => {
      it('should handle combining characters', () => {
        // e followed by combining acute accent
        const combined = 'e\u0301'; // é as combining char
        expect(removeDiacritics(combined)).toBe('e');
      });

      it('should handle precomposed characters', () => {
        // Precomposed é
        expect(removeDiacritics('\u00e9')).toBe('e');
      });
    });
  });

  describe('normalizeStateName', () => {
    describe('basic functionality', () => {
      it('should normalize state names with diacritics', () => {
        expect(normalizeStateName('Rājasthān')).toBe('Rajasthan');
        expect(normalizeStateName('Uttarākhand')).toBe('Uttarakhand');
        expect(normalizeStateName('Bihār')).toBe('Bihar');
      });

      it('should trim whitespace', () => {
        expect(normalizeStateName('  Kerala  ')).toBe('Kerala');
        expect(normalizeStateName('Tamil Nadu ')).toBe('Tamil Nadu');
        expect(normalizeStateName(' Delhi')).toBe('Delhi');
      });
    });

    describe('edge cases', () => {
      it('should handle null/undefined', () => {
        expect(normalizeStateName(null)).toBe('');
        expect(normalizeStateName(undefined)).toBe('');
      });

      it('should handle empty string', () => {
        expect(normalizeStateName('')).toBe('');
      });

      it('should handle whitespace-only strings', () => {
        expect(normalizeStateName('   ')).toBe('');
        expect(normalizeStateName('\t\n')).toBe('');
      });

      it('should preserve internal spacing', () => {
        expect(normalizeStateName('Tamil Nadu')).toBe('Tamil Nadu');
        expect(normalizeStateName('Andhra Pradesh')).toBe('Andhra Pradesh');
        expect(normalizeStateName('West Bengal')).toBe('West Bengal');
      });

      it('should handle special characters', () => {
        expect(normalizeStateName('Jammu & Kashmir')).toBe('Jammu & Kashmir');
        expect(normalizeStateName('Andaman & Nicobar Islands')).toBe('Andaman & Nicobar Islands');
      });
    });

    describe('combined operations', () => {
      it('should trim and remove diacritics together', () => {
        expect(normalizeStateName('  Rājasthān  ')).toBe('Rajasthan');
        expect(normalizeStateName('\tKarnātaka\n')).toBe('Karnataka');
      });
    });
  });

  describe('getStateFileName', () => {
    describe('known states direct lookup', () => {
      it('should return correct file name for major states', () => {
        expect(getStateFileName('Tamil Nadu')).toBe('tamil-nadu');
        expect(getStateFileName('Andhra Pradesh')).toBe('andhra-pradesh');
        expect(getStateFileName('Kerala')).toBe('kerala');
        expect(getStateFileName('Karnataka')).toBe('karnataka');
        expect(getStateFileName('Maharashtra')).toBe('maharashtra');
        expect(getStateFileName('Gujarat')).toBe('gujarat');
        expect(getStateFileName('Rajasthan')).toBe('rajasthan');
        expect(getStateFileName('Uttar Pradesh')).toBe('uttar-pradesh');
        expect(getStateFileName('Madhya Pradesh')).toBe('madhya-pradesh');
        expect(getStateFileName('West Bengal')).toBe('west-bengal');
      });

      it('should return correct file name for smaller states', () => {
        expect(getStateFileName('Goa')).toBe('goa');
        expect(getStateFileName('Sikkim')).toBe('sikkim');
        expect(getStateFileName('Tripura')).toBe('tripura');
        expect(getStateFileName('Mizoram')).toBe('mizoram');
        expect(getStateFileName('Nagaland')).toBe('nagaland');
        expect(getStateFileName('Manipur')).toBe('manipur');
        expect(getStateFileName('Meghalaya')).toBe('meghalaya');
      });

      it('should return correct file name for union territories', () => {
        expect(getStateFileName('Delhi')).toBe('delhi');
        expect(getStateFileName('Chandigarh')).toBe('chandigarh');
        expect(getStateFileName('Puducherry')).toBe('puducherry');
        expect(getStateFileName('Lakshadweep')).toBe('lakshadweep');
        expect(getStateFileName('Ladakh')).toBe('ladakh');
      });
    });

    describe('diacritical variations', () => {
      it('should handle states with diacritics', () => {
        expect(getStateFileName('Rājasthān')).toBe('rajasthan');
        expect(getStateFileName('Bihār')).toBe('bihar');
        expect(getStateFileName('Karnātaka')).toBe('karnataka');
        expect(getStateFileName('Mahārāshtra')).toBe('maharashtra');
        expect(getStateFileName('Gujarāt')).toBe('gujarat');
        expect(getStateFileName('Haryāna')).toBe('haryana');
      });

      it('should handle all documented diacritical variations', () => {
        expect(getStateFileName('Arunāchal Pradesh')).toBe('arunachal-pradesh');
        expect(getStateFileName('Chandīgarh')).toBe('chandigarh');
        expect(getStateFileName('Chhattīsgarh')).toBe('chhattisgarh');
        expect(getStateFileName('Himāchal Pradesh')).toBe('himachal-pradesh');
        expect(getStateFileName('Jhārkhand')).toBe('jharkhand');
        expect(getStateFileName('Ladākh')).toBe('ladakh');
        expect(getStateFileName('Meghālaya')).toBe('meghalaya');
        expect(getStateFileName('Nāgāland')).toBe('nagaland');
        expect(getStateFileName('Tamil Nādu')).toBe('tamil-nadu');
        expect(getStateFileName('Telangāna')).toBe('telangana');
        expect(getStateFileName('Uttarākhand')).toBe('uttarakhand');
      });
    });

    describe('alternate names', () => {
      it('should handle NCT of Delhi', () => {
        expect(getStateFileName('NCT of Delhi')).toBe('delhi');
      });

      it('should handle Jammu & Kashmir variations', () => {
        expect(getStateFileName('Jammu & Kashmir')).toBe('jammu-and-kashmir');
        expect(getStateFileName('Jammu and Kashmir')).toBe('jammu-and-kashmir');
        expect(getStateFileName('Jammu and Kashmīr')).toBe('jammu-and-kashmir');
      });

      it('should handle Andaman & Nicobar variations', () => {
        expect(getStateFileName('Andaman and Nicobar Islands')).toBe('andaman-and-nicobar-islands');
        expect(getStateFileName('Andaman & Nicobar Islands')).toBe('andaman-and-nicobar-islands');
      });

      it('should handle DNH and DD', () => {
        expect(getStateFileName('Dadra and Nagar Haveli and Daman and Diu')).toBe('dnh-and-dd');
        expect(getStateFileName('Dādra and Nagar Haveli and Damān and Diu')).toBe('dnh-and-dd');
      });
    });

    describe('fallback generation', () => {
      it('should generate fallback for unknown states', () => {
        expect(getStateFileName('Unknown State')).toBe('unknown-state');
        expect(getStateFileName('New Territory')).toBe('new-territory');
      });

      it('should generate lowercase hyphenated names', () => {
        expect(getStateFileName('SOME NEW STATE')).toBe('some-new-state');
      });
    });

    describe('edge cases', () => {
      it('should handle empty input', () => {
        expect(getStateFileName('')).toBe('');
        expect(getStateFileName(null)).toBe('');
        expect(getStateFileName(undefined)).toBe('');
      });

      it('should handle single word states', () => {
        expect(getStateFileName('Kerala')).toBe('kerala');
        expect(getStateFileName('Assam')).toBe('assam');
        expect(getStateFileName('Bihar')).toBe('bihar');
        expect(getStateFileName('Odisha')).toBe('odisha');
      });
    });
  });

  describe('getFeatureColor', () => {
    describe('palette selection', () => {
      it('should return colors from state palette', () => {
        expect(getFeatureColor(0, 'states')).toBe('#c2956e');
        expect(getFeatureColor(1, 'states')).toBe('#a8b87c');
        expect(getFeatureColor(2, 'states')).toBe('#d4a574');
      });

      it('should return colors from district palette', () => {
        expect(getFeatureColor(0, 'districts')).toBe('#5c9ead');
        expect(getFeatureColor(1, 'districts')).toBe('#7eb8c4');
        expect(getFeatureColor(2, 'districts')).toBe('#4a8fa3');
      });

      it('should return colors from constituency palette', () => {
        expect(getFeatureColor(0, 'constituencies')).toBe('#9b7bb8');
        expect(getFeatureColor(1, 'constituencies')).toBe('#b894c8');
        expect(getFeatureColor(2, 'constituencies')).toBe('#8668a8');
      });

      it('should return colors from assembly palette', () => {
        expect(getFeatureColor(0, 'assemblies')).toBe('#6b9b78');
        expect(getFeatureColor(1, 'assemblies')).toBe('#88b494');
        expect(getFeatureColor(2, 'assemblies')).toBe('#5a8a68');
      });
    });

    describe('color cycling', () => {
      it('should cycle through colors when index exceeds palette length', () => {
        const color0 = getFeatureColor(0, 'states');
        const color20 = getFeatureColor(20, 'states');
        const color40 = getFeatureColor(40, 'states');
        expect(color0).toBe(color20);
        expect(color0).toBe(color40);
      });

      it('should cycle correctly for all palettes', () => {
        ['states', 'districts', 'constituencies', 'assemblies'].forEach(level => {
          expect(getFeatureColor(0, level)).toBe(getFeatureColor(20, level));
          expect(getFeatureColor(5, level)).toBe(getFeatureColor(25, level));
        });
      });

      it('should handle very large indices', () => {
        expect(getFeatureColor(1000, 'states')).toBe(getFeatureColor(0, 'states'));
        expect(getFeatureColor(999, 'districts')).toBe(getFeatureColor(19, 'districts'));
      });
    });

    describe('default behavior', () => {
      it('should default to states palette for unknown level', () => {
        expect(getFeatureColor(0, 'unknown')).toBe('#c2956e');
        expect(getFeatureColor(0, '')).toBe('#c2956e');
        expect(getFeatureColor(0, null)).toBe('#c2956e');
      });
    });

    describe('all colors valid', () => {
      it('should always return valid hex colors', () => {
        const hexRegex = /^#[0-9a-f]{6}$/i;
        ['states', 'districts', 'constituencies', 'assemblies'].forEach(level => {
          for (let i = 0; i < 30; i++) {
            expect(getFeatureColor(i, level)).toMatch(hexRegex);
          }
        });
      });
    });
  });

  describe('getFeatureStyle', () => {
    describe('style structure', () => {
      it('should return correct style object structure', () => {
        const style = getFeatureStyle(0, 'states');
        expect(style).toHaveProperty('fillColor');
        expect(style).toHaveProperty('fillOpacity');
        expect(style).toHaveProperty('color');
        expect(style).toHaveProperty('weight');
        expect(style).toHaveProperty('opacity');
      });

      it('should have consistent non-color properties', () => {
        ['states', 'districts', 'constituencies', 'assemblies'].forEach(level => {
          const style = getFeatureStyle(0, level);
          expect(style.fillOpacity).toBe(0.65);
          expect(style.color).toBe('#fff');
          expect(style.weight).toBe(1.5);
          expect(style.opacity).toBe(1);
        });
      });
    });

    describe('fill color variation', () => {
      it('should use different colors for different indices', () => {
        const style1 = getFeatureStyle(0, 'districts');
        const style2 = getFeatureStyle(1, 'districts');
        const style3 = getFeatureStyle(2, 'districts');
        expect(style1.fillColor).not.toBe(style2.fillColor);
        expect(style2.fillColor).not.toBe(style3.fillColor);
      });

      it('should use different colors for different levels', () => {
        const stateStyle = getFeatureStyle(0, 'states');
        const districtStyle = getFeatureStyle(0, 'districts');
        const pcStyle = getFeatureStyle(0, 'constituencies');
        const acStyle = getFeatureStyle(0, 'assemblies');
        
        expect(stateStyle.fillColor).not.toBe(districtStyle.fillColor);
        expect(districtStyle.fillColor).not.toBe(pcStyle.fillColor);
        expect(pcStyle.fillColor).not.toBe(acStyle.fillColor);
      });
    });

    describe('exact style values', () => {
      it('should return exact style for states index 0', () => {
        expect(getFeatureStyle(0, 'states')).toEqual({
          fillColor: '#c2956e',
          fillOpacity: 0.65,
          color: '#fff',
          weight: 1.5,
          opacity: 1
        });
      });

      it('should return exact style for districts index 0', () => {
        expect(getFeatureStyle(0, 'districts')).toEqual({
          fillColor: '#5c9ead',
          fillOpacity: 0.65,
          color: '#fff',
          weight: 1.5,
          opacity: 1
        });
      });

      it('should return exact style for constituencies index 0', () => {
        expect(getFeatureStyle(0, 'constituencies')).toEqual({
          fillColor: '#9b7bb8',
          fillOpacity: 0.65,
          color: '#fff',
          weight: 1.5,
          opacity: 1
        });
      });

      it('should return exact style for assemblies index 0', () => {
        expect(getFeatureStyle(0, 'assemblies')).toEqual({
          fillColor: '#6b9b78',
          fillOpacity: 0.65,
          color: '#fff',
          weight: 1.5,
          opacity: 1
        });
      });
    });
  });

  describe('getHoverStyle', () => {
    describe('style structure', () => {
      it('should return correct style object structure', () => {
        const style = getHoverStyle('states');
        expect(style).toHaveProperty('weight');
        expect(style).toHaveProperty('color');
        expect(style).toHaveProperty('fillOpacity');
      });

      it('should have consistent weight and fillOpacity', () => {
        ['states', 'districts', 'constituencies', 'assemblies'].forEach(level => {
          const style = getHoverStyle(level);
          expect(style.weight).toBe(3);
          expect(style.fillOpacity).toBe(0.8);
        });
      });
    });

    describe('color per level', () => {
      it('should return #333 for states', () => {
        expect(getHoverStyle('states').color).toBe('#333');
      });

      it('should return #333 for districts', () => {
        expect(getHoverStyle('districts').color).toBe('#333');
      });

      it('should return #5b21b6 (purple) for constituencies', () => {
        expect(getHoverStyle('constituencies').color).toBe('#5b21b6');
      });

      it('should return #166534 (green) for assemblies', () => {
        expect(getHoverStyle('assemblies').color).toBe('#166534');
      });
    });

    describe('exact hover styles', () => {
      it('should return exact hover style for states', () => {
        expect(getHoverStyle('states')).toEqual({
          weight: 3,
          color: '#333',
          fillOpacity: 0.8
        });
      });

      it('should return exact hover style for constituencies', () => {
        expect(getHoverStyle('constituencies')).toEqual({
          weight: 3,
          color: '#5b21b6',
          fillOpacity: 0.8
        });
      });

      it('should return exact hover style for assemblies', () => {
        expect(getHoverStyle('assemblies')).toEqual({
          weight: 3,
          color: '#166534',
          fillOpacity: 0.8
        });
      });
    });

    describe('default behavior', () => {
      it('should default to states style for unknown level', () => {
        expect(getHoverStyle('unknown').color).toBe('#333');
        expect(getHoverStyle('').color).toBe('#333');
        expect(getHoverStyle(null).color).toBe('#333');
        expect(getHoverStyle(undefined).color).toBe('#333');
      });
    });
  });

  describe('toTitleCase', () => {
    describe('basic functionality', () => {
      it('should convert lowercase to title case', () => {
        expect(toTitleCase('hello world')).toBe('Hello World');
        expect(toTitleCase('tamil nadu')).toBe('Tamil Nadu');
        expect(toTitleCase('andhra pradesh')).toBe('Andhra Pradesh');
      });

      it('should convert uppercase to title case', () => {
        expect(toTitleCase('TAMIL NADU')).toBe('Tamil Nadu');
        expect(toTitleCase('KERALA')).toBe('Kerala');
        expect(toTitleCase('WEST BENGAL')).toBe('West Bengal');
      });

      it('should handle mixed case', () => {
        expect(toTitleCase('tAmIl NaDu')).toBe('Tamil Nadu');
        expect(toTitleCase('KERALA state')).toBe('Kerala State');
      });
    });

    describe('single words', () => {
      it('should convert single word to title case', () => {
        expect(toTitleCase('kerala')).toBe('Kerala');
        expect(toTitleCase('BIHAR')).toBe('Bihar');
        expect(toTitleCase('gOa')).toBe('Goa');
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(toTitleCase('')).toBe('');
      });

      it('should handle null/undefined', () => {
        expect(toTitleCase(null)).toBe('');
        expect(toTitleCase(undefined)).toBe('');
      });

      it('should handle strings with numbers', () => {
        expect(toTitleCase('district 1')).toBe('District 1');
        expect(toTitleCase('AREA 51')).toBe('Area 51');
      });

      it('should handle strings with special characters', () => {
        expect(toTitleCase('jammu & kashmir')).toBe('Jammu & Kashmir');
        expect(toTitleCase('NCT OF DELHI')).toBe('Nct Of Delhi');
      });

      it('should handle multiple spaces', () => {
        expect(toTitleCase('west  bengal')).toBe('West  Bengal');
      });

      it('should handle hyphenated words', () => {
        // Note: this treats each hyphen-separated part as separate
        expect(toTitleCase('jammu-and-kashmir')).toBe('Jammu-And-Kashmir');
      });
    });

    describe('word boundaries', () => {
      it('should capitalize after word boundaries', () => {
        expect(toTitleCase('hello-world')).toBe('Hello-World');
        expect(toTitleCase("o'brien")).toBe("O'Brien");
      });
    });
  });
});
