/**
 * App wiring. Map-primary on desktop, data-primary on mobile (plan section 2).
 */

import {
  state,
  subscribe,
  loadData,
  setMode,
  setYear,
  setSort,
  setParty,
  selectLocation,
  getAC,
} from './store.js';
import { initMap, drawGeo, refreshStyles, flyTo, resetView, invalidate } from './mapview.js';
import { renderDetail, renderDataList, bindDataListEvents } from './panels.js';

const $ = (s) => document.querySelector(s);
const panel = $('#panel');
const body = $('#panel-body');
const crumb = $('#breadcrumb');

const isMobile = () => window.innerWidth <= 768;

/** Panel width follows MODE, not drill-down depth (plan section 2). */
function resolvePanelMode() {
  if (state.mode === 'data') return 'deep';
  return state.selectedId ? 'analyse' : 'map';
}

function renderChrome() {
  const pm = resolvePanelMode();
  panel.dataset.mode = pm;
  document.documentElement.dataset.mode = pm;

  $('#mode-map').setAttribute('aria-pressed', String(state.mode === 'map'));
  $('#mode-data').setAttribute('aria-pressed', String(state.mode === 'data'));

  const ac = state.selectedId ? getAC(state.selectedId) : null;
  crumb.innerHTML = ac
    ? `<button id="crumb-home">Tamil Nadu</button><span>›</span>
       <span>${ac.district ?? ''}</span><span>›</span><strong>${ac.name}</strong>`
    : `<strong>Tamil Nadu</strong><span>·</span><span>234 constituencies</span>`;

  const home = $('#crumb-home');
  if (home) {
    home.addEventListener('click', () => {
      state.selectedId = null;
      resetView();
      render();
    });
  }
}

function renderBody() {
  if (state.mode === 'data') {
    body.innerHTML = renderDataList();
    bindDataListEvents(body);
    $('#sort-sel')?.addEventListener('change', (e) => setSort(e.target.value));
    $('#party-sel')?.addEventListener('change', (e) => setParty(e.target.value));
    return;
  }
  if (state.selectedId) {
    body.innerHTML = renderDetail(state.selectedId);
    return;
  }
  body.innerHTML = `<div class="empty">
    <p><strong>Click a constituency on the map.</strong></p>
    <p>Or switch to <em>Data</em> to rank all 234 by margin, turnout or NOTA
    — every row jumps back to the map.</p>
  </div>`;
}

function render() {
  renderChrome();
  renderBody();
  refreshStyles();
  invalidate();
}

function renderMapBadge() {
  const ac = state.selectedId ? getAC(state.selectedId) : null;
  $('#map-badge').innerHTML = ac
    ? `<strong>${ac.name}</strong>AC ${ac.no ?? '—'} · ${ac.district ?? ''}`
    : `<strong>Tamil Nadu ${state.year}</strong>Assembly result by constituency`;
}

async function boot() {
  initMap();
  await loadData();
  drawGeo();
  renderMapBadge();

  // Mobile inverts the default: 390px cannot show adjacency, so data-nav
  // is the sensible landing surface (plan section 2, "the honest exception").
  if (isMobile()) state.mode = 'data';

  subscribe((reason) => {
    if (reason === 'hover') {
      refreshStyles();
      syncHoverHighlight();
      return;
    }
    if (reason === 'year') {
      drawGeo();
      renderMapBadge();
      render();
      return;
    }
    if (reason === 'filter') {
      renderBody();
      return;
    }
    if (reason === 'select') {
      renderMapBadge();
      render();
      if (state.selectedId) flyTo(state.selectedId);
      return;
    }
    render();
  });

  $('#mode-map').addEventListener('click', () => setMode('map'));
  $('#mode-data').addEventListener('click', () => setMode('data'));
  $('#year-pick').addEventListener('change', (e) => setYear(e.target.value));

  render();
}

/** Mirror map hover onto the corresponding list row. */
function syncHoverHighlight() {
  document.querySelectorAll('.rank-row').forEach((el) => {
    el.classList.toggle('is-linked', el.dataset.id === state.hoveredId);
  });
}

boot().catch((err) => {
  body.innerHTML = `<div class="empty">Failed to load: ${err.message}</div>`;
  console.error(err);
});
