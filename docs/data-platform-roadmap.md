# Data Platform Roadmap: Full Electoral History, Booth-Level Truth, and AI Insights

> Companion to `docs/ui-revamp-plan.md`. That document is a UI facelift, ~2-3 weeks.
> **This one is not that.** Modeling constituency identity across 70 years of
> delimitation, re-validating 84,000+ booths against source documents, and building
> a grounded AI-insights layer is a multi-quarter data platform program. Treat the
> phases below as a roadmap to sequence and resource, not a sprint backlog.

---

## 0. Two assumptions in the question that today's data disproves

Before designing around a premise, I checked it against the files we actually have.
Worth stating plainly because both change the schema.

### "Only one type of election would have happened in a particular year" — **false**

Checked every state where we hold both AC and PC files for the same year:

```
AP: 2009, 2014, 2019, 2024   AR: 2009, 2014, 2019   HR: 2009, 2014, 2019, 2024
JH: 2009, 2014, 2019, 2024   JK: 2014, 2024          MH: 2009, 2014, 2019, 2024
OD: 2009, 2014, 2019, 2024   ...and more
```

Andhra Pradesh, Odisha, Sikkim, Arunachal Pradesh, and several others have
historically held **simultaneous Assembly + Lok Sabha elections**. The schema must
allow both election types to coexist for a given state-year — modeling them as
mutually exclusive would silently drop real elections.

### "We are missing districts JSON accurately for all states" — **partially false, more subtle than stated**

`public/data/geo/districts/` has a populated file for **all 36 states/UTs**, and spot
counts match current reality (TN 38, UP 75, AP 26). Existence isn't the gap.

The actual gap: `district-validation-report.json` at the repo root — the only
rigor artifact we have — validated **only TN's 38 districts**. There is no evidence
the other 35 states have been checked against post-2014 reorganizations the same
way. **The problem isn't missing files, it's unvalidated ones.** Re-scope from "get
district data" to "run the TN validation methodology against the other 35 states."

---

## 1. The real problem underneath "build PC from AC" and "split PC into AC per year"

Good news: **this mostly already exists.** Every PC results file already carries
per-candidate `acWiseVotes` (see `elections/pc/TN/2019.json`) — extracted at
ingestion time from the same Form 20-style source tables. `PCElectionResultPanel.tsx`
and `parliamentContributions.ts` (14.8 KB) already render this. "Split parliament
into assembly to view" is a rendering/promotion task (feeds Phase 2.5's data-nav),
not a new data pipeline.

What's genuinely missing: **for years/states where we have AC results but no
separate PC file**, we cannot currently reconstruct an approximate PC total by
aggregating the ACs that map to it. That's a real, scoped feature:

```
PC total (approx) = Σ AC results for every AC in that PC's mapping, for the closest
                     AC election year to the PC election year
```

This is necessarily approximate (AC and PC elections are rarely the same year,
and AC-to-PC mapping itself changes with delimitation — see §2) but useful as a
labeled estimate, never presented as an official figure.

**Action:** add a `deriveApproxPCFromAC()` utility, gated on data provenance —
output must be visibly marked "estimated from AC-level data, not an official PC
result" wherever it's shown.

---

## 2. The actual hard problem: constituency identity across delimitation

This is the one structural gap everything else in the question depends on, and it
doesn't exist in the schema at all today.

### What we have now

`AS/index.json` carries `"delimitation": 2024` — **one tag for the entire state's
dataset.** There is no concept of "this AC in 2011 corresponds to that AC in 2026"
beyond assuming the `schemaId` stays constant. For states whose boundaries or seat
count changed across a delimitation, that assumption is simply wrong, and nothing
in the code currently checks it.

### Why this matters concretely

India has had constituency delimitations in **1951, 1961, 1971 (frozen until
2001), and 2008** (effective from 2008, based on 2001 census), plus ad hoc state
reorganizations (J&K 2022, Assam 2023 mentioned in code already). Across these:

- **Names change** (constituencies renamed, merged, split).
- **Numbers change** (AC-042 in 1971 is not AC-042 in 2008).
- **Shapes change** (boundaries redrawn even when name/number persist).
- **Seat counts change** (states gain/lose seats at reorganization).

A flat `schemaId` scheme (`TN-001`) that means "AC number 1 in the current
delimitation" cannot represent "the seat that covered this geography in 1962,"
because that seat may have had a different number, different neighbors, and no
1:1 successor.

### The design: a constituency lineage graph, not a bigger flat table

Model each delimitation era's constituency as its own node, and link nodes across
eras with an explicit relationship type — because the mapping is not always 1:1:

