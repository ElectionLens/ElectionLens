#!/usr/bin/env node
/**
 * West Bengal 2026 master candidate table (Congress, BJP, CPI(M), TMC) from voterlist.co.in.
 * Writes scripts/data/wb-2026-voterlist-master.json — merged by merge-wb-kl-2026-announced.mjs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/wb-2026-voterlist-master.json');
const URL = 'https://voterlist.co.in/west-bengal-election-candidate-2026/';
const UA = 'Mozilla/5.0 (compatible; ElectionLens/1.0; +https://github.com/)';

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
  return decodeHtmlEntities(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMasterTable(html) {
  const start = html.indexOf('Assembly No.');
  if (start < 0) return [];
  const sub = html.slice(start);
  const tb = sub.indexOf('<tbody>');
  const te = sub.indexOf('</tbody>', tb);
  if (tb < 0 || te < 0) return [];
  const body = sub.slice(tb, te);
  const rows = [];
  const trs = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (tds.length < 5) continue;
    const m = tds[0].match(/^(\d+)\s*-\s*(.+)$/);
    if (!m) continue;
    const acNo = +m[1];
    const constituencyLabel = m[2].trim();
    rows.push({
      acNo,
      constituencyLabel,
      congress: tds[1] || '',
      bjp: tds[2] || '',
      cpim: tds[3] || '',
      tmc: tds[4] || '',
    });
  }
  return rows;
}

function mergeByAcNo(raw) {
  const map = new Map();
  for (const r of raw) {
    const prev = map.get(r.acNo) || {
      acNo: r.acNo,
      constituencyLabel: r.constituencyLabel,
      congress: '',
      bjp: '',
      cpim: '',
      tmc: '',
    };
    if (r.constituencyLabel) prev.constituencyLabel = r.constituencyLabel;
    for (const k of ['congress', 'bjp', 'cpim', 'tmc']) {
      if (r[k] && r[k].length) prev[k] = r[k];
    }
    map.set(r.acNo, prev);
  }
  return [...map.values()].sort((a, b) => a.acNo - b.acNo);
}

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const raw = parseMasterTable(await res.text());
  if (raw.length < 280) {
    console.error(`Expected ~294 WB master rows, got ${raw.length}`);
    process.exit(1);
  }
  const rows = mergeByAcNo(raw);
  const payload = {
    _meta: {
      source: 'voterlist.co.in',
      articleUrl: URL,
      fetchedAt: new Date().toISOString(),
      note:
        'Combined Congress / BJP / CPI(M) / TMC columns. Assembly serial from page; when WB-NNN is absent in ElectionLens 2026.json, merge maps by constituency name (e.g. legacy 146 → Bishnupur).',
      rawRowCount: raw.length,
      mergedRowCount: rows.length,
    },
    rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${rows.length} merged AC rows -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
