#!/usr/bin/env node
/**
 * Download DataMeet national AC GeoJSON and write Assam-only subset.
 * Source: https://github.com/datameet/maps — docs/data/geojson/ac.geojson (MIT).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPSTREAM =
  'https://raw.githubusercontent.com/datameet/maps/master/docs/data/geojson/ac.geojson';
const OUT_DIR = path.join(__dirname, 'data-sources/assam-ac-datameet');
const OUT_FILE = path.join(OUT_DIR, 'assam-ac.geojson');

async function main() {
  console.log('Fetching', UPSTREAM);
  const res = await fetch(UPSTREAM);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const g = await res.json();
  const features = (g.features || []).filter((x) => {
    const p = x.properties || {};
    return (
      String(p.ST_CODE) === '18' ||
      (p.ST_NAME || '').toUpperCase().trim() === 'ASSAM'
    );
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    type: 'FeatureCollection',
    name: 'Assam_AC',
    _meta: {
      source: 'https://github.com/datameet/maps',
      path: 'docs/data/geojson/ac.geojson',
      license: 'MIT (DataMeet maps repository)',
      extractedAt: new Date().toISOString(),
      note: 'Subset of national AC layer. See scripts/data-sources/assam-ac-datameet/README.md',
    },
    features,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  console.log(`Wrote ${features.length} features → ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
