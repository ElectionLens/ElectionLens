#!/usr/bin/env node
/**
 * Extract Vellore PC 2019 from "33. Constituency Wise Detailed Result.csv"
 * and add TN-08 to public/data/elections/pc/TN/2019.json
 *
 * AC-wise split (in order of precedence):
 * 1. AC_WISE_CSV: CSV with candidate-wise votes per AC (State, PC, AC Name, Candidate, Party, Votes).
 * 2. "15. Assembly Segment Wise Information Electors.csv" in same folder as main CSV: uses votes
 *    polled per AC to distribute each candidate's votes proportionally across ACs.
 * 3. Else: equal split across 6 ACs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSV_PATH = process.env.CSV_PATH || '/Users/p0s097d/Desktop/Dropbox/33. Constituency Wise Detailed Result.csv';
const CSV_DIR = path.dirname(CSV_PATH);
const AC_WISE_CSV = process.env.AC_WISE_CSV || process.argv[2];
const ASSEMBLY_ELECTORS_CSV = process.env.ASSEMBLY_ELECTORS_CSV || path.join(CSV_DIR, '15. Assembly Segment Wise Information Electors.csv');
const TN_2019_JSON = path.join(__dirname, '../public/data/elections/pc/TN/2019.json');

// Normalize AC names from CSV to schema names (e.g. "Gudiyatham (SC)" -> "Gudiyattam")
const AC_NAME_NORM = {
  gudiyatham: 'Gudiyattam',
  'gudiyattam (sc)': 'Gudiyattam',
  kilvaithinankuppam: 'Kilvaithinankuppam',
  'kilvaithinankuppam (sc)': 'Kilvaithinankuppam',
  vellore: 'Vellore',
  anaikattu: 'Anaikattu',
  ambur: 'Ambur',
  vaniyambadi: 'Vaniyambadi',
};
function normAcName(name) {
  const k = norm(name).replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase();
  return AC_NAME_NORM[k] || (name ? name.trim() : '');
}

// Vellore PC (TN-08) AC names from schema
const VELLORE_ACS = [
  'Kilvaithinankuppam',
  'Gudiyattam',
  'Vellore',
  'Anaikattu',
  'Ambur',
  'Vaniyambadi',
];

const PARTY_ABBREV = {
  dmk: 'DMK', aiadmk: 'ADMK', admk: 'ADMK', inc: 'INC', congress: 'INC', bjp: 'BJP',
  ntk: 'NTK', mnm: 'MNM', pmk: 'PMK', cpi: 'CPI', 'cpi(m)': 'CPI(M)', cpim: 'CPI(M)',
  independent: 'IND', ind: 'IND', nota: 'NOTA', 'none of the above': 'NOTA',
};

function getPartyAbbrev(party) {
  const p = (party || '').toString().trim().toLowerCase();
  return PARTY_ABBREV[p] || (p.length > 15 ? p.substring(0, 15) : party?.trim() || 'IND');
}

function norm(s) {
  return (s != null && s !== undefined) ? String(s).trim() : '';
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === ',' && !inQuotes) || (char === '\n' && !inQuotes)) {
      result.push(current.trim());
      current = '';
      if (char === '\n') break;
    } else {
      current += char;
    }
  }
  if (current !== '' || result.length > 0) result.push(current.trim());
  return result;
}

/**
 * Load AC-wise votes from optional CSV. Returns Map: "candidateName|party" -> Map(acName -> votes).
 * CSV should have: State, PC Name, AC Name (or Assembly Constituency), Candidate, Party, Votes.
 */
