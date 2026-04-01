#!/usr/bin/env node
/**
 * AMMK (Amma Makkal Munnetra Kazhagam) 2026 TN slate from voterlist.co.in (two-column table).
 * Writes scripts/data/tn-2026-ammk-voterlist.json — merged in merge-tn-2026-announced.mjs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { keyFrom } from './lib/tn-2026-ac-resolve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/tn-2026-ammk-voterlist.json');
const URL = 'https://voterlist.co.in/ammk-candidate-list-2026-tamil-nadu/';

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
  const raw = [];
  const trs = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (tds.length < 2) continue;
    const cons = tds[0].replace(/\s*\(\d+\)\s*$/i, '').trim();
    let cand = tds[1].split(';')[0].trim();
    cand = cand.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').trim();
    if (!cons || !cand) continue;
    raw.push({ constituency: cons, candidate: cand });
  }
  const byKey = new Map();
  for (const row of raw) {
    const k = keyFrom(row.constituency);
    if (!k) continue;
    byKey.set(k, row);
  }
  return [...byKey.values()];
}

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const merged = parseTable(await res.text());
  if (merged.length < 5 || merged.length > 25) {
    console.error(`Expected ~9–15 AMMK rows (site may update), got ${merged.length}`);
    process.exit(1);
  }
  const payload = {
    _meta: {
      source: 'voterlist.co.in',
      articleUrl: URL,
      fetchedAt: new Date().toISOString(),
      uniqueRows: merged.length,
      note: 'AMMK NDA slate as published; deduplicated by AC key. Merged into TN/2026.json as party AMMK.',
    },
    rows: merged.map((r, i) => ({ order: i + 1, ...r })),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${merged.length} unique rows -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
