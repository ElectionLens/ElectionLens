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
  BJPARTY: {
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
    color: '#B71C1C', // Dark red / crimson to distinguish from DMK (#E31E24) and SP (#FF0000)
    symbol: '⚒️',
    symbolEmoji: '⚒️',
  },
  'CPI(M)': {
    name: 'Communist Party of India (Marxist)',
    shortName: 'CPM',
    color: '#B71C1C',
    symbol: '⚒️',
    symbolEmoji: '⚒️',
  },
  CPIM: {
    name: 'Communist Party of India (Marxist)',
    shortName: 'CPM',
    color: '#B71C1C',
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
    color: '#D4A017', // Golden yellow for better visibility
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
  TVK: {
    name: 'Tamilaga Vettri Kazhagam',
    shortName: 'TVK',
    // Flag: dark red / maroon + yellow (Wikipedia infobox); single UI hue distinct from DMK (#E31E24) and NTK (#800000)
    color: '#7C1F3E',
    symbol: '📯',
    symbolEmoji: '📯',
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
  MNM: {
    name: 'Makkal Needhi Maiam',
    shortName: 'MNM',
    color: '#6366F1', // Indigo (distinct from DMK/AIADMK)
    symbol: '🔦',
    symbolEmoji: '🔦',
  },
  TNLK: {
    name: 'Thamizhaga Vazhvurimai Katchi',
    shortName: 'TNLK',
    color: '#7C3AED', // Violet (distinct from other TN parties)
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },

  // Regional - Andhra Pradesh & Telangana
  TDP: {
    name: 'Telugu Desam Party',
    shortName: 'TDP',
    color: '#DAA520', // Goldenrod for better visibility
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
  MNS: {
    name: 'Maharashtra Navnirman Sena',
    shortName: 'MNS',
    color: '#EA580C', // Orange (distinct from SHS)
    symbol: '🚂',
    symbolEmoji: '🚂',
  },
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
  RLD: {
    name: 'Rashtriya Lok Dal',
    shortName: 'RLD',
    color: '#0D9488', // Teal
    symbol: '🚜',
    symbolEmoji: '🚜',
  },
  INLD: {
    name: 'Indian National Lok Dal',
    shortName: 'INLD',
    color: '#0D9488',
    symbol: '🚜',
    symbolEmoji: '🚜',
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
  'SAD(M)': {
    name: 'Shiromani Akali Dal (Mann)',
    shortName: 'SAD(M)',
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
  AIMIM: {
    name: 'All India Majlis-e-Ittehadul Muslimeen',
    shortName: 'AIMIM',
    color: '#00843D', // Green
    symbol: '🕌',
    symbolEmoji: '🕌',
  },
  AIUDF: {
    name: 'All India United Democratic Front',
    shortName: 'AIUDF',
    color: '#059669', // Emerald
    symbol: '🕌',
    symbolEmoji: '🕌',
  },

  // Regional - Kerala
  IUML: {
    name: 'Indian Union Muslim League',
    shortName: 'IUML',
    color: '#006B5C', // Teal-green to distinguish from JMM/JDS (#008000)
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
  KCJ: {
    name: 'Kerala Congress (Jacob)',
    shortName: 'KC(J)',
    color: '#CA8A04',
    symbol: '🌴',
    symbolEmoji: '🌴',
  },
  CMKSC: {
    name: 'Communist Marxist Party Kerala State Committee',
    shortName: 'CMP(KSC)',
    color: '#9F1239',
    symbol: '☭',
    symbolEmoji: '☭',
  },
  RSP: {
    name: 'Revolutionary Socialist Party',
    shortName: 'RSP',
    color: '#E11D48',
    symbol: '✊',
    symbolEmoji: '✊',
  },
  RMPI: {
    name: 'Revolutionary Marxist Party of India',
    shortName: 'RMPI',
    color: '#BE185D',
    symbol: '⭐',
    symbolEmoji: '⭐',
  },

  // Regional - West Bengal (ECI full names / alliances)
  AISF: {
    name: 'All India Secular Front',
    shortName: 'AISF',
    color: '#047857',
    symbol: '🤝',
    symbolEmoji: '🤝',
  },
  AJUP: {
    name: 'Aam Janata Unnayan Party',
    shortName: 'AJUP',
    color: '#57534E',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
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
    color: '#2E8B57', // Sea green for visibility
    symbol: '🐘',
    symbolEmoji: '🐘',
  },
  RD: {
    name: 'Raijor Dal',
    shortName: 'RD',
    color: '#C2410C',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },
  AJP: {
    name: 'Assam Jatiya Parishad',
    shortName: 'AJP',
    color: '#0369A1',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },
  BGP: {
    name: 'Bharatiya Gana Parishad',
    shortName: 'BGP',
    color: '#15803D',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },
  GSP: {
    name: 'Gana Suraksha Party',
    shortName: 'GSP',
    color: '#65A30D',
    symbol: '🛡️',
    symbolEmoji: '🛡️',
  },
  VIP: {
    name: 'Vikas India Party',
    shortName: 'VIP',
    color: '#7C3AED',
    symbol: '📈',
    symbolEmoji: '📈',
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

  // Other national / left / regional
  SUCI: {
    name: 'Socialist Unity Centre of India (Communist)',
    shortName: 'SUCI',
    color: '#DC2626', // Red
    symbol: '☭',
    symbolEmoji: '☭',
  },
  'SUCI(C)': {
    name: 'Socialist Unity Centre of India (Communist)',
    shortName: 'SUCI',
    color: '#DC2626',
    symbol: '☭',
    symbolEmoji: '☭',
  },
  AIFB: {
    name: 'All India Forward Bloc',
    shortName: 'AIFB',
    color: '#B91C1C', // Dark red
    symbol: '🦁',
    symbolEmoji: '🦁',
  },
  'RPI(A)': {
    name: 'Republican Party of India (Athawale)',
    shortName: 'RPI(A)',
    color: '#1E40AF', // Blue
    symbol: '✊',
    symbolEmoji: '✊',
  },
  RPI: {
    name: 'Republican Party of India',
    shortName: 'RPI',
    color: '#1E40AF',
    symbol: '✊',
    symbolEmoji: '✊',
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

  // Winner parties (from election data) — avoid gray for constituency/state winners
  ZPM: {
    name: "Zoram People's Movement",
    shortName: 'ZPM',
    color: '#0D9488',
    symbol: '⭐',
    symbolEmoji: '⭐',
  },
  JKNPP: {
    name: 'Jammu & Kashmir National Panthers Party',
    shortName: 'JKNPP',
    color: '#9333EA',
    symbol: '🐆',
    symbolEmoji: '🐆',
  },
  BOPF: {
    name: "Bodoland People's Front",
    shortName: 'BOPF',
    color: '#16A34A',
    symbol: '🐘',
    symbolEmoji: '🐘',
  },
  BTP: {
    name: 'Bahujan Tribal Party',
    shortName: 'BTP',
    color: '#CA8A04',
    symbol: '🌿',
    symbolEmoji: '🌿',
  },
  UPPL: {
    name: "United People's Party Liberal",
    shortName: 'UPPL',
    color: '#2563EB',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },
  UKDP: {
    name: 'Uttarakhand Kranti Dal',
    shortName: 'UKDP',
    color: '#0D9488',
    symbol: '🏔️',
    symbolEmoji: '🏔️',
  },
  UDP: {
    name: 'United Democratic Party',
    shortName: 'UDP',
    color: '#0891B2',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },
  AJSUP: {
    name: 'AJSU Party',
    shortName: 'AJSUP',
    color: '#DC2626',
    symbol: '🦁',
    symbolEmoji: '🦁',
  },
  'CPI(ML)(L)': {
    name: 'CPI (Marxist-Leninist) Liberation',
    shortName: 'CPI(ML)(L)',
    color: '#991B1B',
    symbol: '☭',
    symbolEmoji: '☭',
  },
  GFP: {
    name: 'Goa Forward Party',
    shortName: 'GFP',
    color: '#2563EB',
    symbol: '🚢',
    symbolEmoji: '🚢',
  },
  GGP: {
    name: 'Goa Green Party',
    shortName: 'GGP',
    color: '#16A34A',
    symbol: '🌿',
    symbolEmoji: '🌿',
  },
  SBSP: {
    name: 'Suheldev Bharatiya Samaj Party',
    shortName: 'SBSP',
    color: '#1E40AF',
    symbol: '✊',
    symbolEmoji: '✊',
  },
  JVM: {
    name: 'Jharkhand Vikas Morcha',
    shortName: 'JVM',
    color: '#0D9488',
    symbol: '🏔️',
    symbolEmoji: '🏔️',
  },
  HSPDP: {
    name: "Hill State People's Democratic Party",
    shortName: 'HSPDP',
    color: '#059669',
    symbol: '🏔️',
    symbolEmoji: '🏔️',
  },
  IPFT: {
    name: "Indigenous People's Front of Tripura",
    shortName: 'IPFT',
    color: '#16A34A',
    symbol: '🌿',
    symbolEmoji: '🌿',
  },
  AINRC: {
    name: 'All India N.R. Congress',
    shortName: 'AINRC',
    color: '#2563EB',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },
  VOTPP: {
    name: 'Voice of the People Party',
    shortName: 'VOTPP',
    color: '#7C3AED',
    symbol: '🗣️',
    symbolEmoji: '🗣️',
  },
  BVA: {
    name: 'Vanchit Bahujan Aaghadi',
    shortName: 'BVA',
    color: '#4F46E5',
    symbol: '✊',
    symbolEmoji: '✊',
  },
  ZNP: {
    name: 'Zoram National Party',
    shortName: 'ZNP',
    color: '#0D9488',
    symbol: '⭐',
    symbolEmoji: '⭐',
  },
  JNP: {
    name: 'Janata Party',
    shortName: 'JNP',
    color: '#0D9488',
    symbol: '🏛️',
    symbolEmoji: '🏛️',
  },

  /** Kerala / West Bengal — ECI 2026 & regional registrations */
  KCB: {
    name: 'Kerala Congress (B)',
    shortName: 'KC(B)',
    color: '#CA8A04',
    symbol: '🌴',
    symbolEmoji: '🌴',
  },
  SDPI: {
    name: 'Social Democratic Party Of India',
    shortName: 'SDPI',
    color: '#059669',
    symbol: '🕌',
    symbolEmoji: '🕌',
  },
  PDS: {
    name: 'Party for Democratic Socialism',
    shortName: 'PDS',
    color: '#BE123C',
    symbol: '☭',
    symbolEmoji: '☭',
  },
  T20: {
    name: 'Twenty 20 Party',
    shortName: 'T20',
    color: '#6366F1',
    symbol: '2️⃣',
    symbolEmoji: '2️⃣',
  },
  WBSP: {
    name: 'West Bengal Socialist Party',
    shortName: 'WBSP',
    color: '#DC2626',
    symbol: '✊',
    symbolEmoji: '✊',
  },
  GNLF: {
    name: 'Akhil Bharatiya Gorkha League',
    shortName: 'GNLF',
    color: '#15803D',
    symbol: '🏔️',
    symbolEmoji: '🏔️',
  },
  INL: {
    name: 'Indian National League',
    shortName: 'INL',
    color: '#0EA5E9',
    symbol: '📖',
    symbolEmoji: '📖',
  },
  CSP: {
    name: 'Congress (Secular)',
    shortName: 'Cong(S)',
    color: '#38BDF8',
    symbol: '✋',
    symbolEmoji: '✋',
  },
  CPIMLRS: {
    name: 'Communist Party of India (Marxist-Leninist) Red Star',
    shortName: 'CPI(ML) RS',
    color: '#991B1B',
    symbol: '☭',
    symbolEmoji: '☭',
  },
  KPPPU: {
    name: "Kamatapur People's Party (United)",
    shortName: 'KPP(U)',
    color: '#65A30D',
    symbol: '🗺️',
    symbolEmoji: '🗺️',
  },
  WPI: {
    name: 'Welfare Party Of India',
    shortName: 'WPI',
    color: '#047857',
    symbol: '🤝',
    symbolEmoji: '🤝',
  },
  NBP: {
    name: "North Bengal People's Party",
    shortName: 'NBP',
    color: '#0D9488',
    symbol: '🏔️',
    symbolEmoji: '🏔️',
  },
};

/** Maps full names / data variants (uppercase) to canonical PARTY_DATA key. Avoids gray for winner parties. */
const WINNER_PARTY_ALIASES: Record<string, string> = {
  'BHARATIYA JANATA PARTY': 'BJP',
  'INDIAN NATIONAL CONGRESS': 'INC',
  'COMMUNIST PARTY OF INDIA (MARXIST)': 'CPM',
  'COMMUNIST PARTY OF INDIA': 'CPI',
  'ALL INDIA TRINAMOOL CONGRESS': 'TMC',
  'NONE OF THE ABOVE': 'NOTA',
  INDEPENDENT: 'IND',
  'AAM AADMI PARTY': 'AAP',
  'BAHUJAN SAMAJ PARTY': 'BSP',
  'RASHTRIYA JANATA DAL': 'RJD',
  'INDIAN UNION MUSLIM LEAGUE': 'IUML',
  'KERALA CONGRESS': 'KC',
  'KERALA CONGRESS (JACOB)': 'KCJ',
  'COMMUNIST MARXIST PARTY KERALA STATE COMMITTEE': 'CMKSC',
  'REVOLUTIONARY MARXIST PARTY OF INDIA': 'RMPI',
  'REVOLUTIONARY SOCIALIST PARTY': 'RSP',
  'ALL INDIA SECULAR FRONT': 'AISF',
  'AAM JANATA UNNAYAN PARTY': 'AJUP',
  'ALL INDIA N.R. CONGRESS': 'AINRC',
  'AMMA MAKKAL MUNNETTRA KAZAGAM': 'AMMK',
  'JANATA DAL(UNITED)': 'JDU',
  'COMMUNIST PARTY OF INDIA(MARXIST)': 'CPM',
  'CPI(M (L)L)': 'CPI(ML)(L)',
  'ALL INDIA MAJLIS-E-ITTEHADUL MUSLIMEEN': 'AIMIM',
  'SHIV SENA (UDDHAV BALASAHEB THACKERAY)': 'SHSUBT',
  'LOK JANSHAKTI PARTY (RAM VILAS)': 'LJPRV',
  'LOK JANSHAKTI PARTY(RAM VILAS)': 'LJPRV',
  'NATIONALIST CONGRESS PARTY – SHARADCHANDRA PAWAR': 'NCP(SP)',
  'NATIONALIST CONGRESS PARTY - SHARADCHANDRA PAWAR': 'NCP(SP)',
  NCPSP: 'NCP(SP)',
  "HILL STATE PEOPLE'S DEMOCRATIC PARTY": 'HSPDP',
  "INDIGENOUS PEOPLE'S FRONT OF TRIPURA": 'IPFT',
  'UNITED DEMOCRATIC PARTY': 'UDP',
  'AJSU PARTY': 'AJSUP',
  'VOICE OF THE PEOPLE PARTY': 'VOTPP',
  'COMMUNIST PARTY OF INDIA (MARXIST-LENINIST) (LIBERATION)': 'CPI(ML)(L)',
  'TAMILAGA VETTRI KAZHAGAM': 'TVK',
  'THAMIZHAGA VETTRI KAZHAGAM': 'TVK',
  'TAMILAGA VETRI KAZHAGAM': 'TVK',
  'DRAVIDA MUNNETRA KAZHAGAM': 'DMK',
  'ALL INDIA ANNA DRAVIDA MUNNETRA KAZHAGAM': 'AIADMK',
  'NAAM TAMILAR KATCHI': 'NTK',
  'PATTALI MAKKAL KATCHI': 'PMK',
  'TAMIZHAGA VAAZHVURIMAI KATCHI': 'TNLK',
  'THAMIZHAGA VAZHVURIMAI KATCHI': 'TNLK',

  /* Assam — ECI / CSV full strings → canonical keys (short labels in UI) */
  'ASOM GANA PARISHAD': 'AGP',
  'RAIJOR DAL': 'RD',
  'BODOLAND PEOPLES FRONT': 'BOPF',
  'ASSAM JATIYA PARISHAD': 'AJP',
  'BHARATIYA GANA PARISHAD': 'BGP',
  'GANA SURAKSHA PARTY': 'GSP',
  'VIKAS INDIA PARTY': 'VIP',
  'ALL INDIA UNITED DEMOCRATIC FRONT': 'AIUDF',
  "UNITED PEOPLE'S PARTY, LIBERAL": 'UPPL',
  'UNITED PEOPLES PARTY, LIBERAL': 'UPPL',
  "NATIONAL PEOPLE'S PARTY": 'NPP',

  /* Kerala / West Bengal 2026 AC data — ECI full names → canonical keys */
  'NATIONALIST CONGRESS PARTY': 'NCP',
  'KERALA CONGRESS (M)': 'KCM',
  'KERALA CONGRESS (B)': 'KCB',
  'ALL INDIA MAJLIS-E-INQUILAB-E-MILLAT': 'AIMIM',
  'SOCIAL DEMOCRATIC PARTY OF INDIA': 'SDPI',
  'PARTY FOR DEMOCRATIC SOCIALISM': 'PDS',
  'TWENTY 20 PARTY': 'T20',
  'WEST BENGAL SOCIALIST PARTY': 'WBSP',
  'AKHIL BHARATIYA GORKHA LEAGUE': 'GNLF',
  'INDIAN NATIONAL LEAGUE': 'INL',
  'CONGRESS (SECULAR)': 'CSP',
  'COMMUNIST PARTY OF INDIA (MARXIST-LENINIST) RED STAR': 'CPIMLRS',
  "KAMATAPUR PEOPLE'S PARTY (UNITED)": 'KPPPU',
  'WELFARE PARTY OF INDIA': 'WPI',
  'SOCIALIST UNITY CENTRE OF INDIA (COMMUNIST)': 'SUCI',
  'REPUBLICAN PARTY OF INDIA (ATHAWALE)': 'RPI(A)',
  "NORTH BENGAL PEOPLE'S PARTY": 'NBP',
};

/** Decode HTML entities & normalize spaces from scraped JSON before alias lookup */
function normalizePartyRaw(raw: string): string {
  return raw
    .trim()
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Get party information
 */
export function getPartyInfo(partyCode: string): PartyInfo {
  const normalized = normalizePartyRaw(partyCode);
  const code = normalized.toUpperCase().trim();
  const key = WINNER_PARTY_ALIASES[code] ?? code;
  return (
    PARTY_DATA[key] ?? {
      name: normalized,
      shortName: normalized,
      color: '#6B7280',
      symbol: '🏛️',
      symbolEmoji: '🏛️',
    }
  );
}

/** Canonical short label for maps, legends, and compact panels (e.g. INC, CPI(M), TMC). */
export function getPartyShortName(partyCode: string): string {
  return getPartyInfo(partyCode).shortName;
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
