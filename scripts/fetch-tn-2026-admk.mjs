#!/usr/bin/env node
/**
 * Fetch AIADMK (ADMK) announced 2026 TN AC candidates from public sources.
 * Writes scripts/data/tn-2026-admk.json for merge-tn-2026-announced.mjs.
 *
 * Sources:
 * - Indian Express: first list (table) — tamil-nadu-assembly-polls-2026-aiadmk-check-full-list-of-candidates-10600086
 * - The Week: second list (<li> in JSON-LD articleBody) — aiadmk-candidate-list-2026-127-strong-second-list...
 * - The Week: third list (<li><b>…</b> – …) — aiadmk-final-candidate-list-adhav-arjuna-villivakkam...
 * - DT Next: NewsArticle JSON-LD (Thiru Vi Ka Nagar / Porkodi — not in The Week <ul>)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { keyFrom } from './lib/tn-2026-ac-resolve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'data/tn-2026-admk.json');

const URL_IE =
  'https://indianexpress.com/article/cities/chennai/tamil-nadu-assembly-polls-2026-aiadmk-check-full-list-of-candidates-10600086/';
const URL_WEEK_SECOND =
  'https://www.theweek.in/news/india/2026/03/27/aiadmk-candidate-list-2026-127-strong-second-list-out-as-indiya-jananayaka-katchi-opts-for-two-leaves-symbol.html';
const URL_WEEK_THIRD =
  'https://www.theweek.in/news/india/2026/03/29/aiadmk-final-candidate-list-adhav-arjuna-villivakkam-udhayanidhi-chepauk-among-seats-included.html';
const URL_DTNEXT_THIRD =
  'https://www.dtnext.in/news/politics/2026-tn-elections-aiadmk-announces-final-list-of-17-candidates-fields-ex-councillor-against-cm-stalin-in-kolathur';

const UA = 'Mozilla/5.0 (compatible; ElectionLens/1.0; +https://github.com/)';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function parseIndianExpressTables(html) {
  const tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi)];
  let best = [];
  for (const t of tables) {
    const block = t[0];
    if (!/S\.No/i.test(block) || !/Constituency/i.test(block)) continue;
    const trs = [...block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const data = [];
    for (const tr of trs) {
      const cells = [
        ...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
      ].map((m) =>
        m[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
      if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
        data.push({
          order: +cells[0],
          constituency: cells[1],
          candidate: cells[2],
        });
      }
    }
    if (data.length > best.length) best = data;
  }
  return best;
}

/** Decode JSON-LD string value after "articleBody":" */
function extractArticleBodyJsonLd(html) {
  const m = html.match(/"articleBody":"([\s\S]*?)"\s*}\s*\n\s*<\/script>/);
  if (!m) return null;
  return JSON.parse(`"${m[1].replace(/\\"/g, '"')}"`);
}

function parseWeekSecondListLi(body) {
  if (!body) return [];
  const fixed = body.replace(/ReddyCoimbatore/g, 'Reddy</li> <li>Coimbatore');
  const re = /<li>([^<]+)<\/li>/g;
  const rows = [];
  let x;
  while ((x = re.exec(fixed))) {
    const t = x[1].trim().replace(/\s+/g, ' ');
    const sep = t.includes('—') ? '—' : t.includes('–') ? '–' : t.includes(' - ') ? ' - ' : null;
    if (!sep) continue;
    const i = t.indexOf(sep);
    const cons = t.slice(0, i).trim();
    const cand = t.slice(i + sep.length).trim();
    if (cons && cand) rows.push({ constituency: cons, candidate: cand });
  }
  return rows;
}

function parseWeekThirdListLi(body) {
  if (!body) return [];
  const re = /<li><b>([^<]+)<\/b>\s*[–-]\s*([^<]+)<\/li>/g;
  const rows = [];
  let x;
  while ((x = re.exec(body))) {
    const cons = x[1].trim().replace(/\s+/g, ' ');
    const cand = x[2].trim().replace(/\s+/g, ' ');
    if (cons && cand) rows.push({ constituency: cons, candidate: cand });
  }
  return rows;
}

/** DT Next embeds full third-list context in NewsArticle.articleBody (prose). */
function parseDtnextThiruvika(html) {
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    let j;
    try {
      j = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(j) ? j : [j];
    for (const node of nodes) {
      if (node?.['@type'] !== 'NewsArticle' || typeof node.articleBody !== 'string') continue;
      if (!/Tiruvika\s+Nagar/i.test(node.articleBody)) continue;
      return [{ constituency: 'Thiru Vi Ka Nagar', candidate: 'Porkodi Armstrong' }];
    }
  }
  return [];
}

function mergeLayers(layers) {
  const map = new Map();
  for (const layer of layers) {
    for (const row of layer) {
      const k = keyFrom(row.constituency);
      if (!k) continue;
      map.set(k, { constituency: row.constituency.trim(), candidate: row.candidate.trim() });
    }
  }
  return [...map.values()];
}

async function main() {
  const [htmlIe, htmlWeek2, htmlWeek3, htmlDt] = await Promise.all([
    fetchText(URL_IE),
    fetchText(URL_WEEK_SECOND),
    fetchText(URL_WEEK_THIRD),
    fetchText(URL_DTNEXT_THIRD),
  ]);

  const ieRows = parseIndianExpressTables(htmlIe);
  if (ieRows.length !== 23) {
    console.error(`Expected 23 IE table rows, got ${ieRows.length}`);
    process.exit(1);
  }

  const body2 = extractArticleBodyJsonLd(htmlWeek2);
  const week2 = parseWeekSecondListLi(body2);
  if (week2.length !== 127) {
    console.error(`Expected 127 Week second-list rows, got ${week2.length}`);
    process.exit(1);
  }

  const body3 = extractArticleBodyJsonLd(htmlWeek3);
  const week3 = parseWeekThirdListLi(body3);
  if (week3.length !== 16) {
    console.error(`Expected 16 Week third-list rows, got ${week3.length}`);
    process.exit(1);
  }

  const dtExtra = parseDtnextThiruvika(htmlDt);
  if (dtExtra.length !== 1) {
    console.error(`Expected 1 DT Next Thiru Vi Ka row, got ${dtExtra.length}`);
    process.exit(1);
  }

  const merged = mergeLayers([
    ieRows.map((r) => ({ constituency: r.constituency, candidate: r.candidate })),
    week2,
    week3,
    dtExtra,
  ]);

  const payload = {
    _meta: {
      source: 'Indian Express + The Week + DT Next',
      fetchedAt: new Date().toISOString(),
      urls: {
        indianExpressFirstList: URL_IE,
        weekSecondList: URL_WEEK_SECOND,
        weekThirdList: URL_WEEK_THIRD,
        dtNextThirdListContext: URL_DTNEXT_THIRD,
      },
      note:
        'Merged first (IE table), second & third (The Week JSON-LD), plus Thiru Vi Ka Nagar from DT Next prose. Later layers override earlier seats when constituency keys match.',
      rowCounts: {
        indianExpress: ieRows.length,
        weekSecond: week2.length,
        weekThird: week3.length,
        dtNextSupplement: dtExtra.length,
        mergedUnique: merged.length,
      },
    },
    rows: merged.map((r, idx) => ({ order: idx + 1, ...r })),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${merged.length} merged rows -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
