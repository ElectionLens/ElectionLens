#!/usr/bin/env node
/**
 * Merge sourced 2026 TN announced candidates into public/data/elections/ac/TN/2026.json.
 *
 * - DMK symbol (Rising Sun): voterlist.co.in then The Hindu (same schema AC: Hindu wins), then tn-2026-dmk-symbol-extras.json (SPA allies on Rising Sun not in Hindu table; must not duplicate a Hindu AC).
 * - ADMK symbol (Two Leaves): voterlist.co.in, then IE/Week/DT, then PMK (later wins per AC). PMK shown as party ADMK. No separate PMK row.
 * - TVK, NTK: unchanged.
 * - AMMK: voterlist.co.in two-column table (NDA); party label AMMK.
 * - CPI, CPI(M): scripts/data/tn-2026-cpi.json, tn-2026-cpim.json (press lists; party labels CPI, CPM).
 *
 * Per AC: DMK symbol, ADMK symbol, TVK, NTK, AMMK, CPI, CPM. Positions renumbered.
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
import { inferSexFromAnnouncedName } from './lib/infer-candidate-sex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'public/data/schema.json');
const DMK_VL_PATH = path.join(__dirname, 'data/tn-2026-dmk-voterlist.json');
const DMK_HINDU_PATH = path.join(__dirname, 'data/tn-2026-dmk-thehindu.json');
const DMK_VLI_PATH = path.join(__dirname, 'data/tn-2026-dmk-voterlistindia.json');
const DMK_SYMBOL_EXTRAS_PATH = path.join(__dirname, 'data/tn-2026-dmk-symbol-extras.json');
const ADMK_VL_PATH = path.join(__dirname, 'data/tn-2026-admk-voterlist.json');
const ADMK_VLI_PATH = path.join(__dirname, 'data/tn-2026-admk-voterlistindia.json');
const ADMK_PATH = path.join(__dirname, 'data/tn-2026-admk.json');
const PMK_PATH = path.join(__dirname, 'data/tn-2026-pmk.json');
const ADMK_SYMBOL_EXTRAS_PATH = path.join(__dirname, 'data/tn-2026-admk-symbol-extras.json');
const TVK_PATH = path.join(__dirname, 'data/tn-2026-tvk-thehindu.json');
const NTK_PATH = path.join(__dirname, 'data/tn-2026-ntk-tnliv.json');
const AMMK_VL_PATH = path.join(__dirname, 'data/tn-2026-ammk-voterlist.json');
const CPI_PATH = path.join(__dirname, 'data/tn-2026-cpi.json');
const CPIM_PATH = path.join(__dirname, 'data/tn-2026-cpim.json');
const INC_PATH = path.join(__dirname, 'data/tn-2026-inc.json');
const BJP_PATH = path.join(__dirname, 'data/tn-2026-bjp.json');
const VCK_PATH = path.join(__dirname, 'data/tn-2026-vck.json');
const MDMK_PATH = path.join(__dirname, 'data/tn-2026-mdmk.json');
const TMC_NDA_PATH = path.join(__dirname, 'data/tn-2026-tmc-nda.json');
const IJK_PATH = path.join(__dirname, 'data/tn-2026-ijk.json');
const DMK_ALLIES_NEWS_PATH = path.join(__dirname, 'data/tn-2026-dmk-allies-news.json');
const IUML_PATH = path.join(__dirname, 'data/tn-2026-iuml.json');
const PNK_PATH = path.join(__dirname, 'data/tn-2026-pnk.json');
const WIKI_FILL_PATH = path.join(__dirname, 'data/tn-2026-wikipedia-fill.json');
const MANUAL_OVERRIDES_PATH = path.join(__dirname, 'data/tn-2026-manual-overrides.json');
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

const SPA_PRIORITY = ['DMK', 'INC', 'CPI', 'CPM', 'VCK', 'MDMK', 'IUML', 'MMK', 'KMDK', 'DMDK'];
const NDA_PRIORITY = ['ADMK', 'BJP', 'AMMK', 'TMC', 'IJK'];

function pickFirstByPartyPriority(rows, partyPriority) {
  for (const p of partyPriority) {
    const found = rows.find((r) => r.party === p);
    if (found) return found;
  }
  return null;
}

function normalizeToFourCandidates(rows, options = {}) {
  const { preferredNdaParty = null } = options;
  if (!Array.isArray(rows) || rows.length <= 4) return rows;

  const selected = [];
  const selectedByParty = new Set();

  const spa = pickFirstByPartyPriority(rows, SPA_PRIORITY);
  if (spa) {
    selected.push(spa);
    selectedByParty.add(spa.party);
  }

  let nda = null;
  if (preferredNdaParty) {
    nda = rows.find((r) => r.party === preferredNdaParty) || null;
  }
  if (!nda) nda = pickFirstByPartyPriority(rows, NDA_PRIORITY);
  if (nda && !selectedByParty.has(nda.party)) {
    selected.push(nda);
    selectedByParty.add(nda.party);
  }

  const tvk = rows.find((r) => r.party === 'TVK');
  if (tvk && !selectedByParty.has(tvk.party)) {
    selected.push(tvk);
    selectedByParty.add(tvk.party);
  }

  const ntk = rows.find((r) => r.party === 'NTK');
  if (ntk && !selectedByParty.has(ntk.party)) {
    selected.push(ntk);
    selectedByParty.add(ntk.party);
  }

  if (selected.length < 4) {
    for (const row of rows) {
      if (selectedByParty.has(row.party)) continue;
      selected.push(row);
      selectedByParty.add(row.party);
      if (selected.length === 4) break;
    }
  }

  return selected.slice(0, 4);
}

function main() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const dmkVlFile = JSON.parse(fs.readFileSync(DMK_VL_PATH, 'utf8'));
  const dmkHinduFile = JSON.parse(fs.readFileSync(DMK_HINDU_PATH, 'utf8'));
  const dmkVliFile = JSON.parse(fs.readFileSync(DMK_VLI_PATH, 'utf8'));
  const dmkSymbolExtrasFile = fs.existsSync(DMK_SYMBOL_EXTRAS_PATH)
    ? JSON.parse(fs.readFileSync(DMK_SYMBOL_EXTRAS_PATH, 'utf8'))
    : { rows: [] };
  const admkVlFile = JSON.parse(fs.readFileSync(ADMK_VL_PATH, 'utf8'));
  const admkVliFile = JSON.parse(fs.readFileSync(ADMK_VLI_PATH, 'utf8'));
  const admkFile = JSON.parse(fs.readFileSync(ADMK_PATH, 'utf8'));
  const pmkFile = JSON.parse(fs.readFileSync(PMK_PATH, 'utf8'));
  const admkSymbolExtrasFile = fs.existsSync(ADMK_SYMBOL_EXTRAS_PATH)
    ? JSON.parse(fs.readFileSync(ADMK_SYMBOL_EXTRAS_PATH, 'utf8'))
    : { rows: [] };
  const tvkFile = JSON.parse(fs.readFileSync(TVK_PATH, 'utf8'));
  const ntkFile = JSON.parse(fs.readFileSync(NTK_PATH, 'utf8'));
  const ammkVlFile = JSON.parse(fs.readFileSync(AMMK_VL_PATH, 'utf8'));
  const cpiFile = JSON.parse(fs.readFileSync(CPI_PATH, 'utf8'));
  const cpimFile = JSON.parse(fs.readFileSync(CPIM_PATH, 'utf8'));
  const incFile = JSON.parse(fs.readFileSync(INC_PATH, 'utf8'));
  const bjpFile = JSON.parse(fs.readFileSync(BJP_PATH, 'utf8'));
  const vckFile = JSON.parse(fs.readFileSync(VCK_PATH, 'utf8'));
  const mdmkFile = JSON.parse(fs.readFileSync(MDMK_PATH, 'utf8'));
  const tmcNdaFile = JSON.parse(fs.readFileSync(TMC_NDA_PATH, 'utf8'));
  const ijkFile = JSON.parse(fs.readFileSync(IJK_PATH, 'utf8'));
  const dmkAlliesNewsFile = JSON.parse(fs.readFileSync(DMK_ALLIES_NEWS_PATH, 'utf8'));
  const iumlFile = JSON.parse(fs.readFileSync(IUML_PATH, 'utf8'));
  const pnkFile = JSON.parse(fs.readFileSync(PNK_PATH, 'utf8'));
  const wikiFillFile = JSON.parse(fs.readFileSync(WIKI_FILL_PATH, 'utf8'));
  const manualOverridesFile = JSON.parse(fs.readFileSync(MANUAL_OVERRIDES_PATH, 'utf8'));
  const tn2026 = JSON.parse(fs.readFileSync(TN2026_PATH, 'utf8'));

  const dmkVliAssign = assignRowsToSchemaIds(dmkVliFile.rows || [], schema);
  if (dmkVliAssign.failures.length) {
    console.warn(`DMK voterlistindia: ${dmkVliAssign.failures.length} rows did not map.`);
  }
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
  // Fill from voterlistindia first; higher-priority sources overwrite on overlap.
  const dmkAssign = mergeAssignBySchemaId([
    dmkVliAssign,
    dmkVlAssign,
    dmkHinduAssign,
    dmkSymbolExtrasAssign,
  ]);

  const admkVliAssign = assignRowsToSchemaIds(admkVliFile.rows || [], schema);
  if (admkVliAssign.failures.length) {
    console.warn(`ADMK voterlistindia: ${admkVliAssign.failures.length} rows did not map.`);
  }
  const admkVlAssign = assignRowsToSchemaIds(admkVlFile.rows || [], schema);
  const admkIeAssign = assignRowsToSchemaIds(admkFile.rows || [], schema);
  const pmkAssign = assignRowsToSchemaIds(pmkFile.rows || [], schema);
  const admkSymbolExtrasAssign = assignRowsToSchemaIds(admkSymbolExtrasFile.rows || [], schema);
  if (admkIeAssign.failures.length) {
    console.error('ADMK (IE/Week/DT) mapping failures:', admkIeAssign.failures);
    process.exit(1);
  }
  if (pmkAssign.failures.length) {
    console.error('PMK mapping failures:', pmkAssign.failures);
    process.exit(1);
  }
  if (admkSymbolExtrasAssign.failures.length) {
    console.error('ADMK symbol extras mapping failures:', admkSymbolExtrasAssign.failures);
    process.exit(1);
  }
  if (admkVlAssign.failures.length) {
    console.warn(
      `ADMK voterlist: ${admkVlAssign.failures.length} rows did not map (later lists cover those ACs where listed).`
    );
  }
  // Fill from voterlistindia first; higher-priority sources overwrite on overlap.
  const admkSymbolAssign = mergeAssignBySchemaId([
    admkVliAssign,
    admkVlAssign,
    admkIeAssign,
    pmkAssign,
    admkSymbolExtrasAssign,
  ]);

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

  const cpiAssign = assignRowsToSchemaIds(cpiFile.rows || [], schema);
  if (cpiAssign.failures.length) {
    console.error('CPI mapping failures:', cpiAssign.failures);
    process.exit(1);
  }

  const cpimAssign = assignRowsToSchemaIds(cpimFile.rows || [], schema);
  if (cpimAssign.failures.length) {
    console.error('CPI(M) mapping failures:', cpimAssign.failures);
    process.exit(1);
  }

  const incAssign = assignRowsToSchemaIds(incFile.rows || [], schema);
  if (incAssign.failures.length) {
    console.error('INC mapping failures:', incAssign.failures);
    process.exit(1);
  }

  const bjpAssign = assignRowsToSchemaIds(bjpFile.rows || [], schema);
  if (bjpAssign.failures.length) {
    console.error('BJP mapping failures:', bjpAssign.failures);
    process.exit(1);
  }

  const vckAssign = assignRowsToSchemaIds(vckFile.rows || [], schema);
  if (vckAssign.failures.length) {
    console.warn(`VCK mapping failures: ${vckAssign.failures.length}`);
  }

  const mdmkAssign = assignRowsToSchemaIds(mdmkFile.rows || [], schema);
  if (mdmkAssign.failures.length) {
    console.warn(`MDMK mapping failures: ${mdmkAssign.failures.length}`);
  }

  const tmcNdaAssign = assignRowsToSchemaIds(tmcNdaFile.rows || [], schema);
  if (tmcNdaAssign.failures.length) {
    console.warn(`TMC (NDA) mapping failures: ${tmcNdaAssign.failures.length}`);
  }

  const ijkAssign = assignRowsToSchemaIds(ijkFile.rows || [], schema);
  if (ijkAssign.failures.length) {
    console.warn(`IJK mapping failures: ${ijkAssign.failures.length}`);
  }

  const dmkAlliesNewsAssign = assignRowsToSchemaIds(dmkAlliesNewsFile.rows || [], schema);
  if (dmkAlliesNewsAssign.failures.length) {
    console.warn(`DMK allies (news) mapping failures: ${dmkAlliesNewsAssign.failures.length}`);
  }

  const iumlAssign = assignRowsToSchemaIds(iumlFile.rows || [], schema);
  if (iumlAssign.failures.length) {
    console.warn(`IUML mapping failures: ${iumlAssign.failures.length}`);
  }

  const pnkAssign = assignRowsToSchemaIds(pnkFile.rows || [], schema);
  if (pnkAssign.failures.length) {
    console.warn(`PNK mapping failures: ${pnkAssign.failures.length}`);
  }

  const wikiFillAssign = assignRowsToSchemaIds(wikiFillFile.rows || [], schema);
  if (wikiFillAssign.failures.length) {
    console.warn(`Wikipedia fill mapping failures: ${wikiFillAssign.failures.length}`);
  }

  const manualOverridesById = new Map();
  for (const row of manualOverridesFile.rows || []) {
    if (!row?.schemaId || !row?.party || !row?.candidate) continue;
    manualOverridesById.set(String(row.schemaId), row);
  }

  let withDmk = 0;
  let withAdmkSymbol = 0;
  let withPmk = 0;
  let withTvk = 0;
  let withNtk = 0;
  let withAmmk = 0;
  let withCpi = 0;
  let withCpm = 0;
  let withInc = 0;
  let withBjp = 0;
  let withVck = 0;
  let withMdmk = 0;
  let withTmc = 0;
  let withIjk = 0;
  let withDmkAlliesNews = 0;
  let withIuml = 0;
  let withPnk = 0;
  let withWikiFill = 0;
  let withManualOverrides = 0;
  let dmkTvk = 0;

  for (const id of Object.keys(tn2026)) {
    if (!/^TN-\d+$/.test(id)) continue;
    const entry = tn2026[id];
    if (!entry || typeof entry !== 'object') continue;

    const dmk = dmkAssign.byId.get(id);
    const admkSym = admkSymbolAssign.byId.get(id);
    const pmk = pmkAssign.byId.get(id);
    const tvk = tvkAssign.byId.get(id);
    const ntk = ntkAssign.byId.get(id);
    const ammk = ammkAssign.byId.get(id);
    const cpi = cpiAssign.byId.get(id);
    const cpim = cpimAssign.byId.get(id);
    const inc = incAssign.byId.get(id);
    const bjp = bjpAssign.byId.get(id);
    const vck = vckAssign.byId.get(id);
    const mdmk = mdmkAssign.byId.get(id);
    const tmcNda = tmcNdaAssign.byId.get(id);
    const ijk = ijkAssign.byId.get(id);
    const dmkAllyNews = dmkAlliesNewsAssign.byId.get(id);
    const iuml = iumlAssign.byId.get(id);
    const pnk = pnkAssign.byId.get(id);
    const wikiFill = wikiFillAssign.byId.get(id);
    const manualOverride = manualOverridesById.get(id);
    const rows = [];
    if (dmk) {
      rows.push(
        announcedRow('DMK', toDmkAdmkSymbolDisplayName(dmk.candidate), dmk.candidate)
      );
      withDmk++;
    }
    if (admkSym) {
      const twoLeavesParty = pmk ? 'PMK' : 'ADMK';
      rows.push(
        announcedRow(twoLeavesParty, toDmkAdmkSymbolDisplayName(admkSym.candidate), admkSym.candidate)
      );
      withAdmkSymbol++;
      if (pmk) withPmk++;
    }
    if (tvk) {
      rows.push(
        announcedRow('TVK', cleanAnnouncedCandidateName(tvk.candidate), tvk.candidate)
      );
      withTvk++;
    }
    if (ntk) {
      rows.push(announcedRow('NTK', toEciStyleName(ntk.candidate), ntk.candidate));
      withNtk++;
    }
    if (ammk) {
      rows.push(announcedRow('AMMK', toEciStyleName(ammk.candidate), ammk.candidate));
      withAmmk++;
    }
    if (cpi) {
      rows.push(announcedRow('CPI', toEciStyleName(cpi.candidate), cpi.candidate));
      withCpi++;
    }
    if (cpim) {
      rows.push(announcedRow('CPM', toEciStyleName(cpim.candidate), cpim.candidate));
      withCpm++;
    }
    if (inc) {
      rows.push(announcedRow('INC', toEciStyleName(inc.candidate), inc.candidate));
      withInc++;
    }
    if (bjp) {
      rows.push(announcedRow('BJP', toEciStyleName(bjp.candidate), bjp.candidate));
      withBjp++;
    }
    if (vck) {
      rows.push(announcedRow('VCK', toEciStyleName(vck.candidate), vck.candidate));
      withVck++;
    }
    if (mdmk) {
      rows.push(announcedRow('MDMK', toEciStyleName(mdmk.candidate), mdmk.candidate));
      withMdmk++;
    }
    if (tmcNda) {
      rows.push(announcedRow('TMC', toEciStyleName(tmcNda.candidate), tmcNda.candidate));
      withTmc++;
    }
    if (ijk) {
      rows.push(announcedRow('IJK', toEciStyleName(ijk.candidate), ijk.candidate));
      withIjk++;
    }
    if (dmkAllyNews?.party) {
      rows.push(
        announcedRow(
          String(dmkAllyNews.party).toUpperCase(),
          toEciStyleName(dmkAllyNews.candidate),
          dmkAllyNews.candidate
        )
      );
      withDmkAlliesNews++;
    }
    if (iuml) {
      rows.push(announcedRow('IUML', toEciStyleName(iuml.candidate), iuml.candidate));
      withIuml++;
    }
    if (pnk) {
      rows.push(announcedRow('PNK', toEciStyleName(pnk.candidate), pnk.candidate));
      withPnk++;
    }
    if (wikiFill?.party) {
      rows.push(
        announcedRow(
          String(wikiFill.party).toUpperCase(),
          toEciStyleName(wikiFill.candidate),
          wikiFill.candidate
        )
      );
      withWikiFill++;
    }
    if (manualOverride?.party) {
      rows.push(
        announcedRow(
          String(manualOverride.party).toUpperCase(),
          toEciStyleName(manualOverride.candidate),
          manualOverride.candidate
        )
      );
      withManualOverrides++;
    }
    if (dmk && tvk) dmkTvk++;

    // Prefer explicitly announced NDA ally candidates over generic ADMK-symbol row.
    const preferredNdaParty = ammk ? 'AMMK' : pmk ? 'PMK' : bjp ? 'BJP' : null;
    const normalizedRows = normalizeToFourCandidates(rows, { preferredNdaParty });

    normalizedRows.forEach((r, i) => {
      r.position = i + 1;
    });
    entry.candidates = normalizedRows;
    entry.totalCandidates = normalizedRows.length;
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
    admkSymbolExtrasRows: (admkSymbolExtrasFile.rows || []).length,
    note:
      'Two Leaves nominees: merged voterlist NDA table, voterlistindia AIADMK fill, IE/Week/DT AIADMK lists, Live Chennai PMK, and explicit single-seat ally extras contesting on Two Leaves (e.g. TMMK, Puratchi Bharatham). Later sources override earlier on the same AC.',
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
  meta.tnCpiAnnounced = {
    source: cpiFile._meta?.source || 'Press',
    articleUrl: cpiFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: cpiAssign.byId.size,
    note: cpiFile._meta?.note,
  };
  meta.tnCpimAnnounced = {
    source: cpimFile._meta?.source || 'Press',
    articleUrl: cpimFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: cpimAssign.byId.size,
    note: cpimFile._meta?.note,
  };
  meta.tnIncAnnounced = {
    source: incFile._meta?.source || 'Press',
    articleUrl: incFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: incAssign.byId.size,
    note: incFile._meta?.note,
  };
  meta.tnBjpAnnounced = {
    source: bjpFile._meta?.source || 'Press',
    articleUrl: bjpFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: bjpAssign.byId.size,
    note: bjpFile._meta?.note,
  };
  meta.tnVckAnnounced = {
    source: vckFile._meta?.source || 'Press',
    articleUrl: vckFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: vckAssign.byId.size,
    note: vckFile._meta?.note,
  };
  meta.tnMdmkAnnounced = {
    source: mdmkFile._meta?.source || 'Press',
    articleUrl: mdmkFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: mdmkAssign.byId.size,
    note: mdmkFile._meta?.note,
  };
  meta.tnTmcAnnounced = {
    source: tmcNdaFile._meta?.source || 'Press',
    articleUrl: tmcNdaFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: tmcNdaAssign.byId.size,
    note: tmcNdaFile._meta?.note,
  };
  meta.tnIjkAnnounced = {
    source: ijkFile._meta?.source || 'Press',
    articleUrl: ijkFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: ijkAssign.byId.size,
    note: ijkFile._meta?.note,
  };
  meta.tnDmkAlliesNewsAnnounced = {
    source: dmkAlliesNewsFile._meta?.source || 'News',
    articleUrl: dmkAlliesNewsFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: dmkAlliesNewsAssign.byId.size,
    note: dmkAlliesNewsFile._meta?.note,
  };
  meta.tnIumlAnnounced = {
    source: iumlFile._meta?.source || 'News',
    articleUrl: iumlFile._meta?.articleUrl,
    mergedAt: new Date().toISOString(),
    rowsApplied: iumlAssign.byId.size,
    note: iumlFile._meta?.note,
  };
  meta.tnPnkAnnounced = {
    source: pnkFile._meta?.source || 'Press',
    articleUrls: pnkFile._meta?.articleUrls,
    mergedAt: new Date().toISOString(),
    rowsApplied: pnkAssign.byId.size,
    note: pnkFile._meta?.note,
  };
  meta.tnWikipediaFillAnnounced = {
    source: wikiFillFile._meta?.source || 'Wikipedia',
    articleUrls: wikiFillFile._meta?.articleUrls,
    mergedAt: new Date().toISOString(),
    rowsApplied: wikiFillAssign.byId.size,
    note: wikiFillFile._meta?.note,
  };
  meta.tnManualOverridesAnnounced = {
    source: manualOverridesFile._meta?.source || 'Manual',
    mergedAt: new Date().toISOString(),
    rowsApplied: manualOverridesById.size,
    note: manualOverridesFile._meta?.note,
  };
  delete meta.tnDmkAnnounced;
  delete meta.tnAdmkAnnounced;
  delete meta.tnPmkAnnounced;
  meta.description =
    '2026 assembly elections (Tamil Nadu, Kerala, West Bengal, Assam, Puducherry). Polls scheduled Apr–May 2026. ' +
    'Vote totals are not yet counted. Tamil Nadu: Rising Sun (DMK party) and Two Leaves (NDA, incl. PMK on same symbol) in tnDmkSymbolAnnounced / tnAdmkSymbolAnnounced; ' +
    'TVK, NTK, AMMK, CPI, CPI(M), Congress, BJP, VCK, MDMK, TMC, IJK, IUML, PNK, targeted Wikipedia fills, manual overrides, and additional DMK-allied party rows from news-sourced announcements in tnTvkAnnounced / tnNtkAnnounced / tnAmmkAnnounced / tnCpiAnnounced / tnCpimAnnounced / tnIncAnnounced / tnBjpAnnounced / tnVckAnnounced / tnMdmkAnnounced / tnTmcAnnounced / tnIjkAnnounced / tnIumlAnnounced / tnPnkAnnounced / tnWikipediaFillAnnounced / tnManualOverridesAnnounced / tnDmkAlliesNewsAnnounced. ' +
    'Other states: see state-specific _meta where candidates are sourced.';
  meta.lastUpdated = new Date().toISOString().slice(0, 10);
  tn2026._meta = meta;

  fs.writeFileSync(TN2026_PATH, JSON.stringify(tn2026) + '\n');
  console.log(
    `Wrote TN/2026.json — DMK symbol: ${withDmk}, ADMK symbol: ${withAdmkSymbol}, PMK-labeled in Two Leaves: ${withPmk}, TVK: ${withTvk}, NTK: ${withNtk}, AMMK: ${withAmmk}, CPI: ${withCpi}, CPM: ${withCpm}, INC: ${withInc}, BJP: ${withBjp}, VCK: ${withVck}, MDMK: ${withMdmk}, TMC: ${withTmc}, IJK: ${withIjk}, IUML: ${withIuml}, PNK: ${withPnk}, Wiki fill: ${withWikiFill}, Manual overrides: ${withManualOverrides}, DMK allies(news): ${withDmkAlliesNews}, DMK+TVK both: ${dmkTvk}`
  );
}

main();
