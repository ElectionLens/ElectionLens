#!/usr/bin/env node
/**
 * List all constituencies that render with default (non-party) color
 * across all states, all AC years, and all PC years.
 *
 * Uses the same normalization and lookup logic as MapView so the list
 * matches what the app would show as uncolored.
 *
 * Usage: node scripts/list-default-green-constituencies.mjs [--json] [--state=CODE]
 *   --json   Output NDJSON to stdout (one object per line)
 *   --state  Limit to one state code (e.g. TN)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'public/data');
const ELECTION_AC = path.join(DATA, 'elections/ac');
const ELECTION_PC = path.join(DATA, 'elections/pc');
const GEO_ASM = path.join(DATA, 'geo/assembly/constituencies.geojson');
// AC index uses "TG" for Telangana but folder is "TS"
const AC_CODE_TO_DIR = { TG: 'TS' };
const GEO_PC = path.join(DATA, 'geo/parliament/constituencies.geojson');
const SCHEMA_PATH = path.join(DATA, 'schema.json');

const args = process.argv.slice(2);
const outJson = args.includes('--json');
const stateFilter = args.find((a) => a.startsWith('--state='))?.split('=')[1]?.toUpperCase();

// Same as helpers.normalizeName (strip diacritics, trim)
function normalizeName(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeForKey(str) {
  return normalizeName(str)
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseRepeated(s) {
  return s.replace(/(.)\1+/g, '$1');
}

// Schema normalize (same as useSchema): lowercase, strip diacritics, alphanumeric+spaces
function normalizeForSchema(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve AC/PC name to schemaId using schema indices (same as useSchema, including uppercase fallback)
function resolveACName(name, stateId, schema) {
  if (!schema?.indices?.acByName) return null;
  const normalized = normalizeForSchema(name);
  const key = `${normalized}|${stateId}`;
  let id = schema.indices.acByName[key];
  if (!id) {
    const cleanName = normalized.replace(/\s*\([^)]*\)\s*$/, '').trim();
    id = schema.indices.acByName[`${cleanName}|${stateId}`];
  }
  if (!id) {
    const namePart = normalized.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    if (namePart) {
      id =
        schema.indices.acByName[`${namePart.toUpperCase()}|${stateId}`] ??
        schema.indices.acByName[`${namePart}|${stateId}`];
    }
  }
  return id ?? null;
}

function resolvePCName(name, stateId, schema) {
  if (!schema?.indices?.pcByName) return null;
  const normalized = normalizeForSchema(name);
  const key = `${normalized}|${stateId}`;
  let id = schema.indices.pcByName[key];
  if (!id) {
    const namePart = normalized.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    if (namePart) {
      id =
        schema.indices.pcByName[`${namePart.toUpperCase()}|${stateId}`] ??
        schema.indices.pcByName[`${namePart}|${stateId}`];
    }
  }
  return id ?? null;
}

// Strip reservation suffix with or without closing paren (GeoJSON can have "(SC" or " (SC)")
function stripReservationSuffix(s) {
  if (!s || typeof s !== 'string') return s;
  return s.replace(/\s*\(S[CT]\s*\)?\s*$/i, '').trim();
}

// Returns true if geoName/schemaId would match a key in winners (same logic as MapView style)
function hasMatch(geoName, winners, schemaId) {
  if (schemaId && winners[schemaId]) return true;

  let normalizedConstituencyName = geoName
    ? normalizeForKey(geoName)
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  // Normalize malformed GeoJSON names e.g. "Kilvaithinankuppam(SC" or "Secunderabad Cantt. (SC"
  normalizedConstituencyName = stripReservationSuffix(normalizedConstituencyName) || normalizedConstituencyName;
  if (!normalizedConstituencyName) return false;

  let winner =
    winners[normalizedConstituencyName] ??
    winners[normalizedConstituencyName.replace(/[^A-Z0-9]/g, '')] ??
    (geoName ? winners[geoName.toUpperCase().trim()] : null);
  if (winner) return true;

  for (const [key, value] of Object.entries(winners)) {
    const normalizedKey = normalizeForKey(key);
    if (normalizedKey === normalizedConstituencyName) return true;
    const keyFuzzy = normalizedKey.replace(/[^A-Z0-9]/g, '');
    const nameFuzzy = normalizedConstituencyName.replace(/[^A-Z0-9]/g, '');
    if (keyFuzzy === nameFuzzy && keyFuzzy.length > 0) return true;
  }
  const nameCollapsed = collapseRepeated(normalizedConstituencyName);
  for (const [key, value] of Object.entries(winners)) {
    const normalizedKey = normalizeForKey(key);
    if (collapseRepeated(normalizedKey) === nameCollapsed && nameCollapsed.length > 0) return true;
  }
  return false;
}

// Set of constituency identifiers present in AC election results (schemaIds + normalized names)
function getACResultIdentifiers(results) {
  const ids = new Set();
  if (!results || typeof results !== 'object') return ids;
  for (const [key, result] of Object.entries(results)) {
    if (key && SCHEMA_ID_PATTERN.test(key)) ids.add(key);
    const name =
      result.constituencyNameOriginal || result.constituencyName || result.name || '';
    if (name) {
      const n = normalizeForKey(name)
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (n) {
        ids.add(n);
        ids.add(n.replace(/[^A-Z0-9]/g, ''));
        ids.add(collapseRepeated(n));
      }
    }
  }
  return ids;
}

// Only report default-green when this constituency exists in the election data (same delimitation)
function acInElectionData(acName, schemaId, resultIdentifiers) {
  if (!acName && !schemaId) return false;
  if (schemaId && resultIdentifiers.has(schemaId)) return true;
  const n = (acName || '')
    .trim()
    ? normalizeForKey(acName)
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  if (!n) return false;
  if (resultIdentifiers.has(n)) return true;
  if (resultIdentifiers.has(n.replace(/[^A-Z0-9]/g, ''))) return true;
  if (resultIdentifiers.has(collapseRepeated(n))) return true;
  for (const id of resultIdentifiers) {
    if (SCHEMA_ID_PATTERN.test(id)) continue;
    const idNorm = normalizeForKey(id).replace(/\s*\([^)]*\)\s*/g, '').replace(/\s+/g, ' ').trim();
    if (idNorm === n) return true;
    if (collapseRepeated(idNorm) === collapseRepeated(n)) return true;
  }
  return false;
}

