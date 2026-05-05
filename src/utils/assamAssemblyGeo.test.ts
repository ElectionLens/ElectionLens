import { describe, it, expect } from 'vitest';
import {
  ASSAM_NEW_DELIMITATION_ASSEMBLY_YEAR,
  shouldUseAssamPreDelimitationAssemblyGeo,
  mergeAssamAssemblyGeoForYear,
  assamMapDataForYear,
} from './assamAssemblyGeo';
import type { AssembliesGeoJSON, AssemblyFeature } from '../types';

function ac(schemaId: string, tag: string): AssemblyFeature {
  return {
    type: 'Feature',
    properties: {
      schemaId,
      ST_CODE: 18,
      ST_NAME: 'ASSAM',
      AC_NO: 1,
      AC_NAME: 'TEST',
      DIST_NAME: '',
      PC_NO: 0,
      PC_NAME: '',
      PC_ID: 0,
      OBJECTID: 0,
      Shape_Leng: 0,
      Shape_Area: 1,
      reservationType: 'GEN',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [tag === 'pre' ? 1 : 2, 1],
          [0, 0],
        ],
      ],
    },
  };
}

const tn = ac('TN-001', 'post');
tn.properties.ST_NAME = 'TAMIL NADU';
tn.properties.schemaId = 'TN-001';

describe('assamAssemblyGeo', () => {
  it('flags years before new delimitation', () => {
    expect(shouldUseAssamPreDelimitationAssemblyGeo(2021)).toBe(true);
    expect(shouldUseAssamPreDelimitationAssemblyGeo(2023)).toBe(true);
    expect(shouldUseAssamPreDelimitationAssemblyGeo(2024)).toBe(false);
    expect(shouldUseAssamPreDelimitationAssemblyGeo(2026)).toBe(false);
    expect(shouldUseAssamPreDelimitationAssemblyGeo(null)).toBe(false);
  });

  it('merges Assam only when year is before delimitation', () => {
    const post = ac('AS-001', 'post');
    const pre = ac('AS-001', 'pre');
    const base: AssembliesGeoJSON = { type: 'FeatureCollection', features: [tn, post] };
    const preLayer: AssembliesGeoJSON = { type: 'FeatureCollection', features: [pre] };

    const same = mergeAssamAssemblyGeoForYear(base, preLayer, 2026);
    expect(same?.features[1]?.geometry).toEqual(post.geometry);

    const merged = mergeAssamAssemblyGeoForYear(base, preLayer, 2021);
    expect(merged?.features[0]).toBe(tn);
    expect(merged?.features[1]?.geometry).toEqual(pre.geometry);
  });

  it('swaps map features for Assam state when year is historical', () => {
    const post = ac('AS-001', 'post');
    const pre = ac('AS-001', 'pre');
    const base: AssembliesGeoJSON = { type: 'FeatureCollection', features: [post] };
    const preLayer: AssembliesGeoJSON = { type: 'FeatureCollection', features: [pre] };
    const mapData = {
      type: 'FeatureCollection',
      features: [post],
    } as AssembliesGeoJSON;

    const out = assamMapDataForYear(mapData, base, preLayer, 'Assam', 2021);
    expect(out?.features[0]?.geometry).toEqual(pre.geometry);

    const skip = assamMapDataForYear(mapData, base, preLayer, 'Tamil Nadu', 2021);
    expect(skip).toBe(mapData);

    const skipYear = assamMapDataForYear(mapData, base, preLayer, 'Assam', 2026);
    expect(skipYear).toBe(mapData);
  });

  it('documents cutoff constant', () => {
    expect(ASSAM_NEW_DELIMITATION_ASSEMBLY_YEAR).toBe(2024);
  });
});
