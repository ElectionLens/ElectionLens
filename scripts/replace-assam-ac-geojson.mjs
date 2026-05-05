#!/usr/bin/env node
/**
 * Replace Assam assembly features in public/data/geo/assembly/constituencies.geojson
 * using scripts/data-sources/assam-ac-datameet/assam-ac.geojson (DataMeet / ECI-derived).
 *
 * - Strips existing Assam rows (ST_NAME / schemaId AS-*).
 * - Maps AC_NO → schemaId AS-### (must exist in schema.json).
 * - Dedupes multiple polygons per AC_NO (keeps largest Shape_Area).
 * - Sets schema delimitation year to 2024 for Assam (boundaries after the 2023 round /
 *   published post-2023 — e.g. Desktop shapefile); see data-sources/assam-ac-datameet/README.md.
 *
 * Usage: node scripts/replace-assam-ac-geojson.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CURRENT_GEO_PATH = path.join(__dirname, '../public/data/geo/assembly/constituencies.geojson');
const SCHEMA_PATH = path.join(__dirname, '../public/data/schema.json');
const DEFAULT_NEW_PATH = path.join(__dirname, 'data-sources/assam-ac-datameet/assam-ac.geojson');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const inputArg = args.find((a) => a.startsWith('--input='));
const INPUT_PATH = inputArg ? inputArg.split('=').slice(1).join('=') : DEFAULT_NEW_PATH;

function extractReservationType(acName) {
  const u = (acName || '').toUpperCase();
  if (u.includes('(SC)') || u.includes('(SC )')) return 'SC';
  if (u.includes('(ST)') || u.includes('(ST )')) return 'ST';
  return 'GEN';
}

function cleanAcName(acName) {
  return String(acName || '')
    .replace(/\s*\((SC|ST)\)\s*/gi, '')
    .trim();
}

function parseNum(v) {
  const n = parseInt(String(v).replace(/\.0+$/, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

console.log('🔄 Replacing Assam AC boundaries\n');
console.log(`   Input: ${INPUT_PATH}`);
if (dryRun) console.log('   (dry-run: no files written)\n');

const currentGeo = JSON.parse(fs.readFileSync(CURRENT_GEO_PATH, 'utf8'));
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const newRaw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

const asSchemaIds = new Set(
  Object.keys(schema.assemblyConstituencies || {}).filter((k) => k.startsWith('AS-'))
);

/** schemaId -> { feature, area } best so far */
const bestBySchema = new Map();
const unmatchedPolygons = [];

for (const feature of newRaw.features || []) {
  const props = feature.properties || {};
  const acNo = parseNum(props.AC_NO);
  if (!acNo) continue;

  const schemaId = `AS-${String(acNo).padStart(3, '0')}`;
  if (!asSchemaIds.has(schemaId)) {
    unmatchedPolygons.push({ schemaId, acNo, AC_NAME: props.AC_NAME });
    continue;
  }

  const area = parseFloat(props.Shape_Area) || 0;
  const prev = bestBySchema.get(schemaId);
  if (!prev || area > prev.area) {
    bestBySchema.set(schemaId, { feature, area });
  }
}

const newFeatures = [];
for (const schemaId of [...asSchemaIds].sort()) {
  const entry = bestBySchema.get(schemaId);
  if (!entry) continue;

  const feature = entry.feature;
  const props = feature.properties || {};
  const acNameRaw = String(props.AC_NAME || '').trim();
  const cleanName = cleanAcName(acNameRaw);
  const reservationType = extractReservationType(acNameRaw);
  const acNo = parseNum(props.AC_NO);
  const dtCode = parseNum(props.DT_CODE);
  const pcNo = parseNum(props.PC_NO);
  const pcIdNum = parseNum(props.PC_ID);

  newFeatures.push({
    type: 'Feature',
    properties: {
      OBJECTID: parseNum(props.OBJECTID),
      ST_CODE: 18,
      ST_NAME: 'ASSAM',
      DT_CODE: dtCode,
      DIST_NAME: String(props.DIST_NAME || '').toUpperCase(),
      AC_NO: acNo,
      AC_NAME: cleanName.toUpperCase(),
      PC_NO: pcNo,
      PC_NAME: String(props.PC_NAME || '').toUpperCase(),
      PC_ID: pcIdNum,
      STATUS: String(props.STATUS || ''),
      Shape_Leng: parseFloat(props.Shape_Leng) || 0,
      Shape_Area: parseFloat(props.Shape_Area) || 0,
      schemaId,
      reservationType,
    },
    geometry: feature.geometry,
  });
}

if (unmatchedPolygons.length) {
  console.warn('⚠️ Polygons for unknown schema ids (skipped):', unmatchedPolygons.length);
  unmatchedPolygons.slice(0, 10).forEach((x) => console.warn('  ', x));
}

const missingSchema = [...asSchemaIds].filter((id) => !bestBySchema.has(id));
if (missingSchema.length) {
  console.error('❌ No polygon for schema ACs:', missingSchema.join(', '));
  process.exit(1);
}

let removed = 0;
const nonAssam = currentGeo.features.filter((f) => {
  const sid = f.properties?.schemaId || '';
  const st = (f.properties?.ST_NAME || f.properties?.st_name || '').toUpperCase();
  if (sid.startsWith('AS-') || st === 'ASSAM') {
    removed++;
    return false;
  }
  return true;
});

console.log(`Removed ${removed} existing Assam features`);
console.log(`Adding ${newFeatures.length} Assam features (deduped from ${newRaw.features?.length || 0} raw)`);

currentGeo.features = [...nonAssam, ...newFeatures];
currentGeo.features.sort((a, b) => {
  const stA = a.properties?.ST_NAME || a.properties?.st_name || '';
  const stB = b.properties?.ST_NAME || b.properties?.st_name || '';
  if (stA !== stB) return stA.localeCompare(stB);
  const acA = a.properties?.AC_NO || a.properties?.ac_no || 0;
  const acB = b.properties?.AC_NO || b.properties?.ac_no || 0;
  return acA - acB;
});

let schemaDelimUpdated = 0;
for (const id of asSchemaIds) {
  if (schema.assemblyConstituencies[id]) {
    schema.assemblyConstituencies[id].delimitation = 2024;
    schemaDelimUpdated++;
  }
}
if (schema.states?.AS) {
  schema.states.AS.delimitation = 2024;
}
schema.lastUpdated = new Date().toISOString();

if (!dryRun) {
  fs.writeFileSync(CURRENT_GEO_PATH, JSON.stringify(currentGeo));
  fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));
}

console.log(`\n✅ Complete${dryRun ? ' (dry-run)' : ''}`);
console.log(`   Schema Assam delimitation → 2024 (${schemaDelimUpdated} AC rows)`);
console.log(`   Total features in constituencies.geojson: ${currentGeo.features.length}`);