// Set of PC identifiers in PC election results
function getPCResultIdentifiers(results) {
  const ids = new Set();
  if (!results || typeof results !== 'object') return ids;
  for (const [key, result] of Object.entries(results)) {
    if (key && SCHEMA_ID_PATTERN.test(key)) ids.add(key);
    const name =
      result.constituencyNameOriginal || result.constituencyName || result.name || '';
    if (name) {
      const n = normalizeForKey(name)
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (n) {
        ids.add(n);
        ids.add(n.replace(/[^A-Z0-9]/g, ''));
      }
    }
  }
  return ids;
}

function pcInElectionData(pcName, schemaId, resultIdentifiers) {
  if (!pcName && !schemaId) return false;
  if (schemaId && resultIdentifiers.has(schemaId)) return true;
  const n = (pcName || '')
    .trim()
    ? normalizeForKey(pcName)
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  if (!n) return false;
  if (resultIdentifiers.has(n)) return true;
  if (resultIdentifiers.has(n.replace(/[^A-Z0-9]/g, ''))) return true;
  for (const id of resultIdentifiers) {
    if (SCHEMA_ID_PATTERN.test(id)) continue;
    const idNorm = normalizeForKey(id).replace(/\s*\([^)]*\)\s*/g, '').replace(/\s+/g, ' ').trim();
    if (idNorm === n) return true;
  }
  return false;
}

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function stateNameNorm(s) {
  return (s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/&/g, ' AND ')
    .trim();
}

const SCHEMA_ID_PATTERN = /^[A-Z]{2}-\d+$/;

// Build AC winner map from AC election data (same as MapView: schemaId key + name variants)
function buildACWinnersFromACData(results) {
  const winners = {};
  if (!results || typeof results !== 'object') return winners;
  for (const [key, result] of Object.entries(results)) {
    if (!result.candidates?.length) continue;
    const winner = result.candidates[0];
    const entry = { party: winner.party, candidate: winner.name };
    if (key && SCHEMA_ID_PATTERN.test(key)) winners[key] = entry;
    const acName =
      result.constituencyNameOriginal ||
      result.constituencyName ||
      result.name ||
      '';
    if (!acName) continue;
    const normalizedName = normalizeForKey(acName);
    const fuzzyKey = normalizedName.replace(/[^A-Z0-9]/g, '');
    winners[normalizedName] = entry;
    if (fuzzyKey && fuzzyKey !== normalizedName) winners[fuzzyKey] = entry;
    const originalUpper = acName.toUpperCase().trim();
    if (originalUpper !== normalizedName && originalUpper !== fuzzyKey) winners[originalUpper] = entry;
  }
  return winners;
}

