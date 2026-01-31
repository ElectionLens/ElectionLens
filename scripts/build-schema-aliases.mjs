#!/usr/bin/env node
/**
 * Build comprehensive aliases in schema from existing election data
 * 
 * Scans all election data files to collect name variations and adds them
 * as aliases in the schema for better matching.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'public/data');
const SCHEMA_PATH = join(DATA_DIR, 'schema.json');

// Load schema
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

/**
 * Normalize for comparison (strips (SC)/(ST))
 */
function normalize(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '')  // Remove (SC)/(ST)
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Key for index: keep SC/ST suffix so GEN and reserved ACs get distinct keys (e.g. PRATHIPADU vs PRATHIPADUSC)
 */
function keyForIndex(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(SC\)\s*/gi, 'SC')
    .replace(/\s*\(ST\)\s*/gi, 'ST')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/** Collapse repeated chars for fuzzy match (e.g. Pappireddippatti vs Pappireddipatti) */
function collapseRepeated(s) {
  return (s || '').replace(/(.)\1+/g, '$1');
}

/**
 * Find best matching schema entity by AC number
 */
function findByNumber(stateId, acNo, type = 'ac') {
  const entities = type === 'ac' ? schema.assemblyConstituencies : schema.parliamentaryConstituencies;
  
  for (const [id, entity] of Object.entries(entities)) {
    if (entity.stateId !== stateId) continue;
    
    const entityNo = type === 'ac' ? entity.acNo : entity.pcNo;
    if (entityNo === acNo) {
      return { id, entity };
    }
  }
  return null;
}

/**
 * Collect all name variations from election data
 */
function collectNameVariations() {
  const variations = {
    ac: new Map(), // stateId -> Map<acNo, Set<names>>
    pc: new Map(), // stateId -> Map<pcNo, Set<names>>
  };
  
  // Process AC elections
  const acDir = join(DATA_DIR, 'elections/ac');
  if (existsSync(acDir)) {
    for (const stateDir of readdirSync(acDir, { withFileTypes: true })) {
      if (!stateDir.isDirectory()) continue;
      
      const stateId = stateDir.name;
      if (!variations.ac.has(stateId)) {
        variations.ac.set(stateId, new Map());
      }
      
      const statePath = join(acDir, stateId);
      for (const file of readdirSync(statePath)) {
        if (!/^\d{4}\.json$/.test(file)) continue;
        
        const data = JSON.parse(readFileSync(join(statePath, file), 'utf-8'));
        
        for (const [key, result] of Object.entries(data)) {
          if (key.startsWith('_')) continue;
          
          const acNo = result.constituencyNo || result.acNo;
          if (!acNo) continue;
          
          if (!variations.ac.get(stateId).has(acNo)) {
            variations.ac.get(stateId).set(acNo, new Set());
          }
          
          // Add various name forms
          const names = [
            key,
            result.constituencyName,
            result.constituencyNameOriginal,
            result.name,
          ].filter(Boolean);
          
          for (const name of names) {
            variations.ac.get(stateId).get(acNo).add(name);
          }
        }
      }
    }
  }
  
  // Process PC elections
  const pcDir = join(DATA_DIR, 'elections/pc');
  if (existsSync(pcDir)) {
    for (const stateDir of readdirSync(pcDir, { withFileTypes: true })) {
      if (!stateDir.isDirectory()) continue;
      
      const stateId = stateDir.name;
      if (!variations.pc.has(stateId)) {
        variations.pc.set(stateId, new Map());
      }
      
      const statePath = join(pcDir, stateId);
      for (const file of readdirSync(statePath)) {
        if (!/^\d{4}\.json$/.test(file)) continue;
        
        const data = JSON.parse(readFileSync(join(statePath, file), 'utf-8'));
        
        for (const [key, result] of Object.entries(data)) {
          if (key.startsWith('_')) continue;
          
          const pcNo = result.constituencyNo || result.pcNo;
          if (!pcNo) continue;
          
          if (!variations.pc.get(stateId).has(pcNo)) {
            variations.pc.get(stateId).set(pcNo, new Set());
          }
          
          const names = [
            key,
            result.constituencyName,
            result.constituencyNameOriginal,
            result.name,
          ].filter(Boolean);
          
          for (const name of names) {
            variations.pc.get(stateId).get(pcNo).add(name);
          }
        }
      }
    }
  }
  
  return variations;
}

