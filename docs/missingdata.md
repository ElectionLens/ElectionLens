# Missing election data (inventory)

See **[missing-constituency-data.md](./missing-constituency-data.md)** for the full report: schema constituencies whose keys are absent from `public/data/elections` JSON (plus how to read actionable vs large-gap sections).

**Queue for manual JSON backfill:** use the **Likely deferred / countermanded** list and the **Full list — actionable** sections in that file (≤10 missing keys per state-year). Large-gap sections usually need ID alignment first, not raw Form 20 row-by-row entry.

No election JSON files were changed in this documentation update; add rows only from verified official sources.

Regenerate the inventory: `node scripts/find-missing-constituencies.mjs --doc`
