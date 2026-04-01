/**
 * Map press / web constituency labels to schema AC ids for any state (not Tamil Nadu–specific).
 */
import { normCons, toEciStyleName } from './tn-2026-ac-resolve.mjs';

/** Kerala / generic: normalize label to match schema assembly name keys (no TN synonyms). */
export function keyFromGeneric(str) {
  let s = normCons(String(str || ''));
  s = s.replace(/\((north|south|east|west)\)/gi, '$1');
  return s.replace(/[^a-z0-9]/g, '');
}

/** Optional [[regex, replacement], ...] applied to press label before keying (whole-string match). */
export function applySynonyms(str, synonymRules) {
  const t = String(str || '').trim();
  if (!synonymRules?.length) return t;
  for (const [re, rep] of synonymRules) {
    if (re.test(t)) return rep;
  }
  return t;
}

export function buildAcKeyMapForState(schema, stateId) {
  const acMap = new Map();
  for (const [id, a] of Object.entries(schema.assemblyConstituencies || {})) {
    if (a.stateId !== stateId) continue;
    for (const label of [a.name, ...(a.aliases || [])]) {
      if (typeof label !== 'string') continue;
      const k = keyFromGeneric(label);
      if (!k) continue;
      if (!acMap.has(k)) acMap.set(k, []);
      const arr = acMap.get(k);
      if (!arr.includes(id)) arr.push(id);
    }
  }
  for (const [, arr] of acMap) {
    arr.sort((x, y) => schema.assemblyConstituencies[x].acNo - schema.assemblyConstituencies[y].acNo);
  }
  return acMap;
}

/**
 * Resolve a press constituency label to schema id. Same label always maps to same id when
 * the key is unique; multiple ACs sharing a press key use dupState round-robin.
 */
export function resolvePressToAcId(label, acMap, dupState, synonymRules = []) {
  const k = keyFromGeneric(applySynonyms(label, synonymRules));
  const ids = acMap.get(k);
  if (!ids?.length) return { ok: false, k, label };
  if (ids.length === 1) return { ok: true, id: ids[0] };
  const used = dupState.get(k) || 0;
  if (used >= ids.length) return { ok: false, k, label, reason: 'exhausted duplicate name bucket' };
  dupState.set(k, used + 1);
  return { ok: true, id: ids[used] };
}

export { toEciStyleName };