```jsonc
{
  "id": "TN-1971-042",
  "era": "1971-2007",
  "name": "GUMMIDIPOONDI",
  "successors": [
    { "id": "TN-2008-001", "relation": "renamed" }      // 1:1, name/number changed
  ]
},
{
  "id": "TN-1961-018",
  "era": "1961-1970",
  "name": "OLDNAME",
  "successors": [
    { "id": "TN-1971-042", "relation": "split", "shareEstimate": 0.6 },
    { "id": "TN-1971-043", "relation": "split", "shareEstimate": 0.4 }
  ]
}
```

`relation` must cover at minimum: `unchanged`, `renamed`, `merged` (N→1),
`split` (1→N), `boundary-redrawn` (same name/number, different shape — the
sneaky one, because naive joins miss it entirely).

This lineage graph is what makes "show me this seat's history back to 1951"
answerable at all, and it's a prerequisite for §6 (historical backfill) and for
any honest year-over-year swing analysis — **comparing 2024 to 1971 vote share for
"the same" seat is meaningless without knowing if the boundary moved.**

**This is a research project before it's an engineering task.** The source for
this lineage is the Delimitation Commission's own gazetted orders (1951, 1961,
1976 freeze notification, 2008 Delimitation Commission report) — these exist as
public documents but are not machine-readable. Building the crosswalk means
reading and encoding them, state by state.

---

## 3. District accuracy, properly scoped

Given §0's finding, the real workplan is:

1. Generalize `district-validation-report.json`'s TN methodology (it's a single
   state's check) into a script that runs for all 36 states.
2. For each state, verify district count and names against the **authoritative
   current source** (Census 2011 district list + subsequent state gazette
   notifications for splits since), not just internal consistency.
3. Explicitly flag states with recent splits, mirroring the AS/TN handling already
   in `assamAssemblyGeo.ts` — **Telangana (21 new districts, 2016), Andhra Pradesh
   (13→26, 2022), Tamil Nadu (2019-2020), UP, MP** and others all need the
   new-district-to-parent-district mapping the README claims exists. Verify it's
   complete, not just present for the states we've already touched.
4. Publish the per-state validation report the way TN's already is, so gaps are
   visible instead of assumed away.

---

## 4. Booth-level accuracy: redefining "100%" honestly

The existing pipeline (`docs/booth-data-extraction-guide.md`) is more rigorous
than I expected — multi-pass candidate matching, NOTA-balancing, a defined
accuracy formula. Worth being precise about what it actually proves, because
**"100% accuracy" as currently measured is a necessary condition, not a
sufficient one.**

### What today's validation actually checks

```
error_pct = |our_total - official_validVotes| / official_validVotes × 100
```

This confirms **totals reconcile.** It does **not** confirm every individual
candidate's per-booth number is correct — two candidates' figures could be
transposed and the total would still balance perfectly. `add_nota_perfect.py`
computing `NOTA = validVotes - Σ(candidate votes)` is a similar risk: it forces
the checksum to close by construction, which can mask an upstream extraction
error rather than catch one.

### What "100% accuracy" needs to actually mean

Three independent layers, not one:

1. **Reconciliation (existing).** Booth + postal = official total, per candidate.
   Necessary, already built, keep it.
2. **Independent re-extraction cross-check (missing).** Re-run OCR/text-extraction
   with a second, independent method (e.g., a different OCR engine or a
   from-scratch layout parser) on a statistically meaningful random sample per
   state-year (not just the ones that failed validation), and diff against the
   production numbers digit-by-digit. This catches the transposition case
   reconciliation cannot.
3. **Statistical sampling audit (missing).** For a random ~2-5% sample of booths
   per state, manually verify against the source Form 20 PDF/image. Report a
   confidence interval, not a binary pass/fail — "99.7% ± 0.2% booth-candidate
   cells verified correct" is an honest, defensible claim; "100% accuracy" from
   total-reconciliation alone is not.

### Data-quality badges, surfaced in the UI

`BoothDataQualityBanner.tsx` and `boothDataQuality.ts` already exist and already
distinguish Form20-sourced vs. estimated fill (per the README). Extend that
provenance model to carry: `{ source: 'form20-text' | 'form20-ocr' | 'estimated',
crossValidated: boolean, sampledAudit: boolean }` per booth-year, and surface it —
this is a differentiator, not just internal QA. **Show your work; nobody else does.**

---

## 5. Historical depth to 1951 — a realism check before a commitment

Every state's data starts at 2008-2014 (the post-2008 delimitation). Going back to
1951 is not "add more JSON files" — it's three separate hard problems stacked:

1. **Source availability.** ECI publishes *Statistical Reports* for every general
   election back to 1951-52 on eci.gov.in, but as scanned PDFs of varying quality.
   Assembly-level historical data is patchier and split across state archives.
   Some early-decade AC-level data may not exist in digitized form anywhere.
2. **The delimitation crosswalk (§2) is a hard prerequisite**, not a nice-to-have.
   Without it, an AC-level number from 1962 cannot be placed on a map or connected
   to today's geography at all.
