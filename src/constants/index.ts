import type {
  StateFileMap,
  ColorPalettes,
  StateAliasMap,
  DistrictNameMap,
  PCNameMap,
  HexColor,
} from '../types';

/**
 * State file name mappings
 * Maps state names to their state IDs (ISO 3166-2:IN codes)
 * @since v2.0 - Now returns state IDs instead of slugs
 */
export const STATE_FILE_MAP: StateFileMap = {
  'Andaman and Nicobar Islands': 'AN',
  'Andaman & Nicobar Islands': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  'Arunāchal Pradesh': 'AR',
  Assam: 'AS',
  Bihar: 'BR',
  Bihār: 'BR',
  Chandigarh: 'CH',
  Chandīgarh: 'CH',
  Chhattisgarh: 'CG',
  Chhattīsgarh: 'CG',
  'Dadra and Nagar Haveli and Daman and Diu': 'DD',
  'Dādra and Nagar Haveli and Damān and Diu': 'DD',
  Delhi: 'DL',
  'NCT of Delhi': 'DL',
  Goa: 'GA',
  Gujarat: 'GJ',
  Gujarāt: 'GJ',
  Haryana: 'HR',
  Haryāna: 'HR',
  'Himachal Pradesh': 'HP',
  'Himāchal Pradesh': 'HP',
  'Jammu and Kashmir': 'JK',
  'Jammu & Kashmir': 'JK',
  'Jammu and Kashmīr': 'JK',
  Jharkhand: 'JH',
  Jhārkhand: 'JH',
  Karnataka: 'KA',
  Karnātaka: 'KA',
  Kerala: 'KL',
  Ladakh: 'LA',
  Ladākh: 'LA',
  Lakshadweep: 'LD',
  'Madhya Pradesh': 'MP',
  Maharashtra: 'MH',
  Mahārāshtra: 'MH',
  Manipur: 'MN',
  Meghalaya: 'ML',
  Meghālaya: 'ML',
  Mizoram: 'MZ',
  Nagaland: 'NL',
  Nāgāland: 'NL',
  Odisha: 'OD',
  Puducherry: 'PY',
  Punjab: 'PB',
  Rajasthan: 'RJ',
  Rājasthān: 'RJ',
  Sikkim: 'SK',
  'Tamil Nadu': 'TN',
  'Tamil Nādu': 'TN',
  Telangana: 'TS',
  Telangāna: 'TS',
  Tripura: 'TR',
  'Uttar Pradesh': 'UP',
  Uttarakhand: 'UK',
  Uttarākhand: 'UK',
  'West Bengal': 'WB',
} as const;

/**
 * Color palettes for each map level
 * Each palette contains 20 distinct colors
 */
export const COLOR_PALETTES: ColorPalettes = {
  states: [
    '#c2956e',
    '#a8b87c',
    '#d4a574',
    '#8fbc8f',
    '#c9a86c',
    '#b5a090',
    '#9db4a0',
    '#d9b38c',
    '#a5b89c',
    '#c4a87c',
    '#b8a080',
    '#8eb48e',
    '#d4b084',
    '#9cac8c',
    '#c8a470',
    '#b0a488',
    '#92b090',
    '#d0a87c',
    '#a0b094',
    '#c4a078',
  ] as HexColor[],
  districts: [
    '#5c9ead',
    '#7eb8c4',
    '#4a8fa3',
    '#6ab0be',
    '#3d8294',
    '#8dc4cf',
    '#5aa3b3',
    '#72bcc8',
    '#4895a7',
    '#64aebb',
    '#9dd0da',
    '#5298a8',
    '#80c0cc',
    '#4690a0',
    '#6cb4c2',
    '#a8d8e2',
    '#5890a0',
    '#88c8d4',
    '#4488a0',
    '#74b8c6',
  ] as HexColor[],
  constituencies: [
    '#9b7bb8',
    '#b894c8',
    '#8668a8',
    '#a882bc',
    '#7c5ca0',
    '#c4a4d4',
    '#9478b0',
    '#b088c0',
    '#8060a4',
    '#a07cb8',
    '#ccb0dc',
    '#9070a8',
    '#b890c8',
    '#7858a0',
    '#a880bc',
    '#d4b8e0',
    '#8868b0',
    '#c098d0',
    '#7450a0',
    '#ac88c4',
  ] as HexColor[],
  assemblies: [
    '#6b9b78',
    '#88b494',
    '#5a8a68',
    '#78a888',
    '#4a7a58',
    '#98c4a4',
    '#68987c',
    '#84b090',
    '#568864',
    '#74a484',
    '#a8d4b4',
    '#609070',
    '#90bc9c',
    '#4e8060',
    '#80ac8c',
    '#b0dcbc',
    '#588868',
    '#98c4a4',
    '#467858',
    '#88b494',
  ] as HexColor[],
};

