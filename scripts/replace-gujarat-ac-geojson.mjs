#!/usr/bin/env node
/**
 * Replace Gujarat AC GeoJSON with new 2022 delimitation data
 * Source: gujarat_AC.geojson from Desktop
 * 
 * This adds/updates all 182 Gujarat ACs including the 28 new ones from 2022 delimitation:
 * - 12 Ahmedabad splits (Naranpura, Nikol, Naroda, etc.)
 * - 8 Surat splits (Surat North, Varachha Road, Karanj, etc.)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CURRENT_GEO_PATH = path.join(__dirname, '../public/data/geo/assembly/constituencies.geojson');
const NEW_GJ_PATH = '/Users/p0s097d/Desktop/gujarat_AC.geojson';
const SCHEMA_PATH = path.join(__dirname, '../public/data/schema.json');

console.log('🔄 Replacing Gujarat AC boundaries with new 2022 delimitation data...\n');

// Load files
const currentGeo = JSON.parse(fs.readFileSync(CURRENT_GEO_PATH, 'utf8'));
const newGjGeo = JSON.parse(fs.readFileSync(NEW_GJ_PATH, 'utf8'));
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Stats
let removed = 0;
let added = 0;
let schemaUpdated = 0;

// Remove existing Gujarat features
const nonGujaratFeatures = currentGeo.features.filter(f => {
  const stName = f.properties?.ST_NAME || f.properties?.st_name || '';
  const isGujarat = stName.toUpperCase() === 'GUJARAT';
  if (isGujarat) removed++;
  return !isGujarat;
});

console.log(`Removed ${removed} existing Gujarat features`);

// Process new Gujarat features
const newFeatures = [];
const processedACs = new Set();

for (const feature of newGjGeo.features) {
  const props = feature.properties;
  const acName = props.ac_name?.trim();
  const acNo = parseInt(props.ac_no, 10);
  
  // Skip features without valid AC data
  if (!acName || !acNo || acNo === 0) {
    continue;
  }
  
  // Create schema ID
  const schemaId = `GJ-${String(acNo).padStart(3, '0')}`;
  
  // Skip duplicates
  if (processedACs.has(schemaId)) {
    continue;
  }
  processedACs.add(schemaId);
  
  // Determine reservation type from name
  let reservationType = 'GEN';
  const upperName = acName.toUpperCase();
  if (upperName.includes('(SC)')) {
    reservationType = 'SC';
  } else if (upperName.includes('(ST)')) {
    reservationType = 'ST';
  }
  
  // Clean AC name (remove reservation suffix for display)
  const cleanName = acName.replace(/\s*\((SC|ST)\)\s*/gi, '').trim();
  
  // Transform to standard format
  const newFeature = {
    type: 'Feature',
    properties: {
      ST_CODE: 24,
      ST_NAME: 'GUJARAT',
      DT_CODE: parseInt(props.dt_code, 10) || 0,
      DIST_NAME: (props.dist_name || '').toUpperCase(),
      AC_NO: acNo,
      AC_NAME: cleanName.toUpperCase(),
      PC_NO: parseInt(props.pc_no, 10) || 0,
      PC_NAME: (props.pc_name || '').toUpperCase(),
      PC_ID: parseInt(props.pc_id, 10) || 0,
      schemaId: schemaId,
      reservationType: reservationType
    },
    geometry: feature.geometry
  };
  
  newFeatures.push(newFeature);
  added++;
  
  // Update or add to schema
  if (!schema.assemblyConstituencies) {
    schema.assemblyConstituencies = {};
  }
  
  // Determine PC ID (format: GJ-XX based on PC number)
  const pcNo = parseInt(props.pc_no, 10) || 0;
  const pcId = pcNo > 0 ? `GJ-${String(pcNo).padStart(2, '0')}` : null;
  
  if (!schema.assemblyConstituencies[schemaId]) {
    schema.assemblyConstituencies[schemaId] = {
      id: schemaId,
      stateId: 'GJ',
      pcId: pcId,
      districtId: null,
      acNo: acNo,
      name: cleanName.toUpperCase(),
      aliases: [
        cleanName,
        cleanName.toUpperCase(),
        acName,
        acName.toUpperCase()
      ].filter((v, i, a) => a.indexOf(v) === i),
      type: reservationType,
      delimitation: 2022
    };
    schemaUpdated++;
  } else {
    // Update existing entry with new delimitation info
    schema.assemblyConstituencies[schemaId].delimitation = 2022;
    schema.assemblyConstituencies[schemaId].name = cleanName.toUpperCase();
  }
}

// Combine non-Gujarat features with new Gujarat features
currentGeo.features = [...nonGujaratFeatures, ...newFeatures];

// Sort features by state and AC number for consistency
currentGeo.features.sort((a, b) => {
  const stA = a.properties?.ST_NAME || a.properties?.st_name || '';
  const stB = b.properties?.ST_NAME || b.properties?.st_name || '';
  if (stA !== stB) return stA.localeCompare(stB);
  
  const acA = a.properties?.AC_NO || a.properties?.ac_no || 0;
  const acB = b.properties?.AC_NO || b.properties?.ac_no || 0;
  return acA - acB;
});

// Update schema state delimitation
if (schema.states?.GJ) {
  schema.states.GJ.delimitation = 2022;
  schema.states.GJ.assemblySeats = 182;
}

// Update schema timestamp
schema.lastUpdated = new Date().toISOString();

// Write files
fs.writeFileSync(CURRENT_GEO_PATH, JSON.stringify(currentGeo, null, 2));
fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));

console.log(`\n✅ Complete!`);
console.log(`   - Added ${added} Gujarat AC boundaries`);
console.log(`   - Updated/added ${schemaUpdated} schema entries`);
console.log(`   - Total features in constituencies.geojson: ${currentGeo.features.length}`);
console.log(`\nNew Gujarat ACs include:`);

// List the new delimitation ACs
const newDelimACs = [
  'NARANPURA', 'NIKOL', 'NARODA', 'THAKKAR BAPANAGAR', 'BAPUNAGAR', 
  'AMRAIWADI', 'DARIYAPUR', 'JAMALPUR-KHADIA', 'MANINAGAR', 'DANILIMDA',
  'SABARMATI', 'ASARWA', // Ahmedabad 12
  'SURAT NORTH', 'VARACHHA ROAD', 'KARANJ', 'LIMBAYAT', 
  'UDHNA', 'MAJURA', 'KATARGAM', 'SURAT WEST' // Surat 8
];

for (const f of newFeatures) {
  if (newDelimACs.some(n => f.properties.AC_NAME.includes(n.toUpperCase()))) {
    console.log(`   - AC ${f.properties.AC_NO}: ${f.properties.AC_NAME} (${f.properties.schemaId})`);
  }
}