3. **Historical boundary geometry.** We need *shapefiles for each delimitation
   era*, not just current boundaries with a label. These are far rarer than
   result tables; some may not exist in digitized GIS form and would need to be
   redrawn from gazette-published verbal boundary descriptions.

**Recommendation:** backfill by delimitation era, starting from the most recent
extendable boundary (2008 → 1976-2007, since boundaries didn't change in that
window, only results need adding) before attempting pre-1976 eras where both
geometry and crosswalk are hardest. Treat 1951-1961 as a research spike with an
explicit "may not be fully recoverable" expectation, not a committed deliverable.

---

## 6. Booth-level "why did a party win" — the actual differentiator

This is the most valuable idea in the request and the thing the competitor
cannot do at all. But "why" is a causal claim, and election data is observational
— be disciplined about what the tool can honestly assert.

### What's defensible today, computable from data we already have

- **Swing decomposition**: this booth's vote share change vs. the AC's average
  change, vs. its own history. Isolates whether a booth moved *with* or *against*
  its constituency.
- **Neighbor comparison**: compare a booth to demographically/geographically
  similar booths (same AC, similar turnout band) — surfaces outliers worth a
  human explaining, without the tool claiming to know *why*.
- **Turnout-margin correlation**: does this booth's turnout delta correlate with
  the margin shift, within this AC. Correlation, labeled as such.
- **Candidate-specific booth strongholds**: `boothwiseAnalysisEngine.ts` (607
  lines) already computes strike rates and landslide/battleground flags — this
  is the foundation, it just needs a narrative layer on top (§8).

### What is not defensible without more data, and should be labeled as a hypothesis if shown at all

- Attributing a swing to a specific campaign event, candidate action, or local
  issue — that requires the news/context layer (§7) supplying a *citable* source,
  not an LLM inferring a story to fit the numbers.
- Any claim about *why* rooted in the constituency's demographic composition
  unless that composition is itself sourced from a public, cited dataset (which
  is precisely where §7 (caste) needs to be handled carefully).

**Principle for the whole analysis layer: separate "what changed" (data,
provable) from "why it changed" (hypothesis, must cite a source or be labeled as
speculative).** This distinction should be enforced in the UI, not left to prose.

---

## 7. Caste-wise data — flagged, not just built

This is the part of the request that needs the most care, and I'd be doing you a
disservice building it on request without saying so plainly first.

### Why this is harder than "get more data," and where the ground truth actually breaks down

- The Indian Census has not published individual caste enumeration (beyond
  SC/ST) since **1931**. The Socio Economic Caste Census (SECC 2011) *did*
  collect this data but its caste tables were **never officially released** —
  by design, because of the political sensitivity. There is no authoritative,
  granular, nationwide dataset to build this feature against. A handful of
  states have published their own caste surveys (Bihar 2023 is the most
  complete), but coverage is sparse and inconsistent.
- The common workaround — **inferring caste from candidate/voter surnames** —
  is not a data-quality shortcut, it's a fundamentally different and much
  weaker method: the same surname spans many castes and varies by region, so
  the error rate is large and unmeasurable against a ground truth that doesn't
  exist to check it against.
- **Caste is classified as sensitive personal data under India's DPDP Act 2023.**
  A booth typically represents a few hundred to a low-thousands of voters —
  granular enough that a "booth-level caste estimate" functions close to
  individual-level inference in practice, not aggregate demographics. The
  Election Commission has separately and repeatedly acted against caste-based
  campaign targeting. Building infrastructure that estimates caste composition
  at booth granularity is the kind of capability that enables exactly the
  targeting behavior regulators are trying to prevent, regardless of our
  intent — that risk exists independent of how accurate the estimate is.

### What I'd recommend instead, if the underlying goal is socio-political context

