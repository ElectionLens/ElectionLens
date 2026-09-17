import type { AssemblyProperties } from '../types';
import { isAssemblyFeatureSelected } from './mapSelection';

/**
 * Identity of a browse-list row being hovered, in the sidebar.
 *
 * Deliberately carries the same three identifiers the *selection* path uses
 * rather than a bare name. Assembly names are not unique - Tamil Nadu has two
 * Tiruppattur ACs - so a name-only link would light up the wrong polygon, and
 * would do it silently.
 */
export interface HoveredFeature {
  level: 'assemblies' | 'constituencies' | 'districts' | 'states';
  name: string;
  /** AC_NO / seat number where the list has one; the strongest signal. */
  no?: number | undefined;
  schemaId?: string | undefined;
}

export interface MatchesHoveredOptions {
  hovered: HoveredFeature | null;
  level: string;
  props: Record<string, unknown>;
  /**
   * How many features share each normalised assembly name. A name-only match
   * is refused when the name is ambiguous, exactly as selection does.
   */
  assemblyNameCounts?: Map<string, number> | undefined;
}

/**
 * Read the display name for a level, using the same fallback chain each
 * browse list uses. These must stay in step: if a list labels a row from
 * `PC_NAME` but this matcher only reads `ls_seat_name`, the row highlights
 * nothing and the failure is silent.
 */
function featureName(level: string, props: Record<string, unknown>): string {
  const keys: Record<string, string[]> = {
    assemblies: ['AC_NAME'],
    constituencies: ['ls_seat_name', 'PC_NAME'],
    districts: ['district', 'NAME', 'DISTRICT'],
    states: ['shapeName', 'ST_NM'],
  };

  for (const key of keys[level] ?? []) {
    const value = props[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Does this map feature correspond to the hovered sidebar row?
 *
 * Assemblies reuse `isAssemblyFeatureSelected` verbatim so hover and selection
 * can never disagree about which polygon a row means - two matchers would be
 * two chances to be wrong, and the duplicate-name case is precisely where a
 * second implementation would drift.
 */
export function matchesHoveredFeature({
  hovered,
  level,
  props,
  assemblyNameCounts,
}: MatchesHoveredOptions): boolean {
  if (!hovered || hovered.level !== level) return false;

  if (level === 'assemblies') {
    const acProps = props as AssemblyProperties & { schemaId?: string };
    return isAssemblyFeatureSelected({
      selectedAssembly: hovered.name,
      selectedConstituencyNo: hovered.no,
      selectedSchemaId: hovered.schemaId ?? '',
      featureName: acProps.AC_NAME,
      featureSchemaId: acProps.schemaId,
      featureACNo: acProps.AC_NO,
      assemblyNameCounts,
    });
  }

  const name = featureName(level, props);
  if (!name || !hovered.name) return false;
  return normalize(name) === normalize(hovered.name);
}
