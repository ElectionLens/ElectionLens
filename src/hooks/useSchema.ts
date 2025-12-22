import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MasterSchema,
  StateEntity,
  PCEntity,
  ACEntity,
  DistrictEntity,
} from '../types/schema';

const SCHEMA_PATH = '/data/schema.json';

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
      if (!schema) return null;
      const normalized = normalizeName(name);
      const key = `${normalized}|${stateId}`;
      return schema.indices.pcByName[key] ?? null;
    },
    [schema]
  );

  const resolveACName = useCallback(
    (name: string, stateId: string): string | null => {
      if (!schema) return null;
      const normalized = normalizeName(name);
      const key = `${normalized}|${stateId}`;

      // Try direct match first
      let id = schema.indices.acByName[key];

      // Try without reservation suffix
      if (!id) {
        const cleanName = normalized.replace(/\s*\([^)]*\)\s*$/, '').trim();
        id = schema.indices.acByName[`${cleanName}|${stateId}`];
      }

      return id ?? null;
    },
    [schema]
  );

  const resolveDistrictName = useCallback(
    (name: string, stateId: string): string | null => {
      if (!schema) return null;
      const normalized = normalizeName(name);
      const key = `${normalized}|${stateId}`;
      return schema.indices.districtByName[key] ?? null;
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
