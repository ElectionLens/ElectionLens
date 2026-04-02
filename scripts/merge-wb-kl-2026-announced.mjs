#!/usr/bin/env node
/**
 * Merge voterlist-sourced 2026 announced candidates into public/data/elections/ac/WB/2026.json and KL/2026.json.
 *
 * WB: scripts/data/wb-2026-voterlist-master.json (Congress, BJP, CPI(M), TMC).
 * KL: scripts/data/kl-2026-voterlist.json (UDF + LDF + partial BJP).
 *
 * Prerequisite: node scripts/generate-ac-2026-upcoming.mjs
 *
 * Usage: node scripts/merge-wb-kl-2026-announced.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildAcKeyMapForState,
  resolvePressToAcId,
  toEciStyleName,
} from './lib/ac-resolve-by-state.mjs';
import { inferSexFromAnnouncedName } from './lib/infer-candidate-sex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'public/data/schema.json');
const WB_SRC = path.join(__dirname, 'data/wb-2026-voterlist-master.json');
const KL_SRC = path.join(__dirname, 'data/kl-2026-voterlist.json');
const WB_OUT = path.join(ROOT, 'public/data/elections/ac/WB/2026.json');
const KL_OUT = path.join(ROOT, 'public/data/elections/ac/KL/2026.json');

/** Press / table spellings → substring or label fix before keying (whole-string regex → replacement label). */
const KL_PRESS_SYNONYMS = [
  [/^manjeshwaram$/i, 'Manjeshwar'],
  [/^uduma$/i, 'Udma'],
  [/^payyanur$/i, 'Payyannur'],
  [/^vatakara$/i, 'Vadakara'],
  [/^kuttiady$/i, 'Kuttiadi'],
  [/^guruvayur$/i, 'Guruvayoor'],
  [/^karunagapally$/i, 'Karunagappally'],
  [/^kazhakkuttam$/i, 'Kazhakoottam'],
  [/^vattiyurkavu$/i, 'Vattiyoorkavu'],
  [/^kattakada$/i, 'Kattakkada'],
  [/^(thiruvananthapuram|thiruvananthapura)$/i, 'Thiruvananthapura'],
  [/^(ernad)$/i, 'Eranad'],
  [/^(irinjalakkuda)$/i, 'Irinjalakuda'],
  [/^(chalakkudy)$/i, 'Chalakudy'],
  [/^(vypeen)$/i, 'Vypen'],
  [/^(ottappalam)$/i, 'Ottapalam'],
  [/^(mannarkkad)$/i, 'Mannarkad'],
  [/^(nemmara)$/i, 'Nenmara'],
  [/^(ambalappuzha)$/i, 'Ambalapuzha'],
  [/^(mavelikkara)$/i, 'Mavelikara'],
  [/^dharmadom$/i, 'Dharmadam'],
  [/^pudukkad$/i, 'Puthukkad'],
];

const WB_PRESS_SYNONYMS = [
  [/^(krishnanagar uttar)$/i, 'Krishnanagar Uttar'],
  [/^(krishnanagar dakshin)$/i, 'Krishnanagar Dakshin'],
];

const WB_PARTY_FIELDS = [
  ['congress', 'INC'],
  ['bjp', 'BJP'],
  ['cpim', 'CPI(M)'],
  ['tmc', 'TMC'],
];

function announcedRow(party, nameUpper, rawNameForSex) {
  return {
    position: 0,
    name: nameUpper,
    party,
    votes: 0,
    voteShare: 0,
    margin: null,
    marginPct: null,
    sex: inferSexFromAnnouncedName(rawNameForSex ?? nameUpper),
    age: 0,
    depositLost: false,
    announced: true,
  };
}

function usableCell(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/^[*_\-–—]+$/u.test(t)) return false;
  if (t === '***') return false;
  return true;
}

function resolveWbId(acNo, label, wbJson, wbAcMap, wbDup) {
  const id = `WB-${String(acNo).padStart(3, '0')}`;
  if (wbJson[id]) return { ok: true, id };
  return resolvePressToAcId(label, wbAcMap, wbDup, WB_PRESS_SYNONYMS);
}

