# Booth Data Extraction Guide

A comprehensive reference for extracting booth-wise election data from various sources.

## Table of Contents

1. [Data Structure Overview](#data-structure-overview)
2. [PDF Types & Formats](#pdf-types--formats)
3. [Extraction Scripts](#extraction-scripts)
4. [Validation & Accuracy](#validation--accuracy)
5. [Common Issues & Solutions](#common-issues--solutions)
6. [Step-by-Step Process](#step-by-step-process)
7. [State-Specific Notes](#state-specific-notes)

---

## Data Structure Overview

### Output Directory Structure
```
public/data/booths/{STATE_CODE}/{AC_ID}/
├── booths.json      # Polling station metadata
└── {YEAR}.json      # Booth-wise vote results
```

### booths.json Schema
```json
{
  "acId": "TN-001",
  "acName": "GUMMIDIPUNDI",
  "state": "Tamil Nadu",
  "totalBooths": 405,
  "lastUpdated": "2021-04-06",
  "source": "Tamil Nadu CEO - Polling Stations",
  "booths": [
    {
      "id": "TN-001-1",
      "boothNo": "1",
      "num": 1,
      "type": "regular|women|auxiliary|special",
      "name": "Panchayat Union Primary School",
      "address": "Full address with building details",
      "area": "Village/Area name",
      "location": { "lat": 13.123, "lng": 80.456 }
    }
  ]
}
```

### {YEAR}.json Schema (Results)
```json
{
  "acId": "TN-001",
  "acName": "GUMMIDIPUNDI",
  "year": 2021,
  "electionType": "assembly",
  "date": "2021-04-06",
  "totalBooths": 405,
  "source": "Tamil Nadu CEO - Form 20",
  "candidates": [
    { "slNo": 1, "name": "CANDIDATE NAME", "party": "DMK", "symbol": "" }
  ],
  "results": {
    "TN-001-1": {
      "votes": [570, 36, 42],
      "total": 655,
      "rejected": 0
    }
  },
  "summary": {
    "totalVoters": 300000,
    "totalVotes": 250000,
    "turnoutPercent": 83.33,
    "winner": { "name": "...", "party": "...", "votes": 100000 },
    "runnerUp": { "name": "...", "party": "...", "votes": 80000 },
    "margin": 20000,
    "marginPercent": 8.0
  },
  "postal": {
    "candidates": [
      { "name": "...", "party": "...", "postal": 1000, "booth": 99000, "total": 100000 }
    ]
  }
}
```

---

## PDF Types & Formats

### 1. Form 20 (Booth-wise Results)
**Source**: State CEOs after elections  
**Contains**: Vote counts per booth per candidate

**Format Variations**:

| Format | Description | Script |
|--------|-------------|--------|
| Standard Column | SlNo, BoothNo, Votes..., Total, Rejected | `extract-form20.py` |
| Transposed | Candidates in rows, booths in columns | `extract-transposed-*.py` |
| Clean Format | Simple table structure | `extract-clean-format.py` |
| Row Format | One candidate per row | `extract-row-format.py` |
| Hosur Format | Special regional format | `extract-hosur-format.py` |

### 2. Polling Station Lists
**Source**: CEO websites before elections  
**Contains**: Booth names, addresses, types

### 3. Scanned/Image PDFs
**Requires**: OCR processing  
**Script**: `ocr-extract-tn-2021.py`

---

## Extraction Scripts

### Primary Extraction

#### `batch-extract-tn-2021.py`
**Purpose**: Batch process all constituencies  
**Dependencies**: `pdftotext` (poppler)  
**Usage**:
```bash
# Process all 234 TN ACs
python scripts/batch-extract-tn-2021.py

# Process specific range
python scripts/batch-extract-tn-2021.py 1 50    # ACs 1-50
python scripts/batch-extract-tn-2021.py 100 150 # ACs 100-150
```

**Key Functions**:
- `extract_pdf_text(pdf_path)`: Uses pdftotext with -layout flag
- `parse_form20_pdf()`: Parses booth results
- `generate_booth_metadata_from_results()`: Creates booth metadata

### Format-Specific Parsers

#### `extract-transposed-format.py` (v1-v6)
For PDFs where candidates are in rows and booths are in columns.
```
            Booth1  Booth2  Booth3  ...
Candidate1    100     200     150
Candidate2    150     180     120
NOTA           10      15       8
```

#### `extract-column-format.py`
For standard column layout:
```
SlNo  BoothNo  Cand1  Cand2  Cand3  Total  Rejected  NOTA  TotalVotes
1     1        100    150    200    450    5         10    465
```

### OCR Extraction

#### `ocr-extract-tn-2021.py`
**Purpose**: Extract from scanned/image PDFs  
**Dependencies**: `tesseract-ocr`, `pdf2image`

```bash
# Install dependencies
brew install tesseract
pip install pytesseract pdf2image pillow

# Run OCR extraction
python scripts/ocr-extract-tn-2021.py AC001.pdf TN-001
```

**Key Approaches**:
1. Convert PDF pages to high-DPI images (300 DPI)
2. Pre-process images (contrast, threshold)
3. Use Tesseract PSM 6 (block of text) or PSM 4 (single column)
4. Handle 270° rotated pages
5. Parse numeric data from OCR output

### Post-Processing & Fixes

#### `fix_postal_smart.py` ⭐
**Purpose**: Match booth candidates to official candidates  
**Algorithm**: Multi-pass matching

```python
# Pass 1: Exact party match at same position
# Pass 2: Party match anywhere
# Pass 3: Name similarity (>50% using SequenceMatcher)
# Pass 4: Position-based fallback
```

#### `add_nota_perfect.py` ⭐
**Purpose**: Achieve 100% accuracy by adding NOTA  
**Logic**: NOTA = validVotes - sum(candidate votes)

#### `fix_all_booths.py`
**Purpose**: Automated fixes for common issues
- Candidate reordering
- Vote scaling
- Duplicate removal

#### `perfect_candidate_match.py`
**Purpose**: Advanced 6-pass candidate matching
1. Exact normalized name + party
2. Exact normalized name
3. Same party + same position
4. Party match anywhere
5. Fuzzy name match (>60% similarity)
6. Position-based fallback

---

## Validation & Accuracy

### Validation Script: `validate_postal_accuracy.py`
```python
# Key checks:
# 1. Postal section exists
# 2. booth + postal = total for each candidate
# 3. Sum of totals matches official validVotes
```

### Accuracy Targets

| Level | Error % | Description |
|-------|---------|-------------|
| Perfect | 0% | Exact match to official results |
| Near-perfect | <0.5% | Minor rounding differences |
| Acceptable | <2% | Small extraction errors |
| Needs work | >2% | Manual review required |

### Accuracy Formula
```python
error_pct = abs(our_total - official_validVotes) / official_validVotes * 100
```

---

## Common Issues & Solutions

### Issue 1: PDF text extraction fails
**Solution**: 
```bash
pdftotext -layout file.pdf output.txt  # Preserve layout
pdftotext -raw file.pdf output.txt     # Simple extraction
```

### Issue 2: Scanned PDFs
**Solution**: Use OCR extraction
```bash
# Check if PDF is scanned
pdftotext -layout file.pdf - | head -20
# If empty → use OCR script
```

### Issue 3: Rotated pages
**Solution**: 
```python
from PIL import Image
img = img.rotate(-90)  # or 90, 180, 270
```

### Issue 4: Women's booth detection
**Patterns**: `(W)`, `A(W)`, suffix `W` in booth ID

```python
booth_type = "regular"
if '(W)' in booth_no.upper() or booth_no.upper().endswith('W'):
    booth_type = "women"
```

### Issue 5: Candidate order mismatch
**Solution**: Multi-pass matching (see `fix_postal_smart.py`)

### Issue 6: Booth ID normalization
```python
def normalize_booth_id(booth_id, ac_id):
    if not booth_id.startswith(ac_id):
        return f"{ac_id}-{booth_id}"
    return booth_id
```

---

## Step-by-Step Process

### For a New State/Year

```bash
# 1. Gather source PDFs
mkdir -p ~/Desktop/{STATE}_PDFs/

# 2. Create state directory
mkdir -p public/data/booths/{STATE_CODE}

# 3. Get official election results
# Place in: public/data/elections/ac/{STATE_CODE}/{YEAR}.json

# 4. Initial extraction
python scripts/batch-extract-{state}-{year}.py

# 5. Validate
python scripts/validate_postal_accuracy.py

# 6. Fix issues
python scripts/fix_postal_smart.py
python scripts/add_nota_perfect.py

# 7. Final validation
python scripts/validate_postal_accuracy.py
```

---

## State-Specific Notes

### Tamil Nadu (TN) - 2021

**Total ACs**: 234  
**PDF Format**: Mix of standard and transposed  
**Booth ID Format**: `TN-{AC_NUM:03d}-{BOOTH_NO}`

**Scripts used (in order)**:
1. `batch-extract-tn-2021.py` - Main extraction
2. `extract-transposed-v6.py` - For transposed format PDFs
3. `ocr-extract-tn-2021.py` - For scanned PDFs
4. `fix_postal_smart.py` - Candidate matching
5. `add_nota_perfect.py` - NOTA addition

**Data sources**:
- Form 20: `~/Desktop/TNLA_2021_PDFs/`
- Polling stations: `~/Desktop/TN_PollingStations_English/`

**Final result**: 234/234 ACs at 100% accuracy

---

## Dependencies

### System
```bash
brew install poppler        # pdftotext
brew install tesseract      # OCR (if needed)
```

### Python
```bash
pip install pandas openpyxl pdf2image pytesseract pillow
```

---

## Quick Reference

### File Naming
- AC ID: `{STATE}-{NUM:03d}` (e.g., TN-001)
- Booth ID: `{AC_ID}-{BOOTH_NO}` (e.g., TN-001-150)
- PDF: `AC{NUM:03d}.pdf` (e.g., AC001.pdf)

### Key Regex
```python
numbers = re.findall(r'\d+', line)
is_women = bool(re.search(r'\(W\)|(?<!\w)W$', booth_id, re.I))
```

### Validation Command
```bash
python -c "
import json; from pathlib import Path
print(sum(1 for f in Path('public/data/booths/TN').glob('*/2021.json') 
          if 'postal' in json.load(open(f))))
"
```

---

## Troubleshooting Checklist

- [ ] PDF exists and is readable
- [ ] pdftotext extracts text (not scanned)
- [ ] Official election data loaded
- [ ] Candidate count matches
- [ ] Booth IDs normalized
- [ ] Women's booths detected
- [ ] Postal votes calculated
- [ ] NOTA included
- [ ] Total matches validVotes
