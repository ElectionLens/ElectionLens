import { STATE_FILE_MAP, COLOR_PALETTES } from '../constants';

// Remove diacritics from text (Rājasthān -> Rajasthan)
export function removeDiacritics(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normalize state name (remove diacritics, trim)
export function normalizeStateName(name) {
  if (!name) return '';
  return removeDiacritics(name).trim();
}

// Get state file name from state name
export function getStateFileName(stateName) {
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

// Get color for a feature based on index and level
export function getFeatureColor(index, level) {
  const palette = COLOR_PALETTES[level] || COLOR_PALETTES.states;
  return palette[index % palette.length];
}

// Get GeoJSON style for a feature
export function getFeatureStyle(index, level) {
  const color = getFeatureColor(index, level);
  return {
    fillColor: color,
    fillOpacity: 0.65,
    color: '#fff',
    weight: 1.5,
    opacity: 1
  };
}

// Get hover style for a feature
export function getHoverStyle(level) {
  const colorMap = {
    states: '#333',
    districts: '#333',
    constituencies: '#5b21b6',
    assemblies: '#166534'
  };
  return {
    weight: 3,
    color: colorMap[level] || '#333',
    fillOpacity: 0.8
  };
}

// Title case conversion
export function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

