#!/usr/bin/env node
/**
 * Fix J&K schemaIds by matching GeoJSON names to election data names
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mainACPath = path.join(__dirname, '../public/data/geo/assembly/constituencies.geojson');
const schemaPath = path.join(__dirname, '../public/data/schema.json');
const electionPath = path.join(__dirname, '../public/data/elections/ac/JK/2024.json');

console.log('Fixing J&K schemaIds by name matching...\n');

const mainData = JSON.parse(fs.readFileSync(mainACPath, 'utf-8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const electionData = JSON.parse(fs.readFileSync(electionPath, 'utf-8'));

// Build name -> election schemaId map
function normalize(name) {
  if (!name) return '';
  return name.toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/\s+/g, '');
}

const electionNameMap = new Map();
for (const [id, data] of Object.entries(electionData)) {
  if (!id.startsWith('JK-')) continue;
  const names = [data.constituencyName, data.constituencyNameOriginal, data.name].filter(Boolean);
  for (const name of names) {
    electionNameMap.set(normalize(name), id);
  }
}

console.log(`Built election name map with ${electionNameMap.size} entries`);

// Process GeoJSON features
let updated = 0;
let matched = 0;
let unmatched = 0;

for (const feature of mainData.features) {
  if (!feature.properties.ST_NAME?.includes('JAMMU') && 
      !feature.properties.ST_NAME?.includes('KASHMIR')) {
    continue;
  }
  
  const acName = feature.properties.AC_NAME;
  const oldSchemaId = feature.properties.schemaId;
  const normalizedName = normalize(acName);
  
  // Look up correct schemaId from election data
  const correctSchemaId = electionNameMap.get(normalizedName);
  
  if (correctSchemaId) {
    if (correctSchemaId !== oldSchemaId) {
      console.log(`${acName}: ${oldSchemaId} -> ${correctSchemaId}`);
      feature.properties.schemaId = correctSchemaId;
      updated++;
    } else {
      matched++;
    }
  } else {
    console.log(`⚠️ No match for: ${acName} (normalized: ${normalizedName})`);
    unmatched++;
  }
}

console.log(`\nSummary:`);
console.log(`  Already correct: ${matched}`);
console.log(`  Updated: ${updated}`);
console.log(`  Unmatched: ${unmatched}`);

// Update schema to match
console.log('\nUpdating schema aliases...');
let schemaUpdated = 0;

for (const feature of mainData.features) {
  if (!feature.properties.schemaId?.startsWith('JK-')) continue;
  
  const schemaId = feature.properties.schemaId;
  const acName = feature.properties.AC_NAME;
  
  // Ensure schema entry exists and has correct aliases
  if (!schema.assemblyConstituencies[schemaId]) {
    console.log(`Creating schema entry for ${schemaId} (${acName})`);
    schema.assemblyConstituencies[schemaId] = {
      id: schemaId,
      stateId: 'JK',
      pcId: '',
      districtId: '',
      acNo: parseInt(schemaId.split('-')[1]),
      name: acName,
      aliases: [acName, normalize(acName)],
      type: 'GEN',
      delimitation: 2024,
    };
    schemaUpdated++;
  } else {
    // Add alias if not present
    const entry = schema.assemblyConstituencies[schemaId];
    const aliases = new Set(entry.aliases || []);
    aliases.add(acName);
    aliases.add(normalize(acName));
    entry.aliases = [...aliases];
  }
  
  // Update acAliases
  const aliasKey = `${normalize(acName)}|JK`;
  if (!schema.acAliases) schema.acAliases = {};
  schema.acAliases[aliasKey] = schemaId;
}

// Remove old J&K schema entries that no longer exist in GeoJSON
const jkFeatureSchemaIds = new Set(
  mainData.features
    .filter(f => f.properties.schemaId?.startsWith('JK-'))
    .map(f => f.properties.schemaId)
);

const toRemove = [];
for (const [id, entry] of Object.entries(schema.assemblyConstituencies)) {
  if (id.startsWith('JK-') && !jkFeatureSchemaIds.has(id)) {
    // Check if this ID exists in election data
    if (!electionData[id]) {
      toRemove.push(id);
    }
  }
}

console.log(`\nRemoving ${toRemove.length} orphaned schema entries`);
for (const id of toRemove) {
  delete schema.assemblyConstituencies[id];
}

// Save
fs.writeFileSync(mainACPath, JSON.stringify(mainData));
console.log(`\nSaved GeoJSON`);

fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
console.log(`Saved schema`);

console.log('Done!');

