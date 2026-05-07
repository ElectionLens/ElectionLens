#!/usr/bin/env node
/**
 * Fetch May 2026 assembly election results from results.eci.gov.in (ResultAcGenMay2026)
 * and write public/data/elections/ac/{STATE}/2026.json in ElectionLens schema.
 *
 * Requires browser-like User-Agent (Akamai blocks bare fetch otherwise).
 *
 * Usage:
 *   node scripts/fetch-may2026-assembly-from-eci.mjs              # all five states
 *   node scripts/fetch-may2026-assembly-from-eci.mjs --states TN,WB
 *   node scripts/fetch-may2026-assembly-from-eci.mjs --poll 180   # repeat every 180s
 *   node scripts/fetch-may2026-assembly-from-eci.mjs --dry-run    # parse only, no write
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { inferSexFromAnnouncedName } from './lib/infer-candidate-sex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const AC_BASE = path.join(REPO_ROOT, 'public', 'data', 'elections', 'ac');

const BASE = 'https://results.eci.gov.in/ResultAcGenMay2026';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${BASE}/index.htm`,
};

/** ECI multi-state live blob (optional diagnostics) */
const LIVE_JSON = `${BASE}/election-json-S25-live.json`;

const STATES = {
  TN: {
    code: 'TN',
    eciPrefix: 'S22',
    stateName: 'Tamil Nadu',
    slug: 'tamil-nadu',
    expectedAc: 234,
  },
  AS: {
    code: 'AS',
    eciPrefix: 'S03',
    stateName: 'Assam',
    slug: 'assam',
    expectedAc: 126,
  },
  KL: {
    code: 'KL',
    eciPrefix: 'S11',
    stateName: 'Kerala',
    slug: 'kerala',
    expectedAc: 140,
  },
  WB: {
    code: 'WB',
    eciPrefix: 'S25',
    stateName: 'West Bengal',
    slug: 'west-bengal',
    expectedAc: 294,
  },
  PY: {
    code: 'PY',
    eciPrefix: 'U07',
    stateName: 'Puducherry',
    slug: 'puducherry',
    expectedAc: 30,
  },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function statewiseUrl(eciPrefix, pageNum) {
  return `${BASE}/statewise${eciPrefix}${pageNum}.htm`;
}

function candidatesUrl(eciPrefix, eciAcNo) {
  return `${BASE}/candidateswise-${eciPrefix}${eciAcNo}.htm`;
}

/** Extract max pagination page number from statewise HTML (href='statewiseS2212.htm' → 12) */
function extractMaxPage(html, eciPrefix) {
  const esc = eciPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`statewise${esc}(\\d+)\\.htm`, 'g');
  let max = 1;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Rows: { name, eciNo } from main listing table */
function parseStatewiseRows(html) {
  const rows = [];
  const rowRe = /<tr><td align='left'>([^<]+)<\/td><td align='right'>(\d+)<\/td>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const name = m[1].trim();
    const eciNo = parseInt(m[2], 10);
    if (!name || !eciNo) continue;
    if (name.length < 3) continue;
    rows.push({ name, eciNo });
  }
  return rows;
}

function calcEnop(cands) {
  const total = cands.reduce((s, c) => s + c.votes, 0);
  if (total <= 0) return 0;
  let sumSq = 0;
  for (const c of cands) {
    const sh = c.votes / total;
    sumSq += sh * sh;
  }
  return sumSq > 0 ? Math.round((1 / sumSq) * 100) / 100 : 0;
}

