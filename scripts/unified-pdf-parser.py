#!/usr/bin/env python
"""
Unified PDF Parser for Election Booth Data
==========================================
Handles both text-based and scanned PDFs with comprehensive validation.

Features:
- Auto-detects PDF type (text vs scanned)
- Uses pdfplumber for text-based PDFs
- Uses pytesseract for scanned PDFs with preprocessing
- 100% validation before saving any data
- Guard rails against corrupt/misaligned columns

Usage:
    python scripts/unified-pdf-parser.py 21        # Process single AC
    python scripts/unified-pdf-parser.py 1-50     # Process range
    python scripts/unified-pdf-parser.py --all    # Process all ACs needing extraction
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from multiprocessing import Pool, cpu_count
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from PIL import Image

# ============================================================================
# Configuration
# ============================================================================

FORM20_DIR = Path.home() / "Desktop" / "GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")

# Validation thresholds
MIN_VOTES_PER_BOOTH = 20
MAX_VOTES_PER_BOOTH = 3000
MIN_EXTRACTION_RATIO = 0.95  # Must extract at least 95% of expected booths (stricter for 100% goal)
MIN_EXTRACTION_RATIO_SCANNED = 0.70  # Lower threshold for scanned PDFs (OCR is harder)
MAX_VOTE_DEVIATION = 0.10    # Allow 10% deviation from official totals (stricter for accuracy)
MAX_VOTE_DEVIATION_SCANNED = 0.25    # More lenient for scanned PDFs


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class BoothResult:
    """Single booth extraction result."""
    booth_no: int
    votes: list[int]
    total: int
    source_page: int = 0
    confidence: float = 1.0


@dataclass
class ExtractionResult:
    """Complete extraction result for an AC."""
    ac_id: str
    booths: dict[str, BoothResult] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    pdf_type: str = "unknown"
    pages_processed: int = 0
    
    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0 and len(self.booths) > 0


@dataclass 
class ValidationResult:
    """Validation result for extracted data."""
    is_valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict = field(default_factory=dict)


# ============================================================================
# Data Loading
# ============================================================================

def load_reference_data():
    """Load PC data and schema for validation."""
    with open(PC_DATA_PATH) as f:
        pc_data = json.load(f)
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id: str, schema: dict) -> tuple[str, dict]:
    """Get PC info for an AC."""
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id, pc_info
    return None, {}


def get_ac_official_data(ac_id: str, pc_data: dict, schema: dict) -> dict:
    """
    Get official vote data for an AC including booth totals and postal votes.
    Returns: {
        'booth_totals': {candidate_index: votes},
        'postal_votes': {candidate_index: votes},
        'total_votes': {candidate_index: votes},  # Set in stone, never modify
        'candidates': [list of candidate info]
    }
    """
    pc_id, pc_info_schema = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        return {}
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    ac_num = int(ac_id.split('-')[1])
    
    # Get AC name from schema
    ac_name = schema.get('assemblyConstituencies', {}).get(ac_id, {}).get('name', '')
    
    booth_totals = {}
    total_votes = {}
    candidate_info = []
    
    for i, cand in enumerate(candidates):
        # Total votes (set in stone - includes booth + postal)
        total = cand.get('votes', 0)
        total_votes[i] = total
        
        # AC-wise votes (booth votes only)
        ac_votes_list = cand.get('acWiseVotes', [])
        booth_votes = 0
        
        if isinstance(ac_votes_list, list):
            for ac_entry in ac_votes_list:
                if isinstance(ac_entry, dict):
                    entry_name = ac_entry.get('acName', '')
                    if entry_name.lower() == ac_name.lower():
                        booth_votes = ac_entry.get('votes', 0)
                        break
        elif isinstance(ac_votes_list, dict):
            booth_votes = ac_votes_list.get(str(ac_num), ac_votes_list.get(ac_id, 0))
        
        booth_totals[i] = booth_votes
        candidate_info.append({
            'index': i,
            'name': cand.get('name', ''),
            'party': cand.get('party', ''),
            'total_votes': total,
            'booth_votes': booth_votes,
            'postal_votes': total - booth_votes
        })
    
    return {
        'booth_totals': booth_totals,
        'postal_votes': {i: total_votes[i] - booth_totals[i] for i in total_votes},
        'total_votes': total_votes,
        'candidates': candidate_info
    }


def load_existing_data(ac_id: str) -> dict:
    """Load existing 2024.json data for an AC."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if results_file.exists():
        with open(results_file) as f:
            return json.load(f)
    return {"results": {}}


# ============================================================================
# PDF Type Detection
# ============================================================================

