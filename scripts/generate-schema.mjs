#!/usr/bin/env node
/**
 * Generate Master Schema from Existing Data
 *
 * This script reads all existing GeoJSON and election data files
 * and generates a unified schema.json with canonical IDs and names.
 *
 * Usage: node scripts/generate-schema.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(DATA_DIR, 'schema.json');

// ============================================================================
// NORMALIZATION UTILITIES
// ============================================================================

/**
 * Normalize a name for consistent matching
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a lookup key for name + state combination
 */
function createLookupKey(name, stateId) {
  return `${normalizeName(name)}|${stateId}`;
}

/**
 * Generate state ID from name
 */
function generateStateId(name) {
  const STATE_CODES = {
    'andhra pradesh': 'AP',
    'arunachal pradesh': 'AR',
    'assam': 'AS',
    'bihar': 'BR',
    'chhattisgarh': 'CG',
    'chattisgarh': 'CG',
    'goa': 'GA',
    'gujarat': 'GJ',
    'haryana': 'HR',
    'himachal pradesh': 'HP',
    'jharkhand': 'JH',
    'karnataka': 'KA',
    'kerala': 'KL',
    'madhya pradesh': 'MP',
    'maharashtra': 'MH',
    'manipur': 'MN',
    'meghalaya': 'ML',
    'mizoram': 'MZ',
    'nagaland': 'NL',
    'odisha': 'OD',
    'orissa': 'OD', // Old name
    'punjab': 'PB',
    'rajasthan': 'RJ',
    'sikkim': 'SK',
    'tamil nadu': 'TN',
    'telangana': 'TS',
    'tripura': 'TR',
    'uttar pradesh': 'UP',
    'uttarakhand': 'UK',
    'uttarkhand': 'UK', // Typo variant
    'uttaranchal': 'UK', // Old name
    'west bengal': 'WB',
    'delhi': 'DL',
    'nct of delhi': 'DL',
    'jammu and kashmir': 'JK',
    'jammu kashmir': 'JK',
    'ladakh': 'LA',
    'puducherry': 'PY',
    'pondicherry': 'PY', // Old name
    'chandigarh': 'CH',
    'andaman and nicobar islands': 'AN',
    'andaman and nicobar': 'AN',
    'andaman nicobar': 'AN',
    'dadra and nagar haveli and daman and diu': 'DD',
    'dnh and dd': 'DD',
    'dadra nagar haveli': 'DD',
    'daman and diu': 'DD',
    'daman diu': 'DD',
    'lakshadweep': 'LD',
  };

  const normalized = normalizeName(name);
  return STATE_CODES[normalized] || normalized.substring(0, 2).toUpperCase();
}

/**
 * Extract reservation type from name
 */
function extractType(name) {
  if (!name) return 'GEN';
  const upper = name.toUpperCase();
  if (upper.includes('(SC)')) return 'SC';
  if (upper.includes('(ST)')) return 'ST';
  return 'GEN';
}

/**
 * Clean name by removing reservation suffix
 */
function cleanName(name) {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// ============================================================================
// DATA LOADERS
// ============================================================================

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.warn(`Warning: Could not load ${filePath}`);
    return null;
  }
}

function loadStatesBoundaries() {
  const geo = loadJSON(path.join(DATA_DIR, 'geo/boundaries/states.geojson'));
  return geo?.features || [];
}

function loadAssemblyGeo() {
  const geo = loadJSON(path.join(DATA_DIR, 'geo/assembly/constituencies.geojson'));
  return geo?.features || [];
}

function loadParliamentGeo() {
  const geo = loadJSON(path.join(DATA_DIR, 'geo/parliament/constituencies.geojson'));
  return geo?.features || [];
}

function loadElectionIndices() {
  const acDir = path.join(DATA_DIR, 'elections/ac');
  const indices = {};

  if (fs.existsSync(acDir)) {
    for (const stateDir of fs.readdirSync(acDir)) {
      const indexPath = path.join(acDir, stateDir, 'index.json');
      if (fs.existsSync(indexPath)) {
        indices[stateDir] = loadJSON(indexPath);
      }
    }
  }

  return indices;
}

// ============================================================================
// SCHEMA BUILDERS
// ============================================================================

