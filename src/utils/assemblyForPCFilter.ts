import { booleanPointInPolygon, centroid } from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { AssemblyFeature, AssembliesGeoJSON, ConstituenciesGeoJSON } from '../types';
import { normalizeName } from './helpers';
import { ASM_STATE_ALIASES, PC_NAME_MAPPINGS } from '../constants';

/**
 * Lok Sabha polygon for the selected PC (same name matching as MapView currentPCFeatureData).
 */
export function findParliamentPCPolygonFeature(
  parliamentGeoJSON: ConstituenciesGeoJSON | null,
  pcName: string,
  stateName: string
): Feature<Polygon | MultiPolygon> | null {
  if (!parliamentGeoJSON?.features?.length) return null;
  const stateNorm = normalizeName(stateName).toLowerCase();
  const pcNorm = pcName.toLowerCase().trim();

  let feature = parliamentGeoJSON.features.find((f) => {
    const props = f.properties;
    const st = normalizeName(props?.STATE_NAME ?? props?.state_ut_name ?? '').toLowerCase();
    const pc = (props?.ls_seat_name ?? props?.PC_NAME ?? '').toLowerCase().trim();
    return st === stateNorm && pc === pcNorm;
  });

  if (!feature) {
    const pcTarget = normalizeName(pcName);
    feature = parliamentGeoJSON.features.find((f) => {
      const props = f.properties;
      const st = normalizeName(props?.STATE_NAME ?? props?.state_ut_name ?? '').toLowerCase();
      const pc = normalizeName(props?.ls_seat_name ?? props?.PC_NAME ?? '');
      return st === stateNorm && pc === pcTarget;
    });
  }

  if (!feature?.geometry) return null;
  const g = feature.geometry;
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return null;
  return feature as Feature<Polygon | MultiPolygon>;
}

function filterByAssemblyPcName(
  asmData: AssembliesGeoJSON,
  normalizedPC: string,
  asmState: string
): AssemblyFeature[] {
  return asmData.features.filter((f) => {
    if (!f.properties.AC_NAME || f.properties.AC_NAME.trim() === '') return false;
    const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
    if (asmStateName !== asmState) return false;

    const asmPC = normalizeName(f.properties.PC_NAME ?? '')
      .toUpperCase()
      .trim();

    if (asmPC === normalizedPC) return true;

    if (
      asmPC === normalizedPC + ' (SC)' ||
      asmPC === normalizedPC + ' (ST)' ||
      asmPC === normalizedPC + '(SC)' ||
      asmPC === normalizedPC + '(ST)'
    )
      return true;

    const cleanAsmPC = asmPC.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (cleanAsmPC === normalizedPC) return true;

    if (asmPC.startsWith(normalizedPC) || normalizedPC.startsWith(asmPC)) {
      const minLen = Math.min(asmPC.length, normalizedPC.length);
      if (minLen >= 10) return true;
    }

    return false;
  });
}

function filterAssamAssembliesByPCPolygon(
  asmData: AssembliesGeoJSON,
  asmState: string,
  pcPolygon: Feature<Polygon | MultiPolygon>
): AssemblyFeature[] {
  const candidates = asmData.features.filter((f) => {
    if (!f.properties.AC_NAME?.trim()) return false;
    const asmStateName = (f.properties.ST_NAME ?? '').toUpperCase().trim();
    return asmStateName === asmState;
  });

  return candidates.filter((f) => {
    try {
      const c = centroid(f as Feature);
      return booleanPointInPolygon(c, pcPolygon);
    } catch {
      return false;
    }
  });
}

/**
 * Assembly features belonging to a Lok Sabha seat: attribute match on PC_NAME first;
 * Assam fallback — Desktop merge often leaves PC_NAME blank — uses centroid-in-LS-polygon.
 */
export function resolveAssemblyFeaturesForPC(
  pcName: string,
  stateName: string,
  asmData: AssembliesGeoJSON,
  parliamentGeoJSON: ConstituenciesGeoJSON | null
): AssemblyFeature[] {
  let normalizedPC = normalizeName(pcName).toUpperCase().trim();
  const normalizedState = normalizeName(stateName).toUpperCase().trim();
  const asmState = ASM_STATE_ALIASES[normalizedState] ?? normalizedState;

  const mappingKey = `${normalizedPC}|${normalizedState}`;
  const mappedPC = PC_NAME_MAPPINGS[mappingKey];
  if (mappedPC) {
    normalizedPC = mappedPC;
  }

  let assemblies = filterByAssemblyPcName(asmData, normalizedPC, asmState);

  if (assemblies.length === 0 && asmState === 'ASSAM' && parliamentGeoJSON) {
    const pcPoly = findParliamentPCPolygonFeature(parliamentGeoJSON, pcName, stateName);
    if (pcPoly) {
      assemblies = filterAssamAssembliesByPCPolygon(asmData, asmState, pcPoly);
    }
  }

  return assemblies;
}
