/**
 * Map layer - the PRIMARY navigation surface.
 *
 * Two things worth noting:
 * 1. Muted basemap under saturated party fills (production stacks 0.6-0.75
 *    opacity party colour over full-colour Voyager - two layers competing).
 * 2. Bidirectional linking: hovering a panel row highlights the polygon here.
 *    That is the thing the competitor structurally cannot do.
 */

import { state, partyColor, rankedCandidates, selectLocation, setHover } from './store.js';

let map = null;
let layer = null;
const byId = new Map();

const TN_CENTER = [10.9, 78.5];

export function initMap() {
  map = L.map('map', {
    center: TN_CENTER,
    zoom: 7,
    zoomControl: true,
    attributionControl: true,
  });

  // Unkeyed basemap - production calls the CARTO endpoint that now requires
  // a key, which is why "API KEY REQUIRED" is tiled across the whole map (B2).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
    className: 'map-tiles-muted',
  }).addTo(map);

  return map;
}

function styleFor(id) {
  const ac = (state.results[state.year] ?? {})[id];
  const winner = ac ? rankedCandidates(ac)[0] : null;
  const isSel = state.selectedId === id;
  const isHov = state.hoveredId === id;
  return {
    fillColor: winner ? partyColor(winner.party) : '#cfc4ae',
    fillOpacity: isSel ? 0.92 : isHov ? 0.85 : 0.7,
    color: isSel ? '#1c1a16' : isHov ? '#1c1a16' : '#ffffff',
    weight: isSel ? 2.5 : isHov ? 2 : 0.5,
  };
}

export function drawGeo() {
  if (!state.geo) return;
  if (layer) layer.remove();
  byId.clear();

  layer = L.geoJSON(state.geo, {
    style: (f) => styleFor(f.properties.id),
    onEachFeature: (f, lyr) => {
      const id = f.properties.id;
      byId.set(id, lyr);
      lyr.on({
        click: () => void selectLocation(id, { source: 'map' }),
        mouseover: () => setHover(id),
        mouseout: () => setHover(null),
      });
      lyr.bindTooltip(() => tooltipHtml(id), {
        sticky: true,
        className: 'ac-tooltip',
      });
    },
  }).addTo(map);
}

function tooltipHtml(id) {
  const ac = (state.results[state.year] ?? {})[id];
  if (!ac) return id;
  const w = rankedCandidates(ac)[0];
  const color = w ? partyColor(w.party) : '#9b9285';
  return `<span style="border-left:3px solid ${color};padding-left:6px">
    <strong>${ac.name ?? id}</strong><br>${w ? `${w.party} · ${w.share ?? '—'}%` : 'No result'}
  </span>`;
}

/** Restyle in place - far cheaper than redrawing 234 polygons on every hover. */
export function refreshStyles() {
  byId.forEach((lyr, id) => lyr.setStyle(styleFor(id)));
}

export function flyTo(id) {
  const lyr = byId.get(id);
  if (!lyr || !map) return;
  map.fitBounds(lyr.getBounds(), { padding: [40, 40], maxZoom: 10, animate: true });
}

export function resetView() {
  map?.setView(TN_CENTER, 7, { animate: true });
}

export function invalidate() {
  // Called after the panel width animates so Leaflet recomputes its size
  setTimeout(() => map?.invalidateSize(), 300);
}
