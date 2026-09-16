[< Back to index](./README.md)

## 2d. Second benchmark: tnmla.in (member-centric model)

> **Provenance:** `tnmla.in` is blocked by the corporate web gateway ("Blocked by URL
> Filter Database", reputation: Unverified), so this section is a **user-supplied
> description, not a measured inspection**. Unlike [§2b](./02b-card-visual-spec.md) —
> where pixel values came from direct screenshots — nothing here has been verified
> first-hand. Treat the layout claims as reliable and the absence of numbers as a real
> gap. To upgrade: request access at `https://puppy.walmart.com/url-allowlist`, then
> re-measure.

### Why this benchmark matters more than the first

It indexes by a **different primary key**. The Vercel benchmark and ElectionLens both
index by *place*; tnmla.in indexes by *person*:

| | election-data-2026 | tnmla.in | ElectionLens today |
|---|---|---|---|
| Primary key | constituency | **member (MLA)** | constituency |
| Card subject | AC number + name | person: photo, party, portfolio | — |
| Filters | text search only | district, party, boundary | — |
| Detail | vote breakdown | contact, assets, cases | vote breakdown |
| Scope | one election | sitting assembly | multi-year, multi-state |

This resolves the single-benchmark risk flagged in §2b: having two references shows which
patterns are genuine convention (card grid + filter + detail drill-down — both do it)
versus one team's choice (the Vercel site's result-free directory card, which tnmla.in
does *not* copy — it puts real content on the card face).

### What is worth adopting

**T1. Put identity on the card face.** Their card carries name, photo, constituency,
party, and portfolio. This independently confirms §2b's main criticism of the Vercel
directory card: a card with only an ID and two buttons wastes the format. Reinforces the
§2b recommendation (winner + party + margin + turnout on our AC cards).

**T2. Filter by district / party / boundary.** Both benchmarks have a card grid; only
tnmla.in has real filtering. With 234 records, search-only is insufficient — exactly the
§2b criticism. Maps cleanly onto our planned `?sort=` / `?party=` query params (§2), and
our data already supports it: **33 districts** and **6+ winning parties** are derivable
today.

**T3. Superlative list pages** ("wealthiest", "most cases", "women MLAs"). This is
data-nav in its purest form — the "*where* did X happen?" question §2 says map-nav is bad
at. We already compute richer material in `boothwiseAnalysisEngine.ts`; our honest
equivalents are *closest contests*, *largest margins*, *highest turnout*, *seats that
flipped* — all derivable, none requiring new data.

**T4. A prominent "not official" disclaimer.** They run a high-visibility banner naming
the ECI and the Assembly explicitly. We make similar implicit claims by republishing
Form 20 data, and we have **24,939 synthetic booth rows** (see
`scripts/verify_tn_2026_accuracy.py`). A provenance banner is a credibility asset, not an
apology.

**T5. Footer data provenance + a correction channel.** They name sources (ECI affidavits,
assembly bulletins) and publish a correction address. Given our booth data is
*partially* source-backed, naming provenance per-surface is more honest than a blanket
"verified" tier — and a correction channel is the cheapest possible data-quality input.

### What we cannot copy, and must not fake

**We hold no person-level data. Verified against the repo:**

| Field their profile shows | In our data? |
|---|---|
| Asset / wealth disclosures | **No** |
| Pending criminal cases | **No** |
| Contact details (phone, email, post) | **No** |
| Cabinet portfolio / govt role | **No** |
| Photograph | **No** |
| Candidate `age` | field exists, **0 / 234 populated** |
| Candidate `sex` | field exists, **3 / 234 populated** |

Consequences, stated plainly:

- **A "women MLAs" list is not currently buildable.** `sex` is populated for 3 of 234
  winners. Shipping it would produce a confidently wrong page. Either backfill from ECI
  affidavit data first, or do not build it.
- **Asset/criminal-case tracking is out of scope** unless we take on ADR/MyNeta ingestion,
  which is a data-platform commitment (see `../data-platform-roadmap.md`), not a UI task.
- **Member profiles would be near-empty.** We can derive name, party, constituency,
  votes, vote share, and margin for all 234 — a *results* profile, not a *person* profile.
  That is a legitimate thing to build; it is not what tnmla.in is.

If we adopt T3, the superlatives must come from our own strengths (margins, turnout,
booth-level swing), not from imitating theirs. Copying their list titles without their
data is how a civic-data site loses trust.

**Their legal-records framing is worth imitating even so:** they pair criminal-case data
with explicit presumption-of-innocence notes. The transferable principle is that
sensitive derived claims ship with their caveat attached — the same discipline our
`dataQuality.tier` should enforce.

### Where this changes the plan

- §2b's "directory cards must carry result data" is now supported by **two** independent
  references. Treat it as settled.
- Filtering moves from nice-to-have to expected: two of two benchmarks with card grids
  have it; only one has sort.
- A provenance/disclaimer surface (T4/T5) should be added to Phase 0 in
  [§5](./05-phases.md) — it is hours of work and disproportionately affects credibility.
- Their **person-keyed** model is a genuine third navigation axis alongside §2's map-nav
  and data-nav. Out of scope now for want of data; worth recording as a future direction
  if affidavit ingestion ever happens.
