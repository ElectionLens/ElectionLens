#!/usr/bin/env node
/**
 * Kerala 2026 UDF + LDF (CPM page) + BJP tables from voterlist.co.in.
 * Writes scripts/data/kl-2026-voterlist.json — merged by merge-wb-kl-2026-announced.mjs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/kl-2026-voterlist.json');
const UA = 'Mozilla/5.0 (compatible; ElectionLens/1.0; +https://github.com/)';

const URL_UDF = 'https://voterlist.co.in/udf-candidates-list-2026-kerala-pdf/';
const URL_LDF = 'https://voterlist.co.in/cpm-kerala-candidate-list-2026/';
const URL_BJP = 'https://voterlist.co.in/bjp-candidates-list-2026-kerala/';

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

function extractTbodies(html) {
  const blocks = [];
  let i = 0;
  while (true) {
    const s = html.indexOf('<tbody', i);
    if (s < 0) break;
    const e = html.indexOf('</tbody>', s);
    if (e < 0) break;
    blocks.push(html.slice(s, e));
    i = e + 8;
  }
  return blocks;
}

function parseTbodyRows(tbodyInner) {
  const rows = [];
  const trs = [...tbodyInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trs) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function isVoteCountLike(s) {
  const t = String(s || '').trim();
  return /^\d[\d,.\s]*$/.test(t);
}

function parseUdf(html) {
  const rows = [];
  for (const tb of extractTbodies(html)) {
    for (const cells of parseTbodyRows(tb)) {
      if (cells.length < 2) continue;
      if (/^constituency$/i.test(cells[0])) continue;
      const party = (cells[2] || 'UDF').trim() || 'UDF';
      if (isVoteCountLike(party)) continue;
      rows.push({
        layer: 'udf',
        constituency: cells[0],
        candidate: cells[1],
        party,
      });
    }
  }
  return rows;
}

function parseLdf(html) {
  const rows = [];
  for (const tb of extractTbodies(html)) {
    for (const cells of parseTbodyRows(tb)) {
      if (cells.length < 2) continue;
      const c0 = cells[0];
      if (/^constituency$/i.test(c0)) continue;
      let constituency = c0;
      const num = c0.match(/^(\d+)\.\s*(.+)$/);
      if (num) constituency = num[2].trim();
      const party = cells[2] || 'LDF';
      rows.push({
        layer: 'ldf',
        constituency,
        candidate: cells[1],
        party: party.trim() || 'LDF',
      });
    }
  }
  return rows;
}

function parseBjp(html) {
  const rows = [];
  for (const tb of extractTbodies(html)) {
    for (const cells of parseTbodyRows(tb)) {
      if (cells.length < 3) continue;
      if (/^no\.?$/i.test(cells[0]) || /^constituency$/i.test(cells[1])) continue;
      rows.push({
        layer: 'bjp',
        constituency: cells[1],
        candidate: cells[2],
        party: 'BJP',
      });
    }
  }
  return rows;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const [htmlUdf, htmlLdf, htmlBjp] = await Promise.all([
    fetchText(URL_UDF),
    fetchText(URL_LDF),
    fetchText(URL_BJP),
  ]);

  const udf = parseUdf(htmlUdf);
  const ldf = parseLdf(htmlLdf);
  const bjp = parseBjp(htmlBjp);

  if (udf.length < 130) {
    console.error(`Expected ~140 UDF rows, got ${udf.length}`);
    process.exit(1);
  }
  if (ldf.length < 130) {
    console.error(`Expected ~140 LDF rows, got ${ldf.length}`);
    process.exit(1);
  }

  const rows = [...udf, ...ldf, ...bjp];
  const payload = {
    _meta: {
      source: 'voterlist.co.in',
      fetchedAt: new Date().toISOString(),
      articleUrls: { udf: URL_UDF, ldf: URL_LDF, bjp: URL_BJP },
      rowCounts: { udf: udf.length, ldf: ldf.length, bjp: bjp.length, total: rows.length },
      note:
        'UDF multi-district tables; LDF CPM page includes CPI(M)/CPI and party column; BJP list is partial (~98). Constituency labels matched to schema keys in merge script.',
    },
    rows,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(
    `Wrote UDF ${udf.length} + LDF ${ldf.length} + BJP ${bjp.length} = ${rows.length} rows -> ${OUT}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
