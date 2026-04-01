#!/usr/bin/env node
/**
 * Merge sourced 2026 TN announced candidates into public/data/elections/ac/TN/2026.json.
 *
 * - DMK symbol (Rising Sun): voterlist.co.in then The Hindu (same schema AC: Hindu wins), then tn-2026-dmk-symbol-extras.json (SPA allies on Rising Sun not in Hindu table; must not duplicate a Hindu AC).
 * - ADMK symbol (Two Leaves): voterlist.co.in, then IE/Week/DT, then PMK (later wins per AC). PMK shown as party ADMK. No separate PMK row.
 * - TVK, NTK: unchanged.
 * - AMMK: voterlist.co.in two-column table (NDA); party label AMMK.
 *
 * Per AC: DMK symbol, ADMK symbol, TVK, NTK, AMMK. Positions renumbered.
 *
 * Prerequisite: node scripts/generate-ac-2026-upcoming.mjs
 *
 * Usage: node scripts/merge-tn-2026-announced.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assignRowsToSchemaIds,
  cleanAnnouncedCandidateName,
  toDmkAdmkSymbolDisplayName,
  toEciStyleName,
} from './lib/tn-2026-ac-resolve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'public/data/schema.json');
const DMK_VL_PATH = path.join(__dirname, 'data/tn-2026-dmk-voterlist.json');
const DMK_HINDU_PATH = path.join(__dirname, 'data/tn-2026-dmk-thehindu.json');
const DMK_SYMBOL_EXTRAS_PATH = path.join(__dirname, 'data/tn-2026-dmk-symbol-extras.json');
const ADMK_VL_PATH = path.join(__dirname, 'data/tn-2026-admk-voterlist.json');
const ADMK_PATH = path.join(__dirname, 'data/tn-2026-admk.json');
const PMK_PATH = path.join(__dirname, 'data/tn-2026-pmk.json');
const TVK_PATH = path.join(__dirname, 'data/tn-2026-tvk-thehindu.json');
const NTK_PATH = path.join(__dirname, 'data/tn-2026-ntk-tnliv.json');
const AMMK_VL_PATH = path.join(__dirname, 'data/tn-2026-ammk-voterlist.json');
const TN2026_PATH = path.join(ROOT, 'public/data/elections/ac/TN/2026.json');

/** Overlay later assign maps onto earlier (schema id → row). */
function mergeAssignBySchemaId(layers) {
  const byId = new Map();
  for (const layer of layers) {
    for (const [id, row] of layer.byId) {
      byId.set(id, row);
    }
  }
  return { byId, size: byId.size };
}

function announcedRow(party, nameUpper) {
  return {
    position: 0,
    name: nameUpper,
    party,
    votes: 0,
    voteShare: 0,
    margin: null,
    marginPct: null,
    sex: 'M',
    age: 0,
    depositLost: false,
    announced: true,
  };
}

