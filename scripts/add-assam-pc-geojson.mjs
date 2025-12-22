#!/usr/bin/env node
/**
 * Add Assam PC GeoJSON from desktop file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Schema ID mapping for Assam PCs
const ASSAM_PC_MAP = {
  'Kokrajhar': 'AS-01',
  'Dhubri': 'AS-02',
  'Barpeta': 'AS-03',
  'Darrang Udalguri (ex Mangaldoi)': 'AS-04',
  'Gauhati': 'AS-05',
  'Diphu (ex Autonomous District)': 'AS-06',
  'Karimganj': 'AS-07',
  'Silchar': 'AS-08',
  'Nagaon': 'AS-09',
  'Kaziranga (ex Kaliabor)': 'AS-10',
  'Sonitpur (ex Tezpur)': 'AS-11',
  'Lakhimpur': 'AS-12',
  'Dibrugarh': 'AS-13',
  'Jorhat': 'AS-14',
};

// Normalize name for matching
function normalizeName(name) {
  return name.toUpperCase()
    .replace(/\s*\(EX.*\)/gi, '')
    .replace(/[^A-Z]/g, '');
}

// Load files
const assamPCPath = '/Users/p0s097d/Desktop/assam_ls_new_borders.geojson';
const mainPCPath = path.join(__dirname, '../public/data/geo/parliament/constituencies.geojson');

console.log('Loading Assam PC GeoJSON...');
const assamData = JSON.parse(fs.readFileSync(assamPCPath, 'utf-8'));
console.log(`  Found ${assamData.features.length} features`);

console.log('Loading main Parliament GeoJSON...');
const mainData = JSON.parse(fs.readFileSync(mainPCPath, 'utf-8'));
console.log(`  Found ${mainData.features.length} features`);

// Check if Assam already exists
const existingAssam = mainData.features.filter(f => 
  f.properties.state_ut_name?.toUpperCase() === 'ASSAM'
);
console.log(`  Existing Assam features: ${existingAssam.length}`);

// Process Assam features
let added = 0;
let matched = 0;

for (const feature of assamData.features) {
  const seatName = feature.properties.ls_seat_name;
  
  // Find schema ID
  let schemaId = null;
  for (const [name, id] of Object.entries(ASSAM_PC_MAP)) {
    const normalizedMapName = normalizeName(name);
    const normalizedSeatName = normalizeName(seatName);
    
    if (normalizedMapName === normalizedSeatName || 
        normalizedMapName.includes(normalizedSeatName) ||
        normalizedSeatName.includes(normalizedMapName)) {
      schemaId = id;
      matched++;
      break;
    }
  }
  
  if (!schemaId) {
    console.log(`  ⚠️ No schema ID found for: ${seatName}`);
    continue;
  }
  
  // Check if already exists in main data
  const existing = mainData.features.find(f => f.properties.schemaId === schemaId);
  if (existing) {
    console.log(`  ✓ ${seatName} (${schemaId}) already exists`);
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
console.log(`  Matched: ${matched}/${assamData.features.length}`);
console.log(`  Added: ${added}`);
console.log(`  Total features: ${mainData.features.length}`);

// Save
fs.writeFileSync(mainPCPath, JSON.stringify(mainData));
console.log(`\nSaved to ${mainPCPath}`);

