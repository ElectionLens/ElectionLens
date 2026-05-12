/**
 * Tamil Nadu: resolve geo district labels + DISTRICT_NAME_MAPPINGS to schema district ids / labels.
 * Used by reassign-tn-ac-districts.mjs and pull-tn-districts-and-sync-ac-geo.mjs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadDistrictNameMappingsFromConstants() {
  const tsPath = path.join(__dirname, '../../src/constants/index.ts');
  const src = fs.readFileSync(tsPath, 'utf8');
  const startNeedle = 'export const DISTRICT_NAME_MAPPINGS';
  const start = src.indexOf(startNeedle);
  if (start === -1) throw new Error(`Missing ${startNeedle} in index.ts`);
  const braceOpen = src.indexOf('{', start);
  if (braceOpen === -1) throw new Error('Missing opening { for DISTRICT_NAME_MAPPINGS');

  let depth = 0;
  let i = braceOpen;
  let inStr = false;
  let strQuote = '';
  let escaped = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === strQuote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = true;
      strQuote = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }

  let body = src.slice(braceOpen, i);
  body = body.replace(/^\s*\/\/[^\n]*/gm, '');
  return Function(`"use strict"; return (${body});`)();
}

export function resolveDistrictId(distGeoName, districtMappings, schema) {
  const mappingKey = `${String(distGeoName).toUpperCase().trim()}|TAMIL NADU`;
  const mappedRaw = districtMappings[mappingKey] ?? distGeoName;
  let key = `${normalizeName(mappedRaw)}|TN`;
  let id = schema.indices.districtByName[key];
  if (!id) {
    key = `${normalizeName(distGeoName)}|TN`;
    id = schema.indices.districtByName[key];
  }
  return id;
}

/**
 * Resolve TN district label + dt code for assembly GeoJSON properties.
 * Falls back when schema does not yet include a new district (e.g. Mayiladuthurai split).
 */
export function resolveTnDistrictAssignment(schema, districtMappings, distGeoName, geoProps) {
  const districtId = resolveDistrictId(distGeoName, districtMappings, schema);
  if (districtId && schema.districts[districtId]) {
    const entity = schema.districts[districtId];
    const dt = parseInt(String(entity.censusCode || ''), 10);
    return {
      districtId,
      distName: entity.name,
      dtCode: Number.isFinite(dt) && dt > 0 ? dt : parseInt(String(geoProps?.dt_code ?? ''), 10),
    };
  }

  const mappingKey = `${String(distGeoName).toUpperCase().trim()}|TAMIL NADU`;
  const mappedRaw = districtMappings[mappingKey] ?? distGeoName;
  const label = String(mappedRaw).toUpperCase().replace(/\s+/g, ' ').trim();
  const dt = parseInt(String(geoProps?.dt_code ?? ''), 10);

  return {
    districtId: null,
    distName: label,
    dtCode: Number.isFinite(dt) && dt > 0 ? dt : undefined,
  };
}
