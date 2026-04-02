#!/usr/bin/env node
/**
 * Remove assembly GeoJSON features whose properties.schemaId is not a key in
 * schema.assemblyConstituencies (orphans). These are mostly legacy Andhra Pradesh
 * ACs (pre-2014 / pre-Telangana) plus a few stray ids still present in the file.
 *
 * Usage:
 *   node scripts/cleanup-assembly-geojson-orphans.mjs           # dry-run
 *   node scripts/cleanup-assembly-geojson-orphans.mjs --write   # rewrite file
 *   node scripts/cleanup-assembly-geojson-orphans.mjs --ci      # exit 1 if orphans exist
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'public/data/schema.json');
const GEO_PATH = path.join(ROOT, 'public/data/geo/assembly/constituencies.geojson');

const args = new Set(process.argv.slice(2));
const doWrite = args.has('--write');
const ci = args.has('--ci');

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const acKeys = new Set(Object.keys(schema.assemblyConstituencies || {}));

const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
const features = geo.features || [];

const orphans = [];
const kept = [];

for (const f of features) {
  const id = f.properties?.schemaId;
  if (id == null || id === '') {
    kept.push(f);
    continue;
  }
  if (!acKeys.has(id)) {
    orphans.push(id);
    continue;
  }
  kept.push(f);
}

orphans.sort();

console.log(`Assembly GeoJSON: ${features.length} features → would keep ${kept.length}, remove ${orphans.length} orphan(s)`);
if (orphans.length) {
  console.log('Orphan schemaIds:', orphans.join(', '));
}

if (ci && orphans.length > 0) {
  process.exit(1);
}

if (doWrite) {
  if (orphans.length === 0) {
    console.log('Nothing to remove; file unchanged.');
    process.exit(0);
  }
  geo.features = kept;
  fs.writeFileSync(GEO_PATH, JSON.stringify(geo) + '\n');
  console.log(`Wrote ${GEO_PATH}`);
} else if (!ci && orphans.length > 0) {
  console.log('\nDry-run only. Pass --write to apply.');
}

process.exit(0);
