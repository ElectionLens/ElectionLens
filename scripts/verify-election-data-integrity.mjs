#!/usr/bin/env node
/**
 * Scan all PC and AC election JSON for known data bugs:
 * - PC: duplicate assembly acNo within the same PC's acWiseResults (map overwrite bug)
 * - PC / AC: candidates list where official position==1 is NOTA but a non-NOTA candidate
 *   has strictly higher votes (ordering / import inconsistency)
 *
 * Usage:
 *   node scripts/verify-election-data-integrity.mjs
 *   node scripts/verify-election-data-integrity.mjs --ci   # exit 1 if any issue
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PC_ROOT = path.join(ROOT, 'public/data/elections/pc');
const AC_ROOT = path.join(ROOT, 'public/data/elections/ac');

const args = new Set(process.argv.slice(2));
const ci = args.has('--ci');

function isNota(p) {
  return String(p ?? '').toUpperCase() === 'NOTA';
}

/** position field says NOTA is #1, but vote totals show a non-NOTA candidate ahead */
function positionOneNotaButVotesFavorOther(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) return false;
  let minPos = Infinity;
  for (const c of candidates) {
    const p = c.position;
    if (p != null && p < minPos) minPos = p;
  }
  if (minPos === Infinity) return false;
  const atRank = candidates.filter((c) => c.position === minPos);
  const posLeader = [...atRank].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
  if (!posLeader || !isNota(posLeader.party)) return false;
  const voteLeader = [...candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
  if (!voteLeader || isNota(voteLeader.party)) return false;
  return (voteLeader.votes ?? 0) > (posLeader.votes ?? 0);
}

function isAssemblyElectionResult(value) {
  if (!value || typeof value !== 'object') return false;
  if (!Array.isArray(value.candidates)) return false;
  if (typeof value.constituencyNo === 'number') return true;
  if (typeof value.constituencyName === 'string' && value.constituencyName.length > 0) return true;
  if (typeof value.constituencyNameOriginal === 'string' && value.constituencyNameOriginal.length > 0)
    return true;
  if (typeof value.name === 'string' && value.name.length > 0) return true;
  return false;
}

function skipAcRowForWinnerCheck(result, fileMeta) {
  if (fileMeta?.candidatesPolicy === 'announced_only') return true;
  if (fileMeta?.resultsPending) return true;
  return Boolean(result.resultsPending);
}

function scanPcFile(filePath, stateId, year) {
  const issues = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    issues.push({ kind: 'parse_error', message: String(e.message) });
    return issues;
  }

  for (const [pcKey, pc] of Object.entries(data)) {
    if (pcKey === '_meta' || !pc || typeof pc !== 'object') continue;

    const pcCands = pc.candidates;
    if (Array.isArray(pcCands) && positionOneNotaButVotesFavorOther(pcCands)) {
      issues.push({ kind: 'pc_constituency_position_votes_mismatch', stateId, year, pcKey });
    }

    const awr = pc.acWiseResults;
    if (!awr || typeof awr !== 'object') continue;

    const byAcNo = new Map();
    for (const [acKey, row] of Object.entries(awr)) {
      const n = row?.acNo;
      if (n == null || n === '') continue;
      const sid = `${stateId}-${String(n).padStart(3, '0')}`;
      if (!byAcNo.has(sid)) byAcNo.set(sid, []);
      byAcNo.get(sid).push(acKey);
    }
    for (const [sid, keys] of byAcNo) {
      if (keys.length > 1) {
        issues.push({ kind: 'pc_dup_acno', stateId, year, pcKey, acNo: sid, keys });
      }
    }

    for (const [acKey, row] of Object.entries(awr)) {
      const cands = row?.candidates;
      if (Array.isArray(cands) && positionOneNotaButVotesFavorOther(cands)) {
        issues.push({ kind: 'pc_acwise_position_votes_mismatch', stateId, year, pcKey, acKey });
      }
    }
  }
  return issues;
}

function scanAcFile(filePath, stateId, year) {
  const issues = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    issues.push({ kind: 'parse_error', message: String(e.message) });
    return issues;
  }

  const fileMeta = data._meta;
  const byAcNo = new Map();

  for (const [key, result] of Object.entries(data)) {
    if (!key || key.startsWith('_')) continue;
    if (!isAssemblyElectionResult(result)) continue;
    const no = result.constituencyNo;
    if (typeof no === 'number' && Number.isFinite(no) && no > 0) {
      const k = `${stateId}-${no}`;
      if (!byAcNo.has(k)) byAcNo.set(k, []);
      byAcNo.get(k).push(key);
    }
    if (skipAcRowForWinnerCheck(result, fileMeta)) continue;
    const cands = result.candidates;
    if (Array.isArray(cands) && positionOneNotaButVotesFavorOther(cands)) {
      issues.push({ kind: 'ac_position_votes_mismatch', stateId, year, acKey: key });
    }
  }

  for (const [acNoKey, keys] of byAcNo) {
    if (keys.length > 1) {
      issues.push({ kind: 'ac_dup_constituency_no', stateId, year, constituencyNo: acNoKey, keys });
    }
  }

  return issues;
}

function collectYearFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const st of fs.readdirSync(dir)) {
    const stPath = path.join(dir, st);
    if (!fs.statSync(stPath).isDirectory()) continue;
    for (const f of fs.readdirSync(stPath)) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      const year = parseInt(f.replace('.json', ''), 10);
      if (Number.isNaN(year)) continue;
      out.push({ stateId: st, year, path: path.join(stPath, f) });
    }
  }
  return out;
}

const pcFiles = collectYearFiles(PC_ROOT);
const acFiles = collectYearFiles(AC_ROOT);

const allIssues = [];

for (const { stateId, year, path: fp } of pcFiles) {
  allIssues.push(...scanPcFile(fp, stateId, year));
}
for (const { stateId, year, path: fp } of acFiles) {
  allIssues.push(...scanAcFile(fp, stateId, year));
}

const byKind = {};
for (const i of allIssues) {
  byKind[i.kind] = (byKind[i.kind] || 0) + 1;
}

console.log('Election data integrity scan');
console.log(`PC files scanned: ${pcFiles.length}`);
console.log(`AC files scanned: ${acFiles.length}`);
console.log('Issues by kind:', byKind);
console.log(`Total issues: ${allIssues.length}`);

if (allIssues.length > 0 && allIssues.length <= 80) {
  console.log('\nDetails:');
  for (const i of allIssues) console.log(JSON.stringify(i));
} else if (allIssues.length > 80) {
  console.log('\nFirst 40 details:');
  for (const i of allIssues.slice(0, 40)) console.log(JSON.stringify(i));
  console.log(`... and ${allIssues.length - 40} more`);
}

if (ci && allIssues.length > 0) {
  process.exit(1);
}
process.exit(0);
