import { describe, it, expect } from 'vitest';
import { LAYER_URLS } from './layerUrls';

describe('LAYER_URLS', () => {
  it('defines every raster layer the toolbar offers', () => {
    expect(Object.keys(LAYER_URLS).sort()).toEqual(
      ['Light', 'Satellite', 'Streets', 'Terrain', 'Vector'].sort()
    );
  });

  it('gives every non-vector layer a usable tile URL and max zoom', () => {
    for (const [name, cfg] of Object.entries(LAYER_URLS)) {
      if (name === 'Vector') continue;
      expect(cfg.url).toMatch(/^https:\/\//);
      expect(cfg.maxZoom).toBeGreaterThan(0);
    }
  });

  it('marks Vector as a vector layer with no raster URL (handled by VectorTileLayer)', () => {
    expect(LAYER_URLS['Vector']).toMatchObject({ url: '', isVector: true });
  });

  it('uses {s}/{z}/{x}/{y} placeholders for subdomain-sharded raster providers', () => {
    expect(LAYER_URLS['Streets']?.url).toContain('{s}');
    expect(LAYER_URLS['Streets']?.subdomains).toBe('abc');
  });
});
