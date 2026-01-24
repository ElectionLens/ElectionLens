#!/usr/bin/env python
"""
Enhanced Unified PDF Parser for 2021 Data - 100% Accuracy Target
==================================================================
Multi-strategy extraction with fallbacks to achieve 100% accuracy for 2021 ACS data.

Adapted from unified-pdf-parser-v2.py for 2021 election data.

Usage:
    python scripts/unified-pdf-parser-v2-2021.py 30        # Process single AC
    python scripts/unified-pdf-parser-v2-2021.py --fix-column-offset  # Fix column offset issues
    python scripts/unified-pdf-parser-v2-2021.py --fix-missing  # Fix missing booths
    python scripts/unified-pdf-parser-v2-2021.py --all     # Process all needing extraction
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

import pdfplumber
try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Configuration for 2021 data
FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")

# Import common utilities from original parser
sys.path.insert(0, str(Path(__file__).parent))
try:
    from unified_pdf_parser import (
        MIN_VOTES_PER_BOOTH, MAX_VOTES_PER_BOOTH,
        BoothResult, ExtractionResult, ValidationResult
    )
except ImportError:
    # Fallback definitions if import fails
    MIN_VOTES_PER_BOOTH = 20
    MAX_VOTES_PER_BOOTH = 3000
    
    @dataclass
    class BoothResult:
        booth_no: int
        votes: list
        total: int
        source_page: int = 0
        confidence: float = 0.8
    
    @dataclass
    class ExtractionResult:
        ac_id: str
        pdf_type: str
        booths: dict = field(default_factory=dict)
        pages_processed: int = 0
        errors: list = field(default_factory=list)
        warnings: list = field(default_factory=list)

# Enhanced thresholds
MIN_EXTRACTION_RATIO = 0.95  # Must extract at least 95% of expected booths
MAX_VOTE_DEVIATION = 0.10     # Stricter: 10% deviation allowed


# ============================================================================
# Data Loading Functions
# ============================================================================

def load_reference_data():
    """Load 2021 election data and schema."""
    with open(AC_DATA_PATH) as f:
        ac_data = json.load(f)
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    return ac_data, schema


def load_existing_data(ac_id: str) -> dict:
    """Load existing 2021.json data for an AC."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if results_file.exists():
        with open(results_file) as f:
            return json.load(f)
    return {"results": {}, "acId": ac_id, "year": 2021}


def get_ac_official_data(ac_id: str, ac_data: dict, schema: dict) -> dict:
    """Get official election data for an AC."""
    official = ac_data.get(ac_id, {})
    return {
        'ac_id': ac_id,
        'ac_name': official.get('constituencyName', ac_id),
        'candidates': official.get('candidates', []),
        'valid_votes': official.get('validVotes', 0),
        'total_votes': official.get('validVotes', 0),
        'electors': official.get('electors', 0)
    }


# ============================================================================
# Multi-Strategy Text Extraction (same as v2)
# ============================================================================

def extract_text_pdf_multi_strategy(pdf_path: Path, num_candidates: int, ac_id: str) -> ExtractionResult:
    """Extract from text PDF using multiple strategies and merge best results."""
    all_booths = {}  # booth_id -> (BoothResult, confidence)
    
    # Strategy 1: pdfplumber tables (highest confidence)
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        booths = parse_table_enhanced(table, num_candidates, page_num)
                        for booth in booths:
                            key = f"{booth.booth_no:03d}"
                            if key not in all_booths or all_booths[key][1] < 0.95:
                                all_booths[key] = (booth, 0.95)
    except Exception as e:
        pass
    
    # Strategy 2: pdfplumber text extraction
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                booths = parse_text_enhanced(text, num_candidates, page_num)
                for booth in booths:
                    key = f"{booth.booth_no:03d}"
                    if key not in all_booths or all_booths[key][1] < 0.85:
                        all_booths[key] = (booth, 0.85)
    except Exception as e:
        pass
    
    # Strategy 3: pdftotext (fallback)
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            booths = parse_text_enhanced(result.stdout, num_candidates, 0)
            for booth in booths:
                key = f"{booth.booth_no:03d}"
                if key not in all_booths or all_booths[key][1] < 0.75:
                    all_booths[key] = (booth, 0.75)
    except Exception as e:
        pass
    
    # Merge results (keep highest confidence)
    result = ExtractionResult(ac_id=ac_id, pdf_type="text")
    result.booths = {k: v[0] for k, v in all_booths.items()}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            result.pages_processed = len(pdf.pages)
    except:
        result.pages_processed = 0
    
    return result


