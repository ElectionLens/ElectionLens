/**
 * Panel renderers: podium, KPI strip, ranked bars, donut, data-nav list.
 * All hand-rolled SVG/CSS - deliberately no Chart.js (see plan section 6).
 */

import {
  state,
  fmt,
  partyColor,
  getAC,
  rankedCandidates,
  notaVotes,
  acMargin,
  acMarginPct,
  setHover,
  selectLocation,
} from './store.js';
import { visibleRows, metricDisplay, SORTS } from './datanav.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const ROLES = ['Winner', 'Runner-up', '3rd'];

/** Podium: 2x2 at >=520px, collapses to winner-only at 360px. */
function podiumHtml(ac) {
  const ranked = rankedCandidates(ac).slice(0, 3);
  const margin = acMargin(ac);
  const marginPct = acMarginPct(ac);

  const cards = ranked.map((c, i) => {
    const color = partyColor(c.party);
    return `<article class="podium-card${i === 0 ? ' is-winner' : ''}" style="--pc:${color}">
      <div class="podium-role">${ROLES[i]}
        <span class="party-pill" style="--pc:${color}">${esc(c.party)}</span>
      </div>
      <div class="podium-votes">${fmt(c.votes)}</div>
      <div class="podium-name" title="${esc(c.name)}">${esc(c.name)}</div>
      <div class="podium-sub">${c.share != null ? `${c.share}% of valid` : ''}</div>
    </article>`;
  });

  cards.push(`<article class="podium-card" style="--pc:var(--accent)">
      <div class="podium-role">Winning margin</div>
      <div class="podium-votes">${fmt(margin)}</div>
      <div class="podium-sub">${marginPct != null ? `${marginPct.toFixed(2)}% of valid votes` : ''}</div>
    </article>`);

  return `<div class="podium">${cards.join('')}</div>`;
}

/** KPI strip - wraps via auto-fit, never forced to 7 across. */
function kpiHtml(ac) {
  const ranked = rankedCandidates(ac);
  const nota = notaVotes(ac);
  const items = [
    ['Electors', fmt(ac.electors)],
    ['Valid votes', fmt(ac.valid)],
    ['Turnout', ac.turnout != null ? `${ac.turnout}%` : '—'],
    ['NOTA', fmt(nota)],
    ['Candidates', fmt(ranked.length)],
    ['Type', ac.type ?? '—'],
  ];
  return `<div class="kpi-strip">${items
    .map(
      ([l, v]) =>
        `<div class="kpi"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${esc(v)}</div></div>`
    )
    .join('')}</div>`;
}

/** SVG donut - accessible, offline, no canvas. */
function donutHtml(ac) {
  const ranked = rankedCandidates(ac);
  const total = ranked.reduce((s, c) => s + (c.votes ?? 0), 0) || 1;
  const top = ranked.slice(0, 5);
  const otherVotes = total - top.reduce((s, c) => s + (c.votes ?? 0), 0);

  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segs = [];
  const legend = [];

  const push = (label, votes, color) => {
    const frac = votes / total;
    segs.push(
      `<circle r="${R}" cx="64" cy="64" stroke="${color}"
        stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}"
        stroke-dashoffset="${(-offset * C).toFixed(2)}"></circle>`
    );
    legend.push(
      `<div class="legend-item" style="--pc:${color}">
        <span class="legend-swatch"></span>
        <span class="legend-label">${esc(label)}</span>
        <span class="legend-val">${(frac * 100).toFixed(1)}%</span>
      </div>`
    );
    offset += frac;
  };

  top.forEach((c) => push(`${c.name} (${c.party})`, c.votes ?? 0, partyColor(c.party)));
  if (otherVotes > 0) push(`Others (${ranked.length - top.length})`, otherVotes, '#b9b0a2');

  const summary = top
    .map((c) => `${c.name} ${c.party} ${(((c.votes ?? 0) / total) * 100).toFixed(1)}%`)
    .join('; ');

  return `<div class="donut-wrap">
    <svg class="donut" width="128" height="128" viewBox="0 0 128 128" role="img"
         aria-label="Vote share: ${esc(summary)}">${segs.join('')}</svg>
    <div class="donut-legend">${legend.join('')}</div>
  </div>`;
}