function main() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const dmkVlFile = JSON.parse(fs.readFileSync(DMK_VL_PATH, 'utf8'));
  const dmkHinduFile = JSON.parse(fs.readFileSync(DMK_HINDU_PATH, 'utf8'));
  const dmkSymbolExtrasFile = fs.existsSync(DMK_SYMBOL_EXTRAS_PATH)
    ? JSON.parse(fs.readFileSync(DMK_SYMBOL_EXTRAS_PATH, 'utf8'))
    : { rows: [] };
  const admkVlFile = JSON.parse(fs.readFileSync(ADMK_VL_PATH, 'utf8'));
  const admkFile = JSON.parse(fs.readFileSync(ADMK_PATH, 'utf8'));
  const pmkFile = JSON.parse(fs.readFileSync(PMK_PATH, 'utf8'));
  const tvkFile = JSON.parse(fs.readFileSync(TVK_PATH, 'utf8'));
  const ntkFile = JSON.parse(fs.readFileSync(NTK_PATH, 'utf8'));
  const ammkVlFile = JSON.parse(fs.readFileSync(AMMK_VL_PATH, 'utf8'));
  const tn2026 = JSON.parse(fs.readFileSync(TN2026_PATH, 'utf8'));

  const dmkVlAssign = assignRowsToSchemaIds(dmkVlFile.rows || [], schema);
  const dmkHinduAssign = assignRowsToSchemaIds(dmkHinduFile.rows || [], schema);
  const dmkSymbolExtrasAssign = assignRowsToSchemaIds(dmkSymbolExtrasFile.rows || [], schema);
  if (dmkHinduAssign.failures.length) {
    console.error('DMK (The Hindu) mapping failures:', dmkHinduAssign.failures);
    process.exit(1);
  }
  if (dmkSymbolExtrasAssign.failures.length) {
    console.error('DMK symbol extras mapping failures:', dmkSymbolExtrasAssign.failures);
    process.exit(1);
  }
  for (const id of dmkSymbolExtrasAssign.byId.keys()) {
    if (dmkHinduAssign.byId.has(id)) {
      console.error(
        `DMK symbol extra conflicts with The Hindu row for same AC: ${id}. Remove one source.`
      );
      process.exit(1);
    }
  }
  if (dmkVlAssign.failures.length) {
    console.warn(
      `DMK voterlist: ${dmkVlAssign.failures.length} rows did not map (Hindu overlay covers those ACs where listed).`
    );
  }
  const dmkAssign = mergeAssignBySchemaId([dmkVlAssign, dmkHinduAssign, dmkSymbolExtrasAssign]);
  const dmkExpectedSize = dmkHinduAssign.byId.size + dmkSymbolExtrasAssign.byId.size;
  if (dmkAssign.size !== dmkExpectedSize) {
    console.error(
      `DMK symbol merged size ${dmkAssign.size} != expected ${dmkExpectedSize} (Hindu ${dmkHinduAssign.byId.size} + extras ${dmkSymbolExtrasAssign.byId.size})`
    );
    process.exit(1);
  }

  const admkVlAssign = assignRowsToSchemaIds(admkVlFile.rows || [], schema);
  const admkIeAssign = assignRowsToSchemaIds(admkFile.rows || [], schema);
  const pmkAssign = assignRowsToSchemaIds(pmkFile.rows || [], schema);
  if (admkIeAssign.failures.length) {
    console.error('ADMK (IE/Week/DT) mapping failures:', admkIeAssign.failures);
    process.exit(1);
  }
  if (pmkAssign.failures.length) {
    console.error('PMK mapping failures:', pmkAssign.failures);
    process.exit(1);
  }
  if (admkVlAssign.failures.length) {
    console.warn(
      `ADMK voterlist: ${admkVlAssign.failures.length} rows did not map (later lists cover those ACs where listed).`
    );
  }
  const admkSymbolAssign = mergeAssignBySchemaId([admkVlAssign, admkIeAssign, pmkAssign]);

  const tvkAssign = assignRowsToSchemaIds(tvkFile.rows || [], schema);
  if (tvkAssign.failures.length) {
    console.error('TVK mapping failures:', tvkAssign.failures);
    process.exit(1);
  }

  const ntkAssign = assignRowsToSchemaIds(ntkFile.rows || [], schema);
  if (ntkAssign.failures.length) {
    console.error('NTK mapping failures:', ntkAssign.failures);
    process.exit(1);
  }

  const ammkAssign = assignRowsToSchemaIds(ammkVlFile.rows || [], schema);
  if (ammkAssign.failures.length) {
    console.error('AMMK mapping failures:', ammkAssign.failures);
    process.exit(1);
  }

  let withDmk = 0;
  let withAdmkSymbol = 0;
  let withTvk = 0;
  let withNtk = 0;
  let withAmmk = 0;
  let dmkTvk = 0;

  for (const id of Object.keys(tn2026)) {
    if (!/^TN-\d+$/.test(id)) continue;
    const entry = tn2026[id];
    if (!entry || typeof entry !== 'object') continue;

    const dmk = dmkAssign.byId.get(id);
    const admkSym = admkSymbolAssign.byId.get(id);
    const tvk = tvkAssign.byId.get(id);
    const ntk = ntkAssign.byId.get(id);
    const ammk = ammkAssign.byId.get(id);
    const rows = [];
    if (dmk) {
      rows.push(announcedRow('DMK', toDmkAdmkSymbolDisplayName(dmk.candidate)));
      withDmk++;
    }
    if (admkSym) {
      rows.push(announcedRow('ADMK', toDmkAdmkSymbolDisplayName(admkSym.candidate)));
      withAdmkSymbol++;
    }
    if (tvk) {
      rows.push(announcedRow('TVK', cleanAnnouncedCandidateName(tvk.candidate)));
      withTvk++;
    }
    if (ntk) {
      rows.push(announcedRow('NTK', toEciStyleName(ntk.candidate)));
      withNtk++;
    }
    if (ammk) {
      rows.push(announcedRow('AMMK', toEciStyleName(ammk.candidate)));
      withAmmk++;
    }
    if (dmk && tvk) dmkTvk++;

    rows.forEach((r, i) => {
      r.position = i + 1;
    });
    entry.candidates = rows;
    entry.totalCandidates = rows.length;
  }

  const meta = tn2026._meta || {};
  meta.resultsPending = true;
  meta.targetYear = 2026;
  meta.candidatesPolicy = 'announced_only';
  meta.tnDmkSymbolAnnounced = {
    sources: [
      dmkVlFile._meta?.source,
      dmkHinduFile._meta?.source,
      dmkSymbolExtrasFile._meta?.source,
    ].filter(Boolean),
    articleUrls: {
      voterlist: dmkVlFile._meta?.articleUrl,
      theHindu: dmkHinduFile._meta?.articleUrl,
    },
    mergedAt: new Date().toISOString(),
    rowsApplied: dmkAssign.size,
    dmkSymbolExtrasRows: (dmkSymbolExtrasFile.rows || []).length,
    note:
      'Rising Sun rows use party DMK only (ally tags stripped from names). Hindu table + voterlist, then scripts/data/tn-2026-dmk-symbol-extras.json for SPA allies on Rising Sun missing from the Hindu DMK-party-only list. Other SPA seats still use Congress/CPI/etc. symbols — not DMK party rows.',
  };
  meta.tnAdmkSymbolAnnounced = {
    sources: [admkVlFile._meta?.source, admkFile._meta?.source, pmkFile._meta?.source].filter(Boolean),
    articleUrls: {
      voterlist: admkVlFile._meta?.articleUrl,
      indianExpressWeekDtNext: admkFile._meta?.urls,
      pmk: pmkFile._meta?.articleUrl,
    },
    mergedAt: new Date().toISOString(),
    rowsApplied: admkSymbolAssign.size,
    pmkRowsInSource: (pmkFile.rows || []).length,
    note:
      'Two Leaves nominees: merged voterlist NDA table, IE/Week/DT AIADMK lists, and Live Chennai PMK (PMK contests on Two Leaves; shown as party ADMK). Later sources override earlier on the same AC.',
  };
  meta.tnTvkAnnounced = {
    source: tvkFile._meta?.source || 'The Hindu',
    articleUrl: tvkFile._meta?.articleUrl,
    wikipediaReference: tvkFile._meta?.wikipediaReference,
    mergedAt: new Date().toISOString(),
    rowsApplied: tvkAssign.byId.size,
  };
  meta.tnNtkAnnounced = {
    source: ntkFile._meta?.source || 'TNLiv',
    articleUrl: ntkFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: ntkAssign.byId.size,
  };
  meta.tnAmmkAnnounced = {
    source: ammkVlFile._meta?.source || 'voterlist.co.in',
    articleUrl: ammkVlFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: ammkAssign.byId.size,
    note: 'AMMK NDA nominees from voterlist.co.in; distinct party row (not merged into Two Leaves).',
  };
  delete meta.tnDmkAnnounced;
  delete meta.tnAdmkAnnounced;
  delete meta.tnPmkAnnounced;
  meta.description =
    '2026 assembly elections (Tamil Nadu, Kerala, West Bengal, Assam, Puducherry). Polls scheduled Apr–May 2026. ' +
    'Vote totals are not yet counted. Tamil Nadu: Rising Sun (DMK party) and Two Leaves (NDA, incl. PMK on same symbol) in tnDmkSymbolAnnounced / tnAdmkSymbolAnnounced; ' +
    'TVK, NTK, and AMMK in tnTvkAnnounced / tnNtkAnnounced / tnAmmkAnnounced. ' +
    'Other states: see state-specific _meta where candidates are sourced.';
  meta.lastUpdated = new Date().toISOString().slice(0, 10);
  tn2026._meta = meta;

  fs.writeFileSync(TN2026_PATH, JSON.stringify(tn2026) + '\n');
  console.log(
    `Wrote TN/2026.json — DMK symbol: ${withDmk}, ADMK symbol: ${withAdmkSymbol}, TVK: ${withTvk}, NTK: ${withNtk}, AMMK: ${withAmmk}, DMK+TVK both: ${dmkTvk}`
  );
}

main();