/** Lowercase ECI party label → TCPD-style abbreviation (Tamil Nadu exports match 2021 files). */
const TN_PARTY_ABBREV = Object.freeze({
  'dravida munnetra kazhagam': 'DMK',
  'all india anna dravida munnetra kazhagam': 'AIADMK',
  'tamilaga vettri kazhagam': 'TVK',
  'naam tamilar katchi': 'NTK',
  'pattali makkal katchi': 'PMK',
  'desiya murpokku dravida kazhagam': 'DMDK',
  'viduthalai chiruthaigal katchi': 'VCK',
  'marumalarchi dravida munnetra kazhagam': 'MDMK',
  'makkal needhi maiam': 'MNM',
  'amma makkal munnetra kazhagam': 'AMMK',
  'bharatiya janata party': 'BJP',
  'indian national congress': 'INC',
  'communist party of india (marxist)': 'CPM',
  'communist party of india': 'CPI',
  'bahujan samaj party': 'BSP',
  'naadaalum makkal katchi': 'NMK',
  'puthiya tamilagam': 'PT',
  'manithaneya jananayaga katchi': 'MJK',
  'tamizhaga maanila congress': 'TMC(M)',
  'tamil maanila congress (moopanar)': 'TMC(M)',
  'tamizhaga vaazhvurimai katchi': 'TNLK',
  'thamizhaga vazhvurimai katchi': 'TNLK',
  'indhu dravida makkal katchi': 'INDHU',
  'ind': 'IND',
  independent: 'IND',
  nota: 'NOTA',
  'none of the above': 'NOTA',
});

function abbrevPartyTn(raw) {
  const p = raw.trim();
  if (!p) return p;
  const k = p.toLowerCase().replace(/\s+/g, ' ').trim();
  return TN_PARTY_ABBREV[k] ?? p;
}

/**
 * Parse candidateswise HTML into structured result.
 * ECI May2026 final layout: votes in `<div class='cand-info'>…<div class='status …'><div>94320 <span>(+ …)</span></div>`;
 * older/trend layout used `<div>VOTES <span>( share % )</span></div>`.
 */
