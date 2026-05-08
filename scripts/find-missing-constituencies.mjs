#!/usr/bin/env node
/**
 * Find constituencies missing from election data (like Aravakurichi, Thanjavur, Vellore PC).
 * Compares schema's expected AC/PC list per state with keys in each election JSON.
 * Run: node scripts/find-missing-constituencies.mjs
 * Run: node scripts/find-missing-constituencies.mjs --doc   # write docs/missing-constituency-data.md
 */

import fs from 'fs';
import path from 'path';

const DATA_ROOT = path.join(process.cwd(), 'public/data');
const SCHEMA_PATH = path.join(DATA_ROOT, 'schema.json');

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

function expectedAcIds(stateId) {
  const acs = schema.assemblyConstituencies || {};
  return Object.entries(acs)
    .filter(([, ac]) => ac.stateId === stateId)
    .map(([id]) => id)
    .sort();
}

function expectedPcIds(stateId) {
  const pcs = schema.parliamentaryConstituencies || {};
  return Object.entries(pcs)
    .filter(([, pc]) => pc.stateId === stateId)
    .map(([id]) => id)
    .sort();
}

function getAcName(schema, acId) {
  const ac = schema.assemblyConstituencies?.[acId];
  return ac?.name || acId;
}

function getPcName(schema, pcId) {
  const pc = schema.parliamentaryConstituencies?.[pcId];
  return pc?.name || pcId;
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function acYears(stateId) {
  const dir = path.join(DATA_ROOT, 'elections/ac', stateId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .map((f) => parseInt(f.replace('.json', ''), 10))
    .sort((a, b) => a - b);
}

function pcYears(stateId) {
  const dir = path.join(DATA_ROOT, 'elections/pc', stateId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .map((f) => parseInt(f.replace('.json', ''), 10))
    .sort((a, b) => a - b);
}

function loadElectionKeys(type, stateId, year) {
  const file = path.join(DATA_ROOT, 'elections', type, stateId, `${year}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = Object.keys(data).filter(
    (k) => typeof data[k] === 'object' && data[k] !== null && (data[k].year != null || data[k].candidates != null || data[k].constituencyNo != null || data[k].constituencyName != null)
  );
  return keys;
}

const acStates = scanDir(path.join(DATA_ROOT, 'elections/ac'));
const pcStates = scanDir(path.join(DATA_ROOT, 'elections/pc'));

const acMissing = [];
const pcMissing = [];

for (const stateId of acStates) {
  const expected = expectedAcIds(stateId);
  if (expected.length === 0) continue;
  const years = acYears(stateId);
  for (const year of years) {
    const present = loadElectionKeys('ac', stateId, year);
    if (!present) continue;
    const presentSet = new Set(present);
    const missing = expected.filter((id) => !presentSet.has(id));
    if (missing.length > 0) {
      acMissing.push({
        stateId,
        year,
        expectedCount: expected.length,
        presentCount: present.length,
        missingCount: missing.length,
        missing: missing.map((id) => ({ id, name: getAcName(schema, id) })),
      });
    }
  }
}

for (const stateId of pcStates) {
  const expected = expectedPcIds(stateId);
  if (expected.length === 0) continue;
  const years = pcYears(stateId);
  for (const year of years) {
    const present = loadElectionKeys('pc', stateId, year);
    if (!present) continue;
    const presentSet = new Set(present);
    const missing = expected.filter((id) => !presentSet.has(id));
    if (missing.length > 0) {
      pcMissing.push({
        stateId,
        year,
        expectedCount: expected.length,
        presentCount: present.length,
        missingCount: missing.length,
        missing: missing.map((id) => ({ id, name: getPcName(schema, id) })),
      });
    }
  }
}

console.log('=== Missing constituencies (similar to Aravakurichi, Thanjavur, Vellore PC) ===\n');
console.log('Assembly (AC) — constituencies in schema but not in election file:\n');

if (acMissing.length === 0) {
  console.log('  None found. All AC election files have full constituency coverage.\n');
} else {
  for (const m of acMissing) {
    console.log(`  ${m.stateId} ${m.year}: ${m.missingCount} missing (have ${m.presentCount}, expected ${m.expectedCount})`);
    for (const { id, name } of m.missing) {
      console.log(`    - ${id} ${name}`);
    }
    console.log('');
  }
}

console.log('Parliament (PC) — constituencies in schema but not in election file:\n');

if (pcMissing.length === 0) {
  console.log('  None found. All PC election files have full constituency coverage.\n');
} else {
  for (const m of pcMissing) {
    console.log(`  ${m.stateId} ${m.year}: ${m.missingCount} missing (have ${m.presentCount}, expected ${m.expectedCount})`);
    for (const { id, name } of m.missing) {
      console.log(`    - ${id} ${name}`);
    }
    console.log('');
  }
}

/** Above this count per state-year, gaps are often schema/key skew or bulk incompleteness—not row-by-row “missing polls.” */
const LARGE_GAP_THRESHOLD = 10;

const totalAc = acMissing.reduce((s, m) => s + m.missingCount, 0);
const totalPc = pcMissing.reduce((s, m) => s + m.missingCount, 0);
console.log('---');
console.log(`Total: ${totalAc} missing AC entries, ${totalPc} missing PC entries.\n`);

console.log('=== Likely deferred/countermanded (1–5 missing per file, like Aravakurichi/Thanjavur/Vellore) ===\n');
const acSmall = acMissing.filter((m) => m.missingCount >= 1 && m.missingCount <= 5);
const pcSmall = pcMissing.filter((m) => m.missingCount >= 1 && m.missingCount <= 5);
if (acSmall.length > 0) {
  console.log('Assembly (AC):');
  for (const m of acSmall) {
    console.log(`  ${m.stateId} ${m.year}: ${m.missingCount} missing — ${m.missing.map((x) => `${x.id} ${x.name}`).join(', ')}`);
  }
  console.log('');
}
if (pcSmall.length > 0) {
  console.log('Parliament (PC):');
  for (const m of pcSmall) {
    console.log(`  ${m.stateId} ${m.year}: ${m.missingCount} missing — ${m.missing.map((x) => `${x.id} ${x.name}`).join(', ')}`);
  }
}

function renderMissingBlocks(missingList) {
  const lines = [];
  for (const m of missingList) {
    lines.push(`### ${m.stateId} ${m.year}`);
    lines.push('');
    lines.push(`- Expected: ${m.expectedCount} | In file: ${m.presentCount} | Missing: ${m.missingCount}`);
    lines.push('');
    for (const { id, name } of m.missing) {
      lines.push(`- ${id} ${name}`);
    }
    lines.push('');
  }
  return lines;
}

if (process.argv.includes('--doc')) {
  const docPath = path.join(process.cwd(), 'docs', 'missing-constituency-data.md');

  const acActionable = acMissing.filter((m) => m.missingCount <= LARGE_GAP_THRESHOLD);
  const acLarge = acMissing.filter((m) => m.missingCount > LARGE_GAP_THRESHOLD);
  const pcActionable = pcMissing.filter((m) => m.missingCount <= LARGE_GAP_THRESHOLD);
  const pcLarge = pcMissing.filter((m) => m.missingCount > LARGE_GAP_THRESHOLD);

  const lines = [
    '# Missing constituency data',
    '',
    'Constituencies that exist in the schema but are **missing from the election JSON** for that state and year (exact key match only). Examples of genuinely missing published results: Aravakurichi & Thanjavur (TN 2016 AC, deferred poll), Vellore PC (TN 2019, countermanded).',
    '',
    '## How to read this',
    '',
    '- **Small gap (1–5 per state-year)** in **Likely deferred / countermanded** below: best targets to backfill from ECI / Form 20 / bypoll data into `public/data/elections/{ac,pc}/…`.',
    `- **Actionable full-list sections** (≤ ${LARGE_GAP_THRESHOLD} missing keys): still reasonable to audit and fix keys or add rows.`,
    `- **Large-gap sections** (>${LARGE_GAP_THRESHOLD} missing): usually **schema vs file key skew** (e.g. AP numbering vs \`schema.assemblyConstituencies\`), **delimitation**, or a partially keyed file—not hundreds of separate missing polls. Normalize IDs or remap keys before treating every line as a data hole.`,
    '- **Jammu & Kashmir:** older files may not align with current schema AC IDs (delimitation).',
    '',
    '**How to regenerate this file:** `node scripts/find-missing-constituencies.mjs --doc`',
    '',
    '_See also:_ [booth-data-extraction-guide.md](./booth-data-extraction-guide.md), [100-percent-extraction-strategy.md](./100-percent-extraction-strategy.md).',
    '',
    '### Data backfill (manual)',
    '',
    'Optional JSON updates for small-gap constituencies are **not automated here**: add sourced rows under `public/data/elections/ac/<STATE>/<YEAR>.json` or `public/data/elections/pc/<STATE>/<YEAR>.json` after verifying against official results.',
    '',
    '---',
    '',
    '## Summary',
    '',
    `| Type | Total missing entries | Files with gaps |`,
    `|------|------------------------|-----------------|`,
    `| Assembly (AC) | ${totalAc} | ${acMissing.length} state-year files |`,
    `| Parliament (PC) | ${totalPc} | ${pcMissing.length} state-year files |`,
    '',
    `| Bucket | Assembly (AC) state-years | Parliament (PC) state-years |`,
    `|--------|---------------------------|------------------------------|`,
    `| Actionable (≤ ${LARGE_GAP_THRESHOLD} missing) | ${acActionable.length} | ${pcActionable.length} |`,
    `| Large gap (>${LARGE_GAP_THRESHOLD} missing) | ${acLarge.length} | ${pcLarge.length} |`,
    '',
    '---',
    '',
    '## Likely deferred / countermanded (1–5 missing per file)',
    '',
    'These are the best candidates for adding missing data (e.g. Form 20 / bypolls).',
    '',
    '### Assembly (AC)',
    ...(acSmall.length > 0
      ? acSmall.map(
          (m) =>
            `- **${m.stateId} ${m.year}** (${m.missingCount} missing): ${m.missing.map((x) => `${x.id} ${x.name}`).join(', ')}`
        )
      : ['- None']),
    '',
    '### Parliament (PC)',
    ...(pcSmall.length > 0
      ? pcSmall.map(
          (m) =>
            `- **${m.stateId} ${m.year}** (${m.missingCount} missing): ${m.missing.map((x) => `${x.id} ${x.name}`).join(', ')}`
        )
      : ['- None']),
    '',
    '---',
    '',
    `## Full list: Assembly (AC) — actionable (≤ ${LARGE_GAP_THRESHOLD} missing)`,
    '',
    ...(acActionable.length > 0
      ? renderMissingBlocks(acActionable)
      : ['_None._', '']),
    '---',
    '',
    `## Full list: Assembly (AC) — large gaps (>${LARGE_GAP_THRESHOLD} missing, check ID alignment)`,
    '',
    '_**AP:** verify election JSON keys use the same `AP-xxx` scheme as `schema.assemblyConstituencies`._',
    '',
    ...(acLarge.length > 0
      ? renderMissingBlocks(acLarge)
      : ['_None._', '']),
    '---',
    '',
    `## Full list: Parliament (PC) — actionable (≤ ${LARGE_GAP_THRESHOLD} missing)`,
    '',
    ...(pcActionable.length > 0
      ? renderMissingBlocks(pcActionable)
      : ['_None._', '']),
    '---',
    '',
    `## Full list: Parliament (PC) — large gaps (>${LARGE_GAP_THRESHOLD} missing, check ID alignment)`,
    '',
    ...(pcLarge.length > 0
      ? renderMissingBlocks(pcLarge)
      : ['_None._', '']),
    '---',
    '',
    '*Generated by `scripts/find-missing-constituencies.mjs --doc`*',
  ];

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${docPath}`);
}
