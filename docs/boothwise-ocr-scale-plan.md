# Boothwise extraction at scale: OCR-first, source-audited pipeline

## Current archive-2 import

`archive 2/boothwise_dataset` is the TN 2026 seed dataset:

- `*_Form_20.csv`: booth-level votes and candidate columns.
- `*_Form_20.pdf`: source Form 20.
- `*_Poll_Station_Details.pdf`: polling-station number, building, address, area and type.

The importer is `scripts/tn_2026_import_archive2_dataset.py`.

It is deliberately fail-closed:

1. Validate CSV shape and reserved columns.
2. Parse every numeric cell; recover only a single-number OCR cell such as `e 2187`.
3. Match candidates by normalized name, reversed OCR name, or cyclic rotation.
4. For generic headers, match column totals to official AC candidate totals by rank.
5. Require booth-column sums not to exceed official totals and keep postal residual below a ceiling.
6. Require Form20 and polling-station row counts to agree.
7. Write only validated ACs; emit a report for manual review instead of guessing.

The first safe run imported 118 ACs after adding arithmetic layout recovery and a `pdftotext -layout` polling-station fallback. The remaining ACs are retained in the report as flagged and one archive AC is absent. This is intentional: “100% reconciled” must mean every booth value is traceable to a source row, not that a residual was distributed into synthetic booths.

## Canonical data contract

Every source package should be converted to these normalized entities:

### `polling_stations`

- `state_id`, `election_id`, `ac_id`
- `polling_station_no` (string; preserve `12A`, `12M`, `12(W)`)
- `numeric_no` (derived sort key, never the identity by itself)
- `name`, `address`, `polling_area`, `station_type`
- `source_document_id`, `source_page`, `source_row`, `confidence`

### `booth_results`

- `state_id`, `election_id`, `ac_id`, `polling_station_no`
- `candidate_id` (never a candidate column position)
- `votes`, `rejected_votes`, `nota_votes`, `tendered_votes`
- `source_document_id`, `source_page`, `source_row`, `extraction_method`, `confidence`

### `extraction_runs` and `review_queue`

Store the parser version, OCR engine/version, input SHA-256, page image SHA-256,
coordinates, raw OCR text, normalized value, and validation failures. A reviewer must be
able to reproduce any number shown in the UI from the original page crop.

## Extraction strategy

### 1. Ingest and classify

- Download only from an approved election authority source.
- Hash and retain the original PDF; never mutate it.
- Detect text PDF, rotated text PDF, image-only scan, table PDF, and mixed PDF.
- Render image-only pages at 300–400 DPI with deskew and orientation detection.

### 2. Extract in layers

Use the cheapest reliable method first:

1. Native text/table extraction (`pdfplumber`/Camelot-style parsing).
2. Layout-aware OCR on page crops, not the whole page.
3. OCR ensemble for difficult pages: multiple rotations, thresholding and segmentation modes.
4. Manual review for unresolved or conflicting cells.

Candidate headers and polling-station rows must be parsed independently. Never infer a
candidate identity from a column position when a source name or official candidate list is
available.

### 3. Normalize without losing provenance

- Normalize whitespace, punctuation, Tamil/English Unicode variants and OCR confusions.
- Keep the raw value beside the normalized value.
- Preserve auxiliary booth suffixes; do not flatten them to integers.
- Use an explicit candidate-alias table with deterministic and fuzzy scores.
- Reject ambiguous aliases instead of silently selecting the nearest candidate.

### 4. Validate at four levels

**Cell:** integer range, no impossible negative value, OCR confidence threshold.

**Row:** candidate sum equals valid votes; total equals valid + rejected + NOTA where the
source form defines that relationship; tendered votes remain separate.

**AC:** every Form 20 polling-station row maps exactly once to a polling-station record;
no duplicate station identity; source row/page coverage is complete.

**Election:** booth sums plus explicitly sourced postal votes reconcile to official AC totals.
A residual may be reported as `unmapped`, but must never be presented as booth data.

## Human review gates

Use three queues:

- **Green:** deterministic parse, exact row counts, all arithmetic checks pass.
- **Amber:** recoverable OCR noise or candidate alias with one unambiguous match; require
  sampled review before bulk acceptance.
- **Red:** missing rows, duplicate numbers, candidate-column ambiguity, multi-number OCR
  cells, aggregate overcount, or missing polling-station PDF; do not publish.

Review tooling should show the page image crop, raw OCR, parsed cells, neighboring rows,
expected candidate list, and the exact failed invariant. A reviewer correction becomes a
versioned override, not an edit to the raw source.

## Scaling to every year/state

1. Build a source registry keyed by `(state, election_type, year)` with URLs, document type,
   language, expected AC count and parser profile.
2. Create per-format adapters only for layout differences; keep normalization, validation,
   provenance and review queue shared.
3. Run extraction as resumable jobs partitioned by state/year/AC/page.
4. Store raw PDFs and page images outside the frontend bundle; publish compact validated JSON
   shards and a manifest with checksums.
5. Require a validation report before a shard can be promoted to production.
6. Keep parser fixtures for every discovered PDF layout, including rotated, scanned, auxiliary
   and bilingual forms.
7. Re-run old years whenever a parser improves, compare manifests, and require a reviewed
   diff rather than silently changing historical numbers.

## Definition of 100% accuracy

A dataset is “100% accurate” only when all of the following are true:

- Every published booth/station row has a source document, page and row reference.
- Every candidate vote is mapped to an official candidate identity.
- All source rows are accounted for exactly once, including auxiliary rows.
- Row, AC and election-level invariants pass.
- No synthetic booth distribution is used to conceal missing extraction.
- Red and unresolved amber records are zero, or are explicitly excluded from the published
  coverage denominator.
