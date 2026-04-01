#!/usr/bin/env node
/**
 * Fetch PMK's announced 2026 TN AC candidates from Live Chennai (HTML table).
 * Writes scripts/data/tn-2026-pmk.json for merge-tn-2026-announced.mjs.
 *
 * Source: https://www.livechennai.com/detailnews.asp?newsid=79299
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/tn-2026-pmk.json');
const URL = 'https://www.livechennai.com/detailnews.asp?newsid=79299';

const UA = 'Mozilla/5.0 (compatible; ElectionLens/1.0; +https://github.com/)';

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  const re =
    /<tr><td[^>]*>(\d+)<\/td><td[^>]*>([^<]+)<\/td><td[^>]*>([^<]+)<\/td><\/tr>/gi;
  const rows = [];
  let m;
  while ((m = re.exec(html))) {
    rows.push({
      order: +m[1],
      constituency: m[2].replace(/\s+/g, ' ').trim(),
      candidate: m[3].replace(/\s+/g, ' ').trim(),
    });
  }
  if (rows.length !== 18) {
    console.error(`Expected 18 PMK table rows, got ${rows.length}`);
    process.exit(1);
  }
  const payload = {
    _meta: {
      source: 'Live Chennai',
      articleUrl: URL,
      fetchedAt: new Date().toISOString(),
      note: 'PMK NDA slate (18 ACs). Parsed from on-page candidate table.',
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