/**
 * Collect AC names from PC election acWiseResults and acWiseVotes (so spelling variants like
 * Pappireddipatti in PC data get added as aliases to schema ACs like Pappireddippatti).
 * Returns Map stateId -> Map pcId -> Set(acNames).
 */
function collectACNamesFromPC() {
  const acNamesByPC = new Map(); // stateId -> Map(pcId -> Set(acNames))
  const pcDir = join(DATA_DIR, 'elections/pc');
  if (!existsSync(pcDir)) return acNamesByPC;

  for (const stateDir of readdirSync(pcDir, { withFileTypes: true })) {
    if (!stateDir.isDirectory()) continue;
    const stateId = stateDir.name;
    if (!acNamesByPC.has(stateId)) acNamesByPC.set(stateId, new Map());

    const statePath = join(pcDir, stateId);
    for (const file of readdirSync(statePath)) {
      if (!/^\d{4}\.json$/.test(file)) continue;
      const data = JSON.parse(readFileSync(join(statePath, file), 'utf-8'));

      for (const [pcId, result] of Object.entries(data)) {
        if (pcId.startsWith('_') || !result) continue;
        if (!acNamesByPC.get(stateId).has(pcId)) acNamesByPC.get(stateId).set(pcId, new Set());

        const acNames = acNamesByPC.get(stateId).get(pcId);
        if (result.acWiseResults) {
          for (const acName of Object.keys(result.acWiseResults)) {
            if (acName && typeof acName === 'string') acNames.add(acName.trim());
          }
        }
        if (result.candidates && Array.isArray(result.candidates)) {
          for (const c of result.candidates) {
            if (c.acWiseVotes && Array.isArray(c.acWiseVotes)) {
              for (const av of c.acWiseVotes) {
                const name = av.acName?.trim();
                if (name) acNames.add(name);
              }
            }
          }
        }
      }
    }
  }
  return acNamesByPC;
}

/**
 * Add PC-derived AC names as aliases to schema ACs (match by same PC + normalize or collapseRepeated).
 */
function updateSchemaAliasesFromPC(acNamesByPC) {
  let added = 0;
  for (const [stateId, pcMap] of acNamesByPC.entries()) {
    for (const [pcId, acNames] of pcMap.entries()) {
      const acsInPC = Object.entries(schema.assemblyConstituencies || {}).filter(
        ([, ac]) => ac.stateId === stateId && ac.pcId === pcId
      );
      if (acsInPC.length === 0) continue;

      for (const acName of acNames) {
        const n = normalize(acName);
        const nc = collapseRepeated(n);
        if (!n) continue;

        for (const [acId, ac] of acsInPC) {
          const schemaNorm = normalize(ac.name);
          const schemaColl = collapseRepeated(schemaNorm);
          if (n === schemaNorm || nc === schemaColl) {
            const current = new Set(ac.aliases || []);
            if (!current.has(acName)) {
              current.add(acName);
              current.add(acName.toUpperCase());
              current.add(acName.toLowerCase());
              schema.assemblyConstituencies[acId].aliases = [...current];
              added++;
            }
            break;
          }
        }
      }
    }
  }
  return added;
}

/**
 * Update schema with collected aliases
 */
function updateSchemaAliases(variations) {
  let acUpdated = 0;
  let pcUpdated = 0;
  
  // Update AC aliases
  for (const [stateId, acMap] of variations.ac) {
    for (const [acNo, names] of acMap) {
      const match = findByNumber(stateId, acNo, 'ac');
      if (!match) continue;
      
      const { id, entity } = match;
      const currentAliases = new Set(entity.aliases || []);
      const originalSize = currentAliases.size;
      
      for (const name of names) {
        // Add normalized and original forms
        currentAliases.add(name);
        currentAliases.add(name.toUpperCase());
        currentAliases.add(name.toLowerCase());
      }
      
      if (currentAliases.size > originalSize) {
        schema.assemblyConstituencies[id].aliases = [...currentAliases];
        acUpdated++;
      }
    }
  }
  
  // Update PC aliases
  for (const [stateId, pcMap] of variations.pc) {
    for (const [pcNo, names] of pcMap) {
      const match = findByNumber(stateId, pcNo, 'pc');
      if (!match) continue;
      
      const { id, entity } = match;
      const currentAliases = new Set(entity.aliases || []);
      const originalSize = currentAliases.size;
      
      for (const name of names) {
        currentAliases.add(name);
        currentAliases.add(name.toUpperCase());
        currentAliases.add(name.toLowerCase());
      }
      
      if (currentAliases.size > originalSize) {
        schema.parliamentaryConstituencies[id].aliases = [...currentAliases];
        pcUpdated++;
      }
    }
  }
  
  return { acUpdated, pcUpdated };
}

