#!/usr/bin/env node
/**
 * DMK (Rising Sun) candidate table from voterlist.co.in (164 ACs).
 * Writes scripts/data/tn-2026-dmk-voterlist.json — merged with The Hindu in merge-tn-2026-announced.mjs (Hindu wins overlaps).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/tn-2026-dmk-voterlist.json');
const URL = 'https://voterlist.co.in/dmk-candidate-list-2026-tamil-nadu-election/';

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

function parseTable(html) {
  const start = html.indexOf('<tbody>');
  const end = html.indexOf('</tbody>', start);
  if (start < 0 || end < 0) return [];
  const body = html.slice(start, end);
  const rows = [];
  const trs = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (tds.length < 3) continue;
    const order = +tds[0].replace(/\D/g, '');
    if (!order) continue;
    rows.push({
      order,
      constituency: tds[1],
      candidate: tds[2],
    });
  }
  return rows;
}

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const rows = parseTable(await res.text());
  if (rows.length !== 164) {
    console.error(`Expected 164 DMK voterlist rows, got ${rows.length}`);
    process.exit(1);
  }
  const payload = {
    _meta: {
      source: 'voterlist.co.in',
      articleUrl: URL,
      fetchedAt: new Date().toISOString(),
      note: 'DMK party candidates (Rising Sun). Merged with The Hindu list in merge script; Hindu row wins on same constituency.',
    },
    rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${rows.length} rows -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
