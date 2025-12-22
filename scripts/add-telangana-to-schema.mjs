#!/usr/bin/env node
/**
 * Add Telangana ACs to schema from election data
 * 
 * Telangana was formed in 2014 from Andhra Pradesh, so it's missing
 * from older GeoJSON sources. This script adds TS ACs from election data.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'public/data');
const SCHEMA_PATH = join(DATA_DIR, 'schema.json');

// Load schema
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

/**
 * Normalize for comparison
 */
function normalize(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Get state ID from slug
 */
const SLUG_TO_ID = {
  'TS': 'TS',
  'telangana': 'TS',
  'SK': 'SK', 
  'sikkim': 'SK',
  'AN': 'AN',
  'andaman-and-nicobar-islands': 'AN',
  'CH': 'CH',
  'chandigarh': 'CH',
  'DD': 'DD',
  'LA': 'LA',
  'ladakh': 'LA',
  'LD': 'LD',
  'lakshadweep': 'LD',
};

/**
 * Add missing ACs from election data
 */
function addMissingACs(stateId, stateName) {
  const electionDir = join(DATA_DIR, `elections/ac/${stateId}`);
  
  if (!existsSync(electionDir)) {
    console.log(`❌ No election data for ${stateId}`);
    return 0;
  }
  
  // Find latest year file
  const files = readdirSync(electionDir).filter(f => /^\d{4}\.json$/.test(f));
  if (files.length === 0) return 0;
  
  const latestYear = Math.max(...files.map(f => parseInt(f.replace('.json', ''))));
  const yearFile = join(electionDir, `${latestYear}.json`);
  
  const electionData = JSON.parse(readFileSync(yearFile, 'utf-8'));
  
  let added = 0;
  
  for (const [key, result] of Object.entries(electionData)) {
    if (key.startsWith('_')) continue;
    
    const acNo = result.constituencyNo || result.acNo;
    if (!acNo) continue;
    
    const acId = `${stateId}-${String(acNo).padStart(3, '0')}`;
    
    // Skip if already exists
    if (schema.assemblyConstituencies[acId]) continue;
    
    // Determine type
    const name = result.constituencyNameOriginal || result.constituencyName || key;
    let type = 'GEN';
    if (name.includes('(SC)')) type = 'SC';
    else if (name.includes('(ST)')) type = 'ST';
    
    // Clean name (remove SC/ST suffix)
    const cleanName = name
      .replace(/\s*\(SC\)\s*/gi, '')
      .replace(/\s*\(ST\)\s*/gi, '')
      .trim();
    
    // Add to schema
    schema.assemblyConstituencies[acId] = {
      id: acId,
      stateId: stateId,
      pcId: '', // Unknown
      districtId: '', // Unknown
      acNo: acNo,
      name: cleanName,
      aliases: [
        cleanName,
        cleanName.toUpperCase(),
        cleanName.toLowerCase(),
        key,
        key.toUpperCase(),
        key.toLowerCase(),
        name, // With suffix
        name.toUpperCase(),
      ].filter((v, i, a) => a.indexOf(v) === i), // Unique
      type: type,
      delimitation: 2008,
    };
    
    added++;
  }
  
  // Ensure state exists in schema
  if (!schema.states[stateId]) {
    const existingYears = files.map(f => parseInt(f.replace('.json', ''))).sort((a, b) => a - b);
    
    schema.states[stateId] = {
      id: stateId,
      name: stateName,
      aliases: [stateName, stateName.toLowerCase(), stateName.toUpperCase()],
      isoCode: `IN-${stateId}`,
      censusCode: '',
      type: 'state',
      loksabhaSeats: 0,
      assemblySeats: added,
      delimitation: 2008,
      elections: {
        assembly: existingYears,
        parliament: [],
      },
    };
  }
  
  return added;
}

/**
 * Rebuild indices
 */
function rebuildIndices() {
  schema.indices = schema.indices || {};
  schema.indices.acByName = {};
  
  for (const [id, ac] of Object.entries(schema.assemblyConstituencies)) {
    const stateId = ac.stateId;
    
    // Index canonical name
    const key = `${normalize(ac.name)}|${stateId}`;
    schema.indices.acByName[key] = id;
    
    // Index all aliases
    for (const alias of (ac.aliases || [])) {
      const aliasKey = `${normalize(alias)}|${stateId}`;
      if (!schema.indices.acByName[aliasKey]) {
        schema.indices.acByName[aliasKey] = id;
      }
    }
  }
  
  return Object.keys(schema.indices.acByName).length;
}

/**
 * Main
 */
async function main() {
  console.log('🔍 Adding missing states to schema...\n');
  
  // Add Telangana
  const tsAdded = addMissingACs('TS', 'Telangana');
  console.log(`✓ Telangana: Added ${tsAdded} ACs`);
  
  // Check for other missing states in election data
  const electionDir = join(DATA_DIR, 'elections/ac');
  const stateFolders = readdirSync(electionDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const stateId of stateFolders) {
    if (stateId === 'TS') continue; // Already handled
    
    // Check if state has ACs in schema
    const existingCount = Object.values(schema.assemblyConstituencies)
      .filter(ac => ac.stateId === stateId).length;
    
    if (existingCount === 0) {
      const stateName = stateId; // Will use ID as name for now
      const added = addMissingACs(stateId, stateName);
      if (added > 0) {
        console.log(`✓ ${stateId}: Added ${added} ACs`);
      }
    }
  }
  
  // Rebuild indices
  console.log('\n🔄 Rebuilding indices...');
  const indexSize = rebuildIndices();
  console.log(`   AC index: ${indexSize} entries`);
  
  // Update metadata
  schema.lastUpdated = new Date().toISOString();
  
  // Write schema
  writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));
  
  // Summary
  const totalACs = Object.keys(schema.assemblyConstituencies).length;
  const statesWithACs = new Set(
    Object.values(schema.assemblyConstituencies).map(ac => ac.stateId)
  ).size;
  
  console.log(`\n✅ Schema updated!`);
  console.log(`   Total ACs: ${totalACs}`);
  console.log(`   States with ACs: ${statesWithACs}`);
}

main().catch(console.error);

