#!/usr/bin/env node
/**
 * Add Schema IDs to GeoJSON Files
 *
 * This script reads the master schema and adds schemaId to each GeoJSON feature.
 * This allows direct lookup without name matching.
 *
 * Usage: node scripts/add-schema-ids-to-geojson.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../public/data');

// ============================================================================
// UTILITIES
// ============================================================================

function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data));
}

// ============================================================================
// SCHEMA ID ADDERS
// ============================================================================

function addSchemaIdsToAssembly(schema) {
  const filePath = path.join(DATA_DIR, 'geo/assembly/constituencies.geojson');
  const geo = loadJSON(filePath);
  
  let matched = 0;
  let unmatched = 0;
  const unmatchedList = [];

  for (const feature of geo.features) {
    const props = feature.properties;
    const stateName = normalizeName(props.ST_NAME);
    const acName = normalizeName(props.AC_NAME);
    
    // Find state ID
    const stateId = schema.indices.stateByName[stateName];
    if (!stateId) {
      unmatched++;
      unmatchedList.push(`State not found: ${props.ST_NAME}`);
      continue;
    }

    // Find AC by multiple strategies
    let acId = null;
    
    // Strategy 1: Direct lookup with state
    const lookupKey = `${acName}|${stateId}`;
    acId = schema.indices.acByName[lookupKey];
    
    // Strategy 2: Try without reservation suffix
    if (!acId) {
      const cleanName = acName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      acId = schema.indices.acByName[`${cleanName}|${stateId}`];
    }
    
    // Strategy 3: Search by AC number
    if (!acId && props.AC_NO) {
      const expectedId = `${stateId}-${String(props.AC_NO).padStart(3, '0')}`;
      if (schema.assemblyConstituencies[expectedId]) {
        acId = expectedId;
      }
    }

    if (acId) {
      props.schemaId = acId;
      matched++;
    } else {
      unmatched++;
      if (unmatchedList.length < 20) {
        unmatchedList.push(`AC not found: ${props.AC_NAME} (${props.ST_NAME})`);
      }
    }
  }

  saveJSON(filePath, geo);
  
  return { matched, unmatched, unmatchedList, total: geo.features.length };
}

function addSchemaIdsToParliament(schema) {
  const filePath = path.join(DATA_DIR, 'geo/parliament/constituencies.geojson');
  const geo = loadJSON(filePath);
  
  let matched = 0;
  let unmatched = 0;
  const unmatchedList = [];

  for (const feature of geo.features) {
    const props = feature.properties;
    const stateName = normalizeName(props.state_ut_name);
    const pcName = normalizeName(props.ls_seat_name);
    
    // Find state ID
    const stateId = schema.indices.stateByName[stateName];
    if (!stateId) {
      unmatched++;
      unmatchedList.push(`State not found: ${props.state_ut_name}`);
      continue;
    }

    // Find PC
    let pcId = null;
    
    // Strategy 1: Direct lookup
    const lookupKey = `${pcName}|${stateId}`;
    pcId = schema.indices.pcByName[lookupKey];
    
    // Strategy 2: Try without reservation suffix
    if (!pcId) {
      const cleanName = pcName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      pcId = schema.indices.pcByName[`${cleanName}|${stateId}`];
    }
    
    // Strategy 3: Search by seat code
    if (!pcId && props.ls_seat_code) {
      const seatNo = parseInt(props.ls_seat_code, 10);
      const expectedId = `${stateId}-${String(seatNo).padStart(2, '0')}`;
      if (schema.parliamentaryConstituencies[expectedId]) {
        pcId = expectedId;
      }
    }

    if (pcId) {
      props.schemaId = pcId;
      matched++;
    } else {
      unmatched++;
      if (unmatchedList.length < 20) {
        unmatchedList.push(`PC not found: ${props.ls_seat_name} (${props.state_ut_name})`);
      }
    }
  }

  saveJSON(filePath, geo);
  
  return { matched, unmatched, unmatchedList, total: geo.features.length };
}

function addSchemaIdsToStates(schema) {
  const filePath = path.join(DATA_DIR, 'geo/boundaries/states.geojson');
  const geo = loadJSON(filePath);
  
  let matched = 0;
  let unmatched = 0;
  const unmatchedList = [];

  for (const feature of geo.features) {
    const props = feature.properties;
    const stateName = normalizeName(props.shapeName);
    
    const stateId = schema.indices.stateByName[stateName];
    
    if (stateId) {
      props.schemaId = stateId;
      matched++;
    } else {
      unmatched++;
      unmatchedList.push(`State not found: ${props.shapeName}`);
    }
  }

  saveJSON(filePath, geo);
  
  return { matched, unmatched, unmatchedList, total: geo.features.length };
}

function addSchemaIdsToDistricts(schema) {
  const districtsDir = path.join(DATA_DIR, 'geo/districts');
  const files = fs.readdirSync(districtsDir).filter(f => f.endsWith('.geojson'));
  
  let totalMatched = 0;
  let totalUnmatched = 0;
  const allUnmatched = [];

  for (const file of files) {
    const filePath = path.join(districtsDir, file);
    const geo = loadJSON(filePath);
    
    for (const feature of geo.features) {
      const props = feature.properties;
      const stateName = normalizeName(props.st_nm);
      const districtName = normalizeName(props.district);
      
      // Find state ID
      const stateId = schema.indices.stateByName[stateName];
      if (!stateId) {
        totalUnmatched++;
        if (allUnmatched.length < 10) {
          allUnmatched.push(`State not found: ${props.st_nm} in ${file}`);
        }
        continue;
      }

      // Find district
      const lookupKey = `${districtName}|${stateId}`;
      const districtId = schema.indices.districtByName[lookupKey];
      
      if (districtId) {
        props.schemaId = districtId;
        totalMatched++;
      } else {
        totalUnmatched++;
        if (allUnmatched.length < 10) {
          allUnmatched.push(`District not found: ${props.district} (${props.st_nm})`);
        }
      }
    }

    saveJSON(filePath, geo);
  }

  return { matched: totalMatched, unmatched: totalUnmatched, unmatchedList: allUnmatched, total: totalMatched + totalUnmatched };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔄 Loading schema...');
  const schema = loadJSON(path.join(DATA_DIR, 'schema.json'));
  console.log(`   Loaded ${Object.keys(schema.assemblyConstituencies).length} ACs, ${Object.keys(schema.parliamentaryConstituencies).length} PCs`);

  console.log('\n📍 Adding schema IDs to GeoJSON files...\n');

  // States
  console.log('1. State boundaries...');
  const statesResult = addSchemaIdsToStates(schema);
  console.log(`   ✓ ${statesResult.matched}/${statesResult.total} matched`);
  if (statesResult.unmatched > 0) {
    console.log(`   ⚠ ${statesResult.unmatched} unmatched:`);
    statesResult.unmatchedList.forEach(m => console.log(`     - ${m}`));
  }

  // Parliament
  console.log('\n2. Parliament constituencies...');
  const pcResult = addSchemaIdsToParliament(schema);
  console.log(`   ✓ ${pcResult.matched}/${pcResult.total} matched`);
  if (pcResult.unmatched > 0) {
    console.log(`   ⚠ ${pcResult.unmatched} unmatched:`);
    pcResult.unmatchedList.slice(0, 10).forEach(m => console.log(`     - ${m}`));
    if (pcResult.unmatchedList.length > 10) {
      console.log(`     ... and ${pcResult.unmatchedList.length - 10} more`);
    }
  }

  // Assembly
  console.log('\n3. Assembly constituencies...');
  const acResult = addSchemaIdsToAssembly(schema);
  console.log(`   ✓ ${acResult.matched}/${acResult.total} matched`);
  if (acResult.unmatched > 0) {
    console.log(`   ⚠ ${acResult.unmatched} unmatched:`);
    acResult.unmatchedList.slice(0, 10).forEach(m => console.log(`     - ${m}`));
    if (acResult.unmatchedList.length > 10) {
      console.log(`     ... and ${acResult.unmatchedList.length - 10} more`);
    }
  }

  // Districts
  console.log('\n4. District boundaries...');
  const distResult = addSchemaIdsToDistricts(schema);
  console.log(`   ✓ ${distResult.matched}/${distResult.total} matched`);
  if (distResult.unmatched > 0) {
    console.log(`   ⚠ ${distResult.unmatched} unmatched:`);
    distResult.unmatchedList.forEach(m => console.log(`     - ${m}`));
  }

  // Summary
  const totalMatched = statesResult.matched + pcResult.matched + acResult.matched + distResult.matched;
  const totalFeatures = statesResult.total + pcResult.total + acResult.total + distResult.total;
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Schema IDs added: ${totalMatched}/${totalFeatures} features (${(100 * totalMatched / totalFeatures).toFixed(1)}%)`);
  console.log('='.repeat(50));
}

main().catch(console.error);

