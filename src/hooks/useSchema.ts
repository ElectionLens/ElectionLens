import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MasterSchema,
  StateEntity,
  PCEntity,
  ACEntity,
  DistrictEntity,
} from '../types/schema';

const SCHEMA_PATH = '/data/schema.json';

/** Only (SC)/(ST) are stripped as reservation suffixes, not geographic qualifiers like (North)/(South). */
const AC_RESERVED_PAREN_SUFFIX_RE = /\s*\(\s*(SC|ST)\s*\)\s*$/i;

export interface UseSchemaReturn {
  /** Schema loaded and ready */
  isReady: boolean;
  /** Loading state */
  loading: boolean;
  /** Error message if load failed */
  error: string | null;

  // Entity lookups by ID
  getState: (id: string) => StateEntity | null;
  getPC: (id: string) => PCEntity | null;
  getAC: (id: string) => ACEntity | null;
  getDistrict: (id: string) => DistrictEntity | null;

  // Name resolution (returns ID)
  resolveStateName: (name: string) => string | null;
  resolvePCName: (name: string, stateId: string) => string | null;
  resolveACName: (name: string, stateId: string) => string | null;
  resolveDistrictName: (name: string, stateId: string) => string | null;

  // Convenience: get entity by name
  getStateByName: (name: string) => StateEntity | null;
  getPCByName: (name: string, stateId: string) => PCEntity | null;
  getACByName: (name: string, stateId: string) => ACEntity | null;

  // Raw schema access
  schema: MasterSchema | null;
}

/**
 * Normalize a name for schema lookup
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** AC name spelling variants for schema lookup (URL vs schema name), e.g. tadpatri vs tadipatri, pappireddipatti vs pappireddippatti (PC 2024) */
const AC_NAME_LOOKUP_VARIANTS: Record<string, string[]> = {
  tadpatri: ['tadpatri', 'tadipatri'],
  tadipatri: ['tadipatri', 'tadpatri'],
  pappireddipatti: ['pappireddipatti', 'pappireddippatti'],
  pappireddippatti: ['pappireddippatti', 'pappireddipatti'],
  tiruvottiyur: ['tiruvottiyur', 'thiruvottiyur'],
  thiruvottiyur: ['thiruvottiyur', 'tiruvottiyur'],
};

function getACNameLookupVariants(normalized: string): string[] {
  const v = AC_NAME_LOOKUP_VARIANTS[normalized];
  return v ?? [normalized];
}

/**
 * Hook for loading and using the master schema
 *
 * The schema provides canonical IDs and names for all geographic entities,
 * eliminating the need for fuzzy name matching.
 */
