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

function collapseRepeated(s) {
  return s.replace(/(.)\1+/g, '$1');
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

    // Strategy 4: Search assemblyConstituencies by stateId and normalized name/alias
    if (!acId && schema.assemblyConstituencies) {
      const cleanAcName = acName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      for (const [id, ac] of Object.entries(schema.assemblyConstituencies)) {
        if (ac.stateId !== stateId) continue;
        const acNorm = normalizeName(ac.name);
        const acClean = normalizeName((ac.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim());
        if (acNorm === acName || acNorm === cleanAcName || acClean === acName || acClean === cleanAcName) {
          acId = id;
          schema.indices.acByName[lookupKey] = id;
          schema.indices.acByName[`${cleanAcName}|${stateId}`] = id;
          break;
        }
        const aliases = ac.aliases || [];
        for (const alias of aliases) {
          if (normalizeName(alias) === acName || normalizeName(alias) === cleanAcName) {
            acId = id;
            schema.indices.acByName[lookupKey] = id;
            schema.indices.acByName[`${cleanAcName}|${stateId}`] = id;
            break;
          }
        }
        if (acId) break;
      }
    }

    // Strategy 5: Resolve by AC_NO and add GeoJSON name to index (for name/GeoJSON mismatch)
    if (!acId && props.AC_NO != null && schema.assemblyConstituencies) {
      const expectedId = `${stateId}-${String(props.AC_NO).padStart(3, '0')}`;
      if (schema.assemblyConstituencies[expectedId]) {
        acId = expectedId;
        schema.indices.acByName[lookupKey] = expectedId;
        const cleanAcName = acName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        schema.indices.acByName[`${cleanAcName}|${stateId}`] = expectedId;
        const ac = schema.assemblyConstituencies[expectedId];
        const geoName = (props.AC_NAME || '').trim();
        if (geoName && ac.aliases && !ac.aliases.includes(geoName)) {
          ac.aliases = [...(ac.aliases || []), geoName, geoName.toUpperCase()];
        }
      }
    }

    // Strategy 6: Fuzzy match by collapse-repeated chars (e.g. Pappireddippatti vs Pappireddipatti)
    if (!acId && schema.assemblyConstituencies) {
      const cleanAcName = acName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const geoCollapsed = collapseRepeated(acName);
      const geoCollapsedClean = collapseRepeated(cleanAcName);
      const candidates = [];
      for (const [id, ac] of Object.entries(schema.assemblyConstituencies)) {
        if (ac.stateId !== stateId) continue;
        const acNorm = normalizeName(ac.name);
        const acClean = normalizeName((ac.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim());
        if (collapseRepeated(acNorm) === geoCollapsed || collapseRepeated(acNorm) === geoCollapsedClean ||
            collapseRepeated(acClean) === geoCollapsed || collapseRepeated(acClean) === geoCollapsedClean) {
          candidates.push(id);
          continue;
        }
        for (const alias of ac.aliases || []) {
          const aNorm = normalizeName(alias);
          if (collapseRepeated(aNorm) === geoCollapsed || collapseRepeated(aNorm) === geoCollapsedClean) {
            candidates.push(id);
            break;
          }
        }
      }
      if (candidates.length === 1) {
        acId = candidates[0];
        schema.indices.acByName[lookupKey] = acId;
        const cleanAcName = acName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        schema.indices.acByName[`${cleanAcName}|${stateId}`] = acId;
        const ac = schema.assemblyConstituencies[acId];
        const geoName = (props.AC_NAME || '').trim();
        if (geoName && ac.aliases && !ac.aliases.includes(geoName)) {
          ac.aliases = [...(ac.aliases || []), geoName, geoName.toUpperCase()];
        }
      }
    }

    if (acId) {
      props.schemaId = acId;
      matched++;
    } else {
      unmatched++;
      unmatchedList.push(`AC not found: ${props.AC_NAME} (${props.ST_NAME})`);
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

    // Strategy 4: Search parliamentaryConstituencies by stateId and normalized name/alias
    if (!pcId && schema.parliamentaryConstituencies) {
      const cleanPcName = pcName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      for (const [id, pc] of Object.entries(schema.parliamentaryConstituencies)) {
        if (pc.stateId !== stateId) continue;
        const pcNorm = normalizeName(pc.name);
        const pcClean = normalizeName((pc.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim());
        if (pcNorm === pcName || pcNorm === cleanPcName || pcClean === pcName || pcClean === cleanPcName) {
          pcId = id;
          schema.indices.pcByName[lookupKey] = id;
          schema.indices.pcByName[`${cleanPcName}|${stateId}`] = id;
          break;
        }
        const aliases = pc.aliases || [];
        for (const alias of aliases) {
          if (normalizeName(alias) === pcName || normalizeName(alias) === cleanPcName) {
            pcId = id;
            schema.indices.pcByName[lookupKey] = id;
            schema.indices.pcByName[`${cleanPcName}|${stateId}`] = id;
            break;
          }
        }
        if (pcId) break;
      }
    }

    // Strategy 5: Fuzzy match by collapse-repeated chars
    if (!pcId && schema.parliamentaryConstituencies) {
      const cleanPcName = pcName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const geoCollapsed = collapseRepeated(pcName);
      const geoCollapsedClean = collapseRepeated(cleanPcName);
      const candidates = [];
      for (const [id, pc] of Object.entries(schema.parliamentaryConstituencies)) {
        if (pc.stateId !== stateId) continue;
        const pcNorm = normalizeName(pc.name);
        const pcClean = normalizeName((pc.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim());
        if (collapseRepeated(pcNorm) === geoCollapsed || collapseRepeated(pcNorm) === geoCollapsedClean ||
            collapseRepeated(pcClean) === geoCollapsed || collapseRepeated(pcClean) === geoCollapsedClean) {
          candidates.push(id);
          continue;
        }
        for (const alias of pc.aliases || []) {
          const aNorm = normalizeName(alias);
          if (collapseRepeated(aNorm) === geoCollapsed || collapseRepeated(aNorm) === geoCollapsedClean) {
            candidates.push(id);
            break;
          }
        }
      }
      if (candidates.length === 1) {
        pcId = candidates[0];
        schema.indices.pcByName[lookupKey] = pcId;
        schema.indices.pcByName[`${cleanPcName}|${stateId}`] = pcId;
        const pc = schema.parliamentaryConstituencies[pcId];
        const geoName = (props.ls_seat_name || '').trim();
        if (geoName && pc.aliases && !pc.aliases.includes(geoName)) {
          pc.aliases = [...(pc.aliases || []), geoName, geoName.toUpperCase()];
        }
      }
    }

    if (pcId) {
      props.schemaId = pcId;
      matched++;
    } else {
      unmatched++;
      unmatchedList.push(`PC not found: ${props.ls_seat_name} (${props.state_ut_name})`);
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

  // Save schema if we added new index entries (Strategy 4 in assembly/parliament)
  saveJSON(path.join(DATA_DIR, 'schema.json'), schema);

  // Summary
  const totalMatched = statesResult.matched + pcResult.matched + acResult.matched + distResult.matched;
  const totalFeatures = statesResult.total + pcResult.total + acResult.total + distResult.total;
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Schema IDs added: ${totalMatched}/${totalFeatures} features (${(100 * totalMatched / totalFeatures).toFixed(1)}%)`);
  console.log('='.repeat(50));
}

main().catch(console.error);