/** Ranked candidate bars + exact figures (their S4). */
function candidatesHtml(ac) {
  const ranked = rankedCandidates(ac);
  const max = ranked[0]?.votes ?? 1;
  const rows = ranked
    .map((c) => {
      const color = partyColor(c.party);
      const pct = ((c.votes ?? 0) / max) * 100;
      return `<div class="cand-row" style="--pc:${color}">
        <div class="cand-rank">${c.rank}</div>
        <div class="cand-main">
          <div class="cand-name" title="${esc(c.name)}">${esc(c.name)}
            <span class="party-pill" style="--pc:${color}">${esc(c.party)}</span>
          </div>
          <div class="cand-bar-track"><div class="cand-bar" style="width:${pct}%"></div></div>
        </div>
        <div class="cand-figs">
          <span class="cand-votes">${fmt(c.votes)}</span>
          <span class="cand-share">${c.share != null ? `${c.share}%` : ''}</span>
        </div>
      </div>`;
    })
    .join('');
  return `<div class="section"><h3>All candidates (${ranked.length})</h3>${rows}</div>`;
}

export function renderDetail(id) {
  const ac = getAC(id);
  if (!ac) return '<div class="empty">No result for this constituency.</div>';
  return `
    <h2 class="sr-only">${esc(ac.name)} result</h2>
    ${podiumHtml(ac)}
    ${kpiHtml(ac)}
    <div class="section"><h3>Vote share</h3>${donutHtml(ac)}</div>
    ${candidatesHtml(ac)}
  `;
}

/** Data-nav ranked list. Every row is map-linked. */
export function renderDataList() {
  const rows = visibleRows();
  const sortOpts = Object.entries(SORTS)
    .map(
      ([k, v]) =>
        `<option value="${k}" ${state.sort === k ? 'selected' : ''}>${esc(v.label)}</option>`
    )
    .join('');

  const parties = [...new Set(rows.map((r) => r.winner?.party).filter(Boolean))].sort();
  const partyOpts = [
    `<option value="">All parties</option>`,
    ...parties.map(
      (p) => `<option value="${esc(p)}" ${state.party === p ? 'selected' : ''}>${esc(p)}</option>`
    ),
  ].join('');

  const list = rows
    .map((r) => {
      const color = r.winner ? partyColor(r.winner.party) : '#9b9285';
      const m = metricDisplay(r);
      return `<button class="rank-row" data-id="${r.id}" style="--pc:${color}">
        <span class="rank-no">${r.no ?? ''}</span>
        <span class="cand-main">
          <span class="rank-ac">${esc(r.name)}</span>
          <span class="rank-meta">
            <span class="party-pill" style="--pc:${color}">${esc(r.winner?.party ?? '—')}</span>
            ${esc(r.district ?? '')}
          </span>
        </span>
        <span class="rank-metric">${esc(m.main)}<small>${esc(m.sub)}</small></span>
      </button>`;
    })
    .join('');

  return `
    <div class="data-controls">
      <div class="control-pair">
        <div>
          <label for="sort-sel">Rank by</label>
          <select id="sort-sel">${sortOpts}</select>
        </div>
        <div>
          <label for="party-sel">Won by</label>
          <select id="party-sel">${partyOpts}</select>
        </div>
      </div>
    </div>
    <p class="result-count">${rows.length} constituencies · ${esc(state.year)}</p>
    <div id="rank-list">${list || '<div class="empty">No constituencies match.</div>'}</div>
  `;
}

/** Wire hover/click on ranked rows -> map. The bidirectional link. */
export function bindDataListEvents(root) {
  root.querySelectorAll('.rank-row').forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener('mouseenter', () => setHover(id));
    el.addEventListener('mouseleave', () => setHover(null));
    el.addEventListener('focus', () => setHover(id));
    el.addEventListener('blur', () => setHover(null));
    el.addEventListener('click', () => void selectLocation(id, { source: 'data' }));
  });
}