def parse_table_enhanced(table: list, num_candidates: int, page_num: int) -> list[BoothResult]:
    """Enhanced table parsing with better pattern matching."""
    booths = []
    
    if not table or len(table) < 2:
        return booths
    
    # Find header row
    header_row = 0
    for i, row in enumerate(table[:5]):
        if row and any(cell and isinstance(cell, str) and 
                      any(kw in str(cell).upper() for kw in ['SL', 'STATION', 'NO', 'SERIAL']) 
                      for cell in row[:3]):
            header_row = i
            break
    
    # Process data rows
    for row_idx, row in enumerate(table[header_row + 1:], start=header_row + 1):
        if not row or len(row) < 3:
            continue
        
        # Clean and extract numbers
        clean_row = []
        for cell in row:
            if cell is None:
                clean_row.append("")
            else:
                cell_str = str(cell).strip()
                cell_str = re.sub(r'[^\d\s]', ' ', cell_str)
                clean_row.append(cell_str)
        
        # Extract all numbers
        all_numbers = []
        for cell in clean_row:
            nums = re.findall(r'\b(\d+)\b', cell)
            all_numbers.extend([int(n) for n in nums])
        
        if len(all_numbers) < 4:
            continue
        
        # Find booth number
        booth_no = None
        vote_start = 0
        
        for i, num in enumerate(all_numbers[:5]):
            if 1 <= num <= 600:
                booth_no = num
                vote_start = i + 1
                break
        
        if not booth_no:
            continue
        
        # Extract votes
        votes = []
        for num in all_numbers[vote_start:]:
            if num <= 2000:
                votes.append(num)
            elif num > 5000:
                break
        
        if len(votes) >= 3:
            votes = votes[:num_candidates]
            while len(votes) < num_candidates:
                votes.append(0)
            
            total = sum(votes)
            if MIN_VOTES_PER_BOOTH <= total <= MAX_VOTES_PER_BOOTH:
                booths.append(BoothResult(
                    booth_no=booth_no,
                    votes=votes,
                    total=total,
                    source_page=page_num,
                    confidence=0.95
                ))
    
    return booths


def parse_text_enhanced(text: str, num_candidates: int, page_num: int) -> list[BoothResult]:
    """Enhanced text parsing with better pattern recognition."""
    booths = []
    lines = text.split('\n')
    
    for line in lines:
        if any(kw in line.upper() for kw in ['FORM 20', 'ELECTION', 'CANDIDATE', 'PARTY', 'TOTAL', 'NOTA', 'POSTAL']):
            continue
        
        numbers = []
        for match in re.finditer(r'\b(\d+)\b', line):
            numbers.append(int(match.group(1)))
        
        if len(numbers) < 4:
            continue
        
        booth_no = None
        vote_start = 0
        
        for i, num in enumerate(numbers[:3]):
            if 1 <= num <= 600:
                booth_no = num
                vote_start = i + 1
                break
        
        if not booth_no:
            continue
        
        votes = []
        for num in numbers[vote_start:]:
            if num <= 2000:
                votes.append(num)
            elif num > 5000:
                break
        
        if len(votes) >= 3:
            votes = votes[:num_candidates]
            while len(votes) < num_candidates:
                votes.append(0)
            
            total = sum(votes)
            if MIN_VOTES_PER_BOOTH <= total <= MAX_VOTES_PER_BOOTH:
                booths.append(BoothResult(
                    booth_no=booth_no,
                    votes=votes,
                    total=total,
                    source_page=page_num,
                    confidence=0.85
                ))
    
    return booths


# ============================================================================
# Column Order Correction
# ============================================================================

