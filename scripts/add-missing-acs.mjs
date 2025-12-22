#!/usr/bin/env node
/**
 * Add missing ACs to schema from election data
 * 
 * Some GeoJSON files are outdated and missing newer constituencies.
 * This script adds any ACs found in election data but missing from schema.
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
 * Check if AC exists in schema (by AC number)
 */
function acExistsInSchema(stateId, acNo) {
  return Object.values(schema.assemblyConstituencies)
    .some(ac => ac.stateId === stateId && ac.acNo === acNo);
}

/**
 * Add missing ACs from election data for a state
 */
function addMissingACsForState(stateId) {
  const electionDir = join(DATA_DIR, `elections/ac/${stateId}`);
  
  if (!existsSync(electionDir)) return { added: 0, missing: [] };
  
  // Find all year files and collect AC info
  const files = readdirSync(electionDir).filter(f => /^\d{4}\.json$/.test(f));
  if (files.length === 0) return { added: 0, missing: [] };
  
  // Use latest year as primary source
  const latestYear = Math.max(...files.map(f => parseInt(f.replace('.json', ''))));
  const yearFile = join(electionDir, `${latestYear}.json`);
  const electionData = JSON.parse(readFileSync(yearFile, 'utf-8'));
  
  let added = 0;
  const missing = [];
  
  for (const [key, result] of Object.entries(electionData)) {
    if (key.startsWith('_')) continue;
    
    const acNo = result.constituencyNo || result.acNo;
    if (!acNo) continue;
    
    // Check if already exists
    if (acExistsInSchema(stateId, acNo)) continue;
    
    const acId = `${stateId}-${String(acNo).padStart(3, '0')}`;
    
    // Skip if ID already exists (shouldn't happen but just in case)
    if (schema.assemblyConstituencies[acId]) continue;
    
    // Determine type
    const name = result.constituencyNameOriginal || result.constituencyName || key;
    let type = 'GEN';
    if (name.includes('(SC)')) type = 'SC';
    else if (name.includes('(ST)')) type = 'ST';
    
    // Clean name
    const cleanName = name
      .replace(/\s*\(SC\)\s*/gi, '')
      .replace(/\s*\(ST\)\s*/gi, '')
      .trim();
    
    // Add to schema
    schema.assemblyConstituencies[acId] = {
      id: acId,
      stateId: stateId,
      pcId: '',
      districtId: '',
      acNo: acNo,
      name: cleanName,
      aliases: [
        cleanName,
        cleanName.toUpperCase(),
        cleanName.toLowerCase(),
        key,
        key.toUpperCase(),
        key.toLowerCase(),
        name,
        name.toUpperCase(),
      ].filter((v, i, a) => a.indexOf(v) === i),
      type: type,
      delimitation: 2008,
    };
    
    added++;
    missing.push({ acNo, name: cleanName, id: acId });
  }
  
  return { added, missing };
}

/**
 * Rebuild indices
 */
function rebuildIndices() {
  schema.indices = schema.indices || {};
  schema.indices.acByName = {};
  
  for (const [id, ac] of Object.entries(schema.assemblyConstituencies)) {
    const stateId = ac.stateId;
    
    const key = `${normalize(ac.name)}|${stateId}`;
    schema.indices.acByName[key] = id;
    
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
  console.log('🔍 Adding missing ACs to schema from election data...\n');
  
  // Process all states with election data
  const electionDir = join(DATA_DIR, 'elections/ac');
  const stateFolders = readdirSync(electionDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  let totalAdded = 0;
  const stateChanges = [];
  
  for (const stateId of stateFolders) {
    const { added, missing } = addMissingACsForState(stateId);
    
    if (added > 0) {
      totalAdded += added;
      stateChanges.push({ stateId, added, missing });
      console.log(`✓ ${stateId}: Added ${added} missing ACs`);
    }
  }
  
  if (totalAdded === 0) {
    console.log('No missing ACs found - schema is complete!');
  } else {
    // Rebuild indices
    console.log('\n🔄 Rebuilding indices...');
    const indexSize = rebuildIndices();
    console.log(`   AC index: ${indexSize} entries`);
    
    // Update metadata
    schema.lastUpdated = new Date().toISOString();
    
    // Write schema
    writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));
    
    // Summary
    console.log(`\n✅ Added ${totalAdded} missing ACs!`);
    console.log(`   Total ACs now: ${Object.keys(schema.assemblyConstituencies).length}`);
    
    // Details
    if (process.argv.includes('--verbose')) {
      console.log('\nDetails:');
      for (const { stateId, added, missing } of stateChanges) {
        console.log(`\n${stateId} (+${added}):`);
        missing.forEach(m => console.log(`  ${m.id} ${m.name} (AC#${m.acNo})`));
      }
    }
  }
}

main().catch(console.error);