function parseCandidatesHtml(html) {
  const title = html.match(/Assembly Constituency <span>\s*(\d+)\s*-\s*([\s\S]*?)<\/span>/);
  let assemblyNo = title ? parseInt(title[1], 10) : 0;
  let assemblyRaw = title ? title[2].trim() : '';
  assemblyRaw = assemblyRaw.replace(/<strong>[\s\S]*$/i, '').trim();

  const candidates = [];
  const segments = html.split(/<div[^>]*class=['"]cand-box['"]/gi).slice(1);
  for (const seg of segments) {
    const nameM = seg.match(/<h5>([^<]*)<\/h5>/);
    const partyM = seg.match(/<h6>([^<]*)<\/h6>/);
    if (!nameM || !partyM) continue;

    let votes = 0;
    const candInfoIdx = seg.indexOf("<div class='cand-info'");
    const candInfoIdx2 = candInfoIdx >= 0 ? candInfoIdx : seg.indexOf('<div class="cand-info"');
    const infoIdx = candInfoIdx >= 0 ? candInfoIdx : candInfoIdx2;
    if (infoIdx >= 0) {
      const afterInfo = seg.slice(infoIdx);
      const vm = afterInfo.match(/<div>([\d,]+)\s*<span>/);
      if (vm) votes = parseInt(vm[1].replace(/,/g, ''), 10) || 0;
    }
    if (!votes) {
      const voteM = seg.match(/<div>([\d,]+)\s*<span>\(\s*([\d.]+)\s*\)<\/span><\/div>/);
      if (voteM) votes = parseInt(voteM[1].replace(/,/g, ''), 10) || 0;
    }

    const nm = nameM[1].trim().toUpperCase();
    const party = partyM[1].trim();
    if (!nm && party === '') continue;
    candidates.push({
      name: nm,
      party,
      votes,
      voteShare: 0,
      sex: inferSexFromAnnouncedName(nm),
      age: null,
      depositLost: false,
    });
  }

  candidates.sort((a, b) => b.votes - a.votes);
  const totalVotes = candidates.reduce((s, c) => s + c.votes, 0);
  candidates.forEach((c, i) => {
    c.position = i + 1;
    if (totalVotes > 0) c.voteShare = Math.round((c.votes / totalVotes) * 10000) / 100;
    else c.voteShare = 0;
  });
  if (candidates.length >= 2) {
    candidates[0].margin = candidates[0].votes - candidates[1].votes;
    const mPct =
      totalVotes > 0 ? ((candidates[0].margin / totalVotes) * 100).toFixed(2) : '0';
    candidates[0].marginPct = parseFloat(mPct);
    candidates[1].margin = null;
    candidates[1].marginPct = null;
  }
  for (let i = 2; i < candidates.length; i++) {
    candidates[i].margin = null;
    candidates[i].marginPct = null;
  }
  for (const c of candidates) {
    c.depositLost = (c.voteShare ?? 0) < 16.67 && c.position > 1;
  }

  const enop = calcEnop(candidates);

  return {
    assemblyNo,
    assemblyName: assemblyRaw,
    validVotes: totalVotes,
    totalCandidates: candidates.length,
    candidates,
    enop,
  };
}

function reservationFromName(name) {
  const u = name.toUpperCase();
  if (/\(SC\)|\(SC \)/.test(u)) return 'SC';
  if (/\(ST\)|\(ST \)/.test(u)) return 'ST';
  return 'GEN';
}

function stripReservationSuffix(name) {
  return name.replace(/\s*\((SC|ST)\)\s*$/i, '').trim();
}

/** Title Case for display `name` field (matches existing TCPD exports). */
function displayNameFromUpper(u) {
  const s = stripReservationSuffix(u).toLowerCase().replace(/\s+/g, ' ');
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function buildEntry(year, stateCfg, parsed, eciNo) {
  const cleanName = stripReservationSuffix(parsed.assemblyName || '').toUpperCase();
  const ctype = reservationFromName(parsed.assemblyName || '');
  const serial = parsed.assemblyNo || eciNo;
  const schemaId = `${stateCfg.code}-${String(serial).padStart(3, '0')}`;
  const candidates =
    stateCfg.code === 'TN'
      ? parsed.candidates.map((c) => ({ ...c, party: abbrevPartyTn(c.party) }))
      : parsed.candidates;

  return {
    year,
    constituencyNo: serial,
    constituencyName: cleanName,
    constituencyNameOriginal: cleanName,
    constituencyType: ctype,
    districtName: '',
    validVotes: parsed.validVotes,
    electors: 0,
    turnout: 0,
    enop: parsed.enop,
    totalCandidates: candidates.length,
    candidates,
    schemaId,
    name: displayNameFromUpper(parsed.assemblyName || cleanName),
    type: ctype,
  };
}

/** Copy district + electors from a prior-year assembly file (same schema keys), recompute turnout from new validVotes. */
function enrichFromPriorAssemblyYear(out, stateCode, priorYear) {
  const prevPath = path.join(AC_BASE, stateCode, `${priorYear}.json`);
  if (!fs.existsSync(prevPath)) return;
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
  } catch {
    return;
  }
  for (const [k, row] of Object.entries(out)) {
    if (k.startsWith('_') || !row || typeof row !== 'object') continue;
    const ref = prev[k];
    if (!ref || typeof ref !== 'object') continue;
    if (typeof ref.districtName === 'string' && ref.districtName.trim()) {
      row.districtName = ref.districtName;
    }
    if (typeof ref.electors === 'number' && ref.electors > 0) {
      row.electors = ref.electors;
      if (typeof row.validVotes === 'number' && row.validVotes > 0) {
        row.turnout = Math.round((row.validVotes / ref.electors) * 10000) / 100;
      }
    }
  }
}

async function collectAllRows(eciPrefix) {
  const first = await fetchText(statewiseUrl(eciPrefix, 1));
  const maxPage = extractMaxPage(first, eciPrefix);
  const all = [];
  const seen = new Set();
  for (let p = 1; p <= maxPage; p++) {
    const html = p === 1 ? first : await fetchText(statewiseUrl(eciPrefix, p));
    const rows = parseStatewiseRows(html);
    for (const r of rows) {
      const k = `${r.name}|${r.eciNo}`;
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(r);
    }
    await sleep(100);
  }
  return all;
}

async function fetchState(year, stateKey, stateCfg, opts) {
  const { dryRun, delayMs } = opts;
  console.log(`\n=== ${stateKey} (${stateCfg.stateName}) ===`);

  let liveNote = '';
  try {
    const lj = await fetchText(LIVE_JSON);
    const j = JSON.parse(lj);
    const block = j[stateCfg.eciPrefix];
    if (block?.tableData?.length) {
      liveNote = ` (ECI live tableData: ${block.tableData.length} rows)`;
    }
  } catch {
    /* ignore */
  }
  console.log(`Listing constituencies…${liveNote}`);

  const rows = await collectAllRows(stateCfg.eciPrefix);
  console.log(`Found ${rows.length} constituencies in statewise tables.`);

  const out = {};
  let ok = 0;
  let fail = 0;

  for (const { name, eciNo } of rows) {
    const url = candidatesUrl(stateCfg.eciPrefix, eciNo);
    try {
      const html = await fetchText(url);
      if (!html.includes("cand-box")) {
        console.warn(`  Skip ${eciNo} ${name}: no cand-box`);
        fail++;
        continue;
      }
      const parsed = parseCandidatesHtml(html);
      const key = `${stateCfg.code}-${String(parsed.assemblyNo || eciNo).padStart(3, '0')}`;
      out[key] = buildEntry(year, stateCfg, parsed, eciNo);
      ok++;
      if (ok % 25 === 0) console.log(`  … ${ok} ACs parsed`);
    } catch (e) {
      console.warn(`  FAIL ${eciNo} ${name}: ${e.message}`);
      fail++;
    }
    await sleep(delayMs ?? 120);
  }

  console.log(`Done ${stateKey}: ${ok} ok, ${fail} failed.`);

  if (!dryRun && Object.keys(out).length > 0) {
    if (stateCfg.code === 'TN') {
      enrichFromPriorAssemblyYear(out, 'TN', 2021);
    } else if (
      stateCfg.code === 'KL' ||
      stateCfg.code === 'WB' ||
      stateCfg.code === 'PY' ||
      stateCfg.code === 'AS'
    ) {
      enrichFromPriorAssemblyYear(out, stateCfg.code, 2021);
    }
    if (
      stateCfg.code === 'TN' ||
      stateCfg.code === 'KL' ||
      stateCfg.code === 'WB' ||
      stateCfg.code === 'PY' ||
      stateCfg.code === 'AS'
    ) {
      out._meta = {
        resultsPending: false,
        lastUpdated: new Date().toISOString(),
      };
    }
    const dir = path.join(AC_BASE, stateCfg.code);
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `${year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
    console.log(`Wrote ${outPath}`);

    const idxPath = path.join(dir, 'index.json');
    let idx = {};
    if (fs.existsSync(idxPath)) {
      idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    }
    idx.state = stateCfg.stateName;
    idx.stateCode = stateCfg.code;
    idx.stateSlug = stateCfg.slug;
    idx.delimitation = idx.delimitation ?? 2008;
    idx.totalConstituencies = Object.keys(out).filter((k) => !k.startsWith('_')).length;
    idx.lastUpdated = new Date().toISOString();
    idx.source = 'ECI ResultAcGenMay2026 (live import)';
    const years = new Set(idx.availableYears || []);
    years.add(year);
    idx.availableYears = [...years].sort((a, b) => a - b);
    idx.years = idx.availableYears;
    fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n');
    console.log(`Updated ${idxPath}`);
  }

  return { ok, fail, count: Object.keys(out).length };
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let states = Object.keys(STATES);
  let pollSec = 0;
  let dryRun = false;
  let delayMs = 120;
  const year = 2026;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--states' && argv[i + 1]) {
      states = argv[++i].split(',').map((s) => s.trim().toUpperCase());
    } else if (a === '--poll' && argv[i + 1]) {
      pollSec = parseInt(argv[++i], 10);
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--delay' && argv[i + 1]) {
      delayMs = parseInt(argv[++i], 10);
    }
  }

  for (const s of states) {
    if (!STATES[s]) {
      console.error(`Unknown state key: ${s}. Use: ${Object.keys(STATES).join(', ')}`);
      process.exit(1);
    }
  }

  return { states, pollSec, dryRun, delayMs, year };
}

async function runOnce(opts) {
  const summary = [];
  for (const key of opts.states) {
    const r = await fetchState(opts.year, key, STATES[key], opts);
    summary.push({ key, ...r });
  }
  return summary;
}

async function main() {
  const opts = parseArgs();
  console.log('ECI May 2026 assembly fetch → public/data/elections/ac/*/2026.json');
  console.log(`States: ${opts.states.join(', ')} | dryRun=${opts.dryRun} | delay=${opts.delayMs}ms`);

  if (opts.pollSec > 0) {
    console.log(`Polling every ${opts.pollSec}s (Ctrl+C to stop).`);
    for (;;) {
      await runOnce(opts);
      console.log('\n--- cycle complete ---');
      await sleep(opts.pollSec * 1000);
    }
  } else {
    await runOnce(opts);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
