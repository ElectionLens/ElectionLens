# 100% Extraction Accuracy Strategy

## Current Status
- **832 empty booths remaining** (out of 68,505 total)
- **27 scanned PDFs** with extraction issues
- **27 text PDFs** with extraction issues
- **Overall coverage: 98.8%**

## Multi-Strategy Approach

### 1. Text-Based PDFs (200 ACs)
**Current Issues:**
- Some tables not detected properly
- Edge cases in text parsing
- Missing booths in complex layouts

**Solutions:**
1. **Multi-method extraction:**
   - pdfplumber tables (primary)
   - pdfplumber text extraction (fallback)
   - pdftotext command-line (fallback)
   - Merge results with confidence scoring

2. **Enhanced table detection:**
   - Detect header rows dynamically
   - Handle multi-line headers
   - Better number extraction with context

3. **Pattern matching improvements:**
   - Recognize booth number patterns
   - Handle serial numbers vs booth numbers
   - Better vote column detection

### 2. Scanned PDFs (34 ACs)
**Current Issues:**
- OCR accuracy varies (30-50% extraction)
- Some pages fail completely
- Column alignment issues

**Solutions:**
1. **Multi-OCR strategy:**
   - pytesseract with 5 preprocessing methods
   - Surya OCR (page-by-page to avoid crashes)
   - Merge results with confidence scoring
   - Keep highest confidence per booth

2. **Enhanced preprocessing:**
   - Standard thresholding
   - High contrast enhancement
   - Adaptive thresholding
   - Denoising
   - Morphological operations
   - Sharpening

3. **Better OCR parsing:**
   - Aggressive character correction (O→0, l→1)
   - Position-based column detection
   - Row grouping by Y-coordinate
   - Confidence-based filtering

### 3. Validation & Quality Control

**Strict Validation:**
- 95% extraction ratio required (up from 70%)
- 10% deviation allowed (down from 30%)
- Booth + postal = total verification
- Low-voting candidate anomaly detection

**Accuracy Reporting:**
- Per-candidate accuracy metrics
- Overall extraction ratio
- Booth win anomaly detection
- Detailed error reporting

### 4. Retry Logic

**For Failed Extractions:**
1. Try alternative preprocessing
2. Try different OCR engines
3. Try different page segmentation modes
4. Flag for manual review if all fail

### 5. Manual Review Flagging

**For Remaining Edge Cases:**
- Generate detailed reports for failed ACs
- List specific booths that couldn't be extracted
- Provide page numbers and context
- Enable manual data entry interface

## Implementation Priority

### Phase 1: Text PDFs (Quick Wins)
- Enhance table detection
- Add pdftotext fallback
- Improve pattern matching
- **Target: 100% of text PDFs**

### Phase 2: Scanned PDFs (Medium Effort)
- Implement multi-OCR strategy
- Add Surya OCR integration
- Enhanced preprocessing pipeline
- **Target: 95%+ of scanned PDFs**

### Phase 3: Edge Cases (Manual)
- Identify remaining problematic booths
- Generate manual review reports
- Create data entry interface
- **Target: 100% coverage**

## Expected Results

After full implementation:
- **Text PDFs: 100% extraction** (200 ACs)
- **Scanned PDFs: 95-98% extraction** (34 ACs)
- **Overall: 99.5-99.8% coverage**
- **Remaining: <100 booths** for manual review

## Key Improvements Needed

1. ✅ Multi-strategy extraction (implemented in v2)
2. ✅ Enhanced validation (already in place)
3. ✅ Surya OCR integration (needs testing)
4. ⚠️ Better table detection (needs enhancement)
5. ⚠️ Confidence-based merging (needs implementation)
6. ⚠️ Retry logic (needs implementation)
7. ⚠️ Manual review flagging (needs creation)
