# Tamil Nadu 2021 Booth Data Extraction

## Current Status (77% Accuracy)

| Category | Count | Percentage |
|----------|-------|------------|
| Good (<15% error) | 179 | 77.2% |
| Moderate (15-30% error) | 5 | 2.2% |
| Bad (>30% error) | 48 | 20.7% |
| **Total** | **232** | 100% |

## Extraction Scripts

### 1. `remap-all-booths.py`
Remaps vote columns to official candidates using greedy vote-total matching.
- Calculates column totals from booth data
- Matches columns to official candidates by vote totals
- Handles PDF column order differences from official order

### 2. `extract-clean-v2.py`
Improved PDF parsing with better format detection.
- Detects simple vs address-containing PDF formats
- Filters pincode numbers (6-digit starting with 6)
- Validates vote totals against TotalValid column

### 3. `extract-bargur-gingee.py`
Specialized extraction for address-containing PDFs.
- Handles multi-format PDFs (NOTA before/after TotalValid)
- Filters header rows (consecutive numbers, candidate names)
- Works for PDFs like Bargur (TN-052)

### 4. `fix-booth-data-final.py` & `fix-booth-data-v5.py`
Earlier iteration scripts with format-specific parsing attempts.

## PDF Format Types

### Type A: Simple Format
```
SlNo BoothNo [CandidateVotes...] TotalValid Rejected NOTA Total
1    1       135 1 304 3 0 0 1   481        0        4    481
```

### Type B: Address-Containing Format  
```
SlNo BoothNo Address          [CandidateVotes...] TotalValid Rejected NOTA Total
1    1M      Kalikoil 635120  135 1 304 3 0 0 1   481        0        4    481
```

### Type C: NOTA After TotalValid
```
SlNo BoothNo [CandidateVotes...] TotalValid Rejected NOTA Total
1    1       263 1 0 5 18 333    641        0        6    647
```

## Known Issues

### 17 Scanned PDFs (No Text Layer)
These PDFs contain only images and require OCR:
- TN-027, TN-030, TN-031, TN-032, TN-033, TN-034, TN-035
- TN-040, TN-043, TN-044, TN-046, TN-047, TN-049
- TN-108, TN-109, TN-147, TN-148

**Solution**: Manual CSV conversion or OCR with pytesseract/Google Vision API.

### Complex Multi-line Formats
Some PDFs have vote data spread across multiple lines or have header rows interspersed with data.

**Example**: Gingee (TN-070) has vertical header labels that look like data rows.

## Validation Approach

1. Extract candidate votes from PDF
2. Sum all booth votes for each candidate column
3. Compare with official election results
4. Calculate error percentage for top 3 candidates
5. Accept if average error < 15% (allowing for postal vote difference)

## Future Improvements

1. **OCR Integration**: Add pytesseract or Google Vision API for scanned PDFs
2. **Manual CSV Import**: Script to import manually converted CSV files
3. **Multi-line Parsing**: Combine consecutive lines that belong to same booth
4. **Header Detection**: Better detection of header rows vs data rows
5. **Postal Vote Calculation**: Derive postal votes from (official - booth sum)
