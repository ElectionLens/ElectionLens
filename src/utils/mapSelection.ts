import { normalizeName } from './helpers';

interface IsAssemblyFeatureSelectedOptions {
  selectedAssembly: string | null | undefined;
  selectedConstituencyNo?: number | null | undefined;
  selectedSchemaId?: string | null | undefined;
  featureName?: string | null | undefined;
  featureSchemaId?: string | null | undefined;
  featureACNo?: string | number | null | undefined;
  assemblyNameCounts?: Map<string, number> | null | undefined;
}

function normalizeAssemblyName(value: string | null | undefined): string {
  return normalizeName(value).toUpperCase().replace(/\s+/g, ' ').trim();
}

function parseAssemblyNo(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseInt(value, 10);
  return NaN;
}

export function isAssemblyFeatureSelected(options: IsAssemblyFeatureSelectedOptions): boolean {
  const {
    selectedAssembly,
    selectedConstituencyNo,
    selectedSchemaId,
    featureName,
    featureSchemaId,
    featureACNo,
    assemblyNameCounts,
  } = options;

  if (!selectedAssembly) return false;

  const parsedFeatureNo = parseAssemblyNo(featureACNo);
  if (selectedConstituencyNo != null && Number.isFinite(parsedFeatureNo)) {
    return parsedFeatureNo === selectedConstituencyNo;
  }

  if (selectedSchemaId) {
    return Boolean(featureSchemaId && featureSchemaId === selectedSchemaId);
  }

  const selectedNorm = normalizeAssemblyName(selectedAssembly);
  const featureNorm = normalizeAssemblyName(featureName);
  if (!selectedNorm || !featureNorm || selectedNorm !== featureNorm) return false;

  return (assemblyNameCounts?.get(featureNorm) ?? 0) === 1;
}
