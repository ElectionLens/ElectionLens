#!/usr/bin/env node
/**
 * Build public/data/geo/assembly/assam-ac-pre2024.geojson — Assam AC polygons from the
 * DataMeet snapshot (pre–Desktop / pre–2024 merge). Used when viewing assembly years before 2024.
 *
 * Input default: scripts/data-sources/assam-ac-datameet/assam-ac.geojson
 *
 * Usage: node scripts/build-assam-pre-delimitation-geo.mjs [--input=path]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, '../public/data/schema.json');
const OUT_PATH = path.join(__dirname, '../public/data/geo/assembly/assam-ac-pre2024.geojson');
const DEFAULT_INPUT = path.join(__dirname, 'data-sources/assam-ac-datameet/assam-ac.geojson');

const args = process.argv.slice(2);
const inputArg = args.find((a) => a.startsWith('--input='));
const INPUT_PATH = inputArg ? inputArg.split('=').slice(1).join('=') : DEFAULT_INPUT;

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

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const newRaw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

const asSchemaIds = new Set(
  Object.keys(schema.assemblyConstituencies || {}).filter((k) => k.startsWith('AS-'))
);

const bestBySchema = new Map();

for (const feature of newRaw.features || []) {
  const props = feature.properties || {};
  const acNo = parseNum(props.AC_NO);
  if (!acNo) continue;

  const schemaId = `AS-${String(acNo).padStart(3, '0')}`;
  if (!asSchemaIds.has(schemaId)) continue;

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

const missingSchema = [...asSchemaIds].filter((id) => !bestBySchema.has(id));
if (missingSchema.length) {
  console.error('❌ No polygon for schema ACs:', missingSchema.join(', '));
  process.exit(1);
}

const fc = {
  type: 'FeatureCollection',
  name: 'Assam_AC_pre_2024_delimitation',
  features: newFeatures,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(fc));
console.log(`✅ Wrote ${newFeatures.length} features → ${OUT_PATH}`);
