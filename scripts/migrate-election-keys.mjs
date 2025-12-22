#!/usr/bin/env node
/**
 * Migrate election data keys from constituency names to schema IDs
 * 
 * Before: { "GUMMIDIPUNDI": { constituencyNo: 1, ... } }
 * After:  { "TN-001": { name: "Gummidipundi", ... } }
 * 
 * This enables direct ID lookups without fuzzy matching.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'public/data');
const SCHEMA_PATH = join(DATA_DIR, 'schema.json');

// Load schema
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

/**
 * Normalize string for matching
 */
function normalize(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip diacritics
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '')  // Remove (SC)/(ST)
    .replace(/[^A-Z0-9]/g, '')        // Keep only alphanumeric
    .trim();
}

/**
 * Find schema AC by name and state
 */
function findSchemaAC(acName, stateId) {
  const normalizedName = normalize(acName);
  
  // Build lookup from schema
  for (const [acId, ac] of Object.entries(schema.assemblyConstituencies)) {
    if (ac.stateId !== stateId) continue;
    
    // Check against canonical name
    if (normalize(ac.name) === normalizedName) {
      return { id: acId, ...ac };
    }
    
    // Check against aliases
    if (ac.aliases?.some(alias => normalize(alias) === normalizedName)) {
      return { id: acId, ...ac };
    }
  }
  
  // Fallback: match by AC number if available
  const match = acName.match(/^\d+/);
  if (match) {
    const acNo = parseInt(match[0]);
    for (const [acId, ac] of Object.entries(schema.assemblyConstituencies)) {
      if (ac.stateId === stateId && ac.acNo === acNo) {
        return { id: acId, ...ac };
      }
    }
  }
  
  return null;
}

/**
 * Find schema PC by name and state
 */
function findSchemaPC(pcName, stateId) {
  const normalizedName = normalize(pcName);
  
  for (const [pcId, pc] of Object.entries(schema.parliamentaryConstituencies)) {
    if (pc.stateId !== stateId) continue;
    
    if (normalize(pc.name) === normalizedName) {
      return { id: pcId, ...pc };
    }
    
    if (pc.aliases?.some(alias => normalize(alias) === normalizedName)) {
      return { id: pcId, ...pc };
    }
  }
  
  return null;
}

/**
 * Migrate AC election file
 */
function migrateACFile(filePath, stateId) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const migrated = {};
  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = [];
  
  for (const [key, result] of Object.entries(data)) {
    // Skip metadata keys
    if (key.startsWith('_')) {
      migrated[key] = result;
      continue;
    }
    
    const schemaAC = findSchemaAC(key, stateId);
    
    if (schemaAC) {
      // Use schema ID as key, add canonical name
      migrated[schemaAC.id] = {
        ...result,
        schemaId: schemaAC.id,
        name: schemaAC.name,
        type: schemaAC.type || result.constituencyType,
      };
      matched++;
    } else {
      // Keep original if no match found
      migrated[key] = {
        ...result,
        _unmatchedKey: true,
      };
      unmatched++;
      unmatchedNames.push(key);
    }
  }
  
  return { migrated, matched, unmatched, unmatchedNames };
}

/**
 * Migrate PC election file
 */
function migratePCFile(filePath, stateId) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const migrated = {};
  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = [];
  
  for (const [key, result] of Object.entries(data)) {
    if (key.startsWith('_')) {
      migrated[key] = result;
      continue;
    }
    
    const schemaPC = findSchemaPC(key, stateId);
    
    if (schemaPC) {
      migrated[schemaPC.id] = {
        ...result,
        schemaId: schemaPC.id,
        name: schemaPC.name,
        type: schemaPC.type || result.constituencyType,
      };
      matched++;
    } else {
      migrated[key] = {
        ...result,
        _unmatchedKey: true,
      };
      unmatched++;
      unmatchedNames.push(key);
    }
  }
  
  return { migrated, matched, unmatched, unmatchedNames };
}

/**
 * Process all election files
 */
function processElections(type) {
  const baseDir = join(DATA_DIR, 'elections', type);
  const stats = { states: 0, files: 0, matched: 0, unmatched: 0, unmatchedDetails: {} };
  
  if (!existsSync(baseDir)) {
    console.log(`No ${type} elections directory found`);
    return stats;
  }
  
  for (const stateDir of readdirSync(baseDir, { withFileTypes: true })) {
    if (!stateDir.isDirectory()) continue;
    
    const stateId = stateDir.name;
    const statePath = join(baseDir, stateId);
    stats.states++;
    
    for (const file of readdirSync(statePath)) {
      // Only process year files
      if (!/^\d{4}\.json$/.test(file)) continue;
      
      const filePath = join(statePath, file);
      stats.files++;
      
      const migrateFunc = type === 'ac' ? migrateACFile : migratePCFile;
      const { migrated, matched, unmatched, unmatchedNames } = migrateFunc(filePath, stateId);
      
      stats.matched += matched;
      stats.unmatched += unmatched;
      
      if (unmatchedNames.length > 0) {
        const key = `${stateId}/${file}`;
        stats.unmatchedDetails[key] = unmatchedNames;
      }
      
      // Write migrated file
      writeFileSync(filePath, JSON.stringify(migrated, null, 2));
    }
  }
  
  return stats;
}

/**
 * Main
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('🔄 Migrating election data keys to schema IDs...\n');
  
  if (dryRun) {
    console.log('📋 DRY RUN - no files will be modified\n');
  }
  
  // Process AC elections
  console.log('📊 Processing Assembly (AC) Elections...');
  const acStats = processElections('ac');
  console.log(`   States: ${acStats.states}`);
  console.log(`   Files: ${acStats.files}`);
  console.log(`   Matched: ${acStats.matched}`);
  console.log(`   Unmatched: ${acStats.unmatched}`);
  
  if (Object.keys(acStats.unmatchedDetails).length > 0) {
    console.log('\n   ⚠️  Unmatched AC keys:');
    for (const [file, names] of Object.entries(acStats.unmatchedDetails)) {
      console.log(`      ${file}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` (+${names.length - 5} more)` : ''}`);
    }
  }
  
  // Process PC elections
  console.log('\n📊 Processing Parliament (PC) Elections...');
  const pcStats = processElections('pc');
  console.log(`   States: ${pcStats.states}`);
  console.log(`   Files: ${pcStats.files}`);
  console.log(`   Matched: ${pcStats.matched}`);
  console.log(`   Unmatched: ${pcStats.unmatched}`);
  
  if (Object.keys(pcStats.unmatchedDetails).length > 0) {
    console.log('\n   ⚠️  Unmatched PC keys:');
    for (const [file, names] of Object.entries(pcStats.unmatchedDetails)) {
      console.log(`      ${file}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` (+${names.length - 5} more)` : ''}`);
    }
  }
  
  // Summary
  const totalMatched = acStats.matched + pcStats.matched;
  const totalUnmatched = acStats.unmatched + pcStats.unmatched;
  const matchRate = ((totalMatched / (totalMatched + totalUnmatched)) * 100).toFixed(1);
  
  console.log('\n📈 Summary:');
  console.log(`   Total matched: ${totalMatched}`);
  console.log(`   Total unmatched: ${totalUnmatched}`);
  console.log(`   Match rate: ${matchRate}%`);
  
  if (totalUnmatched > 0) {
    console.log('\n⚠️  Some constituencies could not be matched to schema IDs.');
    console.log('   These will keep their original keys until schema is updated.');
  }
  
  console.log('\n✅ Migration complete!');
}

main().catch(console.error);

