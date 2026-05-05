import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  resolveAssemblyFeaturesForPC,
  findParliamentPCPolygonFeature,
} from './assemblyForPCFilter';
import type { AssembliesGeoJSON, ConstituenciesGeoJSON } from '../types';

describe('assemblyForPCFilter', () => {
  it('finds Sonitpur LS polygon and resolves Assam ACs when PC_NAME is blank on features', () => {
    const root = path.join(__dirname, '../../public/data/geo');
    const asm = JSON.parse(
      fs.readFileSync(path.join(root, 'assembly/constituencies.geojson'), 'utf8')
    ) as AssembliesGeoJSON;
    const pcj = JSON.parse(
      fs.readFileSync(path.join(root, 'parliament/constituencies.geojson'), 'utf8')
    ) as ConstituenciesGeoJSON;

    const assamRows = asm.features.filter(
      (f) => (f.properties?.ST_NAME ?? '').toUpperCase() === 'ASSAM'
    );
    const blankPc = assamRows.every((f) => !(f.properties?.PC_NAME ?? '').trim());
    expect(blankPc).toBe(true);

    const poly = findParliamentPCPolygonFeature(pcj, 'Sonitpur (ex Tezpur)', 'Assam');
    expect(poly?.geometry?.type).toMatch(/Polygon|MultiPolygon/);

    const list = resolveAssemblyFeaturesForPC('Sonitpur (ex Tezpur)', 'Assam', asm, pcj);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(15);
  });
});
