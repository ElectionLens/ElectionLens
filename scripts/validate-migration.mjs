#!/usr/bin/env node
/**
 * Validate Schema Migration
 *
 * This script validates that all GeoJSON features have valid schema IDs
 * and that the schema matches the election data.
 *
 * Usage: node scripts/validate-migration.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../public/data');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = [];

function check(name, condition, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ ${name}`);
  } else {
    failedChecks.push({ name, details });
    console.log(`  ❌ ${name}${details ? `: ${details}` : ''}`);
  }
}

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// ============================================================================
// VALIDATION TESTS
// ============================================================================

console.log('\n🔍 VALIDATING SCHEMA MIGRATION\n');
console.log('='.repeat(60));

// 1. Schema file exists and is valid
console.log('\n1. SCHEMA FILE');
const schema = loadJSON(path.join(DATA_DIR, 'schema.json'));
check('Schema file exists', schema !== null);
check('Schema has version', schema?.version !== undefined);
check('Schema has states', Object.keys(schema?.states || {}).length > 0);
check('Schema has PCs', Object.keys(schema?.parliamentaryConstituencies || {}).length > 0);
check('Schema has ACs', Object.keys(schema?.assemblyConstituencies || {}).length > 0);
check('Schema has indices', schema?.indices !== undefined);

// 2. GeoJSON files have schemaId
console.log('\n2. GEOJSON SCHEMA IDs');

// States
const statesGeo = loadJSON(path.join(DATA_DIR, 'geo/boundaries/states.geojson'));
const statesWithId = statesGeo?.features?.filter(f => f.properties.schemaId).length || 0;
const totalStates = statesGeo?.features?.length || 0;
check(`States have schemaId (${statesWithId}/${totalStates})`, statesWithId === totalStates);

// Parliament
const pcGeo = loadJSON(path.join(DATA_DIR, 'geo/parliament/constituencies.geojson'));
const pcsWithId = pcGeo?.features?.filter(f => f.properties.schemaId).length || 0;
const totalPCs = pcGeo?.features?.length || 0;
check(`PCs have schemaId (${pcsWithId}/${totalPCs})`, pcsWithId === totalPCs);

// Assembly
const acGeo = loadJSON(path.join(DATA_DIR, 'geo/assembly/constituencies.geojson'));
const acsWithId = acGeo?.features?.filter(f => f.properties.schemaId).length || 0;
const totalACs = acGeo?.features?.length || 0;
const acCoverage = (acsWithId / totalACs * 100).toFixed(1);
check(`ACs have schemaId (${acsWithId}/${totalACs} = ${acCoverage}%)`, acsWithId / totalACs > 0.9);

// 3. Key constituencies can be looked up
console.log('\n3. KEY CONSTITUENCY LOOKUPS');

const testCases = [
  // State -> AC
  { type: 'AC', name: 'JAYAL (SC)', state: 'RJ', expectedId: 'RJ-108' },
  { type: 'AC', name: 'OMALUR', state: 'TN', expectedId: 'TN-084' },
  { type: 'AC', name: 'ANNA NAGAR', state: 'TN', expectedId: 'TN-021' },
  { type: 'PC', name: 'CHENNAI NORTH', state: 'TN', expectedId: 'TN-02' },
  { type: 'PC', name: 'NAGAUR', state: 'RJ', expectedId: 'RJ-14' },
];

for (const tc of testCases) {
  if (tc.type === 'AC') {
    const found = acGeo?.features?.find(f => 
      f.properties.AC_NAME?.toUpperCase() === tc.name && 
      f.properties.schemaId === tc.expectedId
    );
    check(`${tc.name} (${tc.state}) -> ${tc.expectedId}`, found !== undefined);
  } else {
    const found = pcGeo?.features?.find(f => 
      (f.properties.ls_seat_name || f.properties.PC_NAME)?.toUpperCase() === tc.name &&
      f.properties.schemaId === tc.expectedId
    );
    check(`${tc.name} PC (${tc.state}) -> ${tc.expectedId}`, found !== undefined);
  }
}

// 4. Election data exists for key states
console.log('\n4. ELECTION DATA AVAILABILITY');

// State ID to name mapping for display
const statesWithElections = [
  { id: 'TN', name: 'Tamil Nadu' },
  { id: 'KA', name: 'Karnataka' },
  { id: 'MH', name: 'Maharashtra' },
  { id: 'RJ', name: 'Rajasthan' },
  { id: 'UP', name: 'Uttar Pradesh' },
  { id: 'WB', name: 'West Bengal' },
  { id: 'KL', name: 'Kerala' },
  { id: 'DL', name: 'Delhi' },
];

for (const { id, name } of statesWithElections) {
  const indexPath = path.join(DATA_DIR, `elections/ac/${id}/index.json`);
  const index = loadJSON(indexPath);
  check(`${name} (${id}) has AC election data`, index !== null && index.availableYears?.length > 0,
    index ? `years: ${index.availableYears?.join(', ')}` : 'missing');
}

// 5. No duplicate PC folders
console.log('\n5. NO DUPLICATE PC FOLDERS');

const pcDir = path.join(DATA_DIR, 'elections/pc');
const pcFolders = fs.readdirSync(pcDir);
const duplicatePatterns = [
  /andaman.*nicobar/i,
  /dadra.*haveli/i,
  /daman.*diu/i,
];

for (const pattern of duplicatePatterns) {
  const matches = pcFolders.filter(f => pattern.test(f));
  check(`No duplicate folders for ${pattern.source}`, matches.length <= 1, 
    matches.length > 1 ? `found: ${matches.join(', ')}` : '');
}

// 6. Deep link URLs work (schema + election data match)
console.log('\n6. DEEP LINK TEST CASES');

const deepLinkTests = [
  { url: '/rajasthan/pc/nagaur/ac/jayal-(sc)?year=2023', schemaId: 'RJ-108', stateId: 'RJ', year: 2023 },
  { url: '/tamil-nadu/pc/salem/ac/omalur?year=2021', schemaId: 'TN-084', stateId: 'TN', year: 2021 },
  { url: '/karnataka/pc/bangalore-north/ac/k.r.-pura?year=2023', schemaId: 'KA-155', stateId: 'KA', year: 2023 },
];

for (const test of deepLinkTests) {
  // Check schema has this AC
  const acEntity = schema?.assemblyConstituencies?.[test.schemaId];
  check(`Schema has ${test.schemaId}`, acEntity !== undefined, 
    acEntity ? acEntity.name : 'not found');
  
  // Check election data exists for this year (using state ID, not slug)
  const yearData = loadJSON(path.join(DATA_DIR, `elections/ac/${test.stateId}/${test.year}.json`));
  const hasData = yearData && Object.keys(yearData).length > 0;
  check(`Election data exists for ${test.stateId}/${test.year}`, hasData);
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`\n📊 SUMMARY: ${passedChecks}/${totalChecks} checks passed\n`);

if (failedChecks.length > 0) {
  console.log('❌ FAILED CHECKS:');
  failedChecks.forEach(f => {
    console.log(`   - ${f.name}${f.details ? `: ${f.details}` : ''}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('✅ All validation checks passed!\n');
  process.exit(0);
}

