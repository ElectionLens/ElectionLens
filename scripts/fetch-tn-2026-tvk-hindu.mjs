#!/usr/bin/env node
/**
 * Fetch TVK's announced 2026 TN AC candidate list from The Hindu (AMP HTML).
 * Writes scripts/data/tn-2026-tvk-thehindu.json for merge-tn-2026-announced.mjs.
 *
 * Party colours / context: Wikipedia — Tamilaga Vettri Kazhagam (dark red & yellow on flag).
 *
 * Source: https://www.thehindu.com/elections/tamil-nadu-assembly/tamil-nadu-2026-assembly-elections-tvk-vijay-candidates-full-list/article70799077.ece
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/tn-2026-tvk-thehindu.json');
const URL =
  'https://www.thehindu.com/elections/tamil-nadu-assembly/tamil-nadu-2026-assembly-elections-tvk-vijay-candidates-full-list/article70799077.ece/amp/';

function splitLine(t) {
  if (t.includes(':')) {
    const i = t.indexOf(':');
    return { constituency: t.slice(0, i).trim(), candidate: t.slice(i + 1).trim() };
  }
  const en = t.indexOf(' – ');
  if (en >= 0) return { constituency: t.slice(0, en).trim(), candidate: t.slice(en + 3).trim() };
  const hy = t.indexOf(' - ');
  if (hy >= 0) return { constituency: t.slice(0, hy).trim(), candidate: t.slice(hy + 3).trim() };
  return null;
}

function parseTvkAmpHtml(html) {
  const start = html.indexOf('itemprop="articleBody"');
  const slice = start >= 0 ? html.slice(start, start + 280000) : html;
  const re = /<li>\s*([^<]+?)\s*<\/li>/g;
  const rows = [];
  let m;
  while ((m = re.exec(slice))) {
    const t = m[1].trim().replace(/\s+/g, ' ');
    if (!/[–\-:]/.test(t)) continue;
    const pair = splitLine(t);
    if (pair && pair.constituency && pair.candidate) rows.push(pair);
  }
  return rows;
}

async function main() {
  const res = await fetch(URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ElectionLens/1.0; +https://github.com/)' },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  const rows = parseTvkAmpHtml(html);
  if (rows.length !== 234) {
    console.error(`Expected 234 rows, got ${rows.length}`);
    process.exit(1);
  }
  const payload = {
    _meta: {
      source: 'The Hindu',
      articleUrl:
        'https://www.thehindu.com/elections/tamil-nadu-assembly/tamil-nadu-2026-assembly-elections-tvk-vijay-candidates-full-list/article70799077.ece',
      ampUrl: URL,
      fetchedAt: new Date().toISOString(),
      wikipediaReference: 'https://en.wikipedia.org/wiki/Tamilaga_Vettri_Kazhagam (party colours: dark red, yellow)',
      note: 'TVK first-list candidates; Vijay contests Perambur and Tiruchi East per same article.',
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
