/**
 * Map Tamil Nadu press / party constituency labels to schema AC ids (assemblyConstituencies.name keys only).
 */

/** Press labels -> canonical schema assemblyConstituencies.name */
export const TN_AC_SYNONYMS = [
  [/^madhavaram$/i, 'Madavaram'],
  [/^mannachanallur$/i, 'Manachanallur'],
  [/^ottanchatram$/i, 'Oddanchatram'],
  [/^sholinganallur$/i, 'Shozhinganallur'],
  [/^t\.\s*nagar$/i, 'Thiyagarayanagar'],
  [/^thiruchuli$/i, 'Tiruchuli'],
  [/^thirupparankundram$/i, 'Thiruparankundram'],
  [/^thoothukudi$/i, 'Thoothukkudi'],
  [/^tirumangalam$/i, 'Thirumangalam'],
  [/^tiruvallur$/i, 'Thiruvallur'],
  [/^tiruchi east$/i, 'Tiruchirappalli East'],
  [/^tiruchi west$/i, 'Tiruchirappalli West'],
  [/^thiruchirappalli east$/i, 'Tiruchirappalli East'],
  [/^thiruchirappalli west$/i, 'Tiruchirappalli West'],
  [/^virugambakkam$/i, 'Virugampakkam'],
  [/^mettupalayam$/i, 'Mettuppalayam'],
  [/^villupuram$/i, 'Viluppuram'],
  [/^mudukulathur$/i, 'Mudhukulathur'],
  [/^palacode$/i, 'Palacodu'],
  [/^nilakottai\b/i, 'Nilakkottai (SC)'],
  [/^tirupattur$/i, 'Tiruppattur'],
  [/^thindukkal$/i, 'Dindigul'],
  [/^rayapuram$/i, 'Royapuram'],
  [/^viralimali$/i, 'Viralimalai'],
  [/^tittagudi/i, 'Tittakudi (SC)'],
  [/^chepauk-thiruvallikeni$/i, 'Chepauk-Thiruvalliken'],
  [/^vridhachalam$/i, 'Vriddhachalam'],
  [/^dr\.?\s*radhakrishnan nagar$/i, 'Dr.Radhakrishnan Naga'],
  [/^gopichettipalayam$/i, 'Gobichettipalayam'],
  [/^tiruchengode$/i, 'Tiruchengodu'],
  [/^r\.\s*k\.\s*nagar$/i, 'Dr.Radhakrishnan Naga'],
  [/^r\.k\.\s*nagar$/i, 'Dr.Radhakrishnan Naga'],
  [/^thiruvottiyur$/i, 'Tiruvottiyur'],
  [/^tiruporur$/i, 'Thiruporur'],
  [/^sholingar$/i, 'Sholingur'],
  [/^sangagiri$/i, 'Sankari'],
  [/^keezhvelur/i, 'Kilvelur (SC)'],
  [/^kumbidipundi$/i, 'Gummidipoondi'],
  [/^boothapandi/i, 'Padmanabhapuram'],
  [/^chepauk[–\s-]+triplicane$/i, 'Chepauk-Thiruvalliken'],
  [/^tiruvika\s*nagar$/i, 'Thiru-Vi-Ka-Nagar(SC)'],
  [/^tiruchuzhi$/i, 'Tiruchuli'],
  [/^tirupparankundram$/i, 'Thiruparankundram'],
  [/^maduranthakam/i, 'Madurantakam (SC)'],
  [/^srirampur/i, 'Sriperumbudur (SC)'],
  [/^anaicut$/i, 'Anaikattu'],
  [/^sendamangalam/i, 'Senthamangalam(ST)'],
  [/^kangeyam$/i, 'Kangayam'],
];

export function resolveSynonym(cons) {
  const t = cons.trim();
  for (const [re, rep] of TN_AC_SYNONYMS) {
    if (re.test(t)) return rep;
  }
  return t;
}

