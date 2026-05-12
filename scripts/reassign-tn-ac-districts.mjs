#!/usr/bin/env node
/**
 * Reassign Tamil Nadu assembly constituencies to schema districts using
 * point-in-polygon against public/data/geo/districts/TN-ac-spatial.geojson (udit 37), then
 * DISTRICT_NAME_MAPPINGS (same as the app) to resolve geo labels to schema names.
 *
 * After running:
 *   node scripts/generate-schema.mjs
 *   node scripts/add-schema-ids-to-geojson.mjs
 *   node scripts/generate-manifest.mjs
 *
 * Usage: node scripts/reassign-tn-ac-districts.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import {
  loadDistrictNameMappingsFromConstants,
  resolveTnDistrictAssignment,
} from './lib/tn-district-resolve.mjs';
import { TN_AC_DISTRICT_OVERRIDES } from './lib/tn-ac-district-overrides.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../public/data');
const ASSEMBLY_PATH = path.join(DATA_DIR, 'geo/assembly/constituencies.geojson');
const TN_DISTRICTS_PATH = path.join(DATA_DIR, 'geo/districts/TN-ac-spatial.geojson');
const SCHEMA_PATH = path.join(DATA_DIR, 'schema.json');

function acSamplePoint(feature) {
  try {
    return turf.pointOnFeature(feature);
  } catch {
    return turf.centroid(feature);
  }
}

/** Outer-ring coordinates [lng, lat] for vertex-in-polygon fallback (coastal ACs). */
function collectOuterRingCoords(geom) {
  const out = [];
  if (!geom) return out;
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0];
    if (ring) for (const c of ring) out.push(c);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      const ring = poly[0];
      if (ring) for (const c of ring) out.push(c);
    }
  }
  return out;
}

function findContainingDistrict(pt, districtFeatures) {
  for (const d of districtFeatures) {
    try {
      if (turf.booleanPointInPolygon(pt, d)) return d;
    } catch {
      continue;
    }
  }
  return null;
}

function findDistrictForAc(feature, districtFeatures) {
  const pointAttempts = [
    () => acSamplePoint(feature),
    () => turf.centroid(feature),
    () => turf.centerOfMass(feature),
  ];
  for (const makePt of pointAttempts) {
    try {
      const pt = makePt();
      const hit = findContainingDistrict(pt, districtFeatures);
      if (hit) return hit;
    } catch {
      continue;
    }
  }
  const coords = collectOuterRingCoords(feature.geometry);
  const step = Math.max(1, Math.floor(coords.length / 48));
  for (let i = 0; i < coords.length; i += step) {
    const [lng, lat] = coords[i];
    if (typeof lng !== 'number' || typeof lat !== 'number') continue;
    const pt = turf.point([lng, lat]);
    const hit = findContainingDistrict(pt, districtFeatures);
    if (hit) return hit;
  }
  return null;
}

function main() {
  const districtMappings = loadDistrictNameMappingsFromConstants();
  const assembly = JSON.parse(fs.readFileSync(ASSEMBLY_PATH, 'utf8'));
  const tnDistricts = JSON.parse(fs.readFileSync(TN_DISTRICTS_PATH, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const tnDistrictFeatures = tnDistricts.features.map((f) => turf.feature(f.geometry, f.properties));

  let updated = 0;
  let unchanged = 0;
  const failures = [];

  for (const feature of assembly.features) {
    const st = (feature.properties.ST_NAME || '').toUpperCase().trim();
    if (st !== 'TAMIL NADU') continue;

    const hit = findDistrictForAc(feature, tnDistrictFeatures);
    if (!hit) {
      failures.push({
        ac: feature.properties.schemaId || feature.properties.AC_NO,
        name: feature.properties.AC_NAME,
        reason: 'no district polygon contains sample point',
      });
      continue;
    }

    const distGeoName = hit.properties?.district;
    if (!distGeoName) {
      failures.push({
        ac: feature.properties.schemaId || feature.properties.AC_NO,
        name: feature.properties.AC_NAME,
        reason: 'district polygon missing properties.district',
      });
      continue;
    }

    let { distName: nextDist, dtCode: nextDt } = resolveTnDistrictAssignment(
      schema,
      districtMappings,
      distGeoName,
      hit.properties
    );

    const acNo = Number(feature.properties.AC_NO);
    const ovr = TN_AC_DISTRICT_OVERRIDES[acNo];
    if (ovr) {
      nextDist = ovr.distName;
      nextDt = ovr.dtCode;
    }

    if (!nextDist) {
      failures.push({
        ac: feature.properties.schemaId || feature.properties.AC_NO,
        name: feature.properties.AC_NAME,
        geoDistrict: distGeoName,
        reason: 'could not resolve district label',
      });
      continue;
    }

    const prevDist = feature.properties.DIST_NAME;
    const prevDt = feature.properties.DT_CODE;

    if (prevDist === nextDist && prevDt === nextDt) unchanged++;
    else updated++;

    feature.properties.DIST_NAME = nextDist;
    if (Number.isFinite(nextDt) && nextDt > 0) {
      feature.properties.DT_CODE = nextDt;
    }
  }

  fs.writeFileSync(ASSEMBLY_PATH, JSON.stringify(assembly));

  console.log(`Tamil Nadu ACs: ${updated} updated DIST_NAME/DT_CODE, ${unchanged} already matched.`);
  if (failures.length) {
    console.log(`\n⚠ ${failures.length} failures:`);
    for (const f of failures.slice(0, 20)) console.log('  ', f);
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ All Tamil Nadu assembly features matched a district polygon.');
  }
  console.log(`\nWrote: ${ASSEMBLY_PATH}`);
  console.log('Next: node scripts/generate-schema.mjs && node scripts/add-schema-ids-to-geojson.mjs && node scripts/generate-manifest.mjs');
}

main();
