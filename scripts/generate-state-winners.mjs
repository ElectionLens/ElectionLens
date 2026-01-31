#!/usr/bin/env node
/**
 * Generate state-winners.json: for each state with PC data, compute the party
 * that won the most Lok Sabha seats in the latest election. Used to color-code
 * states on the India (root) map view.
 *
 * Usage: node scripts/generate-state-winners.mjs
 * Output: public/data/elections/state-winners.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PC_BASE = path.join(ROOT, 'public/data/elections/pc');
const OUT_PATH = path.join(ROOT, 'public/data/elections/state-winners.json');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

const stateDirs = fs.readdirSync(PC_BASE).filter((d) => {
  if (d === 'index.json' || d.startsWith('.')) return false;
  const full = path.join(PC_BASE, d);
  return fs.statSync(full).isDirectory();
});

const stateWinners = {};

for (const stateId of stateDirs) {
  const indexPath = path.join(PC_BASE, stateId, 'index.json');
  if (!fs.existsSync(indexPath)) continue;
  const index = loadJSON(indexPath);
  const years = index.availableYears ?? index.years ?? [];
  if (years.length === 0) continue;
  const latestYear = Math.max(...years);
  const yearPath = path.join(PC_BASE, stateId, `${latestYear}.json`);
  if (!fs.existsSync(yearPath)) continue;
  const results = loadJSON(yearPath);
  const partySeats = {};
  for (const pcResult of Object.values(results)) {
    if (!pcResult?.candidates?.length) continue;
    const winner = pcResult.candidates[0];
    const party = (winner.party || 'IND').trim();
    partySeats[party] = (partySeats[party] || 0) + 1;
  }
  const entries = Object.entries(partySeats);
  if (entries.length === 0) continue;
  const [topParty, seats] = entries.sort((a, b) => b[1] - a[1])[0];
  stateWinners[stateId] = { party: topParty, year: latestYear, seats };
}

const output = {
  description: 'Party that won the most Lok Sabha seats per state (latest election). Used to color-code the India map view.',
  generatedAt: new Date().toISOString(),
  stateWinners,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
console.log(`Wrote ${Object.keys(stateWinners).length} state winners to ${OUT_PATH}`);