// Additional state name aliases for legacy/variant names
const STATE_NAME_ALIASES = {
  OD: ['odisha', 'orissa'],
  UK: ['uttarakhand', 'uttarkhand', 'uttaranchal'],
  PY: ['puducherry', 'pondicherry'],
  DL: ['delhi', 'nct of delhi'],
  AN: ['andaman and nicobar islands', 'andaman and nicobar', 'andaman nicobar'],
  DD: ['dadra and nagar haveli and daman and diu', 'dnh and dd', 'dadra nagar haveli', 'daman and diu', 'daman diu'],
  CG: ['chhattisgarh', 'chattisgarh'],
  JK: ['jammu and kashmir', 'jammu kashmir'],
};

function buildStates(boundariesGeo, electionIndices) {
  const states = {};
  const stateByName = {};

  // Start with state boundaries (most complete list)
  for (const feature of boundariesGeo) {
    const props = feature.properties;
    const name = props.shapeName;
    const id = generateStateId(name);

    const normalized = normalizeName(name);

    // Find election index for this state
    const slugName = normalized.replace(/\s+/g, '-');
    const electionIndex = electionIndices[slugName];

    // Get all aliases for this state
    const baseAliases = [name, normalized, name.toUpperCase()];
    const additionalAliases = STATE_NAME_ALIASES[id] || [];

    states[id] = {
      id,
      name,
      aliases: [...new Set([...baseAliases, ...additionalAliases])],
      isoCode: props.shapeISO || `IN-${id}`,
      censusCode: '',
      type: ['DL', 'PY', 'CH', 'AN', 'DD', 'LD', 'LA', 'JK'].includes(id)
        ? 'union_territory'
        : 'state',
      loksabhaSeats: 0, // Will be filled from PC data
      assemblySeats: electionIndex?.totalConstituencies || null,
      delimitation: electionIndex?.delimitation || null,
      elections: {
        assembly: electionIndex?.availableYears || [],
        parliament: [],
      },
    };

    // Build name index - include all aliases
    stateByName[normalized] = id;
    stateByName[name.toLowerCase()] = id;
    for (const alias of additionalAliases) {
      stateByName[alias] = id;
    }
  }

  return { states, stateByName };
}

function buildPCs(parliamentGeo, states, stateByName) {
  const pcs = {};
  const pcByName = {};
  const pcCountByState = {};

  for (const feature of parliamentGeo) {
    const props = feature.properties;
    const stateName = props.state_ut_name;
    const pcName = props.ls_seat_name;

    if (!stateName || !pcName) continue;

    // Find state ID
    const stateId = stateByName[normalizeName(stateName)];
    if (!stateId) {
      console.warn(`Unknown state for PC: ${stateName}`);
      continue;
    }

    // Generate PC number (sequential per state)
    pcCountByState[stateId] = (pcCountByState[stateId] || 0) + 1;
    const pcNo = parseInt(props.ls_seat_code, 10) || pcCountByState[stateId];

    const id = `${stateId}-${String(pcNo).padStart(2, '0')}`;
    const type = extractType(pcName);

    pcs[id] = {
      id,
      stateId,
      pcNo,
      name: pcName,
      aliases: [pcName, cleanName(pcName), pcName.toUpperCase(), cleanName(pcName).toUpperCase()],
      type,
      assemblyIds: [], // Will be filled from AC data
      delimitation: 2008, // Current delimitation
    };

    // Build name index
    const lookupKey = createLookupKey(pcName, stateId);
    pcByName[lookupKey] = id;
    pcByName[createLookupKey(cleanName(pcName), stateId)] = id;

    // Update state's PC count
    if (states[stateId]) {
      states[stateId].loksabhaSeats = Math.max(states[stateId].loksabhaSeats, pcNo);
    }
  }

  return { pcs, pcByName };
}

