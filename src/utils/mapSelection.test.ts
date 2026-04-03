import { describe, it, expect } from 'vitest';
import { isAssemblyFeatureSelected } from './mapSelection';

describe('isAssemblyFeatureSelected', () => {
  it('matches by constituency number when duplicate names exist', () => {
    const counts = new Map<string, number>([['TIRUPPATTUR', 2]]);

    const selected = {
      selectedAssembly: 'Tiruppattur',
      selectedConstituencyNo: 185,
      selectedSchemaId: 'TN-185',
      assemblyNameCounts: counts,
    };

    expect(
      isAssemblyFeatureSelected({
        ...selected,
        featureName: 'Tiruppattur',
        featureSchemaId: 'TN-050',
        featureACNo: 50,
      })
    ).toBe(false);

    expect(
      isAssemblyFeatureSelected({
        ...selected,
        featureName: 'Tiruppattur',
        featureSchemaId: 'TN-185',
        featureACNo: 185,
      })
    ).toBe(true);
  });

  it('falls back to schemaId when AC number is unavailable', () => {
    expect(
      isAssemblyFeatureSelected({
        selectedAssembly: 'Some AC',
        selectedConstituencyNo: null,
        selectedSchemaId: 'TN-120',
        featureName: 'Some AC',
        featureSchemaId: 'TN-120',
        featureACNo: undefined,
        assemblyNameCounts: new Map(),
      })
    ).toBe(true);
  });

  it('uses unique normalized name only as last fallback', () => {
    const counts = new Map<string, number>([['VANIYAMBADI', 1]]);
    expect(
      isAssemblyFeatureSelected({
        selectedAssembly: ' Vaniyambadi ',
        selectedConstituencyNo: null,
        selectedSchemaId: null,
        featureName: 'Vaniyambadi',
        featureSchemaId: '',
        featureACNo: undefined,
        assemblyNameCounts: counts,
      })
    ).toBe(true);
  });

  it('does not match by name when the normalized name is duplicated', () => {
    const counts = new Map<string, number>([['TIRUPPATTUR', 2]]);
    expect(
      isAssemblyFeatureSelected({
        selectedAssembly: 'Tiruppattur',
        selectedConstituencyNo: null,
        selectedSchemaId: null,
        featureName: 'Tiruppattur',
        featureSchemaId: '',
        featureACNo: undefined,
        assemblyNameCounts: counts,
      })
    ).toBe(false);
  });

  it('returns false when no selected assembly exists', () => {
    expect(
      isAssemblyFeatureSelected({
        selectedAssembly: null,
        selectedConstituencyNo: 185,
        selectedSchemaId: 'TN-185',
        featureName: 'Tiruppattur',
        featureSchemaId: 'TN-185',
        featureACNo: 185,
        assemblyNameCounts: new Map([['TIRUPPATTUR', 1]]),
      })
    ).toBe(false);
  });
});
