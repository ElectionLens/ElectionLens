import { describe, it, expect } from 'vitest';
import { DIMMED_MAP_FILL_OPACITY, mergeDimmedNonFocusStyle } from './mapDimming';

describe('mergeDimmedNonFocusStyle', () => {
  it('applies shared dim fill, stroke opacity, and muted border color', () => {
    const merged = mergeDimmedNonFocusStyle({
      fillColor: '#ff0000',
      fillOpacity: 0.7,
      color: '#fff',
      weight: 2,
      opacity: 1,
    });
    expect(merged.fillOpacity).toBe(DIMMED_MAP_FILL_OPACITY);
    expect(merged.opacity).toBe(0.75);
    expect(merged.color).toBe('#94a3b8');
    expect(merged.fillColor).toBe('#ff0000');
    expect(merged.weight).toBe(2);
  });
});