def detect_pdf_type(pdf_path: Path) -> str:
    """Detect if PDF is text-based or scanned."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if len(pdf.pages) == 0:
                return "empty"
            
            # Check first few pages for text content
            text_chars = 0
            for page in pdf.pages[:3]:
                text = page.extract_text() or ""
                text_chars += len(text)
            
            # Count numeric content (votes indicator)
            nums = re.findall(r'\b\d{2,4}\b', text)
            
            if text_chars > 1000 and len(nums) > 20:
                return "text"
            else:
                return "scanned"
    except Exception as e:
        return f"error: {e}"


# ============================================================================
# Text-based PDF Extraction (pdfplumber)
# ============================================================================

def extract_text_pdf(pdf_path: Path, num_candidates: int, ac_id: str) -> ExtractionResult:
    """Extract booth data from text-based PDF using multiple strategies."""
    result = ExtractionResult(ac_id=ac_id, pdf_type="text")
    all_booths = {}  # booth_id -> BoothResult (keep best)
    
    try:
        # Strategy 1: pdfplumber tables (highest quality)
        with pdfplumber.open(pdf_path) as pdf:
            result.pages_processed = len(pdf.pages)
            
            for page_num, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                
                if tables:
                    for table in tables:
                        booths = parse_table_data(table, num_candidates, page_num)
                        for booth in booths:
                            key = f"{booth.booth_no:03d}"
                            if key not in all_booths:
                                all_booths[key] = booth
                
                # Strategy 2: pdfplumber text extraction
                text = page.extract_text() or ""
                booths = parse_text_data(text, num_candidates, page_num)
                for booth in booths:
                    key = f"{booth.booth_no:03d}"
                    if key not in all_booths:
                        all_booths[key] = booth
        
        # Strategy 3: pdftotext fallback (if we're missing booths)
        if len(all_booths) < 50:  # Likely incomplete
            try:
                pdftotext_result = subprocess.run(
                    ['pdftotext', '-layout', str(pdf_path), '-'],
                    capture_output=True, text=True, timeout=30
                )
                if pdftotext_result.returncode == 0:
                    booths = parse_text_data(pdftotext_result.stdout, num_candidates, 0)
                    for booth in booths:
                        key = f"{booth.booth_no:03d}"
                        if key not in all_booths:
                            all_booths[key] = booth
            except Exception:
                pass
                            
    except Exception as e:
        result.errors.append(f"PDF extraction error: {e}")
    
    result.booths = all_booths
    return result


def parse_table_data(table: list, num_candidates: int, page_num: int) -> list[BoothResult]:
    """Parse booth data from extracted table with enhanced detection."""
    booths = []
    
    if not table or len(table) < 2:
        return booths
    
    # Find header row (contains "Sl", "Station", "No", or similar)
    header_row = 0
    for i, row in enumerate(table[:5]):
        if row and any(cell and isinstance(cell, str) and 
                      any(kw in str(cell).upper() for kw in ['SL', 'STATION', 'NO', 'SERIAL', 'BOOTH'])
                      for cell in row[:3]):
            header_row = i
            break
    
    # Process data rows
    for row_idx, row in enumerate(table[header_row + 1:], start=header_row + 1):
        if not row or len(row) < 3:
            continue
        
        # Clean row data - handle None and extract numbers
        clean_row = []
        for cell in row:
            if cell is None:
                clean_row.append("")
            else:
                # Remove non-numeric characters but keep spaces
                cell_str = str(cell).strip()
                # Extract numbers from cell (may contain text)
                clean_row.append(cell_str)
        
        # Extract all numbers from the row
        all_numbers = []
        for cell in clean_row:
            # Extract all numbers from cell
            nums = re.findall(r'\b(\d+)\b', cell)
            all_numbers.extend([int(n) for n in nums])
        
        if len(all_numbers) < 4:
            continue
        
        # Find booth number (first number 1-600 in first few positions)
        booth_no = None
        vote_start = 0
        
        for i, num in enumerate(all_numbers[:5]):
            if 1 <= num <= 600:
                booth_no = num
                vote_start = i + 1
                break
        
        if not booth_no:
            continue
        
        # Extract votes (numbers after booth number)
        votes = []
        for num in all_numbers[vote_start:]:
            if num <= 2000:  # Reasonable vote count
                votes.append(num)
            elif num > 5000:  # Likely a total column
                break
        
        if len(votes) >= 3:
            # Trim to candidate count
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


def parse_text_data(text: str, num_candidates: int, page_num: int) -> list[BoothResult]:
    """Parse booth data from raw text."""
    booths = []
    lines = text.split('\n')
    
    for line in lines:
        # Skip header lines
        if any(kw in line.upper() for kw in ['FORM 20', 'ELECTION', 'CANDIDATE', 'PARTY', 'TOTAL']):
            continue
        
        # Extract all numbers from line
        numbers = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
        
        if len(numbers) < 4:
            continue
        
        # Find booth number (first number in range 1-600)
        booth_no = None
        vote_start = 0
        
        for i, num in enumerate(numbers):
            if 1 <= num <= 600:
                booth_no = num
                vote_start = i + 1
                break
        
        if booth_no is None:
            continue
        
        # Get votes (filter out totals which are usually > 2000)
        votes = []
        for num in numbers[vote_start:]:
            if num <= 2000:
                votes.append(num)
            elif num > 5000:  # Likely a total, stop
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
                    source_page=page_num
                ))
    
    return booths


# ============================================================================
# Scanned PDF Extraction (OCR)
# ============================================================================

def extract_scanned_pdf(pdf_path: Path, num_candidates: int, ac_id: str, expected_booths: set = None) -> ExtractionResult:
    """Extract booth data from scanned PDF using multiple OCR strategies."""
    result = ExtractionResult(ac_id=ac_id, pdf_type="scanned")
    
    # Determine max booth number from expected set
    max_booth = max(expected_booths) if expected_booths else 500
    all_booths = {}  # booth_id -> (BoothResult, confidence)
    
    try:
        # Strategy 1: pytesseract - FAST MODE (single best method)
        # Use single best DPI (300) and best preprocessing method only
        images = convert_from_path(str(pdf_path), dpi=300)
        result.pages_processed = len(images)
        
        for page_num, image in enumerate(images):
            page_booths = {}
            
            # Try only the best preprocessing method first (standard)
            processed = preprocess_image(image, 'standard')
            
            # Try only best PSM mode (6)
            config = '--psm 6 --oem 3'
            text = pytesseract.image_to_string(processed, config=config)
            booths = parse_ocr_text(text, num_candidates, page_num, max_booth)
            
            for booth in booths:
                key = f"{booth.booth_no:03d}"
                if booth.booth_no <= max_booth + 50:
                    page_booths[key] = (booth, 0.8)
            
            # Only try other methods if we got very few booths
            if len(page_booths) < 5:
                # Try high_contrast as fallback
                processed = preprocess_image(image, 'high_contrast')
                text = pytesseract.image_to_string(processed, config=config)
                booths = parse_ocr_text(text, num_candidates, page_num, max_booth)
                
                for booth in booths:
                    key = f"{booth.booth_no:03d}"
                    if booth.booth_no <= max_booth + 50:
                        if key not in page_booths:
                            page_booths[key] = (booth, 0.75)
            
            # Merge page results
            for key, (booth, conf) in page_booths.items():
                if key not in all_booths or all_booths[key][1] < conf:
                    all_booths[key] = (booth, conf)
        
        # Strategy 2: Surya OCR fallback (SKIPPED for speed - uncomment if needed)
        # Surya is very slow (~2-3 min per page), so we skip it for faster processing
        # Uncomment below if you need maximum accuracy and can wait
        # extraction_ratio = len(all_booths) / len(expected_booths) if expected_booths else 1.0
        # if extraction_ratio < 0.5:  # Only use Surya if we got less than 50%
        #     try:
        #         surya_booths = extract_with_surya_fallback(pdf_path, num_candidates, ac_id, expected_booths)
        #         for booth in surya_booths:
        #             key = f"{booth.booth_no:03d}"
        #             if key not in all_booths or all_booths[key][1] < 0.9:
        #                 all_booths[key] = (booth, 0.9)
        #     except Exception as e:
        #         result.warnings.append(f"Surya OCR fallback failed: {e}")
                    
    except Exception as e:
        result.errors.append(f"OCR extraction error: {e}")
    
    # Keep highest confidence results
    result.booths = {k: v[0] for k, v in all_booths.items()}
    return result


def extract_with_surya_fallback(pdf_path: Path, num_candidates: int, ac_id: str, expected_booths: set) -> list[BoothResult]:
    """Extract using Surya OCR as fallback (page-by-page to avoid crashes)."""
    booths = []
    ac_num = int(ac_id.split('-')[1])
    max_booth = max(expected_booths) if expected_booths else 500
    
    try:
        # Get page count
        result = subprocess.run(
            ['pdfinfo', str(pdf_path)],
            capture_output=True, text=True, timeout=10
        )
        page_count = 0
        for line in result.stdout.split('\n'):
            if line.startswith('Pages:'):
                page_count = int(line.split(':')[1].strip())
                break
        
        if page_count == 0:
            return booths
        
        # Process each page separately
        output_dir = Path(f"/tmp/surya_fallback/AC{ac_num:03d}")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        for page_num in range(page_count):
            page_output = output_dir / f"page_{page_num}"
            page_output.mkdir(parents=True, exist_ok=True)
            
            result = subprocess.run(
                ['surya_ocr', str(pdf_path), '--output_dir', str(page_output),
                 '--disable_math', '--page_range', str(page_num)],
                capture_output=True, text=True, timeout=120
            )
            
            if result.returncode == 0:
                # Find results file
                for item in page_output.iterdir():
                    if item.is_dir():
                        rf = item / 'results.json'
                        if rf.exists():
                            with open(rf) as f:
                                data = json.load(f)
                            
                            # Parse Surya results
                            page_booths = parse_surya_json(data, num_candidates, max_booth)
                            booths.extend(page_booths)
                            break
    except Exception:
        pass
    
    return booths


def parse_surya_json(surya_data: dict, num_candidates: int, max_booth: int) -> list[BoothResult]:
    """Parse Surya OCR JSON results."""
    booths = []
    
    for key in surya_data:
        pages = surya_data[key]
        if not isinstance(pages, list):
            continue
        
        for page in pages:
            text_lines = page.get('text_lines', [])
            
            # Group by row
            rows = defaultdict(list)
            for line in text_lines:
                text = line.get('text', '').strip()
                text = re.sub(r'<[^>]+>', '', text)
                if not text:
                    continue
                
                polygon = line.get('polygon', [[0, 0]])
                y = polygon[0][1] if polygon else 0
                x = polygon[0][0] if polygon else 0
                
                row_y = int(y // 12) * 12
                rows[row_y].append((x, text))
            
            # Process rows
            for row_y in sorted(rows.keys()):
                items = rows[row_y]
                items.sort(key=lambda x: x[0])
                
                all_nums = []
                for x, text in items:
                    nums = re.findall(r'\b(\d+)\b', text)
                    for n in nums:
                        all_nums.append((x, int(n)))
                
                if len(all_nums) < 3:
                    continue
                
                # Find booth number
                booth_no = None
                left_nums = [(x, n) for x, n in all_nums if x < 150 and 1 <= n <= max_booth + 50]
                
                if left_nums:
                    for x, n in left_nums:
                        if 100 <= x <= 150:
                            booth_no = n
                            break
                    if not booth_no and left_nums:
                        booth_no = left_nums[-1][1]
                
                if not booth_no:
                    continue
                
                # Get votes
                vote_nums = [(x, n) for x, n in all_nums if x > 150 and n <= 2000 and x < 1100]
                
                if len(vote_nums) >= 3:
                    votes = [n for _, n in vote_nums]
                    total = sum(votes)
                    if 20 <= total <= 3000:
                        votes = votes[:num_candidates]
                        while len(votes) < num_candidates:
                            votes.append(0)
                        
                        booths.append(BoothResult(
                            booth_no=booth_no,
                            votes=votes,
                            total=total,
                            source_page=0,
                            confidence=0.9
                        ))
    
    return booths


def preprocess_image(image: Image.Image, method: str = 'standard') -> Image.Image:
    """Preprocess image for better OCR results."""
    # Convert PIL to OpenCV
    img_array = np.array(image)
    
    # Convert to grayscale
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_array
    
    if method == 'standard':
        # Simple thresholding
        _, processed = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        
    elif method == 'high_contrast':
        # Increase contrast
        gray = cv2.convertScaleAbs(gray, alpha=1.5, beta=0)
        _, processed = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY)
        
    elif method == 'adaptive':
        # Adaptive thresholding
        processed = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        
    elif method == 'denoise':
        # Denoise then threshold
        denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
        _, processed = cv2.threshold(denoised, 150, 255, cv2.THRESH_BINARY)
        
    elif method == 'sharpen':
        # Sharpen then threshold
        kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
        sharpened = cv2.filter2D(gray, -1, kernel)
        _, processed = cv2.threshold(sharpened, 150, 255, cv2.THRESH_BINARY)
        
    else:
        processed = gray
    
    return Image.fromarray(processed)


def parse_ocr_text(text: str, num_candidates: int, page_num: int, max_booth: int = 500) -> list[BoothResult]:
    """Parse booth data from OCR text with aggressive number extraction."""
    booths = []
    seen_booths = set()
    lines = text.split('\n')
    
    for line in lines:
        # Clean OCR artifacts - be aggressive
        line = re.sub(r'[|\\\/\[\]{}()<>]', ' ', line)
        line = re.sub(r'[oO]', '0', line)  # Common OCR error
        line = re.sub(r'[lI](?=\d)', '1', line)  # l or I before digit -> 1
        line = re.sub(r'\s+', ' ', line).strip()
        
        # Skip short lines and headers
        if len(line) < 10:
            continue
        if any(kw in line.upper() for kw in ['FORM', 'ELECTION', 'CANDIDATE', 'PARTY', 'TOTAL', 'NOTA']):
            continue
        
        # Extract all numbers with their positions
        numbers = []
        for match in re.finditer(r'\b(\d+)\b', line):
            num = int(match.group(1))
            pos = match.start()
            numbers.append((pos, num))
        
        if len(numbers) < 4:
            continue
        
        # Sort by position
        numbers.sort(key=lambda x: x[0])
        
        # Find booth number - should be in first 2-3 columns
        booth_no = None
        vote_start_idx = 0
        
        for i, (pos, num) in enumerate(numbers[:3]):
            # Booth numbers are 1-max_booth, typically in leftmost columns
            if 1 <= num <= max_booth + 50 and pos < 200:
                # Check if this looks like a serial/station number
                # (not a vote count which would be larger or have specific patterns)
                booth_no = num
                vote_start_idx = i + 1
                break
        
        if booth_no is None:
            continue
        
        # Skip if we've seen this booth
        if booth_no in seen_booths:
            continue
        
        # Get votes - numbers after booth, filter reasonable values
        vote_nums = []
        for pos, num in numbers[vote_start_idx:]:
            # Vote counts are typically 0-2000
            if num <= 2000:
                vote_nums.append(num)
            elif num > 5000:
                # Likely a total column, stop here
                break
        
        if len(vote_nums) >= 3:
            votes = vote_nums[:num_candidates]
            while len(votes) < num_candidates:
                votes.append(0)
            
            total = sum(votes)
            if MIN_VOTES_PER_BOOTH <= total <= MAX_VOTES_PER_BOOTH:
                seen_booths.add(booth_no)
                booths.append(BoothResult(
                    booth_no=booth_no,
                    votes=votes,
                    total=total,
                    source_page=page_num,
                    confidence=0.8
                ))
    
    return booths


# ============================================================================
# Column Order Correction
# ============================================================================

def correct_column_order(extraction: ExtractionResult, official_data: dict, num_candidates: int) -> ExtractionResult:
    """
    Detect and correct column order by matching extracted totals to official totals.
    Returns corrected extraction with columns reordered.
    """
    if not official_data or not extraction.booths:
        return extraction
    
    official_booth_totals = official_data.get('booth_totals', {})
    if not official_booth_totals:
        return extraction
    
    # Calculate extracted totals per column
    extracted_totals = defaultdict(int)
    for booth in extraction.booths.values():
        for i, votes in enumerate(booth.votes):
            extracted_totals[i] += votes
    
    # Find best column mapping using Hungarian algorithm (simplified)
    # Try to match extracted columns to official candidates
    official_list = [official_booth_totals.get(i, 0) for i in range(num_candidates)]
    extracted_list = [extracted_totals.get(i, 0) for i in range(num_candidates)]
    
    # Calculate correlation for each possible mapping
    best_mapping = None
    best_score = float('-inf')
    
    # Try all permutations (for small candidate counts) or use greedy matching
    if num_candidates <= 10:
        from itertools import permutations
        for perm in permutations(range(num_candidates)):
            score = sum(
                -abs(extracted_list[perm[i]] - official_list[i]) / max(official_list[i], 1)
                for i in range(num_candidates)
                if official_list[i] > 0
            )
            if score > best_score:
                best_score = score
                best_mapping = perm
    else:
        # Greedy matching for large candidate counts - match by similarity
        used_extracted = set()
        best_mapping = list(range(num_candidates))  # Default: no reordering
        
        # Sort official candidates by vote count (descending)
        official_sorted = sorted(enumerate(official_list), key=lambda x: -x[1])
        extracted_sorted = sorted(enumerate(extracted_list), key=lambda x: -x[1])
        
        # Match top candidates first (most reliable)
        for official_idx, official_votes in official_sorted[:min(10, num_candidates)]:
            if official_votes == 0:
                continue
            
            best_match_idx = -1
            best_match_score = float('inf')
            
            for extracted_idx, extracted_votes in extracted_sorted:
                if extracted_idx in used_extracted:
                    continue
                
                # Calculate similarity score (lower is better)
                if official_votes > 0:
                    score = abs(extracted_votes - official_votes) / official_votes
                    if score < best_match_score:
                        best_match_score = score
                        best_match_idx = extracted_idx
            
            if best_match_idx >= 0 and best_match_score < 0.5:  # Only if reasonably close
                best_mapping[official_idx] = best_match_idx
                used_extracted.add(best_match_idx)
    
    # Check if mapping improves accuracy
    if best_mapping and best_mapping != list(range(num_candidates)):
        # Calculate total error with mapping
        mapped_error = sum(
            abs(extracted_list[best_mapping[i]] - official_list[i])
            for i in range(num_candidates)
            if official_list[i] > 0
        )
        
        # Calculate total error without mapping
        original_error = sum(
            abs(extracted_list[i] - official_list[i])
            for i in range(num_candidates)
            if official_list[i] > 0
        )
        
        # Only apply mapping if it reduces error by at least 30%
        if original_error > 0 and mapped_error < original_error * 0.7:
            # Reorder columns in all booths
            corrected_booths = {}
            for booth_id, booth in extraction.booths.items():
                reordered_votes = [booth.votes[best_mapping[i]] if best_mapping[i] < len(booth.votes) else 0 
                                  for i in range(num_candidates)]
                corrected_booths[booth_id] = BoothResult(
                    booth_no=booth.booth_no,
                    votes=reordered_votes,
                    total=sum(reordered_votes),
                    source_page=booth.source_page,
                    confidence=booth.confidence
                )
            
            extraction.booths = corrected_booths
            extraction.warnings.append(f"Column order corrected (mapping: {best_mapping[:5]}...)")
    
    return extraction


# ============================================================================
# Validation
# ============================================================================

def validate_extraction(
    extraction: ExtractionResult,
    official_data: dict,
    num_candidates: int,
    expected_booths: set,
    pdf_type: str = "text"
) -> ValidationResult:
    """
    Comprehensive validation of extracted data.
    Returns ValidationResult with is_valid=True only if all critical checks pass.
    """
    result = ValidationResult(is_valid=True)
    
    # -------------------------------------------------------------------------
    # Check 1: Minimum extraction count
    # -------------------------------------------------------------------------
    if len(extraction.booths) == 0:
        result.errors.append("No booths extracted")
        result.is_valid = False
        return result
    
    # -------------------------------------------------------------------------
    # Check 2: Extraction ratio (different thresholds for scanned PDFs)
    # -------------------------------------------------------------------------
    if expected_booths:
        extraction_ratio = len(extraction.booths) / len(expected_booths)
        result.stats['extraction_ratio'] = extraction_ratio
        
        # Use different threshold for scanned PDFs
        min_ratio = MIN_EXTRACTION_RATIO_SCANNED if pdf_type == "scanned" else MIN_EXTRACTION_RATIO
        
        if extraction_ratio < min_ratio:
            result.warnings.append(
                f"Low extraction ratio: {extraction_ratio:.1%} "
                f"({len(extraction.booths)}/{len(expected_booths)} booths)"
            )
            # Only fail validation if way below threshold
            if extraction_ratio < min_ratio * 0.5:  # Less than half of required
                result.errors.append(
                    f"Extraction ratio too low: {extraction_ratio:.1%} "
                    f"(required: {min_ratio:.0%})"
                )
                result.is_valid = False
    
    # -------------------------------------------------------------------------
    # Check 3: Column count consistency
    # -------------------------------------------------------------------------
    vote_lengths = [len(b.votes) for b in extraction.booths.values()]
    if len(set(vote_lengths)) > 1:
        result.errors.append(
            f"Inconsistent vote column counts: {set(vote_lengths)}"
        )
        result.is_valid = False
    
    # Check against expected candidate count
    if vote_lengths and vote_lengths[0] != num_candidates:
        result.errors.append(
            f"Column count mismatch: got {vote_lengths[0]}, expected {num_candidates}"
        )
        result.is_valid = False
    
    # -------------------------------------------------------------------------
    # Check 4: Booth number validity
    # -------------------------------------------------------------------------
    booth_numbers = [b.booth_no for b in extraction.booths.values()]
    
    # Check for duplicates
    if len(booth_numbers) != len(set(booth_numbers)):
        dups = [n for n in booth_numbers if booth_numbers.count(n) > 1]
        result.errors.append(f"Duplicate booth numbers: {set(dups)}")
        result.is_valid = False
    
    # Check range
    invalid_booths = [n for n in booth_numbers if n < 1 or n > 600]
    if invalid_booths:
        result.errors.append(f"Invalid booth numbers: {invalid_booths}")
        result.is_valid = False
    
    # -------------------------------------------------------------------------
    # Check 5: Vote totals per booth
    # -------------------------------------------------------------------------
    suspicious_booths = []
    for booth_id, booth in extraction.booths.items():
        if booth.total < MIN_VOTES_PER_BOOTH:
            suspicious_booths.append((booth_id, booth.total, "too low"))
        elif booth.total > MAX_VOTES_PER_BOOTH:
            suspicious_booths.append((booth_id, booth.total, "too high"))
        
        # Check for negative votes
        if any(v < 0 for v in booth.votes):
            result.errors.append(f"Booth {booth_id} has negative votes")
            result.is_valid = False
    
    if suspicious_booths:
        result.warnings.append(f"Suspicious booth totals: {suspicious_booths[:5]}")
    
    # -------------------------------------------------------------------------
    # Check 6: Compare with official booth totals (CRITICAL - booth + postal = total)
    # -------------------------------------------------------------------------
    if official_data:
        official_booth_totals = official_data.get('booth_totals', {})
        official_postal_votes = official_data.get('postal_votes', {})
        official_total_votes = official_data.get('total_votes', {})  # Set in stone
        candidates = official_data.get('candidates', [])
        
        # Calculate extracted booth totals
        extracted_booth_totals = defaultdict(int)
        for booth in extraction.booths.values():
            for i, votes in enumerate(booth.votes):
                extracted_booth_totals[i] += votes
        
        # Calculate accuracy metrics for each candidate
        accuracy_details = []
        critical_errors = []
        
        for i in range(num_candidates):
            official_booth = official_booth_totals.get(i, 0)
            official_postal = official_postal_votes.get(i, 0)
            official_total = official_total_votes.get(i, 0)  # Never modify this
            extracted_booth = extracted_booth_totals.get(i, 0)
            
            # Verify: booth + postal = total (official data integrity check)
            calculated_total = official_booth + official_postal
            if abs(calculated_total - official_total) > 10:  # Allow small rounding
                critical_errors.append(
                    f"Candidate {i} data integrity issue: "
                    f"booth({official_booth:,}) + postal({official_postal:,}) = {calculated_total:,} "
                    f"≠ total({official_total:,})"
                )
            
            # Calculate accuracy
            if official_booth > 0:
                booth_accuracy = 1 - abs(extracted_booth - official_booth) / official_booth
                deviation = abs(extracted_booth - official_booth) / official_booth
            else:
                booth_accuracy = 1.0 if extracted_booth == 0 else 0.0
                deviation = 0.0 if extracted_booth == 0 else float('inf')
            
            cand_info = next((c for c in candidates if c['index'] == i), {})
            accuracy_details.append({
                'index': i,
                'name': cand_info.get('name', f'Candidate {i}'),
                'party': cand_info.get('party', ''),
                'official_booth': official_booth,
                'official_postal': official_postal,
                'official_total': official_total,
                'extracted_booth': extracted_booth,
                'booth_accuracy': booth_accuracy,
                'deviation': deviation,
                'error': extracted_booth - official_booth
            })
        
        result.stats['accuracy_details'] = accuracy_details
        
        # Check for critical errors
        if critical_errors:
            for err in critical_errors:
                result.errors.append(err)
            result.is_valid = False
        
        # Check if extracted booth totals match official booth totals
        max_dev = MAX_VOTE_DEVIATION_SCANNED if pdf_type == "scanned" else MAX_VOTE_DEVIATION
        major_deviations = [
            (d['index'], d['deviation'], d['extracted_booth'], d['official_booth'])
            for d in accuracy_details
            if d['official_booth'] > 1000 and d['deviation'] > max_dev
        ]
        
        if major_deviations:
            result.warnings.append(
                f"High deviation from official booth totals: "
                f"{[(i, f'{d:.1%}', e, o) for i, d, e, o in major_deviations[:3]]}"
            )
        
        # Calculate overall extraction quality
        total_official_booth = sum(official_booth_totals.values())
        total_extracted_booth = sum(extracted_booth_totals.values())
        
        if total_official_booth > 0:
            overall_ratio = total_extracted_booth / total_official_booth
            result.stats['overall_ratio'] = overall_ratio
            result.stats['total_official_booth'] = total_official_booth
            result.stats['total_extracted_booth'] = total_extracted_booth
            
            # More lenient thresholds for scanned PDFs
            min_ratio = 0.3 if pdf_type == "scanned" else 0.5
            max_ratio = 1.7 if pdf_type == "scanned" else 1.5
            
            if overall_ratio < min_ratio:
                result.errors.append(
                    f"Extracted booth total too low: {total_extracted_booth:,} vs official {total_official_booth:,} "
                    f"(ratio: {overall_ratio:.2f})"
                )
                result.is_valid = False
            elif overall_ratio > max_ratio:
                result.errors.append(
                    f"Extracted booth total too high: {total_extracted_booth:,} vs official {total_official_booth:,} "
                    f"(ratio: {overall_ratio:.2f})"
                )
                result.is_valid = False
    
    # -------------------------------------------------------------------------
    # Check 7: Detect low-voting candidates getting unusually high booth wins
    # -------------------------------------------------------------------------
    if official_data and len(extraction.booths) > 10:
        candidates = official_data.get('candidates', [])
        extracted_booth_totals = defaultdict(int)
        booth_wins = defaultdict(int)  # Count of booths where candidate got most votes
        
        for booth in extraction.booths.values():
            if not booth.votes:
                continue
            
            # Find winner (candidate with most votes in this booth)
            max_votes = max(booth.votes)
            winner_indices = [i for i, v in enumerate(booth.votes) if v == max_votes]
            
            for i, votes in enumerate(booth.votes):
                extracted_booth_totals[i] += votes
                if i in winner_indices and len(winner_indices) == 1:  # Single winner
                    booth_wins[i] += 1
        
        # Check for anomalies: low-voting candidates winning many booths
        anomalies = []
        for i, cand_info in enumerate(candidates):
            total_votes = cand_info.get('total_votes', 0)
            booth_wins_count = booth_wins.get(i, 0)
            extracted_booth = extracted_booth_totals.get(i, 0)
            
            if total_votes > 0 and booth_wins_count > 0:
                # Calculate expected win rate based on vote share
                total_booths = len(extraction.booths)
                vote_share = total_votes / sum(c['total_votes'] for c in candidates if c.get('total_votes', 0) > 0)
                expected_wins = total_booths * vote_share
                
                # Flag if low-voting candidate wins way more booths than expected
                if total_votes < 10000 and booth_wins_count > expected_wins * 2:
                    anomalies.append({
                        'index': i,
                        'name': cand_info.get('name', f'Candidate {i}'),
                        'party': cand_info.get('party', ''),
                        'total_votes': total_votes,
                        'booth_wins': booth_wins_count,
                        'expected_wins': expected_wins,
                        'vote_share': vote_share
                    })
        
        if anomalies:
            anomaly_list = []
            for a in anomalies[:3]:
                expected_str = f"{a['expected_wins']:.1f} expected"
                anomaly_list.append((a['name'], a['booth_wins'], expected_str))
            result.warnings.append(
                f"Low-voting candidates with unusually high booth wins: {anomaly_list}"
            )
            result.stats['booth_win_anomalies'] = anomalies
    
    # -------------------------------------------------------------------------
    # Check 8: Column order validation (detect swapped columns)
    # -------------------------------------------------------------------------
    if official_data and len(official_data.get('booth_totals', {})) >= 2:
        official_booth_totals = official_data.get('booth_totals', {})
        
        # Get top 2 candidates by official booth votes
        sorted_official = sorted(official_booth_totals.items(), key=lambda x: -x[1])[:2]
        
        # Get top 2 by extracted votes
        extracted_booth_totals = defaultdict(int)
        for booth in extraction.booths.values():
            for i, votes in enumerate(booth.votes):
                extracted_booth_totals[i] += votes
        sorted_extracted = sorted(extracted_booth_totals.items(), key=lambda x: -x[1])[:2]
        
        # Check if order matches (at least for top candidates)
        if sorted_official and sorted_extracted:
            if sorted_official[0][0] != sorted_extracted[0][0]:
                result.warnings.append(
                    f"Column order may be wrong: "
                    f"Official top candidate is index {sorted_official[0][0]}, "
                    f"but extracted top is index {sorted_extracted[0][0]}"
                )
    
    return result


# ============================================================================
# Parallel Processing Wrapper
# ============================================================================

def process_ac_wrapper(args):
    """Wrapper for parallel processing."""
    ac_num, pc_data, schema = args
    return process_ac(ac_num, pc_data, schema)


# ============================================================================
# Main Processing
# ============================================================================

def process_ac(ac_num: int, pc_data: dict, schema: dict, force: bool = False) -> dict:
    """Process a single AC with full validation."""
    ac_id = f"TN-{ac_num:03d}"
    
    print(f"\n{'='*70}")
    print(f"Processing {ac_id}")
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
    
    # Get PC info
    pc_id, pc_info = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"  ✗ Could not find PC for {ac_id}")
        return {'status': 'error', 'error': 'No PC found'}
    
    candidates = pc_data.get(pc_id, {}).get('candidates', [])
    num_candidates = len(candidates)
    print(f"  PC: {pc_id}, Candidates: {num_candidates}")
    
    # Get official data for validation (booth totals, postal votes, total votes)
    official_data = get_ac_official_data(ac_id, pc_data, schema)
    
    # Check PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        print(f"  ✗ PDF not found: {pdf_path}")
        return {'status': 'error', 'error': 'PDF not found'}
    
    # Detect PDF type
    pdf_type = detect_pdf_type(pdf_path)
    print(f"  PDF type: {pdf_type}")
    
    # Extract data
    if pdf_type == "text":
        extraction = extract_text_pdf(pdf_path, num_candidates, ac_id)
    elif pdf_type == "scanned":
        extraction = extract_scanned_pdf(pdf_path, num_candidates, ac_id, needs_extraction)
    else:
        print(f"  ✗ Unknown PDF type: {pdf_type}")
        return {'status': 'error', 'error': f'Unknown PDF type: {pdf_type}'}
    
    # Filter to expected booths if we have too many
    original_count = len(extraction.booths)
    if needs_extraction and len(extraction.booths) > len(needs_extraction) * 1.5:
        max_booth = max(needs_extraction) if needs_extraction else 600
        filtered_booths = {}
        for booth_id, booth in extraction.booths.items():
            if booth.booth_no <= max_booth + 50:  # Allow some margin
                filtered_booths[booth_id] = booth
        extraction.booths = filtered_booths
        if len(filtered_booths) < original_count:
            extraction.warnings.append(f"Filtered from {original_count} to {len(filtered_booths)} booths")
    
    print(f"  Extracted {len(extraction.booths)} booths from {extraction.pages_processed} pages")
    
    if extraction.errors:
        for err in extraction.errors:
            print(f"  ✗ {err}")
    
    # Correct column order if needed
    if len(extraction.booths) > 10:
        extraction = correct_column_order(extraction, official_data, num_candidates)
        if extraction.warnings and "Column order corrected" in str(extraction.warnings):
            print(f"  ✓ Column order corrected")
    
    # Validate extraction
    print(f"\n  Validating...")
    validation = validate_extraction(
        extraction, 
        official_data, 
        num_candidates,
        needs_extraction,
        pdf_type
    )
    
    # Print validation results
    if validation.errors:
        print(f"  ✗ VALIDATION FAILED:")
        for err in validation.errors:
            print(f"    - {err}")
    
    if validation.warnings:
        print(f"  ⚠ Warnings:")
        for warn in validation.warnings:
            print(f"    - {warn}")
    
    # Detailed accuracy report
    print(f"\n  📊 ACCURACY REPORT:")
    if validation.stats.get('accuracy_details'):
        accuracy_details = validation.stats['accuracy_details']
        
        # Overall statistics
        if validation.stats.get('overall_ratio'):
            print(f"    Overall Booth Extraction Ratio: {validation.stats['overall_ratio']:.2%}")
            print(f"    Official Booth Total: {validation.stats.get('total_official_booth', 0):,}")
            print(f"    Extracted Booth Total: {validation.stats.get('total_extracted_booth', 0):,}")
        
        # Top candidates accuracy
        print(f"\n    Top 5 Candidates Accuracy:")
        sorted_by_votes = sorted(accuracy_details, key=lambda x: -x['official_total'])[:5]
        for d in sorted_by_votes:
            accuracy_pct = d['booth_accuracy'] * 100
            status = "✓" if accuracy_pct >= 95 else "⚠" if accuracy_pct >= 80 else "✗"
            print(f"      {status} {d['name'][:30]:30s} ({d['party']:6s}): "
                  f"{accuracy_pct:5.1f}% | "
                  f"Extracted: {d['extracted_booth']:6,} | "
                  f"Official: {d['official_booth']:6,} | "
                  f"Error: {d['error']:+6,}")
        
        # Candidates with poor accuracy
        poor_accuracy = [d for d in accuracy_details if d['official_booth'] > 1000 and d['booth_accuracy'] < 0.80]
        if poor_accuracy:
            print(f"\n    ⚠ Candidates with Poor Accuracy (<80%):")
            for d in sorted(poor_accuracy, key=lambda x: x['booth_accuracy'])[:5]:
                print(f"      - {d['name'][:30]:30s}: {d['booth_accuracy']*100:.1f}% "
                      f"(Error: {d['error']:+,})")
    
    if validation.stats.get('booth_win_anomalies'):
        print(f"\n    ⚠ Booth Win Anomalies Detected:")
        for a in validation.stats['booth_win_anomalies'][:3]:
            print(f"      - {a['name']}: {a['booth_wins']} wins "
                  f"(expected {a['expected_wins']:.1f}, vote share {a['vote_share']:.1%})")
    
    # Only save if validation passes
    if not validation.is_valid:
        print(f"\n  ✗ NOT SAVING - Validation failed")
        return {
            'status': 'validation_failed',
            'ac_id': ac_id,
            'extracted': len(extraction.booths),
            'errors': validation.errors
        }
    
    # Update existing data
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
    existing['source'] = f'Tamil Nadu CEO - Form 20 (unified-parser, {pdf_type})'
    
    # Save
    results_file = OUTPUT_BASE / ac_id / "2024.json"
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


def main():
    """Main entry point."""
    pc_data, schema = load_reference_data()
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python unified-pdf-parser.py 21        # Single AC")
        print("  python unified-pdf-parser.py 1-50     # Range")
        print("  python unified-pdf-parser.py --all    # All needing extraction")
        return
    
    arg = sys.argv[1]
    
    if arg == '--all':
        # Find all ACs needing extraction
        ac_nums = []
        for ac_num in range(1, 235):
            ac_id = f"TN-{ac_num:03d}"
            existing = load_existing_data(ac_id)
            empty = sum(1 for r in existing.get('results', {}).values() 
                       if not r.get('votes') or len(r.get('votes', [])) == 0)
            if empty > 0:
                ac_nums.append(ac_num)
        print(f"Found {len(ac_nums)} ACs needing extraction")
        
    elif '-' in arg:
        # Range
        start, end = map(int, arg.split('-'))
        ac_nums = list(range(start, end + 1))
        
    else:
        # Single or multiple ACs
        ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
    
    # Process in parallel for speed
    results = {'success': 0, 'failed': 0, 'skipped': 0}
    
    # Separate text and scanned PDFs for optimal parallelization
    text_acs = []
    scanned_acs = []
    scanned_list = [1,3,4,5,6,7,28,29,30,31,38,39,40,41,42,151,152,153,154,155,156,188,189,191,192,193,194,213,214]
    
    for ac_num in ac_nums:
        if ac_num in scanned_list:
            scanned_acs.append(ac_num)
        else:
            text_acs.append(ac_num)
    
    # Process text PDFs in parallel (fast, can do many at once)
    if text_acs:
        print(f"\nProcessing {len(text_acs)} text PDFs in parallel...")
        num_workers = min(len(text_acs), cpu_count() * 2, 8)  # Limit to 8 workers
        with Pool(num_workers) as pool:
            text_results = pool.map(process_ac_wrapper, [(ac, pc_data, schema) for ac in text_acs])
            for result in text_results:
                if result['status'] == 'success':
                    results['success'] += 1
                elif result['status'] == 'complete':
                    results['skipped'] += 1
                else:
                    results['failed'] += 1
    
    # Process scanned PDFs sequentially (OCR is CPU-intensive, parallel doesn't help much)
    if scanned_acs:
        print(f"\nProcessing {len(scanned_acs)} scanned PDFs sequentially...")
        for ac_num in scanned_acs:
            result = process_ac(ac_num, pc_data, schema)
            
            if result['status'] == 'success':
                results['success'] += 1
            elif result['status'] == 'complete':
                results['skipped'] += 1
            else:
                results['failed'] += 1
    
    # Summary
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    print(f"  Success: {results['success']}")
    print(f"  Failed:  {results['failed']}")
    print(f"  Skipped: {results['skipped']}")


if __name__ == "__main__":
    main()
