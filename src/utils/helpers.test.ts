import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  getStateFileName,
  getFeatureColor,
  getFeatureStyle,
  getHoverStyle,
  toTitleCase,
} from './helpers';

describe('normalizeName', () => {
  it('strips diacritics from text', () => {
    expect(normalizeName('Tamil Nādu')).toBe('Tamil Nadu');
    expect(normalizeName('Mahārāshtra')).toBe('Maharashtra');
  });

  it('trims whitespace', () => {
    expect(normalizeName('  Tamil Nadu  ')).toBe('Tamil Nadu');
    expect(normalizeName('\nKerala\t')).toBe('Kerala');
  });

  it('handles null and undefined', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });

  it('handles empty strings', () => {
    expect(normalizeName('')).toBe('');
  });
});

describe('getStateFileName', () => {
  it('returns correct file names for known states', () => {
    expect(getStateFileName('Tamil Nadu')).toBe('tamil-nadu');
    expect(getStateFileName('Andhra Pradesh')).toBe('andhra-pradesh');
  });

  it('handles diacritics in state names', () => {
    expect(getStateFileName('Tamil Nādu')).toBe('tamil-nadu');
  });

  it('handles null and undefined', () => {
    expect(getStateFileName(null)).toBe('');
    expect(getStateFileName(undefined)).toBe('');
  });

  it('generates slug from name as fallback', () => {
    const result = getStateFileName('Some New State');
    expect(result).toBe('some-new-state');
  });
});

describe('getFeatureColor', () => {
  it('returns a hex color string', () => {
    const color = getFeatureColor(0, 'states');
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('cycles through colors based on index', () => {
    const color1 = getFeatureColor(0, 'states');
    const color2 = getFeatureColor(1, 'states');
    expect(color1).not.toBe(color2);
  });

  it('handles different map levels', () => {
    const stateColor = getFeatureColor(0, 'states');
    const districtColor = getFeatureColor(0, 'districts');
    // Colors may differ by level based on palette
    expect(stateColor).toBeDefined();
    expect(districtColor).toBeDefined();
  });

  it('handles null/undefined level with fallback', () => {
    const color = getFeatureColor(0, null);
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('getFeatureStyle', () => {
  it('returns a style object with required properties', () => {
    const style = getFeatureStyle(0, 'states');
    expect(style).toHaveProperty('fillColor');
    expect(style).toHaveProperty('fillOpacity');
    expect(style).toHaveProperty('color');
    expect(style).toHaveProperty('weight');
    expect(style).toHaveProperty('opacity');
  });

  it('returns valid fill opacity', () => {
    const style = getFeatureStyle(0, 'districts');
    expect(style.fillOpacity).toBeGreaterThanOrEqual(0);
    expect(style.fillOpacity).toBeLessThanOrEqual(1);
  });

  it('returns white border color', () => {
    const style = getFeatureStyle(0, 'constituencies');
    expect(style.color).toBe('#fff');
  });
});

describe('getHoverStyle', () => {
  it('returns hover style with increased weight', () => {
    const style = getHoverStyle('states');
    expect(style.weight).toBe(3);
    expect(style.fillOpacity).toBe(0.8);
  });

  it('returns different border colors for different levels', () => {
    const stateStyle = getHoverStyle('states');
    const assemblyStyle = getHoverStyle('assemblies');
    expect(stateStyle.color).toBe('#333');
    expect(assemblyStyle.color).toBe('#166534');
  });

  it('handles constituencies level', () => {
    const style = getHoverStyle('constituencies');
    expect(style.color).toBe('#5b21b6');
  });

  it('handles null/undefined with fallback', () => {
    const style = getHoverStyle(null);
    expect(style.color).toBe('#333');
  });
});

describe('toTitleCase', () => {
  it('converts strings to title case', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
    expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
    expect(toTitleCase('hElLo WoRlD')).toBe('Hello World');
  });

  it('handles single words', () => {
    expect(toTitleCase('hello')).toBe('Hello');
    expect(toTitleCase('HELLO')).toBe('Hello');
  });

  it('handles null and undefined', () => {
    expect(toTitleCase(null)).toBe('');
    expect(toTitleCase(undefined)).toBe('');
  });

  it('handles empty strings', () => {
    expect(toTitleCase('')).toBe('');
  });

  it('handles names with numbers', () => {
    expect(toTitleCase('indore-1')).toBe('Indore-1');
    expect(toTitleCase('WARD 123')).toBe('Ward 123');
  });
});
