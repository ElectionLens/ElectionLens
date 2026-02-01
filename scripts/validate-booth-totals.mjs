#!/usr/bin/env node
/**
 * Validate booth data: sum(booth totals) must equal sum(candidate votes) per file.
 * Run: node scripts/validate-booth-totals.mjs
 * Or: node scripts/validate-booth-totals.mjs public/data/booths/TN/TN-134/2016.json public/data/booths/TN/TN-174/2016.json
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_FILES = [
  'public/data/booths/TN/TN-134/2016.json',
  'public/data/booths/TN/TN-174/2016.json',
];

function validateBoothFile(filePath) {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    return { file: filePath, ok: false, error: 'File not found' };
  }
  const d = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const results = d.results || {};
  const candidates = d.candidates || [];
  const numCand = candidates.length;

  let sumBoothTotals = 0;
  const candSums = Array(numCand).fill(0);

  for (const row of Object.values(results)) {
    sumBoothTotals += row.total ?? 0;
    const votes = row.votes ?? [];
    for (let i = 0; i < numCand; i++) candSums[i] += Number(votes[i]) || 0;
  }

  const sumCandidateTotals = candSums.reduce((a, b) => a + b, 0);
  const ok = sumBoothTotals === sumCandidateTotals;
  const officialTotal = d.summary?.totalVotes;

  return {
    file: filePath,
    acId: d.acId,
    year: d.year,
    boothCount: Object.keys(results).length,
    sumBoothTotals,
    sumCandidateTotals,
    ok,
    candidateSums: candSums.map((s, i) => ({ party: candidates[i]?.party ?? i, votes: s })),
    officialTotal,
    extractedVsOfficial:
      officialTotal != null ? `${sumBoothTotals.toLocaleString()} / ${officialTotal.toLocaleString()}` : null,
  };
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;
let allOk = true;

console.log('Booth data validation: booth total = candidate total\n');

for (const f of files) {
  const r = validateBoothFile(f);
  if (r.error) {
    console.log(`❌ ${r.file}: ${r.error}`);
    allOk = false;
    continue;
  }
  const status = r.ok ? '✅' : '❌';
  console.log(`${status} ${r.acId} ${r.year} (${r.file})`);
  console.log(`   Booths: ${r.boothCount} | Sum(booth totals): ${r.sumBoothTotals.toLocaleString()} | Sum(candidate votes): ${r.sumCandidateTotals.toLocaleString()}`);
  if (!r.ok) console.log(`   MISMATCH: booth total ≠ candidate total`);
  if (r.extractedVsOfficial) console.log(`   Extracted / official total: ${r.extractedVsOfficial}`);
  console.log(`   Per candidate: ${r.candidateSums.map((c) => `${c.party}:${c.votes.toLocaleString()}`).join(', ')}`);
  console.log('');
  if (!r.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