/**
 * Assembly state name aliases (assembly file uses older names)
 */
export const ASM_STATE_ALIASES: StateAliasMap = {
  ODISHA: 'ORISSA',
  UTTARAKHAND: 'UTTARKHAND',
  TELANGANA: 'ANDHRA PRADESH',
} as const;

/**
 * District name mappings from district files to assembly file
 * Format: "DISTRICT_NAME|STATE_NAME": "ASSEMBLY_FILE_DISTRICT_NAME"
 */
export const DISTRICT_NAME_MAPPINGS: DistrictNameMap = {
  // Tamil Nadu - spelling variations
  'NILGIRIS|TAMIL NADU': 'THE NILGIRIS',
  'KANYAKUMARI|TAMIL NADU': 'KANNIYAKUMARI',
  'THIRUVALLUR|TAMIL NADU': 'TIRUVALLUR',
  'VILLUPURAM|TAMIL NADU': 'VILUPPURAM',
  // Tamil Nadu - new districts
  'MAYILADUTHURAI|TAMIL NADU': 'NAGAPATTINAM',
  'KALLAKURICHI|TAMIL NADU': 'VILUPPURAM',
  'CHENGALPATTU|TAMIL NADU': 'KANCHEEPURAM',
  'RANIPET|TAMIL NADU': 'VELLORE',
  'TIRUPATHUR|TAMIL NADU': 'VELLORE',
  'TENKASI|TAMIL NADU': 'TIRUNELVELI',
  'TIRUPPUR|TAMIL NADU': 'COIMBATORE',
  'ARIYALUR|TAMIL NADU': 'PERAMBALUR',
  // Karnataka
  'BENGALURU URBAN|KARNATAKA': 'BANGALORE',
  'BENGALURU RURAL|KARNATAKA': 'BANGALORE RURAL',
  'MYSURU|KARNATAKA': 'MYSORE',
  'BELAGAVI|KARNATAKA': 'BELGAUM',
  'KALABURAGI|KARNATAKA': 'GULBARGA',
  'VIJAYAPURA|KARNATAKA': 'BIJAPUR',
  'SHIVAMOGGA|KARNATAKA': 'SHIMOGA',
  'TUMAKURU|KARNATAKA': 'TUMKUR',
  'BALLARI|KARNATAKA': 'BELLARY',
  // Maharashtra
  'CHHATRAPATI SAMBHAJINAGAR|MAHARASHTRA': 'AURANGABAD',
  'DHARASHIV|MAHARASHTRA': 'OSMANABAD',
  // Madhya Pradesh
  'NARMADAPURAM|MADHYA PRADESH': 'HOSHANGABAD',
  // Odisha
  'BALASORE|ODISHA': 'BALESHWAR',
  'JAGATSINGHPUR|ODISHA': 'JAGATSINGHAPUR',
  // Chhattisgarh
  'BALOD|CHHATTISGARH': 'DURG',
  'BEMETARA|CHHATTISGARH': 'DURG',
  'MUNGELI|CHHATTISGARH': 'BILASPUR',
  'BALODA BAZAR|CHHATTISGARH': 'RAIPUR',
  'GARIABAND|CHHATTISGARH': 'RAIPUR',
  'SUKMA|CHHATTISGARH': 'DANTEWADA',
  'KONDAGAON|CHHATTISGARH': 'BASTAR',
  'NARAYANPUR|CHHATTISGARH': 'BASTAR',
  // Telangana - original districts
  'HYDERABAD|TELANGANA': 'HYDERABAD',
  'RANGAREDDY|TELANGANA': 'RANGAREDDY',
  // Telangana - new districts
  'BHADRADRI KOTHAGUDEM|TELANGANA': 'KHAMMAM',
  'JAGTIAL|TELANGANA': 'KARIMNAGAR',
  'JANGAON|TELANGANA': 'WARANGAL',
  'JAYASHANKAR BHUPALAPALLY|TELANGANA': 'WARANGAL',
  'JOGULAMBA GADWAL|TELANGANA': 'MAHABUBNAGAR',
  'KAMAREDDY|TELANGANA': 'NIZAMABAD',
  'KOMARAM BHEEM|TELANGANA': 'ADILABAD',
  'MAHABUBABAD|TELANGANA': 'WARANGAL',
  'MANCHERIAL|TELANGANA': 'ADILABAD',
  'MEDCHAL MALKAJGIRI|TELANGANA': 'RANGAREDDY',
  'MULUGU|TELANGANA': 'WARANGAL',
  'NAGARKURNOOL|TELANGANA': 'MAHABUBNAGAR',
  'NARAYANPET|TELANGANA': 'MAHABUBNAGAR',
  'NIRMAL|TELANGANA': 'ADILABAD',
  'PEDDAPALLI|TELANGANA': 'KARIMNAGAR',
  'RAJANNA SIRCILLA|TELANGANA': 'KARIMNAGAR',
  'SANGAREDDY|TELANGANA': 'MEDAK',
  'SIDDIPET|TELANGANA': 'MEDAK',
  'SURYAPET|TELANGANA': 'NALGONDA',
  'VIKARABAD|TELANGANA': 'RANGAREDDY',
  'WANAPARTHY|TELANGANA': 'MAHABUBNAGAR',
  'YADADRI BHUVANAGIRI|TELANGANA': 'NALGONDA',
  // Andhra Pradesh
  'PARVATHIPURAM MANYAM|ANDHRA PRADESH': 'VIZIANAGARAM',
  'ALLURI SITHARAMA RAJU|ANDHRA PRADESH': 'EAST GODAVARI',
  'ANAKAPALLI|ANDHRA PRADESH': 'VISAKHAPATNAM',
  'TIRUPATI|ANDHRA PRADESH': 'CHITTOOR',
  'ANNAMAYYA|ANDHRA PRADESH': 'CUDDAPAH',
  'SRI SATHYA SAI|ANDHRA PRADESH': 'ANANTAPUR',
  'NTR|ANDHRA PRADESH': 'KRISHNA',
  'ELURU|ANDHRA PRADESH': 'WEST GODAVARI',
  'KONASEEMA|ANDHRA PRADESH': 'EAST GODAVARI',
  'KAKINADA|ANDHRA PRADESH': 'EAST GODAVARI',
  'DR. B.R. AMBEDKAR KONASEEMA|ANDHRA PRADESH': 'EAST GODAVARI',
  'BAPATLA|ANDHRA PRADESH': 'GUNTUR',
  'PALNADU|ANDHRA PRADESH': 'GUNTUR',
  'NANDYAL|ANDHRA PRADESH': 'KURNOOL',
  // Gujarat
  'DEVBHUMI DWARKA|GUJARAT': 'JAMNAGAR',
  'GIR SOMNATH|GUJARAT': 'JUNAGADH',
  'MORBI|GUJARAT': 'RAJKOT',
  'BOTAD|GUJARAT': 'BHAVNAGAR',
  'MAHISAGAR|GUJARAT': 'KHEDA',
  'CHHOTA UDAIPUR|GUJARAT': 'VADODARA',
  'ARAVALLI|GUJARAT': 'SABARKANTHA',
  // Rajasthan
  'PRATAPGARH|RAJASTHAN': 'CHITTAURGARH',
  // UP - district name changes (new names → old names used in assembly file)
  'AMETHI|UTTAR PRADESH': 'SULTANPUR',
  'SHAMLI|UTTAR PRADESH': 'MUZAFFARNAGAR',
  'HAPUR|UTTAR PRADESH': 'GHAZIABAD',
  'SAMBHAL|UTTAR PRADESH': 'MORADABAD',
  'KASGANJ|UTTAR PRADESH': 'ETAH',
  'HATRAS|UTTAR PRADESH': 'ALIGARH',
  'AMROHA|UTTAR PRADESH': 'JYOTIBA PHULE NAGAR',
  'PRAYAGRAJ|UTTAR PRADESH': 'ALLAHABAD',
  'AYODHYA|UTTAR PRADESH': 'FAIZABAD',
  'BHADOHI|UTTAR PRADESH': 'SANT RAVIDAS NAGAR',
  'LAKHIMPUR KHERI|UTTAR PRADESH': 'KHERI',
  // Punjab - district name changes
  'FEROZEPUR|PUNJAB': 'FIROZPUR',
  'SHAHID BHAGAT SINGH NAGAR|PUNJAB': 'NAWANSHAHR',
  'SRI MUKTSAR SAHIB|PUNJAB': 'MUKTSAR',
  'BARNALA|PUNJAB': 'SANGRUR',
  'FAZILKA|PUNJAB': 'FIROZPUR',
  'PATHANKOT|PUNJAB': 'GURDASPUR',
  'S.A.S. NAGAR|PUNJAB': 'RUPNAGAR',
  'TARN TARAN|PUNJAB': 'AMRITSAR',
  // Bihar
  'ARWAL|BIHAR': 'JEHANABAD',
  // Jharkhand
  'RAMGARH|JHARKHAND': 'HAZARIBAGH',
  'KHUNTI|JHARKHAND': 'RANCHI',
  // Assam
  'KAMRUP METROPOLITAN|ASSAM': 'KAMRUP',
  'SOUTH SALMARA-MANKACHAR|ASSAM': 'DHUBRI',
  'BAJALI|ASSAM': 'BARPETA',
  'TAMULPUR|ASSAM': 'BAKSA',
  'BISWANATH|ASSAM': 'SONITPUR',
  'HOJAI|ASSAM': 'NAGAON',
  'WEST KARBI ANGLONG|ASSAM': 'KARBI ANGLONG',
  'CHARAIDEO|ASSAM': 'SIVASAGAR',
  'MAJULI|ASSAM': 'JORHAT',
  // Manipur
  'KANGPOKPI|MANIPUR': 'SENAPATI',
  'TENGNOUPAL|MANIPUR': 'CHANDEL',
  'JIRIBAM|MANIPUR': 'IMPHAL EAST',
  'NONEY|MANIPUR': 'TAMENGLONG',
  'PHERZAWL|MANIPUR': 'CHURACHANDPUR',
  'KAKCHING|MANIPUR': 'THOUBAL',
  'KAMJONG|MANIPUR': 'UKHRUL',
} as const;

