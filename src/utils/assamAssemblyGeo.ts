import type { AssembliesGeoJSON, AssemblyFeature, GeoJSONData } from '../types';
import { getElectionStateId } from './helpers';

/** Assembly elections before this year use the pre-2024 Assam AC map (DataMeet / old boundaries). */
export const ASSAM_NEW_DELIMITATION_ASSEMBLY_YEAR = 2024;

export function shouldUseAssamPreDelimitationAssemblyGeo(year: number | null): boolean {
  return year != null && year < ASSAM_NEW_DELIMITATION_ASSEMBLY_YEAR;
}

/**
 * Replace Assam features in the nationwide assembly layer with pre-delimitation polygons when `year`
 * is before {@link ASSAM_NEW_DELIMITATION_ASSEMBLY_YEAR}.
 */
export function mergeAssamAssemblyGeoForYear(
  base: AssembliesGeoJSON | null,
  pre: AssembliesGeoJSON | null,
  year: number | null
): AssembliesGeoJSON | null {
  if (!base?.features?.length || !pre?.features?.length) return base;
  if (!shouldUseAssamPreDelimitationAssemblyGeo(year)) return base;

  const preBySchema = new Map(
    pre.features
      .filter((f) => {
        const sid = f.properties?.schemaId;
        return typeof sid === 'string' && sid.startsWith('AS-');
      })
      .map((f) => [f.properties.schemaId as string, f])
  );

  const features = base.features.map((f) => {
    const sid = f.properties?.schemaId;
    if (typeof sid === 'string' && sid.startsWith('AS-')) {
      return preBySchema.get(sid) ?? f;
    }
    return f;
  });

  return { type: 'FeatureCollection', features };
}

/**
 * Swap Assam AC geometries on the current map layer (state assemblies, ACs-in-PC, etc.) when the
 * selected assembly year is before the new delimitation.
 */
export function assamMapDataForYear(
  currentData: GeoJSONData | null,
  baseAssembly: AssembliesGeoJSON | null,
  preAssembly: AssembliesGeoJSON | null,
  stateName: string | null,
  year: number | null
): GeoJSONData | null {
  if (!currentData?.features?.length) return currentData;
  if (!stateName || !baseAssembly || !preAssembly) return currentData;
  if (getElectionStateId(stateName) !== 'AS') return currentData;
  if (!shouldUseAssamPreDelimitationAssemblyGeo(year)) return currentData;

  const merged = mergeAssamAssemblyGeoForYear(baseAssembly, preAssembly, year);
  if (!merged?.features?.length) return currentData;

  const bySchema = new Map<string, AssemblyFeature>();
  for (const f of merged.features) {
    const sid = f.properties?.schemaId;
    if (typeof sid === 'string' && sid.startsWith('AS-')) {
      bySchema.set(sid, f);
    }
  }

  const features = currentData.features.map((f) => {
    const sid = f.properties && 'schemaId' in f.properties ? f.properties.schemaId : undefined;
    if (typeof sid === 'string' && sid.startsWith('AS-')) {
      const repl = bySchema.get(sid);
      return repl ?? f;
    }
    return f;
  });

  return { ...currentData, features } as GeoJSONData;
}
