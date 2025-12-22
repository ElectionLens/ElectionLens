#!/usr/bin/env node
/**
 * Add J&K PC GeoJSON from desktop file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Schema ID mapping for J&K PCs
const JK_PC_MAP = {
  'Baramulla': 'JK-01',
  'Srinagar': 'JK-02',
  'Anantnag-Rajouri (ex Anantnag)': 'JK-03',
  'Anantnag-Rajouri': 'JK-03',
  'Anantnag': 'JK-03',
  'Udhampur': 'JK-04',
  'Jammu': 'JK-05',
  // Skip "Rest of J&K" - it's a placeholder
};

// Load schema
const schemaPath = path.join(__dirname, '../public/data/schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

// Load files
const jkPath = '/Users/p0s097d/Desktop/j_and_k_ls_new_borders.geojson';
const mainPCPath = path.join(__dirname, '../public/data/geo/parliament/constituencies.geojson');

console.log('Loading J&K PC GeoJSON...');
const jkData = JSON.parse(fs.readFileSync(jkPath, 'utf-8'));
console.log(`  Found ${jkData.features.length} features`);

console.log('Loading main Parliament GeoJSON...');
const mainData = JSON.parse(fs.readFileSync(mainPCPath, 'utf-8'));
console.log(`  Found ${mainData.features.length} features`);

// Check existing J&K
const existingJK = mainData.features.filter(f => {
  const state = f.properties.state_ut_name?.toUpperCase() || '';
  return state.includes('JAMMU') || state.includes('KASHMIR');
});
console.log(`  Existing J&K features: ${existingJK.length}`);

// Process J&K features
let added = 0;
let skipped = 0;

for (const feature of jkData.features) {
  const seatName = feature.properties.ls_seat_name;
  const seatCode = feature.properties.ls_seat_code;
  
  // Skip placeholder
  if (seatCode === '999' || seatName.includes('Rest of')) {
    console.log(`  ⏭️ Skipping placeholder: ${seatName}`);
    skipped++;
    continue;
  }
  
  // Find schema ID
  let schemaId = JK_PC_MAP[seatName];
  
  if (!schemaId) {
    // Try partial match
    for (const [name, id] of Object.entries(JK_PC_MAP)) {
      if (seatName.toUpperCase().includes(name.toUpperCase().split(' ')[0])) {
        schemaId = id;
        break;
      }
    }
  }
  
  if (!schemaId) {
    console.log(`  ❌ No schema ID for: ${seatName}`);
    continue;
  }
  
  // Check if schema entry exists, if not add it back
  if (!schema.parliamentaryConstituencies[schemaId]) {
    console.log(`  📝 Adding ${schemaId} back to schema`);
    schema.parliamentaryConstituencies[schemaId] = {
      id: schemaId,
      stateId: 'JK',
      pcNo: parseInt(seatCode),
      name: seatName.replace(' (ex Anantnag)', ''),
      aliases: [seatName, seatName.toUpperCase()],
      type: 'GEN',
      assemblyIds: [],
      delimitation: 2024,
    };
  }
  
  // Check if already exists in GeoJSON
  const existing = mainData.features.find(f => f.properties.schemaId === schemaId);
  if (existing) {
    console.log(`  ✓ ${seatName} (${schemaId}) already exists in GeoJSON`);
    continue;
  }
  
  // Add schemaId to feature
  feature.properties.schemaId = schemaId;
  
  // Add to main data
  mainData.features.push(feature);
  added++;
  console.log(`  + Added ${seatName} as ${schemaId}`);
}

console.log(`\nSummary:`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Added: ${added}`);
console.log(`  Total features: ${mainData.features.length}`);

// Save GeoJSON
fs.writeFileSync(mainPCPath, JSON.stringify(mainData));
console.log(`\nSaved GeoJSON to ${mainPCPath}`);

// Save schema (if we added Udhampur back)
fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
console.log(`Saved schema to ${schemaPath}`);

