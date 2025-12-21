/**
 * Party data including colors, symbols, and full names
 * Source: Official party colors and Election Commission symbols
 */

export interface PartyInfo {
  name: string;
  shortName: string;
  color: string;
  symbol: string;
  symbolEmoji?: string;
}

/** Comprehensive party database */
export const PARTY_DATA: Record<string, PartyInfo> = {
  // National Parties
  BJP: {
    name: 'Bharatiya Janata Party',
    shortName: 'BJP',
    color: '#FF9933',
    symbol: '🪷',
    symbolEmoji: '🪷',
  },
  INC: {
    name: 'Indian National Congress',
    shortName: 'INC',
    color: '#19AAED',
    symbol: '✋',
    symbolEmoji: '✋',
  },
  BSP: {
    name: 'Bahujan Samaj Party',
    shortName: 'BSP',
    color: '#22409A',
    symbol: '🐘',
    symbolEmoji: '🐘',
  },
  CPM: {
    name: 'Communist Party of India (Marxist)',
    shortName: 'CPM',
    color: '#FF0000',
    symbol: '⚒️',
    symbolEmoji: '⚒️',
  },
  'CPI(M)': {
    name: 'Communist Party of India (Marxist)',
    shortName: 'CPM',
    color: '#FF0000',
    symbol: '⚒️',
    symbolEmoji: '⚒️',
  },
  CPI: {
    name: 'Communist Party of India',
    shortName: 'CPI',
    color: '#CC0000',
    symbol: '🌾',
    symbolEmoji: '🌾',
  },
  NCP: {
    name: 'Nationalist Congress Party',
    shortName: 'NCP',
    color: '#004080',
    symbol: '⏰',
    symbolEmoji: '⏰',
  },
  AAP: {
    name: 'Aam Aadmi Party',
    shortName: 'AAP',
    color: '#0066CC',
    symbol: '🧹',
    symbolEmoji: '🧹',
  },
  AAAP: {
    name: 'Aam Aadmi Party',
    shortName: 'AAP',
    color: '#0066CC',
    symbol: '🧹',
    symbolEmoji: '🧹',
  },

  // Regional - Tamil Nadu
  DMK: {
    name: 'Dravida Munnetra Kazhagam',
    shortName: 'DMK',
    color: '#E31E24',
    symbol: '☀️',
    symbolEmoji: '☀️',
  },
  AIADMK: {
    name: 'All India Anna Dravida Munnetra Kazhagam',
    shortName: 'AIADMK',
    color: '#138808',
    symbol: '🍃',
    symbolEmoji: '🍃',
  },
  ADMK: {
    name: 'All India Anna Dravida Munnetra Kazhagam',
    shortName: 'AIADMK',
    color: '#138808',
    symbol: '🍃',
    symbolEmoji: '🍃',
  },
  PMK: {
    name: 'Pattali Makkal Katchi',
    shortName: 'PMK',
    color: '#FFFF00',
    symbol: '🥭',
    symbolEmoji: '🥭',
  },
  DMDK: {
    name: 'Desiya Murpokku Dravida Kazhagam',
    shortName: 'DMDK',
    color: '#00BFFF',
    symbol: '🦚',
    symbolEmoji: '🦚',
  },
  VCK: {
    name: 'Viduthalai Chiruthaigal Katchi',
    shortName: 'VCK',
    color: '#0000FF',
    symbol: '🔥',
    symbolEmoji: '🔥',
  },
  NTK: {
    name: 'Naam Tamilar Katchi',
    shortName: 'NTK',
    color: '#800000',
    symbol: '🐅',
    symbolEmoji: '🐅',
  },
  AMMK: {
    name: 'Amma Makkal Munnetra Kazhagam',
    shortName: 'AMMK',
    color: '#006400',
    symbol: '🌿',
    symbolEmoji: '🌿',
  },
  MDMK: {
    name: 'Marumalarchi Dravida Munnetra Kazhagam',
    shortName: 'MDMK',
    color: '#8B0000',
    symbol: '🔔',
    symbolEmoji: '🔔',
  },

  // Regional - Andhra Pradesh & Telangana
  TDP: {
    name: 'Telugu Desam Party',
    shortName: 'TDP',
    color: '#FFED00',
    symbol: '🚲',
    symbolEmoji: '🚲',
  },
  YSRCP: {
    name: 'YSR Congress Party',
    shortName: 'YSRCP',
    color: '#1569C7',
    symbol: '🏠',
    symbolEmoji: '🏠',
  },
  BRS: {
    name: 'Bharat Rashtra Samithi',
    shortName: 'BRS',
    color: '#FF69B4',
    symbol: '🚗',
    symbolEmoji: '🚗',
  },
  TRS: {
    name: 'Telangana Rashtra Samithi',
    shortName: 'TRS',
    color: '#FF69B4',
    symbol: '🚗',
    symbolEmoji: '🚗',
  },

  // Regional - West Bengal
  TMC: {
    name: 'All India Trinamool Congress',
    shortName: 'TMC',
    color: '#228B22',
    symbol: '🌸',
    symbolEmoji: '🌸',
  },
  AITC: {
    name: 'All India Trinamool Congress',
    shortName: 'TMC',
    color: '#228B22',
    symbol: '🌸',
    symbolEmoji: '🌸',
  },

  // Regional - Maharashtra
  SHS: {
    name: 'Shiv Sena',
    shortName: 'SHS',
    color: '#FF6600',
    symbol: '🏹',
    symbolEmoji: '🏹',
  },
  SS: {
    name: 'Shiv Sena',
    shortName: 'SHS',
    color: '#FF6600',
    symbol: '🏹',
    symbolEmoji: '🏹',
  },
  SHSUBT: {
    name: 'Shiv Sena (Uddhav Balasaheb Thackeray)',
    shortName: 'SHS(UBT)',
    color: '#FF6600',
    symbol: '🔥',
    symbolEmoji: '🔥',
  },
  'NCP(SP)': {
    name: 'NCP (Sharadchandra Pawar)',
    shortName: 'NCP(SP)',
    color: '#004080',
    symbol: '⏰',
    symbolEmoji: '⏰',
  },

  // Regional - Bihar & Jharkhand
  RJD: {
    name: 'Rashtriya Janata Dal',
    shortName: 'RJD',
    color: '#00FF00',
    symbol: '🏮',
    symbolEmoji: '🏮',
  },
  'JD(U)': {
    name: 'Janata Dal (United)',
    shortName: 'JD(U)',
    color: '#006400',
    symbol: '🏹',
    symbolEmoji: '🏹',
  },
  JDU: {
    name: 'Janata Dal (United)',
    shortName: 'JD(U)',
    color: '#006400',
    symbol: '🏹',
    symbolEmoji: '🏹',
  },
  JMM: {
    name: 'Jharkhand Mukti Morcha',
    shortName: 'JMM',
    color: '#008000',
    symbol: '🏹',
    symbolEmoji: '🏹',
  },
  LJP: {
    name: 'Lok Janshakti Party',
    shortName: 'LJP',
    color: '#00008B',
    symbol: '🏠',
    symbolEmoji: '🏠',
  },
  LJPRV: {
    name: 'Lok Janshakti Party (Ram Vilas)',
    shortName: 'LJP(RV)',
    color: '#00008B',
    symbol: '🏠',
    symbolEmoji: '🏠',
  },

  // Regional - Uttar Pradesh
  SP: {
    name: 'Samajwadi Party',
    shortName: 'SP',
    color: '#FF0000',
    symbol: '🚲',
    symbolEmoji: '🚲',
  },

  // Regional - Odisha
  BJD: {
    name: 'Biju Janata Dal',
    shortName: 'BJD',
    color: '#00AA00',
    symbol: '🐚',
    symbolEmoji: '🐚',
  },

  // Regional - Punjab
  SAD: {
    name: 'Shiromani Akali Dal',
    shortName: 'SAD',
    color: '#0000CD',
    symbol: '⚖️',
    symbolEmoji: '⚖️',
  },

  // Regional - Karnataka
  JDS: {
    name: 'Janata Dal (Secular)',
    shortName: 'JDS',
    color: '#008000',
    symbol: '👨‍🌾',
    symbolEmoji: '👨‍🌾',
  },
  'JD(S)': {
    name: 'Janata Dal (Secular)',
    shortName: 'JDS',
    color: '#008000',
    symbol: '👨‍🌾',
    symbolEmoji: '👨‍🌾',
  },

  // Regional - Jammu & Kashmir
  JKNC: {
    name: 'Jammu & Kashmir National Conference',
    shortName: 'JKNC',
    color: '#0000FF',
    symbol: '🏔️',
    symbolEmoji: '🏔️',
  },
  NC: {
    name: 'Jammu & Kashmir National Conference',
    shortName: 'JKNC',
    color: '#0000FF',
    symbol: '🏔️',
    symbolEmoji: '🏔️',
  },
  PDP: {
    name: 'Peoples Democratic Party',
    shortName: 'PDP',
    color: '#009933',
    symbol: '📝',
    symbolEmoji: '📝',
  },

  // Regional - Kerala
  IUML: {
    name: 'Indian Union Muslim League',
    shortName: 'IUML',
    color: '#008000',
    symbol: '🪜',
    symbolEmoji: '🪜',
  },
  KC: {
    name: 'Kerala Congress',
    shortName: 'KC',
    color: '#FFD700',
    symbol: '🌴',
    symbolEmoji: '🌴',
  },
  KCM: {
    name: 'Kerala Congress (M)',
    shortName: 'KC(M)',
    color: '#FFD700',
    symbol: '🌴',
    symbolEmoji: '🌴',
  },

  // Regional - North East
  NPP: {
    name: 'National Peoples Party',
    shortName: 'NPP',
    color: '#FF4500',
    symbol: '📖',
    symbolEmoji: '📖',
  },
  SKM: {
    name: 'Sikkim Krantikari Morcha',
    shortName: 'SKM',
    color: '#FF0000',
    symbol: '⛏️',
    symbolEmoji: '⛏️',
  },
  SDF: {
    name: 'Sikkim Democratic Front',
    shortName: 'SDF',
    color: '#0000FF',
    symbol: '🏠',
    symbolEmoji: '🏠',
  },
  AGP: {
    name: 'Asom Gana Parishad',
    shortName: 'AGP',
    color: '#FFFFFF',
    symbol: '🐘',
    symbolEmoji: '🐘',
  },
  NDPP: {
    name: 'Nationalist Democratic Progressive Party',
    shortName: 'NDPP',
    color: '#0000FF',
    symbol: '🏠',
    symbolEmoji: '🏠',
  },
  MNF: {
    name: 'Mizo National Front',
    shortName: 'MNF',
    color: '#0000FF',
    symbol: '⭐',
    symbolEmoji: '⭐',
  },
  NPF: {
    name: 'Naga Peoples Front',
    shortName: 'NPF',
    color: '#0000FF',
    symbol: '🐔',
    symbolEmoji: '🐔',
  },

  // Independent
  IND: {
    name: 'Independent',
    shortName: 'IND',
    color: '#808080',
    symbol: '👤',
    symbolEmoji: '👤',
  },

  // NOTA
  NOTA: {
    name: 'None of the Above',
    shortName: 'NOTA',
    color: '#333333',
    symbol: '✖️',
    symbolEmoji: '✖️',
  },
};

/**
 * Get party information
 */
export function getPartyInfo(partyCode: string): PartyInfo {
  const code = partyCode.toUpperCase().trim();
  return (
    PARTY_DATA[code] ?? {
      name: partyCode,
      shortName: partyCode,
      color: '#6B7280',
      symbol: '🏛️',
      symbolEmoji: '🏛️',
    }
  );
}

/**
 * Get party color
 */
export function getPartyColor(partyCode: string): string {
  return getPartyInfo(partyCode).color;
}

/**
 * Get party symbol emoji
 */
export function getPartySymbol(partyCode: string): string {
  return getPartyInfo(partyCode).symbol;
}

/**
 * Get full party name
 */
export function getPartyFullName(partyCode: string): string {
  return getPartyInfo(partyCode).name;
}
