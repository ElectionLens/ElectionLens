#!/usr/bin/env node
/**
 * Assam: keep current assembly polygons (Desktop / latest merge), assign each AC to a Lok Sabha seat
 * using centroid-in-polygon against **previous** Assam PC boundaries from git (HEAD), then dissolve ACs
 * by seat number (1–14) into one polygon per PC for parliament GeoJSON.
 *
 * Why not DataMeet AC_NO→PC_NO? Desktop/new numbering does not match DataMeet's national AC index.
 *
 * Requires: @turf/turf (devDependency)
 *
 * Usage:
 *   node scripts/sync-assam-assembly-and-pc-geo.mjs
 *   node scripts/sync-assam-assembly-and-pc-geo.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const ASSEMBLY_PATH = path.join(ROOT, 'public/data/geo/assembly/constituencies.geojson');
const PARLIAMENT_PATH = path.join(ROOT, 'public/data/geo/parliament/constituencies.geojson');
const SCHEMA_PATH = path.join(ROOT, 'public/data/schema.json');

const PARLIAMENT_GIT_REF =
  process.env.ASSAM_PC_BASE_REF ||
  'HEAD:public/data/geo/parliament/constituencies.geojson';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function loadParliamentFromGit() {
  const buf = execSync(`git show ${PARLIAMENT_GIT_REF}`, {
    cwd: ROOT,
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'utf8',
  });
  return JSON.parse(buf);
}

function unionAssamGeometries(features) {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0].geometry;
  const polys = features.map((f) => turf.feature(f.geometry));
  const merged = turf.union(turf.featureCollection(polys));
  return merged?.geometry ?? null;
}

function pointInParliamentFC(centroid, pcFeature) {
  const g = pcFeature.geometry;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    return turf.booleanPointInPolygon(centroid, pcFeature);
  }
  return false;
}

function stepAssignPcFromLegacyParliament(assembly, assamPcs) {
  let hit = 0;
  let miss = 0;
  for (const feature of assembly.features || []) {
    if (!feature.properties?.schemaId?.startsWith('AS-')) continue;
    let centroid;
    try {
      centroid = turf.centroid(feature);
    } catch {
      miss++;
      continue;
    }
    let matched = null;
    for (const pcf of assamPcs) {
      try {
        if (pointInParliamentFC(centroid, pcf)) {
          matched = pcf;
          break;
        }
      } catch {
        /* invalid geometry */
      }
    }
    if (!matched) {
      miss++;
      continue;
    }
    const p = matched.properties;
    const seat = parseInt(String(p.ls_seat_code), 10);
    if (!Number.isFinite(seat) || seat < 1 || seat > 14) {
      miss++;
      continue;
    }
    const pm = feature.properties;
    pm.PC_NO = seat;
    pm.PC_NAME = String(p.ls_seat_name || '').toUpperCase();
    hit++;
  }
  console.log(`Assembly: assigned PC by centroid-in-previous-PC: ${hit} hit, ${miss} miss`);
  if (miss > 0) {
    console.warn('⚠️ Some Assam ACs were not inside any previous PC polygon; check boundaries.');
  }
  if (!dryRun) {
    fs.writeFileSync(ASSEMBLY_PATH, JSON.stringify(assembly));
  }
  return assembly;
}

function stepRebuildParliament(assembly) {
  const parliament = JSON.parse(fs.readFileSync(PARLIAMENT_PATH, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const templateBySeat = {};
  const oldParl = loadParliamentFromGit();
  for (const f of oldParl.features || []) {
    if (String(f.properties?.state_ut_code) !== 'S03') continue;
    const code = String(f.properties.ls_seat_code || '').trim();
    if (!code) continue;
    templateBySeat[code] = { ...f.properties };
  }

  const byPcNo = new Map();
  for (const feature of assembly.features || []) {
    if (!feature.properties?.schemaId?.startsWith('AS-')) continue;
    const pcNo = parseInt(String(feature.properties.PC_NO), 10);
    if (!pcNo || pcNo < 1 || pcNo > 14) continue;
    if (!byPcNo.has(pcNo)) byPcNo.set(pcNo, []);
    byPcNo.get(pcNo).push(feature);
  }

  const newPcFeatures = [];
  for (let pcNo = 1; pcNo <= 14; pcNo++) {
    const group = byPcNo.get(pcNo);
    if (!group || group.length === 0) {
      console.error(`❌ No assembly polygons for PC_NO=${pcNo}; abort`);
      process.exit(1);
    }
    const geom = unionAssamGeometries(group);
    if (!geom) {
      console.error(`❌ Union failed for PC_NO=${pcNo}`);
      process.exit(1);
    }
    const tmpl = templateBySeat[String(pcNo)];
    if (!tmpl) {
      console.error(`❌ No template for ls_seat_code=${pcNo} in git parliament snapshot`);
      process.exit(1);
    }
    const canonicalPcId = `AS-${String(pcNo).padStart(2, '0')}`;
    const pcMeta = schema.parliamentaryConstituencies?.[canonicalPcId];
    const props = {
      ...tmpl,
      schemaId: canonicalPcId,
      ls_seat_code: String(pcNo),
      ls_seat_name: pcMeta?.name ?? tmpl.ls_seat_name,
      unique_id: `S03_${pcNo}`,
    };
    newPcFeatures.push({ type: 'Feature', properties: props, geometry: geom });
  }

  const nonAssam = parliament.features.filter((f) => String(f.properties?.state_ut_code) !== 'S03');
  const removed = parliament.features.length - nonAssam.length;
  parliament.features = [...nonAssam, ...newPcFeatures];

  console.log(`Parliament: removed ${removed} Assam features, added ${newPcFeatures.length} dissolved PCs`);
  if (!dryRun) {
    fs.writeFileSync(PARLIAMENT_PATH, JSON.stringify(parliament));
  }
}


function main() {
  const assembly = JSON.parse(fs.readFileSync(ASSEMBLY_PATH, 'utf8'));
  const oldParl = loadParliamentFromGit();
  const assamPcs = (oldParl.features || []).filter((f) => String(f.properties?.state_ut_code) === 'S03');
  console.log(`Legacy Assam PC polygons from git (${PARLIAMENT_GIT_REF}): ${assamPcs.length}`);

  const updated = stepAssignPcFromLegacyParliament(assembly, assamPcs);
  stepRebuildParliament(updated);

  console.log(dryRun ? '\n(dry-run: no files written)' : '\n✅ Done');
}

main();
