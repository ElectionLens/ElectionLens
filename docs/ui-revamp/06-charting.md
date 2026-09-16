[< Back to index](./README.md)

## 6. Charting decision

They use Chart.js 4.4.4 via CDN. Our house default for reports is Chart.js too, so it's the path of least resistance — but:

- We currently ship **zero** charting libraries. Our bars are CSS divs.
- Chart.js is ~70 KB gzipped and renders to `<canvas>` — **invisible to screen readers**, which fights Phase 3.
- Our two needs (doughnut for vote share, horizontal ranked bars) are genuinely trivial in CSS/SVG.

**Recommendation: don't add Chart.js.** Build `<VoteShareDonut>` (one SVG `stroke-dasharray` circle) and `<RankedBars>` (flex divs) as accessible SVG/CSS components. Keeps us offline-first — a CDN `<script>` tag would *break our core offline promise*, which is a differentiator we should not trade for a doughnut.

Revisit only if we need time-series/swing charts across many years, where hand-rolling stops being sensible.

> **Chart.js footgun, if we ever do adopt it:** wrap the `<canvas>` in a fixed-height
> `<div>` — `responsive: true` ignores the canvas `height` attribute.

---
