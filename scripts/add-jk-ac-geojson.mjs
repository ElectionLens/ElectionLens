#!/usr/bin/env node
/**
 * Add J&K AC GeoJSON from desktop file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load schema
const schemaPath = path.join(__dirname, '../public/data/schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

// Get existing J&K ACs from schema
const jkACs = Object.entries(schema.assemblyConstituencies)
  .filter(([id, ac]) => ac.stateId === 'JK')
  .map(([id, ac]) => ({ id, ...ac }));

console.log(`Found ${jkACs.length} J&K ACs in schema`);

// Load files
const jkPath = '/Users/p0s097d/Desktop/j_and_k_assembly_new_borders.geojson';
const mainACPath = path.join(__dirname, '../public/data/geo/assembly/constituencies.geojson');

console.log('Loading J&K AC GeoJSON...');
const jkData = JSON.parse(fs.readFileSync(jkPath, 'utf-8'));
console.log(`  Found ${jkData.features.length} features`);

console.log('Loading main Assembly GeoJSON...');
const mainData = JSON.parse(fs.readFileSync(mainACPath, 'utf-8'));
console.log(`  Found ${mainData.features.length} features`);

// Normalize name for matching
function normalizeName(name) {
  if (!name) return '';
  return name.toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Process J&K features
let added = 0;
let matched = 0;
let skipped = 0;
let addedToSchema = 0;

for (const feature of jkData.features) {
  const seatId = feature.properties.seat_id;
  const seatName = feature.properties.seat_name_en;
  const seatType = feature.properties.sc_st_gen;
  const district = feature.properties.seat_district_en;
  
  // Skip placeholder/null entries
  if (!seatName || seatId === 9999 || seatId === null) {
    console.log(`  ⏭️ Skipping placeholder: seat_id=${seatId}`);
    skipped++;
    continue;
  }
  
  // Generate schema ID
  const schemaId = `JK-${String(seatId).padStart(3, '0')}`;
  
  // Check if exists in schema, if not add it
  if (!schema.assemblyConstituencies[schemaId]) {
    console.log(`  📝 Adding ${schemaId} (${seatName}) to schema`);
    schema.assemblyConstituencies[schemaId] = {
      id: schemaId,
      stateId: 'JK',
      pcId: '', // Will need to be filled in
      districtId: '',
      acNo: seatId,
      name: seatName.trim(),
      aliases: [seatName.trim(), seatName.trim().toUpperCase(), normalizeName(seatName)],
      type: seatType === 'SC' ? 'SC' : seatType === 'ST' ? 'ST' : 'GEN',
      delimitation: 2024,
    };
    addedToSchema++;
  }
  
  // Check if already exists in GeoJSON
  const existing = mainData.features.find(f => f.properties.schemaId === schemaId);
  if (existing) {
    console.log(`  ✓ ${seatName} (${schemaId}) already exists in GeoJSON`);
    matched++;
    continue;
  }
  
  // Add properties to feature
  feature.properties.schemaId = schemaId;
  feature.properties.AC_NO = seatId;
  feature.properties.AC_NAME = seatName.trim();
  feature.properties.ST_NAME = 'JAMMU & KASHMIR';
  feature.properties.DIST_NAME = district;
  
  // Add to main data
  mainData.features.push(feature);
  added++;
  console.log(`  + Added ${seatName} as ${schemaId}`);
}

console.log(`\nSummary:`);
console.log(`  Skipped (placeholders): ${skipped}`);
console.log(`  Already in GeoJSON: ${matched}`);
console.log(`  Added to GeoJSON: ${added}`);
console.log(`  Added to schema: ${addedToSchema}`);
console.log(`  Total GeoJSON features: ${mainData.features.length}`);

// Save GeoJSON
fs.writeFileSync(mainACPath, JSON.stringify(mainData));
console.log(`\nSaved GeoJSON to ${mainACPath}`);

// Save schema
fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
console.log(`Saved schema to ${schemaPath}`);

