#!/usr/bin/env node
/**
 * Generate state-winners-ac.json: for each state with AC data, compute the party
 * that won the most assembly seats in the latest Vidhan Sabha election. Used to
 * color-code states on the India (root) map view (AC-based, not PC-based).
 *
 * Usage: node scripts/generate-state-winners-from-ac.mjs
 * Output: public/data/elections/state-winners-ac.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AC_BASE = path.join(ROOT, 'public/data/elections/ac');
const OUT_PATH = path.join(ROOT, 'public/data/elections/state-winners-ac.json');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

const stateDirs = fs.readdirSync(AC_BASE).filter((d) => {
  if (d === 'index.json' || d.startsWith('.')) return false;
  const full = path.join(AC_BASE, d);
  return fs.statSync(full).isDirectory();
});

const stateWinners = {};

function fileHasAcResults(yearPath) {
  if (!fs.existsSync(yearPath)) return false;
  let data;
  try {
    data = loadJSON(yearPath);
  } catch {
    return false;
  }
  for (const [k, row] of Object.entries(data)) {
    if (k.startsWith('_') || !row?.candidates?.length) continue;
    return true;
  }
  return false;
}

for (const stateId of stateDirs) {
  const indexPath = path.join(AC_BASE, stateId, 'index.json');
  if (!fs.existsSync(indexPath)) continue;
  const index = loadJSON(indexPath);
  const years = [...(index.availableYears ?? index.years ?? [])].sort((a, b) => b - a);
  if (years.length === 0) continue;

  let results = null;
  let latestYear = null;
  for (const y of years) {
    const yearPath = path.join(AC_BASE, stateId, `${y}.json`);
    if (!fileHasAcResults(yearPath)) continue;
    results = loadJSON(yearPath);
    latestYear = y;
    break;
  }
  if (!results || latestYear == null) continue;

  const partySeats = {};
  for (const acResult of Object.values(results)) {
    if (!acResult?.candidates?.length) continue;
    const winner =
      acResult.candidates.find((c) => c.position === 1) ?? acResult.candidates[0];
    const party = (winner.party || 'IND').trim();
    partySeats[party] = (partySeats[party] || 0) + 1;
  }
  const entries = Object.entries(partySeats);
  if (entries.length === 0) continue;
  const [topParty, seats] = entries.sort((a, b) => b[1] - a[1])[0];
  stateWinners[stateId] = { party: topParty, year: latestYear, seats };
}

const output = {
  description:
    'Party that won the most assembly seats per state (latest Vidhan Sabha election). Used to color-code the India map view. AC-based, not PC-based.',
  generatedAt: new Date().toISOString(),
  stateWinners,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
console.log(`Wrote ${Object.keys(stateWinners).length} state winners (AC-based) to ${OUT_PATH}`);