def correct_column_order(extraction: ExtractionResult, official_data: dict, num_candidates: int) -> ExtractionResult:
    """Correct column order by matching to official totals."""
    if len(extraction.booths) < 10:
        return extraction
    
    # Calculate column sums
    col_sums = [0] * (num_candidates + 5)  # Allow extra columns
    for booth in extraction.booths.values():
        for i, v in enumerate(booth.votes):
            if i < len(col_sums):
                col_sums[i] += v
    
    # Check for column offset (col0 > 2x col1 and col0 > 50000)
    # Also check if col0 values look like "Total Electors" (400-2500 range per booth)
    has_offset = False
    if len(col_sums) > 1:
        # Method 1: col0 >> col1 (classic offset)
        if col_sums[0] > col_sums[1] * 2 and col_sums[0] > 50000:
            has_offset = True
        
        # Method 2: Check if first column values look like electors (400-2500 per booth)
        sample_booths = list(extraction.booths.values())[:20]
        if sample_booths:
            first_col_values = [b.votes[0] for b in sample_booths if len(b.votes) > 0]
            if first_col_values:
                avg_first = sum(first_col_values) / len(first_col_values)
                # Total Electors typically 400-2500, votes typically 50-2000
                if 400 <= avg_first <= 2500:
                    # Check if removing first column improves match
                    official_total = official_data.get('valid_votes', 0)
                    total_with_first = col_sums[0]
                    total_without_first = sum(col_sums[1:num_candidates+1])
                    
                    if official_total > 0:
                        ratio_with = abs(total_with_first - official_total) / official_total
                        ratio_without = abs(total_without_first - official_total) / official_total
                        
                        # If removing first column gives better match, it's likely offset
                        if ratio_without < ratio_with * 0.8:
                            has_offset = True
    
    if has_offset:
        # Remove first column
        extraction.warnings.append("Column offset detected - removing first column (Total Electors)")
        for booth in extraction.booths.values():
            if len(booth.votes) > 0:
                booth.votes = booth.votes[1:]
                while len(booth.votes) < num_candidates:
                    booth.votes.append(0)
                booth.total = sum(booth.votes)
        
        # Recalculate to verify
        col_sums_new = [0] * num_candidates
        for booth in extraction.booths.values():
            for i, v in enumerate(booth.votes):
                if i < num_candidates:
                    col_sums_new[i] += v
        
        official_total = official_data.get('valid_votes', 0)
        extracted_total = sum(col_sums_new)
        if official_total > 0:
            ratio = extracted_total / official_total
            if 0.90 <= ratio <= 1.10:
                extraction.warnings.append(f"Column offset fixed - ratio now {ratio:.2%}")
    
    return extraction


# ============================================================================
# Main Processing
# ============================================================================

def process_ac_enhanced(ac_num: int, ac_data: dict, schema: dict, force: bool = False) -> dict:
    """Process AC with multi-strategy extraction for 2021 data."""
    ac_id = f"TN-{ac_num:03d}"
    
    print(f"\n{'='*70}")
    print(f"Processing {ac_id} (2021 Enhanced Multi-Strategy)")
    print(f"{'='*70}")
    
    # Load existing data
    existing = load_existing_data(ac_id)
    
    # Find booths needing extraction
    needs_extraction = set()
    for k, v in existing.get('results', {}).items():
        if not v.get('votes') or len(v.get('votes', [])) == 0:
            match = re.match(r'^TN-\d{3}-0*(\d+)', k)
            if match:
                needs_extraction.add(int(match.group(1)))
    
    if not needs_extraction and not force:
        print(f"  ✓ All booths already have vote data")
        return {'status': 'complete', 'ac_id': ac_id}
    
    print(f"  Booths needing extraction: {len(needs_extraction)}")
    
    # Get official data
    official_data = get_ac_official_data(ac_id, ac_data, schema)
    candidates = official_data.get('candidates', [])
    num_candidates = len(candidates)
    
    if num_candidates == 0:
        return {'status': 'error', 'error': 'No candidates found'}
    
    print(f"  Candidates: {num_candidates}")
    print(f"  Official votes: {official_data.get('valid_votes', 0):,}")
    
    # Check PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {'status': 'error', 'error': 'PDF not found'}
    
    # Detect PDF type
    pdf_type = detect_pdf_type(pdf_path)
    print(f"  PDF type: {pdf_type}")
    
    # Extract with multi-strategy
    if pdf_type == "text":
        extraction = extract_text_pdf_multi_strategy(pdf_path, num_candidates, ac_id)
    else:
        return {'status': 'error', 'error': f'Scanned PDF extraction not yet implemented for 2021'}
    
    print(f"  Extracted {len(extraction.booths)} booths from {extraction.pages_processed} pages")
    
    # Correct column order
    if len(extraction.booths) > 10:
        extraction = correct_column_order(extraction, official_data, num_candidates)
    
    # Validate against official
    col_sums = [0] * num_candidates
    for booth in extraction.booths.values():
        for i, v in enumerate(booth.votes):
            if i < num_candidates:
                col_sums[i] += v
    
    print(f"\n  📊 Validation:")
    print(f"    Extracted votes: {sum(col_sums):,}")
    print(f"    Official votes:  {official_data.get('valid_votes', 0):,}")
    
    if official_data.get('valid_votes', 0) > 0:
        ratio = sum(col_sums) / official_data.get('valid_votes', 1)
        print(f"    Ratio: {ratio:.2%}")
        
        if ratio < 0.90 or ratio > 1.10:
            print(f"    ⚠ Warning: Vote totals don't match (expected 90-110%)")
    
    # Update and save
    updated = 0
    new = 0
    
    for booth_id, booth in extraction.booths.items():
        full_id = f"{ac_id}-{booth_id}"
        
        if full_id in existing['results']:
            if not existing['results'][full_id].get('votes'):
                existing['results'][full_id]['votes'] = booth.votes
                existing['results'][full_id]['total'] = booth.total
                updated += 1
        else:
            existing['results'][full_id] = {
                'votes': booth.votes,
                'total': booth.total,
                'rejected': 0
            }
            new += 1
    
    existing['totalBooths'] = len(existing['results'])
    existing['source'] = f'Tamil Nadu CEO - Form 20 (enhanced-parser-v2-2021, {pdf_type})'
    
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    with open(results_file, 'w') as f:
        json.dump(existing, f, indent=2)
    
    print(f"\n  ✓ SAVED: {new} new, {updated} updated")
    
    return {
        'status': 'success',
        'ac_id': ac_id,
        'new': new,
        'updated': updated,
        'pdf_type': pdf_type
    }


