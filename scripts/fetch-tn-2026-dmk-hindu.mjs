#!/usr/bin/env node
/**
 * Fetch DMK's announced 2026 TN AC candidate list from The Hindu (AMP HTML).
 * Writes scripts/data/tn-2026-dmk-thehindu.json for merge-tn-2026-announced.mjs.
 *
 * Source: https://www.thehindu.com/elections/tamil-nadu-assembly/tamil-nadu-assembly-elections-2026-dmk-candidates-full-list/article70799057.ece
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/tn-2026-dmk-thehindu.json');
const URL =
  'https://www.thehindu.com/elections/tamil-nadu-assembly/tamil-nadu-assembly-elections-2026-dmk-candidates-full-list/article70799057.ece/amp/';

async function main() {
  const res = await fetch(URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ElectionLens/1.0; +https://github.com/)' },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  const re = /<p[^>]*>(\d+)\.\s*([^<]+)<\/p>/g;
  const rows = [];
  let m;
  while ((m = re.exec(html))) {
    const line = m[2].trim();
    const dash = line.lastIndexOf(' - ');
    if (dash < 0) continue;
    rows.push({
      order: +m[1],
      constituency: line.slice(0, dash).trim(),
      candidate: line.slice(dash + 3).trim(),
    });
  }
  if (rows.length !== 164) {
    console.error(`Expected 164 rows, got ${rows.length}`);
    process.exit(1);
  }
  const payload = {
    _meta: {
      source: 'The Hindu',
      articleUrl:
        'https://www.thehindu.com/elections/tamil-nadu-assembly/tamil-nadu-assembly-elections-2026-dmk-candidates-full-list/article70799057.ece',
      ampUrl: URL,
      fetchedAt: new Date().toISOString(),
      note: 'DMK-announced candidates only; other parties unchanged in merge script.',
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