// Build AC winner map from PC election data (acWiseResults or acWiseVotes) + schemaId via resolveACName
function buildACWinnersFromPCData(results, stateId, schema) {
  const winners = {};
  if (!results || typeof results !== 'object') return winners;
  const addWinner = (acName, party, candidateName) => {
    const entry = { party, candidate: candidateName };
    const normalizedName = normalizeForKey(acName);
    const fuzzyKey = normalizedName.replace(/[^A-Z0-9]/g, '');
    winners[normalizedName] = entry;
    if (fuzzyKey && fuzzyKey !== normalizedName) winners[fuzzyKey] = entry;
    const originalUpper = acName.toUpperCase().trim();
    if (originalUpper !== normalizedName && originalUpper !== fuzzyKey) winners[originalUpper] = entry;
    const sid = resolveACName(acName, stateId, schema);
    if (sid) winners[sid] = entry;
  };
  for (const pcResult of Object.values(results)) {
    if (pcResult.acWiseResults) {
      for (const [acName, acContribution] of Object.entries(pcResult.acWiseResults)) {
        if (acContribution.candidates?.length) {
          const sorted = [...acContribution.candidates].sort((a, b) => b.votes - a.votes);
          const w = sorted[0];
          if (w) addWinner(acName, w.party, w.name);
        }
      }
    } else if (pcResult.candidates?.length) {
      const acToBest = {};
      for (const candidate of pcResult.candidates) {
        if (!candidate.acWiseVotes) continue;
        for (const av of candidate.acWiseVotes) {
          const acName = (av.acName || '').trim();
          if (!acName) continue;
          const votes = av.votes ?? 0;
          if (!acToBest[acName] || votes > acToBest[acName].votes) {
            acToBest[acName] = { party: candidate.party, name: candidate.name, votes };
          }
        }
      }
      for (const [acName, best] of Object.entries(acToBest)) addWinner(acName, best.party, best.name);
    }
  }
  return winners;
}

// Build PC winner map from PC election data (schemaId key + name variants + resolvePCName)
function buildPCWinnersFromPCData(results, stateId, schema) {
  const winners = {};
  if (!results || typeof results !== 'object') return winners;
  for (const [key, result] of Object.entries(results)) {
    if (!result.candidates?.length) continue;
    const winner = result.candidates[0];
    const entry = { party: winner.party, candidate: winner.name };
    if (key && SCHEMA_ID_PATTERN.test(key)) winners[key] = entry;
    const pcName =
      result.constituencyNameOriginal || result.constituencyName || result.name || '';
    if (!pcName) continue;
    const normalizedName = normalizeForKey(pcName).replace(/\s*\([^)]*\)\s*/g, '').replace(/\s+/g, ' ');
    const fuzzyKey = normalizedName.replace(/[^A-Z0-9]/g, '');
    winners[normalizedName] = entry;
    if (fuzzyKey && fuzzyKey !== normalizedName) winners[fuzzyKey] = entry;
    const originalUpper = pcName.toUpperCase().trim();
    if (originalUpper !== normalizedName && originalUpper !== fuzzyKey) winners[originalUpper] = entry;
    const sid = resolvePCName(pcName, stateId, schema);
    if (sid) winners[sid] = entry;
  }
  return winners;
}