export function normCons(str) {
  let s = str
    .toLowerCase()
    .replace(/\s*\((sc|st)\)\s*/gi, '')
    .replace(/dr\.\s*/gi, '')
    .trim();
  s = s.replace(/\(\s*sc\s*$/i, '').replace(/\(\s*st\s*$/i, '').trim();
  return s;
}

export function keyFrom(str) {
  let x = resolveSynonym(str);
  x = normCons(x);
  x = x.replace(/thiruvallikeni/gi, 'thiruvalliken');
  x = x.replace(/bodinayak+kanur/gi, 'bodinayakanur');
  x = x.replace(/\((north|south|east|west)\)/gi, '$1');
  return x.replace(/[^a-z0-9]/g, '');
}

export function toEciStyleName(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip TVK role suffixes; normalize smart quotes */
export function cleanAnnouncedCandidateName(raw) {
  let t = String(raw)
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .trim();
  t = t.replace(/\s*\(TVK[^)]*\)\s*/gi, '').trim();
  t = t.replace(/\s*\(former[^)]*\)\s*/gi, '').trim();
  return toEciStyleName(t);
}

/** Parenthetical is stripped when it labels an ally/party, not a personal alias like (a) or (alias). */
const ALLY_OR_PARTY_PAREN_INNER = [
  /^Indian\s+National\s+Congress\b/i,
  /^Indian\s+Union\s+Muslim\s+League\b/i,
  /^Viduthalai\s+Chiruthaigal\b/i,
  /^Puthiya\s+Tamizhagam\b/i,
  /^Mukkulathor\b/i,
  /^Congress\b/i,
  /^Cong\.?\b/i,
  /^INC\b/i,
  /^IUML\b/i,
  /^VCK\b/i,
  /^MDMK\b/i,
  /^KMDK\b/i,
  /^MNM\b/i,
  /^CPI\s*\(\s*M\s*\)/i,
  /^CPI\b/i,
  /^BJP\b/i,
  /^PMK\b/i,
  /^AMMK\b/i,
  /^TVK\b/i,
  /^NTK\b/i,
  /^RJD\b/i,
  /^DMK\b/i,
  /^ADMK\b/i,
  /^AIADMK\b/i,
  /^SPA\b/i,
];

/**
 * Remove press-style (INC), (Mukkulathor), (PMK), etc. from DMK/ADMK symbol rows; keep (a) / (alias) nicknames.
 */
export function stripAllianceParentheticalFromSymbolCandidate(raw) {
  let t = String(raw).replace(/[\u2018\u2019\u201C\u201D]/g, "'").trim();
  let changed = true;
  while (changed) {
    changed = false;
    t = t.replace(/\s*\(([^)]*)\)/g, (full, inner) => {
      const s = String(inner).trim();
      if (!s) return full;
      if (/^a$/i.test(s) || /^alias$/i.test(s)) return full;
      if (ALLY_OR_PARTY_PAREN_INNER.some((re) => re.test(s))) {
        changed = true;
        return '';
      }
      return full;
    });
    t = t.replace(/\s+/g, ' ').trim();
  }
  return t;
}

export function toDmkAdmkSymbolDisplayName(raw) {
  return toEciStyleName(stripAllianceParentheticalFromSymbolCandidate(raw));
}

export function buildAcKeyMap(schema) {
  const acMap = new Map();
  for (const [id, a] of Object.entries(schema.assemblyConstituencies || {})) {
    if (a.stateId !== 'TN') continue;
    const k = keyFrom(a.name);
    if (!k) continue;
    if (!acMap.has(k)) acMap.set(k, []);
    acMap.get(k).push(id);
  }
  for (const [, arr] of acMap) {
    arr.sort((a, b) => schema.assemblyConstituencies[a].acNo - schema.assemblyConstituencies[b].acNo);
  }
  return acMap;
}

export function assignAcId(consLabel, acMap, dupConsumers) {
  const k = keyFrom(consLabel);
  const ids = acMap.get(k);
  if (!ids?.length) return { ok: false, k, consLabel };
  if (ids.length === 1) return { ok: true, id: ids[0] };
  const used = dupConsumers.get(k) || 0;
  if (used >= ids.length) return { ok: false, k, consLabel, reason: 'exhausted duplicate name bucket' };
  dupConsumers.set(k, used + 1);
  return { ok: true, id: ids[used] };
}

/**
 * @param {Array<{constituency: string, candidate: string}>} rows
 * @returns {{ byId: Map<string, {constituency: string, candidate: string, schemaId: string}>, failures: unknown[] }}
 */
/** Later layers overwrite earlier rows that resolve to the same AC key (press constituency label). */
export function mergeRowsByAcKey(layers) {
  const map = new Map();
  for (const layer of layers) {
    for (const row of layer) {
      if (!row?.constituency || !row?.candidate) continue;
      const k = keyFrom(row.constituency);
      if (!k) continue;
      map.set(k, {
        constituency: String(row.constituency).trim(),
        candidate: String(row.candidate).trim(),
      });
    }
  }
  return [...map.values()];
}

export function assignRowsToSchemaIds(rows, schema) {
  const acMap = buildAcKeyMap(schema);
  const dupConsumers = new Map();
  const byId = new Map();
  const failures = [];

  for (const row of rows) {
    const r = assignAcId(row.constituency, acMap, dupConsumers);
    if (!r.ok) {
      failures.push({ row, ...r });
      continue;
    }
    if (byId.has(r.id)) {
      failures.push({ row, schemaId: r.id, reason: 'duplicate_schema_id' });
      continue;
    }
    byId.set(r.id, { ...row, schemaId: r.id });
  }

  return { byId, failures };
}
