#!/usr/bin/env node
/**
 * Add Sikkim AC GeoJSON from desktop file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load schema to get AC names and IDs
const schemaPath = path.join(__dirname, '../public/data/schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

// Get Sikkim ACs from schema
const sikkimACs = Object.entries(schema.assemblyConstituencies)
  .filter(([id, ac]) => ac.stateId === 'SK')
  .map(([id, ac]) => ({ id, ...ac }));

console.log(`Found ${sikkimACs.length} Sikkim ACs in schema`);

// Load files
const sikkimPath = '/Users/p0s097d/Desktop/sikkim_assembly_updated.geojson';
const mainACPath = path.join(__dirname, '../public/data/geo/assembly/constituencies.geojson');

console.log('Loading Sikkim AC GeoJSON...');
const sikkimData = JSON.parse(fs.readFileSync(sikkimPath, 'utf-8'));
console.log(`  Found ${sikkimData.features.length} features`);

console.log('Loading main Assembly GeoJSON...');
const mainData = JSON.parse(fs.readFileSync(mainACPath, 'utf-8'));
console.log(`  Found ${mainData.features.length} features`);

// Check existing Sikkim
const existingSikkim = mainData.features.filter(f => 
  f.properties.ST_NAME?.toUpperCase() === 'SIKKIM'
);
console.log(`  Existing Sikkim features: ${existingSikkim.length}`);

// Normalize name for matching
function normalizeName(name) {
  return name.toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Process Sikkim features
let added = 0;
let matched = 0;

for (const feature of sikkimData.features) {
  const acNum = feature.properties.ac_num;
  const acName = feature.properties.ac_name;
  const acType = feature.properties.ac_type;
  
  // Find matching schema entry by AC number
  const schemaAC = sikkimACs.find(ac => ac.acNo === acNum);
  
  if (!schemaAC) {
    // Try by name
    const normalizedName = normalizeName(acName);
    const byName = sikkimACs.find(ac => 
      normalizeName(ac.name).includes(normalizedName) ||
      normalizedName.includes(normalizeName(ac.name))
    );
    
    if (byName) {
      console.log(`  ⚠️ Matched by name: ${acName} -> ${byName.id} (${byName.name})`);
      feature.properties.schemaId = byName.id;
      feature.properties.AC_NO = acNum;
      feature.properties.AC_NAME = byName.name;
      feature.properties.ST_NAME = 'SIKKIM';
      feature.properties.PC_NAME = schema.parliamentaryConstituencies[byName.pcId]?.name || 'SIKKIM';
      matched++;
    } else {
      console.log(`  ❌ No schema match for AC #${acNum}: ${acName}`);
      continue;
    }
  } else {
    feature.properties.schemaId = schemaAC.id;
    feature.properties.AC_NO = acNum;
    feature.properties.AC_NAME = schemaAC.name;
    feature.properties.ST_NAME = 'SIKKIM';
    feature.properties.PC_NAME = schema.parliamentaryConstituencies[schemaAC.pcId]?.name || 'SIKKIM';
    matched++;
  }
  
  // Check if already exists
  const existing = mainData.features.find(f => 
    f.properties.schemaId === feature.properties.schemaId
  );
  
  if (existing) {
    console.log(`  ✓ ${acName} (${feature.properties.schemaId}) already exists`);
    continue;
  }
  
  // Add to main data
  mainData.features.push(feature);
  added++;
  console.log(`  + Added ${acName} as ${feature.properties.schemaId}`);
}

console.log(`\nSummary:`);
console.log(`  Schema ACs: ${sikkimACs.length}`);
console.log(`  File ACs: ${sikkimData.features.length}`);
console.log(`  Matched: ${matched}`);
console.log(`  Added: ${added}`);
console.log(`  Total features: ${mainData.features.length}`);

// Save
fs.writeFileSync(mainACPath, JSON.stringify(mainData));
console.log(`\nSaved to ${mainACPath}`);