function buildACs(assemblyGeo, states, stateByName, pcs, pcByName) {
  const acs = {};
  const acByName = {};
  const districts = {};
  const districtByName = {};

  for (const feature of assemblyGeo) {
    const props = feature.properties;
    const stateName = props.ST_NAME;
    const acName = props.AC_NAME;
    const pcName = props.PC_NAME;
    const districtName = props.DIST_NAME;

    if (!stateName || !acName) continue;

    // Find state ID
    const stateId = stateByName[normalizeName(stateName)];
    if (!stateId) {
      console.warn(`Unknown state for AC: ${stateName}`);
      continue;
    }

    // Generate AC ID
    const acNo = props.AC_NO || 0;
    const id = `${stateId}-${String(acNo).padStart(3, '0')}`;
    const type = extractType(acName);

    // Find or create district
    let districtId = null;
    if (districtName) {
      const districtLookup = createLookupKey(districtName, stateId);
      districtId = districtByName[districtLookup];

      if (!districtId) {
        const distCode = props.DT_CODE || Object.keys(districts).length + 1;
        districtId = `${stateId}-D${String(distCode).padStart(2, '0')}`;

        districts[districtId] = {
          id: districtId,
          stateId,
          censusCode: String(props.DT_CODE || ''),
          name: districtName,
          aliases: [districtName, districtName.toUpperCase()],
          assemblyIds: [],
        };

        districtByName[districtLookup] = districtId;
      }

      // Add AC to district
      if (districts[districtId] && !districts[districtId].assemblyIds.includes(id)) {
        districts[districtId].assemblyIds.push(id);
      }
    }

    // Find PC ID
    let pcId = null;
    if (pcName) {
      const pcLookup = createLookupKey(pcName, stateId);
      pcId = pcByName[pcLookup] || pcByName[createLookupKey(cleanName(pcName), stateId)];

      // Add AC to PC
      if (pcId && pcs[pcId] && !pcs[pcId].assemblyIds.includes(id)) {
        pcs[pcId].assemblyIds.push(id);
      }
    }

    acs[id] = {
      id,
      stateId,
      pcId,
      districtId,
      acNo,
      name: acName,
      aliases: [acName, cleanName(acName), acName.toUpperCase(), cleanName(acName).toUpperCase()],
      type,
      delimitation: 2008,
    };

    // Build name index
    const lookupKey = createLookupKey(acName, stateId);
    acByName[lookupKey] = id;
    acByName[createLookupKey(cleanName(acName), stateId)] = id;
  }

  return { acs, acByName, districts, districtByName };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔄 Loading existing data...');

  // Load all source data
  const boundariesGeo = loadStatesBoundaries();
  const assemblyGeo = loadAssemblyGeo();
  const parliamentGeo = loadParliamentGeo();
  const electionIndices = loadElectionIndices();

  console.log(`   Found ${boundariesGeo.length} states`);
  console.log(`   Found ${parliamentGeo.length} PCs`);
  console.log(`   Found ${assemblyGeo.length} ACs`);

  console.log('\n📦 Building schema...');

  // Build states first
  const { states, stateByName } = buildStates(boundariesGeo, electionIndices);
  console.log(`   ${Object.keys(states).length} states`);

  // Build PCs
  const { pcs, pcByName } = buildPCs(parliamentGeo, states, stateByName);
  console.log(`   ${Object.keys(pcs).length} PCs`);

  // Build ACs and Districts
  const { acs, acByName, districts, districtByName } = buildACs(
    assemblyGeo,
    states,
    stateByName,
    pcs,
    pcByName
  );
  console.log(`   ${Object.keys(acs).length} ACs`);
  console.log(`   ${Object.keys(districts).length} districts`);

  // Assemble final schema
  const schema = {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    sources: {
      geo: 'Survey of India / DataMeet',
      elections: 'ECI / TCPD',
    },
    states,
    parliamentaryConstituencies: pcs,
    assemblyConstituencies: acs,
    districts,
    indices: {
      stateByName,
      pcByName,
      acByName,
      districtByName,
    },
  };

  // Write output
  console.log('\n💾 Writing schema.json...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(schema, null, 2));

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n✅ Schema generated successfully!');
  console.log(`   Output: ${OUTPUT_FILE}`);

  // Print summary
  console.log('\n📊 Summary:');
  console.log(`   States: ${Object.keys(states).length}`);
  console.log(`   PCs: ${Object.keys(pcs).length}`);
  console.log(`   ACs: ${Object.keys(acs).length}`);
  console.log(`   Districts: ${Object.keys(districts).length}`);
}

main().catch(console.error);

