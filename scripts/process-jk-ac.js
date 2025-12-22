#!/usr/bin/env node
/**
 * Process J&K AC GeoJSON and add to main constituencies file
 */

const fs = require('fs');
const path = require('path');

const jkPath = '/Users/p0s097d/Desktop/j_and_k_assembly_new_borders.geojson';
const mainACPath = path.join(__dirname, '../public/data/geo/assembly/constituencies.geojson');
const schemaPath = path.join(__dirname, '../public/data/schema.json');

console.log('Starting J&K AC GeoJSON processing...');

// Check file exists
if (!fs.existsSync(jkPath)) {
  console.error('ERROR: J&K file not found at', jkPath);
  process.exit(1);
}

console.log('Loading files...');
const jkData = JSON.parse(fs.readFileSync(jkPath, 'utf-8'));
const mainData = JSON.parse(fs.readFileSync(mainACPath, 'utf-8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

console.log(`J&K features: ${jkData.features.length}`);
console.log(`Main features before: ${mainData.features.length}`);

// Normalize name for matching
function normalizeName(name) {
  if (!name) return '';
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

let added = 0;
let skipped = 0;
let addedToSchema = 0;

for (const feature of jkData.features) {
  const seatId = feature.properties.seat_id;
  const seatName = feature.properties.seat_name_en;
  const seatType = feature.properties.sc_st_gen;
  const district = feature.properties.seat_district_en;
  
  // Skip placeholder/null entries
  if (!seatName || seatId === 9999 || seatId === null) {
    console.log(`Skipping placeholder: seat_id=${seatId}`);
    skipped++;
    continue;
  }
  
  // Generate schema ID
  const schemaId = `JK-${String(seatId).padStart(3, '0')}`;
  
  // Check if exists in schema, if not add it
  if (!schema.assemblyConstituencies[schemaId]) {
    console.log(`Adding ${schemaId} (${seatName}) to schema`);
    schema.assemblyConstituencies[schemaId] = {
      id: schemaId,
      stateId: 'JK',
      pcId: '',
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
    console.log(`${seatName} (${schemaId}) already exists`);
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
  console.log(`+ Added ${seatName} as ${schemaId}`);
}

console.log(`\nSummary:`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Added to GeoJSON: ${added}`);
console.log(`  Added to schema: ${addedToSchema}`);
console.log(`  Total features: ${mainData.features.length}`);

// Save
fs.writeFileSync(mainACPath, JSON.stringify(mainData));
console.log(`Saved GeoJSON`);

fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
console.log(`Saved schema`);

console.log('Done!');

