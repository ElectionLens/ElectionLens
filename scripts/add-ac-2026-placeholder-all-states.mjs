/**
 * Add 2026 to each state's AC index (if missing) and create a minimal 2026.json
 * placeholder when the file does not exist. Does not overwrite existing 2026.json
 * (Tamil Nadu, Kerala, West Bengal, Puducherry, etc. keep full data).
 *
 * Run from repo root: node scripts/add-ac-2026-placeholder-all-states.mjs
 */
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AC_ROOT = join(__dirname, '../public/data/elections/ac');

/** State folders / codes where 2026 is not the next assembly cycle (e.g. last poll 2023 → next ~2028). */
const SKIP_ASSEMBLY_2026 = new Set(['KA']);
const PLACEHOLDER_META = {
  resultsPending: true,
  targetYear: 2026,
  candidatesPolicy: 'announced_only',
  description:
    'Placeholder for 2026 assembly cycle: no announced candidate rows in Election Lens for this state yet. Map stays neutral for this year until data is merged.',
  lastUpdated: new Date().toISOString().slice(0, 10),
};

const PLACEHOLDER_JSON = `${JSON.stringify({ _meta: PLACEHOLDER_META }, null, 2)}\n`;

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await readdir(AC_ROOT, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  let updatedIndexes = 0;
  let createdJson = 0;

  for (const dir of dirs) {
    const indexPath = join(AC_ROOT, dir, 'index.json');
    if (!(await fileExists(indexPath))) continue;

    const raw = await readFile(indexPath, 'utf8');
    const index = JSON.parse(raw);
    const stateCode = index.stateCode ?? dir;
    if (SKIP_ASSEMBLY_2026.has(stateCode) || SKIP_ASSEMBLY_2026.has(dir)) continue;

    const years = index.availableYears ?? index.years ?? [];
    if (!years.includes(2026)) {
      const next = [...years, 2026].sort((a, b) => a - b);
      index.availableYears = next;
      if (Array.isArray(index.years)) index.years = next;
      await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
      updatedIndexes++;
    }

    const yearPath = join(AC_ROOT, dir, '2026.json');
    if (!(await fileExists(yearPath))) {
      await writeFile(yearPath, PLACEHOLDER_JSON);
      createdJson++;
    }
  }

  // Master index.json
  const masterPath = join(AC_ROOT, 'index.json');
  const masterRaw = await readFile(masterPath, 'utf8');
  const master = JSON.parse(masterRaw);
  for (const st of master.states ?? []) {
    if (SKIP_ASSEMBLY_2026.has(st.code ?? '')) continue;
    if (!st.years) st.years = [];
    if (!st.years.includes(2026)) {
      st.years = [...st.years, 2026].sort((a, b) => a - b);
    }
  }
  await writeFile(masterPath, `${JSON.stringify(master, null, 2)}\n`);

  console.log(
    `Done. Updated ${updatedIndexes} state index.json files; created ${createdJson} placeholder 2026.json files. Master index refreshed.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
