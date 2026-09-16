[< Back to index](./README.md)

## 4. What to steal from them (and what to ignore)

### Steal

**S1. The podium + KPI strip.** Their single best idea. Above the fold:
a 4-card row (Winner / Runner-up / 3rd / Margin) with party-colored left borders and
candidate photos, then a 7-cell KPI strip (Total, Valid, NOTA, Rejected, Winner-led
booths, Runner-led booths, Total booths). You know the whole result in two seconds.
Our equivalent data is *below* a raw candidate table. **Invert that.**

**S2. Winner-led vs runner-led booth counts as a headline stat.** They surface
`244 / 80` in the KPI strip. We compute richer versions of this in
`boothwiseAnalysisEngine.ts` (607 lines of it!) and bury it in a tab. Promote it.

**S3. Indian digit grouping everywhere.** They show `2,32,630`. We're inconsistent (B3).

**S4. Ranked horizontal bars beside the candidate table.** Their All-Candidates view
pairs a ranked bar chart with exact tabular numbers — scan *and* precision. Our
candidate list is numbers only, no visual weight.

**S5. Explicit tab bar with underline-active state.** Theirs is scannable at a glance;
ours is a `<select>` dropdown that hides sibling options.

**S6. Booth mini-cards with sparkline bars.** For 344 booths they use lightweight
repeated cards with 3 mini-bars instead of 344 charts. Good pattern for our 84k booths
— though we'll need virtualization they didn't bother with.

**S7. Their restraint with chart types.** Doughnut + bar. That's it. No chart that
needs a legend to decode.

### Do not steal
- **Their homepage.** A 234-card unpaginated scroll wall. Our map *is* the better index.
- **Their flat card grid as primary navigation.** We have geography; they don't. Don't throw away our biggest differentiator to imitate a site that lacks it.
- **Their single-state, single-year scope.** Obviously.
- **Chart.js as a hard dependency** — see §4.
- **Their party colours.** See the correctness warning in §2b — they are wrong, and copying
  them would import a factual error into our design system.

---