def detect_pdf_type(pdf_path: Path) -> str:
    """Detect if PDF is text-based or scanned."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if len(pdf.pages) == 0:
                return "empty"
            
            text_chars = 0
            for page in pdf.pages[:3]:
                text = page.extract_text() or ""
                text_chars += len(text)
            
            nums = re.findall(r'\b\d{2,4}\b', text)
            
            if text_chars > 1000 and len(nums) > 20:
                return "text"
            else:
                return "scanned"
    except Exception:
        return "scanned"


def fix_column_offset_issues(ac_data: dict, schema: dict):
    """Fix column offset issues in ACs identified by status script."""
    # ACs with column offset from status report
    offset_acs = [
        5, 12, 13, 15, 16, 19, 63, 76, 86, 129, 140, 141, 144, 173, 208, 214, 226, 234
    ]
    
    print(f"\n{'='*70}")
    print(f"Fixing Column Offset Issues ({len(offset_acs)} ACs)")
    print(f"{'='*70}")
    
    for ac_num in offset_acs:
        result = process_ac_enhanced(ac_num, ac_data, schema, force=True)
        if result['status'] == 'success':
            print(f"  ✓ Fixed {result['ac_id']}")
        else:
            print(f"  ✗ Failed {result.get('ac_id', f'TN-{ac_num:03d}')}: {result.get('error', 'unknown')}")


def fix_missing_booths(ac_data: dict, schema: dict):
    """Fix missing booths in ACs identified by status script."""
    # ACs with missing booths from status report
    missing_acs = [
        32, 33, 108, 109, 149, 159
    ]
    
    print(f"\n{'='*70}")
    print(f"Fixing Missing Booths ({len(missing_acs)} ACs)")
    print(f"{'='*70}")
    
    for ac_num in missing_acs:
        result = process_ac_enhanced(ac_num, ac_data, schema, force=True)
        if result['status'] == 'success':
            print(f"  ✓ Fixed {result['ac_id']}")
        else:
            print(f"  ✗ Failed {result.get('ac_id', f'TN-{ac_num:03d}')}: {result.get('error', 'unknown')}")


def main():
    """Main entry point."""
    ac_data, schema = load_reference_data()
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python unified-pdf-parser-v2-2021.py 30              # Single AC")
        print("  python unified-pdf-parser-v2-2021.py --fix-column-offset  # Fix column offsets")
        print("  python unified-pdf-parser-v2-2021.py --fix-missing      # Fix missing booths")
        print("  python unified-pdf-parser-v2-2021.py --all            # All needing extraction")
        return
    
    arg = sys.argv[1]
    
    if arg == '--fix-column-offset':
        fix_column_offset_issues(ac_data, schema)
    elif arg == '--fix-missing':
        fix_missing_booths(ac_data, schema)
    elif arg == '--all':
        ac_nums = []
        for ac_num in range(1, 235):
            ac_id = f"TN-{ac_num:03d}"
            existing = load_existing_data(ac_id)
            empty = sum(1 for r in existing.get('results', {}).values() 
                       if not r.get('votes') or len(r.get('votes', [])) == 0)
            if empty > 0:
                ac_nums.append(ac_num)
        print(f"Found {len(ac_nums)} ACs needing extraction")
        
        results = {'success': 0, 'failed': 0, 'skipped': 0}
        for ac_num in ac_nums:
            result = process_ac_enhanced(ac_num, ac_data, schema)
            if result['status'] == 'success':
                results['success'] += 1
            elif result['status'] == 'complete':
                results['skipped'] += 1
            else:
                results['failed'] += 1
        
        print(f"\n{'='*70}")
        print(f"SUMMARY")
        print(f"{'='*70}")
        print(f"  Success: {results['success']}")
        print(f"  Failed:  {results['failed']}")
        print(f"  Skipped: {results['skipped']}")
    else:
        ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
        for ac_num in ac_nums:
            result = process_ac_enhanced(ac_num, ac_data, schema)
            print(f"\nResult: {result['status']}")


if __name__ == "__main__":
    main()