function main() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const wbSrc = JSON.parse(fs.readFileSync(WB_SRC, 'utf8'));
  const klSrc = JSON.parse(fs.readFileSync(KL_SRC, 'utf8'));
  const wbJson = JSON.parse(fs.readFileSync(WB_OUT, 'utf8'));
  const klJson = JSON.parse(fs.readFileSync(KL_OUT, 'utf8'));

  const wbAcMap = buildAcKeyMapForState(schema, 'WB');
  const wbDup = new Map();
  const wbFailures = [];
  const wbById = new Map();

  for (const r of wbSrc.rows || []) {
    const res = resolveWbId(r.acNo, r.constituencyLabel, wbJson, wbAcMap, wbDup);
    if (!res.ok) {
      wbFailures.push({ row: r, ...res });
      continue;
    }
    const id = res.id;
    if (!wbById.has(id)) wbById.set(id, []);
    const list = wbById.get(id);
    for (const [field, party] of WB_PARTY_FIELDS) {
      if (!usableCell(r[field])) continue;
      list.push(announcedRow(party, toEciStyleName(r[field]), r[field]));
    }
  }

  if (wbFailures.length) {
    console.error('WB mapping failures:', wbFailures.slice(0, 25));
    console.error(`... total ${wbFailures.length}`);
    process.exit(1);
  }

  const klAcMap = buildAcKeyMapForState(schema, 'KL');
  const klDup = new Map();
  const klFailures = [];
  const klById = new Map();

  for (const r of klSrc.rows || []) {
    if (!r?.constituency || !usableCell(r.candidate)) continue;
    const res = resolvePressToAcId(r.constituency, klAcMap, klDup, KL_PRESS_SYNONYMS);
    if (!res.ok) {
      klFailures.push({ row: r, ...res });
      continue;
    }
    const id = res.id;
    if (!klById.has(id)) klById.set(id, []);
    const party = String(r.party || 'OTH').trim().slice(0, 24);
    klById.get(id).push(announcedRow(party, toEciStyleName(r.candidate), r.candidate));
  }

  if (klFailures.length) {
    console.error('KL mapping failures:', klFailures.slice(0, 40));
    console.error(`... total ${klFailures.length}`);
    process.exit(1);
  }

  let wbWith = 0;
  for (const k of Object.keys(wbJson)) {
    if (!/^WB-\d+$/.test(k)) continue;
    const entry = wbJson[k];
    if (!entry || typeof entry !== 'object') continue;
    const rows = wbById.get(k) || [];
    rows.sort((a, b) => (a.party + a.name).localeCompare(b.party + b.name));
    rows.forEach((row, i) => {
      row.position = i + 1;
    });
    entry.resultsPending = true;
    entry.candidates = rows;
    entry.totalCandidates = rows.length;
    if (rows.length) wbWith++;
  }

  let klWith = 0;
  for (const k of Object.keys(klJson)) {
    if (!/^KL-\d+$/.test(k)) continue;
    const entry = klJson[k];
    if (!entry || typeof entry !== 'object') continue;
    const rows = klById.get(k) || [];
    rows.sort((a, b) => (a.party + a.name).localeCompare(b.party + b.name));
    rows.forEach((row, i) => {
      row.position = i + 1;
    });
    entry.resultsPending = true;
    entry.candidates = rows;
    entry.totalCandidates = rows.length;
    if (rows.length) klWith++;
  }

  const now = new Date().toISOString().slice(0, 10);
  wbJson._meta = wbJson._meta || {};
  wbJson._meta.resultsPending = true;
  wbJson._meta.targetYear = 2026;
  wbJson._meta.candidatesPolicy = 'announced_only';
  wbJson._meta.wbVoterlistMasterAnnounced = {
    source: wbSrc._meta?.source,
    articleUrl: wbSrc._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsInSource: (wbSrc.rows || []).length,
    acsWithAnyCandidate: wbWith,
    note: 'Congress, BJP, CPI(M), TMC from voterlist master table; AC serial falls back to name when WB-NNN missing in dataset.',
  };
  wbJson._meta.description =
    '2026 West Bengal assembly election. Vote totals not yet counted. Announced candidates (Congress, BJP, CPI(M), TMC) from voterlist.co.in master table — see wbVoterlistMasterAnnounced.';
  wbJson._meta.lastUpdated = now;

  klJson._meta = klJson._meta || {};
  klJson._meta.resultsPending = true;
  klJson._meta.targetYear = 2026;
  klJson._meta.candidatesPolicy = 'announced_only';
  klJson._meta.klVoterlistAnnounced = {
    sources: klSrc._meta?.source,
    articleUrls: klSrc._meta?.articleUrls,
    mergedAt: new Date().toISOString(),
    rowCounts: klSrc._meta?.rowCounts,
    acsWithAnyCandidate: klWith,
    note: 'UDF + LDF (CPM page) + partial BJP from voterlist.co.in; multiple parties per AC where listed.',
  };
  klJson._meta.description =
    '2026 Kerala assembly election. Vote totals not yet counted. Announced candidates from voterlist UDF/LDF/BJP tables — see klVoterlistAnnounced.';
  klJson._meta.lastUpdated = now;

  fs.writeFileSync(WB_OUT, JSON.stringify(wbJson) + '\n');
  fs.writeFileSync(KL_OUT, JSON.stringify(klJson) + '\n');
  console.log(`Wrote WB/2026.json — ${wbWith} ACs with ≥1 candidate`);
  console.log(`Wrote KL/2026.json — ${klWith} ACs with ≥1 candidate`);
}

main();
