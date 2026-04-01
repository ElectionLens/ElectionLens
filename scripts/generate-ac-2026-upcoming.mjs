#!/usr/bin/env node
/**
 * Build assembly 2026.json files for states with scheduled 2026 elections (TN, KL, WB, AS, PY).
 * Copies constituency metadata from the last completed election; zeroes votes; sets resultsPending.
 * Does not copy candidate rows — 2026 lists are filled only from sourced announcements (see merge-tn-2026-announced.mjs for TN).
 *
 * Usage: node scripts/generate-ac-2026-upcoming.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../public/data/elections/ac');
const TARGET_YEAR = 2026;

const TARGETS = [
  { code: 'TN', sourceYear: 2021 },
  { code: 'KL', sourceYear: 2021 },
  { code: 'WB', sourceYear: 2021 },
  { code: 'AS', sourceYear: 2021 },
  { code: 'PY', sourceYear: 2021 },
];

function transformEntry(schemaKey, entry) {
  const m = schemaKey.match(/^[A-Z]{2}-(\d+)$/);
  const acNumFromKey = m ? +m[1] : null;

  return {
    ...entry,
    year: TARGET_YEAR,
    constituencyNo:
      typeof entry.constituencyNo === 'number' ? entry.constituencyNo : acNumFromKey ?? entry.constituencyNo,
    resultsPending: true,
    validVotes: 0,
    turnout: 0,
    enop: 0,
    totalCandidates: 0,
    candidates: [],
  };
}

function isConstituencyEntry(k, v) {
  if (k.startsWith('_')) return false;
  if (!v || typeof v !== 'object') return false;
  if (typeof v.constituencyNo === 'number' || typeof v.acNo === 'number') return true;
  if (/^[A-Z]{2}-\d+$/.test(k) && Array.isArray(v.candidates) && v.candidates.length > 0) return true;
  return false;
}

for (const { code, sourceYear } of TARGETS) {
  const srcPath = path.join(ROOT, code, `${sourceYear}.json`);
  if (!fs.existsSync(srcPath)) {
    console.error(`Missing source: ${srcPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  const out = {
    _meta: {
      resultsPending: true,
      targetYear: TARGET_YEAR,
      derivedFrom: sourceYear,
      candidatesPolicy: 'announced_only',
      description:
        '2026 assembly elections (Tamil Nadu, Kerala, West Bengal, Assam, Puducherry). Polls scheduled Apr–May 2026. ' +
        'Vote totals are not yet counted. Candidate lists are empty until sourced announcements are merged (TN/WB/KL: voterlist + merge scripts; see package.json refresh:ac-2026-announced).',
      lastUpdated: new Date().toISOString().slice(0, 10),
    },
  };

  let count = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!isConstituencyEntry(k, v)) continue;
    out[k] = transformEntry(k, v);
    count++;
  }

  const destPath = path.join(ROOT, code, `${TARGET_YEAR}.json`);
  fs.writeFileSync(destPath, JSON.stringify(out) + '\n');
  console.log(`${code}: wrote ${count} constituencies -> ${destPath}`);

  const idxPath = path.join(ROOT, code, 'index.json');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const years = new Set(idx.availableYears || []);
  years.add(TARGET_YEAR);
  idx.availableYears = [...years].sort((a, b) => a - b);
  idx.lastUpdated = new Date().toISOString();
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n');
}

const masterPath = path.join(ROOT, 'index.json');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
for (const st of master.states || []) {
  if (!TARGETS.some((t) => t.code === st.code)) continue;
  const ys = new Set(st.years || []);
  ys.add(TARGET_YEAR);
  st.years = [...ys].sort((a, b) => a - b);
}
fs.writeFileSync(masterPath, JSON.stringify(master, null, 2) + '\n');
console.log('Updated public/data/elections/ac/index.json');
