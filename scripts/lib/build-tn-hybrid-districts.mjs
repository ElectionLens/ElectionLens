/**
 * Build 38-district Tamil Nadu GeoJSON for map display:
 * udit (37) Nagapattinam polygon minus Mayiladuthurai (datta07) plus Mayiladuthurai polygon.
 * Assignment AC↔district uses TN-ac-spatial.geojson (udit 37) + overrides — see reassign script.
 */

import * as turf from '@turf/turf';

const UDIT_TN_URL =
  'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@master/geojson/states/tamil-nadu.geojson';

const DATTA_TN_URL =
  'https://raw.githubusercontent.com/datta07/INDIAN-SHAPEFILES/master/STATES/TAMIL%20NADU/TAMIL%20NADU_DISTRICTS.geojson';

export function normalizeDattaFeatureProps(fc) {
  if (!fc?.features?.length) return fc;
  const sample = fc.features[0].properties || {};
  if (!sample.dtname) return fc;

  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const p = f.properties || {};
      const dtname = p.dtname || '';
      const dtcode11 = p.dtcode11 ?? '';
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          district: dtname,
          st_nm: 'Tamil Nadu',
          dt_code: String(dtcode11),
        },
      };
    }),
  };
}

/**
 * @param {object} udit - FeatureCollection from udit Tamil Nadu
 * @param {object} dattaNormalized - FeatureCollection from datta07 after normalizeDattaFeatureProps
 */
export function buildTnHybridDistrictDisplayGeojson(udit, dattaNormalized) {
  const uditNagFeat = udit.features.find((f) => f.properties?.district === 'Nagapattinam');
  const mayFeat = dattaNormalized.features.find((f) => f.properties?.district === 'Mayiladuthurai');
  if (!uditNagFeat || !mayFeat) {
    throw new Error('Hybrid TN geo: missing Nagapattinam (udit) or Mayiladuthurai (datta)');
  }

  const uditNag = turf.feature(uditNagFeat.geometry, uditNagFeat.properties);
  const may = turf.feature(mayFeat.geometry, mayFeat.properties);

  const nagRemainder = turf.difference(turf.featureCollection([uditNag, may]));
  nagRemainder.properties = {
    district: 'Nagapattinam',
    st_nm: 'Tamil Nadu',
    dt_code: String(uditNagFeat.properties.dt_code ?? mayFeat.properties.dt_code ?? '618'),
  };

  const others = udit.features
    .filter((f) => f.properties?.district !== 'Nagapattinam')
    .map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: { ...f.properties },
    }));

  return {
    type: 'FeatureCollection',
    features: [...others, nagRemainder, mayFeat],
  };
}

export async function fetchUditTnDistricts() {
  const res = await fetch(UDIT_TN_URL);
  if (!res.ok) throw new Error(`udit TN fetch failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchDattaTnDistrictsRaw() {
  const res = await fetch(DATTA_TN_URL);
  if (!res.ok) throw new Error(`datta TN fetch failed: HTTP ${res.status}`);
  return res.json();
}

export { UDIT_TN_URL, DATTA_TN_URL };
