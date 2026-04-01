#!/usr/bin/env node
/**
 * Fetch NTK (Naam Tamilar Katchi) 2026 TN AC full list from TNLiv (WordPress table).
 * Writes scripts/data/tn-2026-ntk-tnliv.json for merge-tn-2026-announced.mjs.
 *
 * Source: https://tnliv.in/ntk-candidates-list/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/tn-2026-ntk-tnliv.json');
const URL = 'https://tnliv.in/ntk-candidates-list/';

const UA = 'Mozilla/5.0 (compatible; ElectionLens/1.0; +https://github.com/)';

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

/** First column: "234 – Karaikudi" or "1 – Gummidipoondi" */
function parseConstituencyCell(raw) {
  const t = decodeHtmlEntities(raw)
    .replace(/\s+/g, ' ')
    .trim();
  const m = t.match(/^\d+\s*[–-]\s*(.+)$/);
  return (m ? m[1] : t).trim();
}

function parseTnlivTable(html) {
  const start = html.indexOf('<tbody>');
  const end = html.indexOf('</tbody>', start);
  if (start < 0 || end < 0) return [];
  const body = html.slice(start, end);
  const rows = [];
  const re = /<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/gi;
  let m;
  while ((m = re.exec(body))) {
    const constituency = parseConstituencyCell(m[1]);
    const candidate = decodeHtmlEntities(m[2]).replace(/\s+/g, ' ').trim();
    if (constituency && candidate) rows.push({ constituency, candidate });
  }
  return rows;
}

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  const rows = parseTnlivTable(html);
  if (rows.length !== 234) {
    console.error(`Expected 234 NTK table rows, got ${rows.length}`);
    process.exit(1);
  }
  const payload = {
    _meta: {
      source: 'TNLiv',
      articleUrl: URL,
      fetchedAt: new Date().toISOString(),
      note: 'NTK full slate (234 ACs). Parsed from wp-block-table in article.',
    },
    rows: rows.map((r, i) => ({ order: i + 1, ...r })),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${rows.length} rows -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
