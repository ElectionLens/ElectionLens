import { describe, it, expect } from 'vitest';
import {
  PARTY_DATA,
  getPartyInfo,
  getPartyColor,
  getPartySymbol,
  getPartyFullName,
} from './partyData';

describe('partyData', () => {
  describe('PARTY_DATA', () => {
    it('should contain major national parties', () => {
      expect(PARTY_DATA.BJP).toBeDefined();
      expect(PARTY_DATA.INC).toBeDefined();
      expect(PARTY_DATA.BSP).toBeDefined();
      expect(PARTY_DATA.AAP).toBeDefined();
      expect(PARTY_DATA.CPM).toBeDefined();
    });

    it('should contain regional parties', () => {
      expect(PARTY_DATA.DMK).toBeDefined();
      expect(PARTY_DATA.TVK).toBeDefined();
      expect(PARTY_DATA.TVK?.shortName).toBe('TVK');
      expect(PARTY_DATA.AIADMK).toBeDefined();
      expect(PARTY_DATA.TMC).toBeDefined();
      expect(PARTY_DATA.SP).toBeDefined();
      expect(PARTY_DATA.BJD).toBeDefined();
      expect(PARTY_DATA.TDP).toBeDefined();
      expect(PARTY_DATA.BRS).toBeDefined();
    });

    it('should have correct structure for each party', () => {
      const bjp = PARTY_DATA.BJP;
      expect(bjp).toHaveProperty('name');
      expect(bjp).toHaveProperty('shortName');
      expect(bjp).toHaveProperty('color');
      expect(bjp).toHaveProperty('symbol');
    });

    it('should have valid hex colors', () => {
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      Object.values(PARTY_DATA).forEach((party) => {
        expect(party.color).toMatch(hexColorRegex);
      });
    });
  });

  describe('getPartyInfo', () => {
    it('should return party info for known parties', () => {
      const bjpInfo = getPartyInfo('BJP');
      expect(bjpInfo.name).toBe('Bharatiya Janata Party');
      expect(bjpInfo.shortName).toBe('BJP');
      expect(bjpInfo.color).toBe('#FF9933');
    });

    it('should handle lowercase party codes', () => {
      const incInfo = getPartyInfo('inc');
      expect(incInfo.name).toBe('Indian National Congress');
    });

    it('should handle mixed case party codes', () => {
      const dmkInfo = getPartyInfo('DmK');
      expect(dmkInfo.name).toBe('Dravida Munnetra Kazhagam');
    });

    it('should handle party codes with spaces', () => {
      const info = getPartyInfo('  BJP  ');
      expect(info.name).toBe('Bharatiya Janata Party');
    });

    it('should return default info for unknown parties', () => {
      const unknownInfo = getPartyInfo('UNKNOWN_PARTY');
      expect(unknownInfo.name).toBe('UNKNOWN_PARTY');
      expect(unknownInfo.shortName).toBe('UNKNOWN_PARTY');
      expect(unknownInfo.color).toBe('#6B7280');
      expect(unknownInfo.symbol).toBe('🏛️');
    });

    it('should handle empty string', () => {
      const emptyInfo = getPartyInfo('');
      expect(emptyInfo.name).toBe('');
      expect(emptyInfo.color).toBe('#6B7280');
    });
  });

  describe('getPartyColor', () => {
    it('should return correct colors for major parties', () => {
      expect(getPartyColor('BJP')).toBe('#FF9933');
      expect(getPartyColor('INC')).toBe('#19AAED');
      expect(getPartyColor('DMK')).toBe('#E31E24');
      expect(getPartyColor('TVK')).toBe('#7C1F3E');
      expect(getPartyColor('AIADMK')).toBe('#138808');
    });

    it('should return default gray for unknown parties', () => {
      expect(getPartyColor('UNKNOWN')).toBe('#6B7280');
    });

    it('should be case insensitive', () => {
      expect(getPartyColor('bjp')).toBe('#FF9933');
      expect(getPartyColor('Bjp')).toBe('#FF9933');
    });

    it('should handle IND (Independent)', () => {
      expect(getPartyColor('IND')).toBe('#808080');
    });
  });

  describe('getPartySymbol', () => {
    it('should return correct symbols for major parties', () => {
      expect(getPartySymbol('BJP')).toBe('🪷');
      expect(getPartySymbol('INC')).toBe('✋');
      expect(getPartySymbol('BSP')).toBe('🐘');
      expect(getPartySymbol('AAP')).toBe('🧹');
    });

    it('should return default symbol for unknown parties', () => {
      expect(getPartySymbol('UNKNOWN')).toBe('🏛️');
    });

    it('should be case insensitive', () => {
      expect(getPartySymbol('dmk')).toBe('☀️');
    });
  });

  describe('getPartyFullName', () => {
    it('should return full names for known parties', () => {
      expect(getPartyFullName('BJP')).toBe('Bharatiya Janata Party');
      expect(getPartyFullName('INC')).toBe('Indian National Congress');
      expect(getPartyFullName('DMK')).toBe('Dravida Munnetra Kazhagam');
      expect(getPartyFullName('TMC')).toBe('All India Trinamool Congress');
    });

    it('should return the code itself for unknown parties', () => {
      expect(getPartyFullName('UNKNOWN')).toBe('UNKNOWN');
    });

    it('should be case insensitive', () => {
      expect(getPartyFullName('bjp')).toBe('Bharatiya Janata Party');
    });

    it('should handle party aliases', () => {
      // ADMK is alias for AIADMK
      expect(getPartyFullName('ADMK')).toBe('All India Anna Dravida Munnetra Kazhagam');
      // AITC is alias for TMC
      expect(getPartyFullName('AITC')).toBe('All India Trinamool Congress');
    });
  });

  describe('Party Aliases', () => {
    it('should handle ADMK as AIADMK', () => {
      const admkInfo = getPartyInfo('ADMK');
      const aiadmkInfo = getPartyInfo('AIADMK');
      expect(admkInfo.color).toBe(aiadmkInfo.color);
    });

    it('should handle AAAP as AAP', () => {
      const aaapInfo = getPartyInfo('AAAP');
      const aapInfo = getPartyInfo('AAP');
      expect(aaapInfo.color).toBe(aapInfo.color);
    });

    it('should handle TRS as BRS', () => {
      const trsInfo = getPartyInfo('TRS');
      const brsInfo = getPartyInfo('BRS');
      expect(trsInfo.color).toBe(brsInfo.color);
    });

    it('should handle JDU as JD(U)', () => {
      const jduInfo = getPartyInfo('JDU');
      expect(jduInfo.name).toBe('Janata Dal (United)');
    });

    it('should handle CPI(M) as CPM', () => {
      const cpiMInfo = getPartyInfo('CPI(M)');
      const cpmInfo = getPartyInfo('CPM');
      expect(cpiMInfo.color).toBe(cpmInfo.color);
    });

    it('should handle CPIM (no space) as CPM', () => {
      const cpimInfo = getPartyInfo('CPIM');
      const cpmInfo = getPartyInfo('CPM');
      expect(cpimInfo.color).toBe(cpmInfo.color);
      expect(cpimInfo.color).toBe('#B71C1C');
    });

    it('should handle BJPARTY as BJP', () => {
      expect(getPartyInfo('BJPARTY').color).toBe('#FF9933');
      expect(getPartyInfo('BJPARTY').name).toBe('Bharatiya Janata Party');
    });

    it('should resolve MNM and TNLK (Tamil Nadu parties in data)', () => {
      expect(PARTY_DATA.MNM).toBeDefined();
      expect(getPartyColor('MNM')).toBe('#6366F1');
      expect(PARTY_DATA.TNLK).toBeDefined();
      expect(getPartyColor('TNLK')).toBe('#7C3AED');
    });

    it('should resolve winner-party aliases and new winner parties (no gray)', () => {
      const gray = '#6B7280';
      expect(getPartyColor('ZPM')).not.toBe(gray);
      expect(getPartyColor('JKNPP')).not.toBe(gray);
      expect(getPartyColor('Janata Dal(United)')).not.toBe(gray);
      expect(getPartyInfo('Janata Dal(United)').name).toContain('Janata Dal');
      expect(getPartyColor('CPI(ML)(L)')).not.toBe(gray);
      expect(getPartyColor('ALL INDIA MAJLIS-E-ITTEHADUL MUSLIMEEN')).not.toBe(gray);
      expect(getPartyColor('SHIV SENA (UDDHAV BALASAHEB THACKERAY)')).not.toBe(gray);
      expect(getPartyColor('UNITED DEMOCRATIC PARTY')).not.toBe(gray);
      expect(getPartyColor('AJSU PARTY')).not.toBe(gray);
    });
  });

  describe('Regional Parties Coverage', () => {
    it('should have Tamil Nadu parties', () => {
      expect(PARTY_DATA.DMK).toBeDefined();
      expect(PARTY_DATA.AIADMK).toBeDefined();
      expect(PARTY_DATA.PMK).toBeDefined();
      expect(PARTY_DATA.DMDK).toBeDefined();
      expect(PARTY_DATA.VCK).toBeDefined();
      expect(PARTY_DATA.NTK).toBeDefined();
    });

    it('should have Andhra/Telangana parties', () => {
      expect(PARTY_DATA.TDP).toBeDefined();
      expect(PARTY_DATA.YSRCP).toBeDefined();
      expect(PARTY_DATA.BRS).toBeDefined();
    });

    it('should have Bihar/Jharkhand parties', () => {
      expect(PARTY_DATA.RJD).toBeDefined();
      expect(PARTY_DATA['JD(U)']).toBeDefined();
      expect(PARTY_DATA.JMM).toBeDefined();
    });

    it('should have Maharashtra parties', () => {
      expect(PARTY_DATA.SHS).toBeDefined();
      expect(PARTY_DATA.NCP).toBeDefined();
    });

    it('should have Kerala parties', () => {
      expect(PARTY_DATA.IUML).toBeDefined();
      expect(PARTY_DATA.CPI).toBeDefined();
      expect(PARTY_DATA.CPM).toBeDefined();
    });

    it('should have J&K parties', () => {
      expect(PARTY_DATA.JKNC).toBeDefined();
      expect(PARTY_DATA.PDP).toBeDefined();
    });

    it('should have North East parties', () => {
      expect(PARTY_DATA.NPP).toBeDefined();
      expect(PARTY_DATA.SKM).toBeDefined();
      expect(PARTY_DATA.MNF).toBeDefined();
    });
  });
});