function loadAcWiseFromCsv(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return null;
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = parseCSVLine(lines[0]);
  const col = {
    state: header.findIndex((h) => /state/i.test(norm(h))),
    pcName: header.findIndex((h) => /pc|parliamentary|constituency/i.test(norm(h)) && !/assembly|ac/i.test(norm(h))),
    acName: header.findIndex((h) => /ac\s*name|assembly\s*constituency|assembly\s*name/i.test(norm(h))),
    candidate: header.findIndex((h) => /candidate|name/i.test(norm(h)) && !/constituency|party|pc|ac/i.test(norm(h))),
    party: header.findIndex((h) => /party/i.test(norm(h))),
    votes: header.findIndex((h) => /votes|total/i.test(norm(h)) && !/elector/i.test(norm(h))),
  };
  if (col.candidate < 0 || col.votes < 0) return null;
  if (col.acName < 0) col.acName = header.findIndex((h) => /ac|assembly/i.test(norm(h)));
  const acWise = new Map(); // key = "cand|party" -> Map(acName -> votes)
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(col.candidate, col.party, col.votes) + 1) continue;
    const state = norm(row[col.state]);
    const pc = norm(row[col.pcName]);
    if (!/tamil|tn/i.test(state) || !/vellore/i.test(pc)) continue;
    const cand = norm(row[col.candidate]);
    const party = norm(row[col.party]);
    const acName = normAcName(row[col.acName] || '');
    if (!acName) continue;
    let v = 0;
    try {
      v = parseInt(String(row[col.votes] || '').replace(/,/g, ''), 10) || 0;
    } catch (_) {}
    const key = `${cand}|${getPartyAbbrev(party)}`;
    if (!acWise.has(key)) acWise.set(key, new Map());
    const perAc = acWise.get(key);
    perAc.set(acName, (perAc.get(acName) || 0) + v);
  }
  return acWise.size ? acWise : null;
}

/**
 * Load AC-wise votes polled from "15. Assembly Segment Wise Information Electors.csv".
 * Returns { acOrder: string[], votesPerAc: number[] } for Vellore PC, or null.
 * Last column is TOTAL votes polled per AC.
 */
