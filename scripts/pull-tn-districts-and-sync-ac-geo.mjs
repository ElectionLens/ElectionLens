#!/usr/bin/env node
/**
 * Pull latest Tamil Nadu:
 *  - Map districts: hybrid 38 polygons (udit + datta07 Mayiladuthurai; Nagapattinam = udit minus Mayil)
 *  - AC spatial join: udit 37 polygons (TN-ac-spatial.geojson) + AC overrides (see tn-ac-district-overrides.mjs)
 *  - Constituency names from ECI ResultAcGenMay2026 statewise tables (no per-AC candidate fetch)
 *
 * Then refresh assembly GeoJSON DIST_NAME / DT_CODE via spatial join + DISTRICT_NAME_MAPPINGS
 * (same pipeline as scripts/reassign-tn-ac-districts.mjs) and regenerate schema + manifest.
 *
 * Writes:
 *   public/data/geo/districts/TN.geojson (38 — map)
 *   public/data/geo/districts/TN-ac-spatial.geojson (37 — AC spatial join)
 *   public/data/meta/tn-districts-list.json
 *   public/data/meta/tn-eci-constituencies-list.json
 *   public/data/meta/tn-ac-district-mapping.json
 *
 * Usage:
 *   node scripts/pull-tn-districts-and-sync-ac-geo.mjs
 *   node scripts/pull-tn-districts-and-sync-ac-geo.mjs --skip-eci
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as turf from '@turf/turf';
import {
  loadDistrictNameMappingsFromConstants,
  resolveDistrictId,
} from './lib/tn-district-resolve.mjs';
import {
  buildTnHybridDistrictDisplayGeojson,
  DATTA_TN_URL,
  fetchDattaTnDistrictsRaw,
  fetchUditTnDistricts,
  normalizeDattaFeatureProps,
  UDIT_TN_URL,
} from './lib/build-tn-hybrid-districts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'public/data');
const META_DIR = path.join(DATA_DIR, 'meta');
const TN_DISTRICTS_PATH = path.join(DATA_DIR, 'geo/districts/TN.geojson');
const TN_AC_SPATIAL_PATH = path.join(DATA_DIR, 'geo/districts/TN-ac-spatial.geojson');
const ASSEMBLY_PATH = path.join(DATA_DIR, 'geo/assembly/constituencies.geojson');
const SCHEMA_PATH = path.join(DATA_DIR, 'schema.json');

const ECI_BASE = 'https://results.eci.gov.in/ResultAcGenMay2026';
const TN_ECI_PREFIX = 'S22';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${ECI_BASE}/index.htm`,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function extractMaxPage(html, eciPrefix) {
  const esc = eciPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`statewise${esc}(\\d+)\\.htm`, 'g');
  let max = 1;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function parseStatewiseRows(html) {
  const rows = [];
  const rowRe = /<tr><td align='left'>([^<]+)<\/td><td align='right'>(\d+)<\/td>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const name = m[1].trim();
    const eciNo = parseInt(m[2], 10);
    if (!name || !eciNo) continue;
    if (name.length < 2) continue;
    rows.push({ name, eciCandidatewiseNo: eciNo });
  }
  return rows;
}

async function collectTnEciConstituencies() {
  const first = await fetchText(`${ECI_BASE}/statewise${TN_ECI_PREFIX}1.htm`);
  const maxPage = extractMaxPage(first, TN_ECI_PREFIX);
  const seen = new Set();
  const all = [];
  for (let p = 1; p <= maxPage; p++) {
    const html =
      p === 1 ? first : await fetchText(`${ECI_BASE}/statewise${TN_ECI_PREFIX}${p}.htm`);
    for (const r of parseStatewiseRows(html)) {
      const k = `${r.name}|${r.eciCandidatewiseNo}`;
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(r);
    }
    await sleep(80);
  }
  return { rows: all, pages: maxPage };
}

function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function acSamplePoint(feature) {
  try {
    return turf.pointOnFeature(feature);
  } catch {
    return turf.centroid(feature);
  }
}

function findDistrictForAc(feature, districtFeatures) {
  const pointAttempts = [() => acSamplePoint(feature), () => turf.centroid(feature), () => turf.centerOfMass(feature)];
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

function runNode(scriptRelative) {
  execSync(`node ${path.join(REPO_ROOT, scriptRelative)}`, {
    stdio: 'inherit',
    cwd: REPO_ROOT,
    env: process.env,
  });
}

function buildEciNameLookup(rows) {
  const byNorm = new Map();
  for (const r of rows) {
    const k = normalizeName(r.name).replace(/\s+/g, '');
    if (!byNorm.has(k)) byNorm.set(k, r.name);
  }
  return byNorm;
}

function matchEciName(acName, byNorm) {
  const strip = (s) =>
    String(s || '')
      .replace(/\s*\((SC|ST)\)\s*$/i, '')
      .trim();
  const keys = [normalizeName(acName).replace(/\s+/g, ''), normalizeName(strip(acName)).replace(/\s+/g, '')];
  for (const k of keys) {
    if (k && byNorm.has(k)) return byNorm.get(k);
  }
  return null;
}

async function main() {
  let skipEci = false;
  for (const a of process.argv.slice(2)) {
    if (a === '--skip-eci') skipEci = true;
  }
  fs.mkdirSync(META_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();

  console.log('\n1) Tamil Nadu district GeoJSON');
  console.log(`   AC spatial (37): ${UDIT_TN_URL}`);
  console.log(`   Map hybrid (38): udit + ${DATTA_TN_URL} (Mayiladuthurai + Nagapattinam remainder)`);

  const udit = await fetchUditTnDistricts();
  if (udit.type !== 'FeatureCollection' || !Array.isArray(udit.features)) {
    throw new Error('udit TN response is not a FeatureCollection');
  }
  fs.writeFileSync(TN_AC_SPATIAL_PATH, JSON.stringify(udit));
  console.log(`   Wrote ${TN_AC_SPATIAL_PATH} (${udit.features.length} polygons)`);

  const dattaRaw = await fetchDattaTnDistrictsRaw();
  const dattaNorm = normalizeDattaFeatureProps(dattaRaw);
  const tnGeo = buildTnHybridDistrictDisplayGeojson(udit, dattaNorm);
  fs.writeFileSync(TN_DISTRICTS_PATH, JSON.stringify(tnGeo));

  const districtList = tnGeo.features.map((f) => ({
    district: f.properties?.district ?? null,
    dt_code: f.properties?.dt_code ?? null,
    st_nm: f.properties?.st_nm ?? null,
  }));
  fs.writeFileSync(
    path.join(META_DIR, 'tn-districts-list.json'),
    JSON.stringify(
      {
        generated: generatedAt,
        sources: {
          acSpatialJoin37: UDIT_TN_URL,
          mayiladuthuraiBoundary: DATTA_TN_URL,
          mapDisplay38:
            'udit districts with Nagapattinam replaced by (udit Nagapattinam − Mayiladuthurai) ∪ Mayiladuthurai',
        },
        count: districtList.length,
        districts: districtList,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`   Wrote ${TN_DISTRICTS_PATH} (${tnGeo.features.length} polygons)`);
  console.log(`   Wrote public/data/meta/tn-districts-list.json`);

  let eciRows = [];
  let eciPages = 0;
  if (!skipEci) {
    console.log('\n2) Fetch ECI Tamil Nadu constituency list (statewise tables)');
    const { rows, pages } = await collectTnEciConstituencies();
    eciRows = rows;
    eciPages = pages;
    fs.writeFileSync(
      path.join(META_DIR, 'tn-eci-constituencies-list.json'),
      JSON.stringify(
        {
          generated: generatedAt,
          source: `${ECI_BASE}/statewise${TN_ECI_PREFIX}1.htm`,
          pages,
          count: rows.length,
          constituencies: rows,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`   ${rows.length} constituencies across ${pages} page(s)`);
    console.log(`   Wrote public/data/meta/tn-eci-constituencies-list.json`);
    if (rows.length !== 234) {
      console.warn(`   ⚠ Expected 234 TN ACs; got ${rows.length} (ECI layout may have changed).`);
    }
  } else {
    console.log('\n2) Skipped ECI fetch (--skip-eci)');
  }

  console.log('\n3) Reassign assembly DIST_NAME / DT_CODE (spatial join)');
  runNode('scripts/reassign-tn-ac-districts.mjs');

  console.log('\n4) Regenerate schema, GeoJSON schemaIds, manifest');
  runNode('scripts/generate-schema.mjs');
  runNode('scripts/add-schema-ids-to-geojson.mjs');
  runNode('scripts/generate-manifest.mjs');

  console.log('\n5) Write tn-ac-district-mapping.json');
  const districtMappings = loadDistrictNameMappingsFromConstants();
  const assembly = JSON.parse(fs.readFileSync(ASSEMBLY_PATH, 'utf8'));
  const tnDistricts = JSON.parse(fs.readFileSync(TN_AC_SPATIAL_PATH, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const tnDistrictFeatures = tnDistricts.features.map((f) => turf.feature(f.geometry, f.properties));
  const eciLookup = eciRows.length ? buildEciNameLookup(eciRows) : new Map();

  const assemblyConstituencies = [];
  for (const feature of assembly.features) {
    const st = (feature.properties.ST_NAME || '').toUpperCase().trim();
    if (st !== 'TAMIL NADU') continue;
    const hit = findDistrictForAc(feature, tnDistrictFeatures);
    const geoDistrict = hit?.properties?.district ?? null;
    const districtId = geoDistrict
      ? resolveDistrictId(geoDistrict, districtMappings, schema)
      : null;
    const acName = feature.properties.AC_NAME ?? '';
    assemblyConstituencies.push({
      schemaId: feature.properties.schemaId ?? null,
      acNo: feature.properties.AC_NO ?? null,
      acName,
      eciListName: matchEciName(acName, eciLookup),
      geoDistrict,
      districtId,
      distName: feature.properties.DIST_NAME ?? null,
      dtCode: feature.properties.DT_CODE ?? null,
    });
  }
  assemblyConstituencies.sort((a, b) => (Number(a.acNo) || 0) - (Number(b.acNo) || 0));

  fs.writeFileSync(
    path.join(META_DIR, 'tn-ac-district-mapping.json'),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        districtGeoSources: {
          mapDisplay38:
            'hybrid: scripts/lib/build-tn-hybrid-districts.mjs (udit Nagapattinam − datta Mayiladuthurai + Mayil polygon)',
          acSpatialJoin37: UDIT_TN_URL,
          mayiladuthuraiPolygon: DATTA_TN_URL,
        },
        eciConstituencyList: skipEci ? null : `${ECI_BASE}/statewise${TN_ECI_PREFIX}1.htm`,
        assemblyConstituencies,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`   Wrote public/data/meta/tn-ac-district-mapping.json (${assemblyConstituencies.length} ACs)`);

  console.log('\n✅ Done. Optional: node scripts/validate-district-views.mjs --state=TN');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
