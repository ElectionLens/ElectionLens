/**
 * Tamil Nadu: assembly constituency numbers whose revenue district must be set
 * explicitly (spatial joins alone can mis-label when coarse district GeoJSON overlaps AC shapes).
 *
 * AC 161 — Mayiladuthurai — use official dt code from Census/LGD shape metadata (796 in datta07).
 */
export const TN_AC_DISTRICT_OVERRIDES = {
  161: { distName: 'MAYILADUTHURAI', dtCode: 796 },
};
