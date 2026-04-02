/**
 * Set nextAssemblyElectionYear per state and keep exactly one future year in the index:
 * all years strictly before that next election, plus `next` itself.
 * Removes extra placeholder years (e.g. 2027–2029 when next is 2026).
 * Deletes `{year}.json` files for years no longer listed (future orphans only when safe).
 *
 * Run from repo root: node scripts/sync-ac-years-through-2029.mjs
 */
import { readdir, readFile, writeFile, access, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AC_ROOT = join(__dirname, '../public/data/elections/ac');

/** Indicative next Vidhan Sabha poll year (ECI schedule is final). */
const NEXT_ASSEMBLY_ELECTION_YEAR = {
  AP: 2029,
  AR: 2029,
  AS: 2026,
  BR: 2030,
  CG: 2028,
  DL: 2030,
  GA: 2027,
  GJ: 2027,
  HP: 2027,
  HR: 2029,
  JH: 2029,
  JK: 2029,
  KA: 2028,
  KL: 2026,
  MH: 2029,
  ML: 2028,
  MN: 2027,
  MP: 2028,
  MZ: 2028,
  NL: 2028,
  OD: 2029,
  PB: 2027,
  PY: 2026,
  RJ: 2028,
  SK: 2029,
  TN: 2026,
  TR: 2028,
  TS: 2028,
  UK: 2027,
  UP: 2027,
  WB: 2026,
};

function placeholderMeta(targetYear) {
  return {
    resultsPending: true,
    targetYear,
    candidatesPolicy: 'announced_only',
    description:
      `Placeholder for ${targetYear} assembly cycle: no announced candidate rows in Election Lens for this state yet. Map stays neutral for this year until data is merged.`,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Historical/completed years are those strictly before scheduled `next`, plus exactly one slot: `next`.
 */
function buildAvailableYears(existing, next) {
  const prior = (existing ?? []).filter((y) => y < next);
  return [...new Set([...prior, next])].sort((a, b) => a - b);
}

async function main() {
  const entries = await readdir(AC_ROOT, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  let updated = 0;
  let placeholders = 0;
  let removedFiles = 0;

  for (const dir of dirs) {
    const indexPath = join(AC_ROOT, dir, 'index.json');
    if (!(await fileExists(indexPath))) continue;

    const raw = await readFile(indexPath, 'utf8');
    const index = JSON.parse(raw);
    const code = index.stateCode ?? dir;
    const next = NEXT_ASSEMBLY_ELECTION_YEAR[code];
    if (next == null) {
      console.warn(`No NEXT_ASSEMBLY_ELECTION_YEAR for ${code} (${dir}), skip`);
      continue;
    }

    index.nextAssemblyElectionYear = next;
    index.availableYears = buildAvailableYears(index.availableYears, next);
    if (Array.isArray(index.years)) index.years = [...index.availableYears];

    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    updated++;

    const keep = new Set(index.availableYears);
    const dirEntries = await readdir(join(AC_ROOT, dir));
    for (const name of dirEntries) {
      const m = /^(\d{4})\.json$/.exec(name);
      if (!m) continue;
      const y = parseInt(m[1], 10);
      if (keep.has(y)) continue;
      await unlink(join(AC_ROOT, dir, name));
      removedFiles++;
    }

    for (const y of index.availableYears) {
      if (y < 2026) continue;
      const yPath = join(AC_ROOT, dir, `${y}.json`);
      if (await fileExists(yPath)) continue;
      await writeFile(yPath, `${JSON.stringify({ _meta: placeholderMeta(y) }, null, 2)}\n`);
      placeholders++;
    }
  }

  const masterPath = join(AC_ROOT, 'index.json');
  const masterRaw = await readFile(masterPath, 'utf8');
  const master = JSON.parse(masterRaw);

  for (const st of master.states ?? []) {
    let code = st.code;
    if (code === 'TG') code = 'TS';
    st.code = code;
    const idxPath = join(AC_ROOT, code, 'index.json');
    if (await fileExists(idxPath)) {
      const idx = JSON.parse(await readFile(idxPath, 'utf8'));
      st.years = idx.availableYears ?? st.years;
      st.nextAssemblyElectionYear = idx.nextAssemblyElectionYear;
    }
  }

  master.lastUpdated = new Date().toISOString();
  await writeFile(masterPath, `${JSON.stringify(master, null, 2)}\n`);

  console.log(
    `Done. Updated ${updated} state index.json files; created ${placeholders} placeholder JSON; removed ${removedFiles} orphan year files; master synced.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