function main() {
  const defaultGreen = [];

  let schema = null;
  try {
    schema = loadJSON(SCHEMA_PATH);
  } catch (e) {
    if (!outJson) console.warn('Schema not loaded, schemaId matching skipped:', e.message);
  }

  const acIndex = loadJSON(path.join(ELECTION_AC, 'index.json'));
  const asmGeo = loadJSON(GEO_ASM);
  let pcGeo;
  try {
    pcGeo = loadJSON(GEO_PC);
  } catch (e) {
    pcGeo = { features: [] };
  }

  const acStatesByName = {};
  for (const s of acIndex.states || []) {
    const code = (s.code || '').toUpperCase();
    if (stateFilter && code !== stateFilter) continue;
    acStatesByName[stateNameNorm(s.name)] = { name: s.name, code, years: s.years || [] };
  }

  // Per-state list of { name, schemaId } from assembly GeoJSON (schemaId used for app-style matching)
  const acByState = {};
  for (const f of asmGeo.features || []) {
    const st = (f.properties && f.properties.ST_NAME) || '';
    const ac = (f.properties && f.properties.AC_NAME) || '';
    const schemaId = (f.properties && f.properties.schemaId) || null;
    if (!ac || !st) continue;
    const key = stateNameNorm(st);
    if (!acByState[key]) acByState[key] = [];
    acByState[key].push({ name: ac, schemaId });
  }

  const pcByState = {};
  for (const f of pcGeo.features || []) {
    const st = (f.properties && (f.properties.state_ut_name || f.properties.STATE_NAME)) || '';
    const pc = (f.properties && (f.properties.ls_seat_name || f.properties.PC_NAME)) || '';
    const schemaId = (f.properties && f.properties.schemaId) || null;
    if (!pc || !st) continue;
    const key = stateNameNorm(st);
    if (!pcByState[key]) pcByState[key] = [];
    pcByState[key].push({ name: pc, schemaId });
  }

  const pcStateDirs = fs.readdirSync(ELECTION_PC).filter((d) => {
    if (d === 'index.json' || d.startsWith('.')) return false;
    return fs.statSync(path.join(ELECTION_PC, d)).isDirectory();
  });

  const pcStates = [];
  for (const code of pcStateDirs) {
    if (stateFilter && code.toUpperCase() !== stateFilter) continue;
    const idxPath = path.join(ELECTION_PC, code, 'index.json');
    if (!fs.existsSync(idxPath)) continue;
    const idx = loadJSON(idxPath);
    const name = idx.state || code;
    const years = idx.availableYears || idx.years || [];
    pcStates.push({ name, code: code.toUpperCase(), years });
  }

  const codeToAcStateName = {};
  for (const [norm, obj] of Object.entries(acStatesByName)) {
    codeToAcStateName[obj.code] = norm;
  }

  for (const [stateNorm, { name: stateName, code, years }] of Object.entries(acStatesByName)) {
    const geoACs = acByState[stateNorm] || [];
    if (!geoACs.length) continue;

    const acDir = AC_CODE_TO_DIR[code] || code;
    for (const year of years) {
      const acPath = path.join(ELECTION_AC, acDir, `${year}.json`);
      if (!fs.existsSync(acPath)) continue;
      const results = loadJSON(acPath);
      const winners = buildACWinnersFromACData(results);
      const resultIds = getACResultIdentifiers(results);
      for (const { name: acName, schemaId } of geoACs) {
        if (
          acInElectionData(acName, schemaId, resultIds) &&
          !hasMatch(acName, winners, schemaId)
        ) {
          defaultGreen.push({
            state: stateName,
            stateCode: code,
            year,
            type: 'ac',
            context: 'assembly',
            constituencyName: acName,
          });
        }
      }
    }
  }

  // Build set of AC names present in PC election data (acWiseResults / acWiseVotes)
  function getACNamesFromPCData(results) {
    const names = new Set();
    if (!results || typeof results !== 'object') return names;
    for (const pcResult of Object.values(results)) {
      if (pcResult.acWiseResults) {
        for (const acName of Object.keys(pcResult.acWiseResults)) {
          const n = (acName || '')
            .trim()
            ? normalizeForKey(acName)
                .replace(/\s*\([^)]*\)\s*/g, '')
                .replace(/\s+/g, ' ')
                .trim()
            : '';
          if (n) {
            names.add(n);
            names.add(n.replace(/[^A-Z0-9]/g, ''));
            names.add(collapseRepeated(n));
          }
        }
      } else if (pcResult.candidates?.length) {
        for (const c of pcResult.candidates) {
          if (!c.acWiseVotes) continue;
          for (const av of c.acWiseVotes) {
            const acName = (av.acName || '').trim();
            if (!acName) continue;
            const n = normalizeForKey(acName)
              .replace(/\s*\([^)]*\)\s*/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (n) {
              names.add(n);
              names.add(n.replace(/[^A-Z0-9]/g, ''));
              names.add(collapseRepeated(n));
            }
          }
        }
      }
    }
    return names;
  }

  for (const { name: stateName, code, years } of pcStates) {
    const stateNorm = stateNameNorm(stateName);
    const geoACs = acByState[stateNorm] || [];
    const geoPCs = pcByState[stateNorm] || [];

    for (const year of years) {
      const pcPath = path.join(ELECTION_PC, code, `${year}.json`);
      if (!fs.existsSync(pcPath)) continue;
      const results = loadJSON(pcPath);

      const acWinners = buildACWinnersFromPCData(results, code, schema);
      // Fill in ACs missing from PC data with their PC winner (same as MapView)
      if (schema?.assemblyConstituencies) {
        for (const [acId, ac] of Object.entries(schema.assemblyConstituencies)) {
          if (ac.stateId !== code || acWinners[acId]) continue;
          const pcId = ac.pcId;
          if (!pcId) continue;
          const pcResult = results[pcId];
          if (pcResult?.candidates?.length) {
            const w = pcResult.candidates[0];
            if (w) {
              const entry = { party: w.party, candidate: w.name };
              acWinners[acId] = entry;
              // Same as MapView: add name/aliases so GeoJSON without schemaId can match
              const namesToAdd = [ac.name, ...(ac.aliases || [])].filter(Boolean);
              for (const n of namesToAdd) {
                const norm = normalizeForKey(n);
                if (norm && !acWinners[norm]) acWinners[norm] = entry;
                const upper = String(n).toUpperCase().trim();
                if (upper && upper !== norm && !acWinners[upper]) acWinners[upper] = entry;
              }
            }
          }
        }
      }
      const acNamesInPC = getACNamesFromPCData(results);
      const pcKeysInFile = new Set(Object.keys(results || {}));
      // For PC-year view, report default-green only when the AC could have been colored but wasn't.
      // Skip ACs whose PC has no result for this year (e.g. Vellore TN-08 missing from TN 2019).
      for (const { name: acName, schemaId } of geoACs) {
        const acInPCData = acInElectionData(acName, null, acNamesInPC);
        const acSchema = schemaId && schema?.assemblyConstituencies?.[schemaId];
        const pcId = acSchema?.pcId;
        const pcHasResult = pcId && pcKeysInFile.has(pcId);
        const couldBeColored = acInPCData || (schemaId && (acNamesInPC.size > 0 && pcHasResult));
        if (couldBeColored && !hasMatch(acName, acWinners, schemaId)) {
          defaultGreen.push({
            state: stateName,
            stateCode: code,
            year,
            type: 'ac',
            context: 'pcYear',
            constituencyName: acName,
          });
        }
      }

      const pcWinners = buildPCWinnersFromPCData(results, code, schema);
      const pcResultIds = getPCResultIdentifiers(results);
      for (const { name: pcName, schemaId } of geoPCs) {
        if (
          pcInElectionData(pcName, schemaId, pcResultIds) &&
          !hasMatch(pcName, pcWinners, schemaId)
        ) {
          defaultGreen.push({
            state: stateName,
            stateCode: code,
            year,
            type: 'pc',
            context: 'pcView',
            constituencyName: pcName,
          });
        }
      }
    }
  }

  // Dedupe by (state, year, type, context, name) in case same constituency appears in multiple features
  const seenKey = new Set();
  const deduped = defaultGreen.filter((r) => {
    const key = `${r.stateCode}|${r.year}|${r.type}|${r.context}|${r.constituencyName}`;
    if (seenKey.has(key)) return false;
    seenKey.add(key);
    return true;
  });

  if (outJson) {
    for (const row of deduped) {
      console.log(JSON.stringify(row));
    }
    return;
  }

  console.log('Constituencies with default (non-party) color');
  console.log('(Uses same logic as app: schemaId first, then name/fuzzy/collapse matching)');
  console.log('State | StateCode | Year | Type | Context    | Constituency');
  console.log('-'.repeat(100));
  for (const r of deduped) {
    console.log(
      [r.state, r.stateCode, r.year, r.type, r.context.padEnd(11), r.constituencyName].join(' | ')
    );
  }
  console.log('-'.repeat(100));
  console.log(`Total: ${deduped.length} unique`);
  if (deduped.length === 0) {
    console.log('All constituencies are color-coded (validation passed).');
  } else {
    console.log('Remaining default-green: ensure GeoJSON has schemaId on all features and/or align names in schema.');
  }
}

main();
