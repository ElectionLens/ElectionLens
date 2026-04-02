#!/usr/bin/env node
/**
 * 2014 Lok Sabha PC files: remove duplicate acWiseResults rows that share the same
 * assembly acNo (bogus second row is usually NOTA-only). Re-key entries to schema
 * canonical AC names so map colouring and lookups stay consistent.
 *
 * Usage: node scripts/fix-pc-2014-acwise-duplicates.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PC_DIR = path.join(ROOT, 'public/data/elections/pc');
const SCHEMA_PATH = path.join(ROOT, 'public/data/schema.json');
const YEAR = 2014;

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const assembly = schema.assemblyConstituencies || {};

function contributionScore(contrib) {
  const cands = contrib?.candidates;
  if (!Array.isArray(cands) || cands.length === 0) return 0;
  const nonNota = cands.filter((c) => String(c.party ?? '').toUpperCase() !== 'NOTA');
  if (nonNota.length === 0) return cands.length;
  return 10000 + nonNota.length * 100 + cands.length;
}

function pickBestInGroup(entries) {
  let best = entries[0];
  let bestScore = contributionScore(best.contrib);
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i];
    const s = contributionScore(e.contrib);
    if (s > bestScore || (s === bestScore && e.key.length > best.key.length)) {
      best = e;
      bestScore = s;
    }
  }
  return best;
}

function canonicalAcName(stateId, acNo, fallback) {
  if (acNo == null || acNo === '') return fallback;
  const sid = `${stateId}-${String(acNo).padStart(3, '0')}`;
  return assembly[sid]?.name ?? fallback;
}

function processStateFile(stateId, filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let pcsTouched = 0;
  let keysRemoved = 0;
  let keysRekeyed = 0;

  for (const [pcKey, pc] of Object.entries(raw)) {
    if (pcKey === '_meta' || !pc || typeof pc !== 'object') continue;
    const awr = pc.acWiseResults;
    if (!awr || typeof awr !== 'object') continue;

    const byAcNo = new Map();
    for (const [k, v] of Object.entries(awr)) {
      const n = v?.acNo;
      if (n == null || n === '') continue;
      const sid = `${stateId}-${String(n).padStart(3, '0')}`;
      if (!byAcNo.has(sid)) byAcNo.set(sid, []);
      byAcNo.get(sid).push({ key: k, contrib: v });
    }

    const keysToDrop = new Set();
    for (const [, group] of byAcNo) {
      if (group.length <= 1) continue;
      const keep = pickBestInGroup(group);
      for (const { key } of group) {
        if (key !== keep.key) keysToDrop.add(key);
      }
    }

    const trimmed = { ...awr };
    for (const k of keysToDrop) {
      delete trimmed[k];
      keysRemoved++;
    }

    const finalAwr = {};
    for (const [k, v] of Object.entries(trimmed)) {
      const n = v?.acNo;
      const canon = canonicalAcName(stateId, n, k);
      const newKey = canon;
      const newVal = { ...v, acName: canonicalAcName(stateId, n, v.acName ?? k) };
      if (newKey !== k) keysRekeyed++;

      if (finalAwr[newKey]) {
        const merged = pickBestInGroup([
          { key: newKey, contrib: finalAwr[newKey] },
          { key: k, contrib: newVal },
        ]);
        const acNameFinal = canonicalAcName(stateId, merged.contrib.acNo, merged.contrib.acName);
        finalAwr[newKey] = { ...merged.contrib, acName: acNameFinal };
      } else {
        finalAwr[newKey] = newVal;
      }
    }

    const beforeKeys = JSON.stringify(awr);
    const afterKeys = JSON.stringify(finalAwr);
    if (beforeKeys === afterKeys && keysToDrop.size === 0) continue;

    pc.acWiseResults = finalAwr;
    if (Array.isArray(pc.assemblyConstituencies)) {
      pc.assemblyConstituencies = [
        ...new Set(
          Object.entries(finalAwr)
            .sort((a, b) => (a[1].acNo ?? 0) - (b[1].acNo ?? 0))
            .map(([key]) => key)
        ),
      ];
    }
    pcsTouched++;
  }

  if (pcsTouched > 0) {
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2) + '\n');
  }
  return { pcsTouched, keysRemoved, keysRekeyed };
}

let totalRemoved = 0;
let totalRekey = 0;
let files = 0;

for (const st of fs.readdirSync(PC_DIR)) {
  const stPath = path.join(PC_DIR, st);
  if (!fs.statSync(stPath).isDirectory()) continue;
  const fp = path.join(stPath, `${YEAR}.json`);
  if (!fs.existsSync(fp)) continue;
  const r = processStateFile(st, fp);
  if (r.pcsTouched > 0) {
    files++;
    totalRemoved += r.keysRemoved;
    totalRekey += r.keysRekeyed;
    console.log(`${st}: PCs ${r.pcsTouched}, removed keys ${r.keysRemoved}, rekeys ${r.keysRekeyed}`);
  }
}

console.log(`\nModified ${files} state file(s). Removed ${totalRemoved} duplicate keys. Rekey count ${totalRekey}.`);