- Use **only officially published, aggregate survey data** where it exists
  (e.g. a state's own published caste survey), joined at **district level**,
  never inferred, never below the resolution the source itself publishes.
- Label it unambiguously as "from the [State] Caste Survey, [year], district
  level" — never presented as our own estimate, never extrapolated to a finer
  grain than the source provides.
- Do **not** build name/surname-based inference of any kind, at any granularity.
  It cannot be validated and it is the specific technique most associated with
  the harms above.

**This should be a product decision made with eyes open, not a default "yes and
here's how."** Happy to build the sourced, district-level, clearly-labeled
version if you want it — recommend against the inferred, booth-level version
regardless of accuracy achievable, for the reasons above.

---

## 8. News and external analysis ingestion

Distinct from the "no competitor scrapers" guardrail — this is public journalism,
not a licensed competitor data product, and attribution makes it fine. Two honest
patterns:

1. **Curated, cited annotations** — a human (or an AI-assisted-but-reviewed
   pipeline) attaches a dated, sourced note to a specific AC/booth/year:
   "Local reporting attributed the swing here to X [source, date]." Never
   auto-published without the citation resolving to a real, checkable article.
2. **Do not** auto-scrape and auto-summarize news into causal claims the tool
   asserts as fact. That's exactly the failure mode §6 warns about, just
   laundered through a news source instead of an LLM's own inference.

`BlogSection.tsx` is already the closest thing we have to this pattern (curated,
narrative, cites specific numbers) — extend that model rather than inventing a
scraping pipeline.

---

## 9. The AI insights layer

Per house rules, this routes through **AI Innovation Lab / AI Launchpad**, not an
ad hoc API key. Design constraints, given everything above:

1. **Retrieval-grounded, not generative-first.** The model answers *from* our
   verified structured data (results, booth reconciliation status, cited news
   annotations) — it does not generate a "why" from vote numbers alone. If asked
   "why did DMK win Gummidipoondi," the answer surfaces the swing/turnout/neighbor
   data from §6 and any cited context from §8, explicitly distinguishing
   observed-fact from cited-hypothesis. It does not invent a mechanism.
2. **Every generated claim carries a citation** — either to our own data (which
   AC/booth/year) or to an external source URL from §8. No bare assertions.
3. **Never surfaces inferred sensitive attributes** (§7) even if a user prompts
   for them — this is a hard guardrail on the retrieval layer, not a prompt
   instruction the model could be talked out of.
4. **Data-quality provenance (§4) is part of the context window.** If asked about
   a booth whose data is OCR-estimated rather than cross-validated, the answer
   should say so.

---

## 10. Sequencing

This is a program, not a sprint. Rough phase order, each gated on the previous
because §2 (identity crosswalk) is a load-bearing prerequisite for §5, §6, and
honest year-over-year comparison generally:

| Phase | Scope | Depends on | Status |
|---|---|---|---|
| A | Fix the false assumption in the schema: allow simultaneous AC+PC per state-year | — | **Done** (`5993ebef`) |
| B | District validation methodology generalized to all 36 states (§3) | — | |
| C | Booth accuracy: add independent-re-extraction cross-check + sampling audit + provenance badges (§4) | — | |
| D | `deriveApproxPCFromAC()` for gap-filling, clearly labeled as estimated (§1) | — | |
| E | **Constituency lineage graph** — research + encode 2008/1976 delimitation orders first (§2) | — | |
| F | Booth-level swing/neighbor/correlation analysis surfaced in UI, "what changed" only (§6) | C | |
| G | Historical backfill 1976-2007 (geometry stable, results need adding) | E | |
| H | News/context annotation layer, curated + cited (§8) | — | |
| I | AI insights layer via AI Innovation Lab, grounded + cited + guardrailed (§9) | C, F, H | |
| J | Historical backfill pre-1976 (research spike, may be partially unrecoverable) | E, G | |
| — | **Caste data: district-level, officially-sourced only, if approved as a product decision (§7)** | explicit sign-off | |

### Phase A — what actually shipped

Turned out to be two bugs in `scripts/generate-schema.mjs`, not a type-level
schema change — the `MasterSchema` type already modeled
`elections: { assembly: number[], parliament: number[] }` as two independent
arrays (checked before touching anything; good instinct to verify rather than
assume the type needed redesigning).

1. `parliament: []` was a hardcoded literal. No code path read PC data at all
   when building the schema.
2. The assembly lookup was *also* silently broken, for an unrelated reason:
   `electionIndices[slugName]` (a name-slug key, `'andhra-pradesh'`) never
   matched the map's actual keys (2-letter directory codes, `'AP'`) for any of
   the 36 states. `elections.assembly` and `assemblySeats` were both empty
   before parliament was even considered.

Regenerated `schema.json`: 8 states (MH, SK, OD, AP, AR, JH and others) now
visibly carry an overlapping assembly+parliament year in the same entry — the
concrete, checkable form of "the schema can represent a simultaneous
election." Zero behavior change today (nothing in `src` reads those fields
yet), 535/535 tests pass. Full writeup in the commit message.

A, B, D are independently shippable in weeks. C and E are the two multi-month
foundations everything valuable (F, G, I, J) sits on top of — resource those first
even though they're the least visible externally.

---

## 11. What I'd say no to, or push back on, as currently framed

- **"100% accuracy" as a claim** — replace with a measured confidence interval
  plus provenance badges (§4). More honest and, said out loud to users, more
  impressive than an unverifiable round number.
- **Booth-level or surname-inferred caste data** — recommend against, for
  reasons in §7, independent of achievable accuracy.
- **"Why did a party win" as a direct factual answer** — reframe as "what
  changed" (data) plus "cited context" (news), never a model-invented mechanism.
- **1951 coverage as a committed deliverable** — reframe as a phased research
  effort with an explicit chance some eras are unrecoverable (§5).