function loadAcProportionsFromElectorsCsv(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return null;
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 7) return null;
  const header = parseCSVLine(lines[5]);
  let colState = header.findIndex((h) => /state/i.test(norm(h)));
  let colAcName = header.findIndex((h) => /ac\s*name/i.test(norm(h)));
  let colPcName = header.findIndex((h) => /pc\s*name/i.test(norm(h)));
  const colTotal = header.length - 1;
  if (colState < 0) colState = 0;
  if (colAcName < 0) colAcName = 1;
  if (colPcName < 0) colPcName = 2;
  if (colTotal < 0) return null;
  const acOrder = [];
  const votesPerAc = [];
  for (let i = 6; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length <= Math.max(colPcName, colTotal)) continue;
    const state = norm(row[colState]);
    const pc = norm(row[colPcName]);
    const acName = norm(row[colAcName]);
    if (!/tamil|tn/i.test(state) || !/^vellore$/i.test(pc)) continue;
    if (/votes not retrieved|rejected/i.test(acName)) continue;
    const n = normAcName(acName) || acName;
    if (!n) continue;
    let v = 0;
    try {
      v = parseInt(String(row[colTotal] || '').replace(/,/g, ''), 10) || 0;
    } catch (_) {}
    acOrder.push(n);
    votesPerAc.push(v);
  }
  if (acOrder.length === 0) return null;
  return { acOrder, votesPerAc };
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('File not found:', CSV_PATH);
    process.exit(1);
  }

  console.log('Reading', CSV_PATH, '...');
  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCSVLine(lines[2]); // row 3 is header (0-indexed 2)
  const rows = [];
  for (let i = 3; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length >= 10) rows.push(cells);
  }

  const col = {
    state: header.findIndex((h) => /state\s*name/i.test(norm(h))),
    pcName: header.findIndex((h) => /pc\s*name|parliamentary.*name/i.test(norm(h))),
    candidate: header.findIndex((h) => /candidates?\s*name/i.test(norm(h))),
    party: header.findIndex((h) => /party\s*name/i.test(norm(h))),
    general: header.findIndex((h) => /^general$/i.test(norm(h))),
    total: header.findIndex((h) => /^total$/i.test(norm(h))),
  };
  if (col.state < 0) col.state = 0;
  if (col.pcName < 0) col.pcName = 1;
  if (col.candidate < 0) col.candidate = 2;
  if (col.party < 0) col.party = 6;
  if (col.general < 0) col.general = 8;
  if (col.total < 0) col.total = 10;

  const filtered = rows.filter((r) => {
    const state = norm(r[col.state]);
    const pc = norm(r[col.pcName]);
    return /tamil\s*nadu|tn/i.test(state) && /^vellore$/i.test(pc);
  });

  console.log('Vellore rows:', filtered.length);
  if (filtered.length === 0) {
    console.error('No Vellore data found.');
    process.exit(1);
  }

  const candidates = [];
  let validVotes = 0;
  for (const row of filtered) {
    const cand = norm(row[col.candidate]);
    const party = norm(row[col.party]);
    let v = 0;
    const totalVal = row[col.total];
    const generalVal = row[col.general];
    if (totalVal !== undefined && totalVal !== '') {
      v = parseInt(String(totalVal).replace(/,/g, ''), 10) || 0;
    }
    if (v === 0 && generalVal !== undefined) {
      v = parseInt(String(generalVal).replace(/,/g, ''), 10) || 0;
    }
    validVotes += v;
    candidates.push({
      name: cand,
      party: getPartyAbbrev(party),
      partyRaw: party,
      votes: v,
    });
  }

  candidates.sort((a, b) => b.votes - a.votes);

  const margin = candidates.length >= 2 ? candidates[0].votes - candidates[1].votes : 0;
  const marginPct = validVotes ? (margin / validVotes) * 100 : 0;
  const shares = candidates.map((c) => (validVotes ? (c.votes / validVotes) * 100 : 0));
  const enop =
    shares.reduce((a, b) => a + b * b, 0) > 0 ? 1 / shares.reduce((a, b) => a + b * b, 0) : 0;

  const numACs = VELLORE_ACS.length;
  const acWiseMap = loadAcWiseFromCsv(AC_WISE_CSV);
  const acProportions = !acWiseMap ? loadAcProportionsFromElectorsCsv(ASSEMBLY_ELECTORS_CSV) : null;
  if (acWiseMap) {
    console.log('Using AC-wise data from', AC_WISE_CSV);
  } else if (acProportions) {
    const total = acProportions.votesPerAc.reduce((a, b) => a + b, 0);
    console.log('Using AC proportions from', ASSEMBLY_ELECTORS_CSV, '(total votes polled:', total, ')');
  }

  const acOrder = acWiseMap
    ? [...VELLORE_ACS]
    : acProportions
      ? acProportions.acOrder
      : [...VELLORE_ACS];
  const votesPerAcProportion = acProportions
    ? (() => {
        const total = acProportions.votesPerAc.reduce((a, b) => a + b, 0);
        return total ? acProportions.votesPerAc.map((v) => v / total) : null;
      })()
    : null;

  const acTotalsByAc = acWiseMap
    ? new Map(
        acOrder.map((acName) => {
          const n = normAcName(acName) || acName;
          const total = [...acWiseMap.values()].reduce(
            (sum, m) => sum + (m.get(n) ?? m.get(acName) ?? 0),
            0
          );
          return [acName, total];
        })
      )
    : null;

  const outCandidates = candidates.map((c, pos) => {
    let acWiseVotes;
    if (acWiseMap) {
      const key = `${c.name}|${c.party}`;
      const perAc = acWiseMap.get(key);
      if (perAc && perAc.size > 0) {
        acWiseVotes = acOrder.map((acName) => {
          const n = normAcName(acName) || acName;
          const vAc = perAc.get(n) ?? perAc.get(acName) ?? 0;
          const acTotal = acTotalsByAc?.get(acName) ?? 0;
          const vsAc = acTotal ? (vAc / acTotal) * 100 : 0;
          return { acName, votes: vAc, voteShare: Math.round(vsAc * 100) / 100 };
        });
      } else {
        acWiseVotes = equalSplitAcVotes(c.votes, validVotes, acOrder);
      }
    } else if (votesPerAcProportion && votesPerAcProportion.length === acOrder.length) {
      acWiseVotes = acOrder.map((acName, idx) => {
        const vAc = Math.round(c.votes * votesPerAcProportion[idx]);
        const acTotal = Math.round(validVotes * votesPerAcProportion[idx]);
        const vsAc = acTotal ? (vAc / acTotal) * 100 : 0;
        return { acName, votes: vAc, voteShare: Math.round(vsAc * 100) / 100 };
      });
    } else {
      acWiseVotes = equalSplitAcVotes(c.votes, validVotes, acOrder);
    }
    return {
      name: c.name,
      party: c.party,
      votes: c.votes,
      position: pos + 1,
      voteShare: Math.round((c.votes / validVotes) * 100 * 100) / 100,
      margin: pos === 0 ? margin : 0,
      marginPct: pos === 0 ? Math.round(marginPct * 100) / 100 : 0,
      sex: 'M',
      age: null,
      depositLost: pos >= 3,
      acWiseVotes,
    };
  });

  function equalSplitAcVotes(votes, total, acs) {
    const votesPerAc = total / acs.length;
    return acs.map((acName) => ({
      acName,
      votes: Math.round(votes / acs.length),
      voteShare: votesPerAc ? Math.round((votes / acs.length / votesPerAc) * 100 * 100) / 100 : 0,
    }));
  }

  const acWiseResults = {};
  if (acWiseMap) {
    const acTotals = new Map();
    for (const acName of acOrder) {
      const n = normAcName(acName) || acName;
      let total = 0;
      for (const perAc of acWiseMap.values()) {
        total += perAc.get(n) ?? perAc.get(acName) ?? 0;
      }
      acTotals.set(acName, total);
      acTotals.set(n, total);
    }
    for (const acName of acOrder) {
      const n = normAcName(acName) || acName;
      const acTotal = acTotals.get(acName) || acTotals.get(n) || 0;
      const acCands = outCandidates.map((c) => {
        const key = `${c.name}|${c.party}`;
        const perAc = acWiseMap.get(key);
        const vAc = perAc ? (perAc.get(n) ?? perAc.get(acName) ?? 0) : Math.round(c.votes / numACs);
        const voteShare = acTotal ? (vAc / acTotal) * 100 : (numACs ? (vAc / (validVotes / numACs)) * 100 : 0);
        return {
          name: c.name,
          party: c.party,
          votes: vAc,
          position: 0,
          voteShare: Math.round(voteShare * 100) / 100,
          sex: 'M',
          depositLost: c.depositLost,
        };
      });
      acCands.sort((a, b) => b.votes - a.votes);
      acCands.forEach((ac, i) => {
        ac.position = i + 1;
      });
      acWiseResults[acName] = {
        acName,
        acNo: acOrder.indexOf(acName) + 1,
        acType: acOrder.indexOf(acName) < 2 ? 'SC' : 'GEN',
        validVotes: acTotal,
        candidates: acCands,
      };
    }
  } else {
    const proportions = votesPerAcProportion && votesPerAcProportion.length === acOrder.length
      ? votesPerAcProportion
      : acOrder.map(() => 1 / acOrder.length);
    acOrder.forEach((acName, idx) => {
      const p = proportions[idx];
      const acTotal = Math.round(validVotes * p);
      const acCands = outCandidates.map((c) => {
        const vAc = Math.round(c.votes * p);
        const voteShare = acTotal ? (vAc / acTotal) * 100 : 0;
        return {
          name: c.name,
          party: c.party,
          votes: vAc,
          position: 0,
          voteShare: Math.round(voteShare * 100) / 100,
          sex: 'M',
          depositLost: c.depositLost,
        };
      });
      acCands.sort((a, b) => b.votes - a.votes);
      acCands.forEach((ac, i) => {
        ac.position = i + 1;
      });
      acWiseResults[acName] = {
        acName,
        acNo: idx + 1,
        acType: /kilvaithinankuppam|gudiyattam/i.test(acName) ? 'SC' : 'GEN',
        validVotes: acTotal,
        candidates: acCands,
      };
    });
  }

  const tn08 = {
    year: 2019,
    constituencyNo: 8,
    constituencyName: 'VELLORE',
    constituencyNameOriginal: 'Vellore',
    constituencyType: 'GEN',
    stateName: 'Tamil_Nadu',
    validVotes,
    electors: 0,
    turnout: 0,
    enop: Math.round(enop * 100) / 100,
    totalCandidates: outCandidates.length,
    candidates: outCandidates,
    assemblyConstituencies: VELLORE_ACS,
    acWiseResults,
    schemaId: 'TN-08',
    name: 'Vellore',
    type: 'GEN',
  };

  const tn2019 = JSON.parse(fs.readFileSync(TN_2019_JSON, 'utf8'));
  tn2019['TN-08'] = tn08;
  const sorted = Object.keys(tn2019).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10);
    const nb = parseInt(b.replace(/\D/g, ''), 10);
    return na - nb;
  });
  const out = {};
  for (const k of sorted) {
    out[k] = tn2019[k];
  }
  fs.writeFileSync(TN_2019_JSON, JSON.stringify(out, null, 2), 'utf8');
  console.log('Added TN-08 (Vellore) to', TN_2019_JSON);
  console.log('Valid votes:', validVotes, 'Candidates:', outCandidates.length, 'Winner:', outCandidates[0]?.name, outCandidates[0]?.party);
}

main();
