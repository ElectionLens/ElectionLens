import { STATE_FILE_MAP, COLOR_PALETTES } from '../constants';
import type { MapLevel, FeatureStyle, HoverStyle, HexColor, ColorPalette } from '../types';

/**
 * Remove diacritics from text (Rājasthān -> Rajasthan)
 * Uses Unicode normalization to decompose characters and remove combining marks
 */
export function removeDiacritics(str: string | null | undefined): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize state name by removing diacritics and trimming whitespace
 */
export function normalizeStateName(name: string | null | undefined): string {
  if (!name) return '';
  return removeDiacritics(name).trim();
}

/**
 * Get the file name for a state's GeoJSON data
 * Handles diacritical variations and alternate names
 */
export function getStateFileName(stateName: string | null | undefined): string {
  if (!stateName) return '';

  // Direct lookup
  if (STATE_FILE_MAP[stateName]) {
    return STATE_FILE_MAP[stateName];
  }

  // Try normalized name
  const normalized = normalizeStateName(stateName);
  if (STATE_FILE_MAP[normalized]) {
    return STATE_FILE_MAP[normalized];
  }

  // Try to find by normalized match
  for (const [key, value] of Object.entries(STATE_FILE_MAP)) {
    if (normalizeStateName(key) === normalized) {
      return value;
    }
  }

  // Generate from name as fallback
  return normalized.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Get color for a feature based on index and map level
 * Colors cycle through the palette when index exceeds length
 */
export function getFeatureColor(index: number, level: MapLevel | null | undefined): HexColor {
  const palette: ColorPalette = COLOR_PALETTES[level as MapLevel] || COLOR_PALETTES.states;
  return palette[index % palette.length] as HexColor;
}

/**
 * Get GeoJSON style for a feature
 * Returns Leaflet-compatible path options
 */
export function getFeatureStyle(index: number, level: MapLevel): FeatureStyle {
  const color = getFeatureColor(index, level);
  return {
    fillColor: color,
    fillOpacity: 0.65,
    color: '#fff',
    weight: 1.5,
    opacity: 1,
  };
}

/**
 * Get hover style for a feature
 * Returns level-specific border color for visual feedback
 */
export function getHoverStyle(level: MapLevel | null | undefined): HoverStyle {
  const colorMap: Record<string, string> = {
    states: '#333',
    districts: '#333',
    constituencies: '#5b21b6',
    assemblies: '#166534',
  };
  return {
    weight: 3,
    color: colorMap[level as string] || '#333',
    fillOpacity: 0.8,
  };
}

/**
 * Convert string to title case
 * Example: "TAMIL NADU" -> "Tamil Nadu"
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