/**
 * PC name mappings for assembly matching
 * Format: "PC_NAME|STATE_NAME": "ASSEMBLY_FILE_PC_NAME"
 */
export const PC_NAME_MAPPINGS: PCNameMap = {
  'DARRANG UDALGURI (EX MANGALDOI)|ASSAM': 'MANGALDOI',
  'DIPHU (EX AUTONOMOUS DISTRICT)|ASSAM': 'AUTONOMOUS DISTRICT',
  'KAZIRANGA (EX KALIABOR)|ASSAM': 'KALIABOR',
  'SONITPUR (EX TEZPUR)|ASSAM': 'TEZPUR',
  'NAGAON|ASSAM': 'NOWGONG',
  'ANANTNAG-RAJOURI (EX ANANTNAG)|JAMMU & KASHMIR': 'ANANTANAG',
  'ANANTNAG-RAJOURI|JAMMU & KASHMIR': 'ANANTANAG',
  'ANANTNAG|JAMMU & KASHMIR': 'ANANTANAG',
  'MUMBAI SOUTH -CENTRAL|MAHARASHTRA': 'MUMBAI SOUTH -CENTRA',
  'RATNAGIRI -SINDHUDURG|MAHARASHTRA': 'RATNAGIRI ?SINDHUDUR',
  'KARAULI -DHOLPUR|RAJASTHAN': 'KARAULI ?DHOLPUR(SC)',
  'TONK - SAWAI MADHOPUR|RAJASTHAN': 'TONK ? SAWAI MADHOPUR',
  'JANJGIR-CHAMPA|CHHATTISGARH': 'JANJGIR-CHAMPA (SC',
  'THIRUVANANTHAPURAM|KERALA': 'THIRUVANANTHAPURA',
  'FATEHGARH SAHIB|PUNJAB': 'FATEHGARH SAHIB (SC',
  'NAINITAL-UDHAMSINGH NAGAR|UTTARAKHAND': 'NAINITAL-UDHAMSINGH NAG',
} as const;

/**
 * Parliament state name aliases
 */
export const PC_STATE_ALIASES: StateAliasMap = {
  'NCT of Delhi': 'Delhi',
  'Andaman & Nicobar': 'Andaman and Nicobar Islands',
  'Andaman & Nicobar Islands': 'Andaman and Nicobar Islands',
  'Jammu & Kashmir': 'Jammu and Kashmir',
} as const;

// ============================================================
// IndexedDB Configuration
// ============================================================

/** IndexedDB database name */
export const DB_NAME = 'IndiaElectionMapDB';

/** IndexedDB database version */
export const DB_VERSION = 1;

/** IndexedDB object store name */
export const STORE_NAME = 'geojson';