export function useSchema(): UseSchemaReturn {
  const [schema, setSchema] = useState<MasterSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // Load schema on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const loadSchema = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(SCHEMA_PATH);
        if (!response.ok) {
          throw new Error(`Failed to load schema: ${response.status}`);
        }
        const data = (await response.json()) as MasterSchema;
        setSchema(data);
      } catch (err) {
        console.error('Failed to load schema:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    void loadSchema();
  }, []);

  // Entity lookups by ID
  const getState = useCallback(
    (id: string): StateEntity | null => {
      return schema?.states[id] ?? null;
    },
    [schema]
  );

  const getPC = useCallback(
    (id: string): PCEntity | null => {
      return schema?.parliamentaryConstituencies[id] ?? null;
    },
    [schema]
  );

  const getAC = useCallback(
    (id: string): ACEntity | null => {
      return schema?.assemblyConstituencies[id] ?? null;
    },
    [schema]
  );

  const getDistrict = useCallback(
    (id: string): DistrictEntity | null => {
      return schema?.districts[id] ?? null;
    },
    [schema]
  );

  // Name resolution
  const resolveStateName = useCallback(
    (name: string): string | null => {
      if (!schema) return null;
      const normalized = normalizeName(name);
      return schema.indices.stateByName[normalized] ?? null;
    },
    [schema]
  );

  const resolvePCName = useCallback(
    (name: string, stateId: string): string | null => {
      if (!schema?.indices?.pcByName) return null;
      // URL paths often append "(ex-FormerSeat)" after delimitation; indexes use compact keys like DARRANGUDALGURI|AS.
      // Strip parentheticals before normalize/namePart so slugs resolve (matches MapView PC JSON lookup / useParliamentResults).
      const withoutParens = name.replace(/\s*\([^)]*\)\s*/g, '').trim();
      const normalized = normalizeName(withoutParens);
      const key = `${normalized}|${stateId}`;
      let id = schema.indices.pcByName[key];
      if (!id) {
        const namePart = normalized.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
        if (namePart) {
          id =
            schema.indices.pcByName[`${namePart.toUpperCase()}|${stateId}`] ??
            schema.indices.pcByName[`${namePart}|${stateId}`];
        }
      }
      return id ?? null;
    },
    [schema]
  );

  const resolveACName = useCallback(
    (name: string, stateId: string): string | null => {
      if (!schema?.indices?.acByName) return null;
      const normalized = normalizeName(name);
      const key = `${normalized}|${stateId}`;

      // Try direct match first (lowercase, schema may use this)
      let id = schema.indices.acByName[key];

      // Try without (SC)/(ST) only — do not strip (South)/(North) or URL slugs become ambiguous vs COIMBATORE|TN
      if (!id) {
        const cleanName = normalized.replace(AC_RESERVED_PAREN_SUFFIX_RE, '').trim();
        id = schema.indices.acByName[`${cleanName}|${stateId}`];
      }
      if (!id && /\s+(st|sc)$/i.test(normalized)) {
        const withoutRes = normalized.replace(/\s+(st|sc)$/i, '').trim();
        if (withoutRes) id = schema.indices.acByName[`${withoutRes}|${stateId}`];
      }

      // Fallback: full normalized as uppercase (e.g. PRATHIPADUSC|AP for "Prathipadu (SC)" so (SC)/(ST) ACs resolve)
      if (!id) {
        const fullUpper = normalized
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '')
          .toUpperCase();
        if (fullUpper) id = schema.indices.acByName[`${fullUpper}|${stateId}`];
        // Also try without "AND" so "Lahaul & Spiti (ST)" -> LAHAULANDSPITIST matches schema LAHAULSPITIST
        if (!id && fullUpper.includes('AND')) {
          id = schema.indices.acByName[`${fullUpper.replace(/AND/g, '')}|${stateId}`];
        }
      }

      // Fallback: (ST)/(SC) attached without space (e.g. Rampachodavaram(ST) -> rampachodavaramst) try without trailing st/sc
      if (!id && /\(?(st|sc)\)?\s*$/i.test(name)) {
        const noTrailing = normalized.replace(/(st|sc)$/i, '').trim();
        const part = noTrailing
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '')
          .toUpperCase();
        if (part) id = schema.indices.acByName[`${part}|${stateId}`];
      }

      // Fallback: schema indices may be built with uppercase, no reservation (e.g. KURUPAM|AP from build-schema-aliases)
      if (!id) {
        const normalizedNoRes = normalized
          .replace(AC_RESERVED_PAREN_SUFFIX_RE, '')
          .trim()
          .replace(/\s+(st|sc)$/i, '')
          .trim();
        const namePart = normalizedNoRes.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
        if (namePart) {
          id =
            schema.indices.acByName[`${namePart.toUpperCase()}|${stateId}`] ??
            schema.indices.acByName[`${namePart}|${stateId}`];
        }
      }

      // Fallback: try spelling variants (e.g. tadpatri vs tadipatri, pappireddipatti vs pappireddippatti) so URL and schema both resolve
      if (!id) {
        for (const variant of getACNameLookupVariants(normalized)) {
          if (variant === normalized) continue;
          id = schema.indices.acByName[`${variant}|${stateId}`];
          // Index keys are uppercase (keyForIndex in build-schema-aliases), so try uppercase variant
          if (!id && variant) {
            const variantUpper = variant
              .replace(/\s+/g, '')
              .replace(/[^a-z0-9]/g, '')
              .toUpperCase();
            if (variantUpper) id = schema.indices.acByName[`${variantUpper}|${stateId}`];
          }
          if (id) break;
        }
      }

      return id ?? null;
    },
    [schema]
  );

  const resolveDistrictName = useCallback(
    (name: string, stateId: string): string | null => {
      if (!schema?.indices?.districtByName) return null;
      const normalized = normalizeName(name);
      const key = `${normalized}|${stateId}`;
      let id = schema.indices.districtByName[key];
      // Fallback: GeoJSON may use spelling variant (e.g. Bagalkote vs schema Bagalkot)
      if (!id && normalized.endsWith('e')) {
        const withoutE = normalized.slice(0, -1);
        id = schema.indices.districtByName[`${withoutE}|${stateId}`];
      }
      if (!id && !normalized.endsWith('e')) {
        id = schema.indices.districtByName[`${normalized}e|${stateId}`];
      }
      return id ?? null;
    },
    [schema]
  );

  // Convenience: get entity by name
  const getStateByName = useCallback(
    (name: string): StateEntity | null => {
      const id = resolveStateName(name);
      return id ? getState(id) : null;
    },
    [resolveStateName, getState]
  );

  const getPCByName = useCallback(
    (name: string, stateId: string): PCEntity | null => {
      const id = resolvePCName(name, stateId);
      return id ? getPC(id) : null;
    },
    [resolvePCName, getPC]
  );

  const getACByName = useCallback(
    (name: string, stateId: string): ACEntity | null => {
      const id = resolveACName(name, stateId);
      return id ? getAC(id) : null;
    },
    [resolveACName, getAC]
  );

  return {
    isReady: schema !== null,
    loading,
    error,
    getState,
    getPC,
    getAC,
    getDistrict,
    resolveStateName,
    resolvePCName,
    resolveACName,
    resolveDistrictName,
    getStateByName,
    getPCByName,
    getACByName,
    schema,
  };
}