/**
 * Rebuild indices for name lookups
 */
function rebuildIndices() {
  // Rebuild AC name index
  schema.indices = schema.indices || {};
  schema.indices.acByName = {};
  
  for (const [id, ac] of Object.entries(schema.assemblyConstituencies)) {
    const stateId = ac.stateId;

    // Index canonical name (use keyForIndex so (SC)/(ST) ACs get distinct keys, e.g. PRATHIPADUSC vs PRATHIPADU)
    const key = `${keyForIndex(ac.name)}|${stateId}`;
    const existingId = schema.indices.acByName[key];
    const currentReserved = /\(SC\)|\(ST\)/i.test(ac.name);
    // Prefer GEN over (SC)/(ST) when key would conflict so base name resolves to GEN AC
    if (existingId) {
      const existingReserved = /\(SC\)|\(ST\)/i.test(schema.assemblyConstituencies[existingId]?.name || '');
      if (currentReserved && !existingReserved) continue; // keep GEN
      if (!currentReserved && existingReserved) schema.indices.acByName[key] = id; // overwrite with GEN
    } else {
      schema.indices.acByName[key] = id;
    }
    
    // Index all aliases
    for (const alias of (ac.aliases || [])) {
      const aliasKey = `${normalize(alias)}|${stateId}`;
      if (!schema.indices.acByName[aliasKey]) {
        schema.indices.acByName[aliasKey] = id;
      }
    }
  }
  
  // Rebuild PC name index
  schema.indices.pcByName = {};
  
  for (const [id, pc] of Object.entries(schema.parliamentaryConstituencies)) {
    const stateId = pc.stateId;
    
    const key = `${normalize(pc.name)}|${stateId}`;
    schema.indices.pcByName[key] = id;
    
    for (const alias of (pc.aliases || [])) {
      const aliasKey = `${normalize(alias)}|${stateId}`;
      if (!schema.indices.pcByName[aliasKey]) {
        schema.indices.pcByName[aliasKey] = id;
      }
    }
  }
  
  return {
    acIndexSize: Object.keys(schema.indices.acByName).length,
    pcIndexSize: Object.keys(schema.indices.pcByName).length,
  };
}

/**
 * Main
 */
async function main() {
  console.log('🔍 Building schema aliases from election data...\n');
  
  // Collect name variations
  console.log('📊 Scanning election data for name variations...');
  const variations = collectNameVariations();
  
  let acVariations = 0;
  let pcVariations = 0;
  for (const stateMap of variations.ac.values()) {
    acVariations += stateMap.size;
  }
  for (const stateMap of variations.pc.values()) {
    pcVariations += stateMap.size;
  }
  console.log(`   Found ${acVariations} AC variations across ${variations.ac.size} states`);
  console.log(`   Found ${pcVariations} PC variations across ${variations.pc.size} states`);
  
  // Update schema
  console.log('\n📝 Updating schema aliases...');
  const { acUpdated, pcUpdated } = updateSchemaAliases(variations);
  console.log(`   Updated ${acUpdated} ACs with new aliases`);
  console.log(`   Updated ${pcUpdated} PCs with new aliases`);

  // Add AC name variants from PC election acWiseResults/acWiseVotes (e.g. Pappireddipatti -> Pappireddippatti)
  console.log('\n📋 Scanning PC elections for AC name variants...');
  const acNamesByPC = collectACNamesFromPC();
  const pcAcAliasesAdded = updateSchemaAliasesFromPC(acNamesByPC);
  console.log(`   Added ${pcAcAliasesAdded} AC aliases from PC data`);
  
  // Rebuild indices
  console.log('\n🔄 Rebuilding name indices...');
  const { acIndexSize, pcIndexSize } = rebuildIndices();
  console.log(`   AC index: ${acIndexSize} entries`);
  console.log(`   PC index: ${pcIndexSize} entries`);
  
  // Update metadata
  schema.lastUpdated = new Date().toISOString();
  
  // Write updated schema
  writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));
  console.log('\n✅ Schema updated with expanded aliases!');
}

main().catch(console.error);

