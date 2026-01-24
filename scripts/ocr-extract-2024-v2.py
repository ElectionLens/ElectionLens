#!/usr/bin/env python3
"""
OCR extraction for 2024 Tamil Nadu PC booth data.
Based on successful 2021 extraction techniques.

Key insights from 2021:
1. Use pdf2image + pytesseract (more reliable than subprocess)
2. Higher DPI (200-300) for scanned documents
3. PSM 6 works well for tabular data
4. Handle transposed format (candidates as rows, booths as columns)
5. Clean OCR artifacts aggressively
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter
except ImportError:
    print("Required packages missing. Install with:")
    print("  pip install pdf2image pytesseract pillow")
    sys.exit(1)

# Configuration
FORM20_DIR = Path(os.path.expanduser("~/Desktop/GELS_2024_Form20_PDFs"))
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    with open(PC_DATA) as f:
        pc_data = json.load(f)
    with open(SCHEMA) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id, schema):
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id
    return None


def get_base_booth_no(booth_no: str) -> int:
    """Extract numeric base from booth number."""
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def preprocess_image(image):
    """Preprocess image for better OCR."""
    # Convert to grayscale
    if image.mode != 'L':
        image = image.convert('L')
    
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.5)
    
    # Sharpen
    image = image.filter(ImageFilter.SHARPEN)
    
    return image


def ocr_pdf_pages(pdf_path: Path, dpi: int = 250) -> list:
    """Convert PDF to images and OCR each page."""
    print(f"    Converting PDF to images at {dpi} DPI...")
    images = convert_from_path(str(pdf_path), dpi=dpi)
    
    page_texts = []
    for i, image in enumerate(images):
        # Preprocess
        processed = preprocess_image(image)
        
        # Try multiple PSM modes
        best_text = ""
        best_numbers = 0
        
        for psm in [6, 4, 3]:
            text = pytesseract.image_to_string(
                processed, 
                config=f'--psm {psm} -l eng'
            )
            # Count extractable numbers
            nums = len(re.findall(r'\d+', text))
            if nums > best_numbers:
                best_numbers = nums
                best_text = text
        
        page_texts.append(best_text)
        print(f"    Page {i+1}/{len(images)}: {best_numbers} numbers found", end='\r')
    
    print(f"    Processed {len(images)} pages" + " " * 20)
    return page_texts


def clean_ocr_line(line: str) -> str:
    """Clean common OCR artifacts."""
    # Replace common OCR errors
    line = line.replace('|', ' ').replace('[', '').replace(']', '')
    line = line.replace('{', '').replace('}', '')
    
    # Fix common digit misreads
    line = re.sub(r'[oO](?=\d)', '0', line)  # O before digit -> 0
    line = re.sub(r'(?<=\d)[oO]', '0', line)  # O after digit -> 0
    line = re.sub(r'(?<=\d)[lI]', '1', line)  # l/I after digit -> 1
    line = re.sub(r'[lI](?=\d)', '1', line)   # l/I before digit -> 1
    line = re.sub(r'(?<=\d)[sS]', '5', line)  # S after digit -> 5
    
    # Normalize whitespace
    line = re.sub(r'\s+', ' ', line).strip()
    
    return line


def parse_standard_format(text: str, expected_bases: set, num_candidates: int) -> dict:
    """
    Parse standard row format:
    [SlNo/BoothNo] [BoothNo] [votes...] [TotalValid] [Rejected] [NOTA] [Total]
    
    Or simplified:
    [BoothNo] [BoothNo] [votes...]
    """
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        line = clean_ocr_line(line)
        if not line:
            continue
        
        # Skip headers
        lower = line.lower()
        if any(x in lower for x in ['polling', 'station', 'total valid', 'grand total', 
                                     'serial', 'sl.no', 'candidate', 'name of', 
                                     'rejected', 'form 20', 'assembly', 'electors']):
            continue
        
        # Extract all numbers
        nums = re.findall(r'\d+', line)
        
        if len(nums) < 5:
            continue
        
        try:
            # Pattern 1: First two numbers are same (row_idx = booth_no)
            if nums[0] == nums[1]:
                booth_no = int(nums[0])
                if booth_no in expected_bases:
                    votes = []
                    for n in nums[2:]:
                        v = int(n)
                        if v <= 2000:  # Reasonable vote count
                            votes.append(v)
                        elif v > 10000:
                            break  # Likely concatenated numbers
                    
                    if len(votes) >= 3:
                        total = sum(votes[:num_candidates]) if len(votes) >= num_candidates else sum(votes)
                        if 50 <= total <= 3000:
                            booth_id = f"{booth_no:03d}"
                            if booth_id not in results:
                                results[booth_id] = votes[:num_candidates] if len(votes) >= num_candidates else votes
            
            # Pattern 2: First number is serial, second is booth
            if len(nums) >= 6:
                serial = int(nums[0])
                booth_no = int(nums[1])
                
                if 1 <= serial <= 600 and booth_no in expected_bases:
                    votes = []
                    for n in nums[2:]:
                        v = int(n)
                        if v <= 2000:
                            votes.append(v)
                        elif v > 10000:
                            break
                    
                    if len(votes) >= 3:
                        total = sum(votes[:num_candidates]) if len(votes) >= num_candidates else sum(votes)
                        if 50 <= total <= 3000:
                            booth_id = f"{booth_no:03d}"
                            if booth_id not in results:
                                results[booth_id] = votes[:num_candidates] if len(votes) >= num_candidates else votes
            
            # Pattern 3: Just booth number followed by votes
            booth_no = int(nums[0])
            if booth_no in expected_bases:
                votes = []
                for n in nums[1:]:
                    v = int(n)
                    if v <= 2000:
                        votes.append(v)
                    elif v > 10000:
                        break
                
                if len(votes) >= 3:
                    total = sum(votes[:num_candidates]) if len(votes) >= num_candidates else sum(votes)
                    if 50 <= total <= 3000:
                        booth_id = f"{booth_no:03d}"
                        if booth_id not in results:
                            results[booth_id] = votes[:num_candidates] if len(votes) >= num_candidates else votes
                            
        except (ValueError, IndexError):
            continue
    
    return results


def parse_all_pages(page_texts: list, expected_bases: set, num_candidates: int) -> dict:
    """Parse all pages and merge results."""
    all_results = {}
    
    for page_text in page_texts:
        page_results = parse_standard_format(page_text, expected_bases, num_candidates)
        
        # Merge - keep first occurrence (usually higher quality)
        for booth_id, votes in page_results.items():
            if booth_id not in all_results:
                all_results[booth_id] = votes
    
    return all_results


def process_ac(ac_num: int, pc_data: dict, schema: dict) -> dict:
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Load metadata
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if not booths_file.exists():
        return {'status': 'no_metadata'}
    
    with open(booths_file) as f:
        meta = json.load(f)
    
    # Get expected booth numbers
    expected_bases = set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', []))
    
    # Load existing results
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
        existing_bases = set(get_base_booth_no(k.split('-')[-1]) for k in data.get('results', {}).keys())
    else:
        pc_id = get_pc_for_ac(ac_id, schema)
        pc_info = pc_data.get(pc_id, {}) if pc_id else {}
        candidates = pc_info.get('candidates', [])
        
        data = {
            'acId': ac_id,
            'acName': meta.get('acName', ''),
            'year': 2024,
            'electionType': 'parliament',
            'totalBooths': 0,
            'source': 'Tamil Nadu CEO - Form 20 (OCR)',
            'candidates': [{'slNo': i+1, 'name': c.get('name', ''), 'party': c.get('party', '')} 
                          for i, c in enumerate(candidates)],
            'results': {}
        }
        existing_bases = set()
    
    # Check what we need
    missing_bases = expected_bases - existing_bases
    if not missing_bases:
        return {'status': 'complete', 'extracted': len(existing_bases)}
    
    # Check PDF exists
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {'status': 'no_pdf', 'missing': len(missing_bases)}
    
    # Get candidate count
    num_candidates = len(data.get('candidates', []))
    
    print(f"  {ac_id}: {len(existing_bases)}/{len(expected_bases)} (need {len(missing_bases)})")
    
    try:
        # OCR with multiple DPI attempts
        best_results = {}
        
        for dpi in [200, 300]:
            print(f"    Trying DPI {dpi}...")
            page_texts = ocr_pdf_pages(pdf_path, dpi=dpi)
            parsed = parse_all_pages(page_texts, missing_bases, num_candidates)
            
            # Keep results that fill gaps
            for booth_id, votes in parsed.items():
                booth_base = int(booth_id)
                if booth_base in missing_bases and booth_id not in best_results:
                    best_results[booth_id] = votes
            
            print(f"    Found {len(best_results)} new booths so far")
            
            # If we found enough, stop
            if len(best_results) >= len(missing_bases) * 0.8:
                break
        
        # Add new results
        new_count = 0
        for booth_id, votes in best_results.items():
            # Pad votes to candidate count
            while len(votes) < num_candidates:
                votes.append(0)
            votes = votes[:num_candidates]
            
            full_booth_id = f"{ac_id}-{booth_id}"
            data['results'][full_booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            new_count += 1
        
        # Save
        data['totalBooths'] = len(data['results'])
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"    +{new_count} booths → {len(data['results'])}/{len(expected_bases)}")
        
        return {
            'status': 'processed',
            'extracted': len(data['results']),
            'expected': len(expected_bases),
            'new': new_count
        }
        
    except Exception as e:
        print(f"    Error: {e}")
        return {'status': 'error', 'error': str(e)}


def main():
    print("=" * 60)
    print("TN 2024 PC Booth Extraction (pdf2image + pytesseract)")
    print("=" * 60)
    
    # Check dependencies
    try:
        pytesseract.get_tesseract_version()
    except Exception as e:
        print(f"Tesseract not found: {e}")
        print("Install with: brew install tesseract")
        sys.exit(1)
    
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        # Process specific AC
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
    else:
        # Find ACs with largest gaps
        gaps = []
        for ac_num in range(1, 235):
            ac_id = f"TN-{ac_num:03d}"
            
            booths_file = OUTPUT_BASE / ac_id / "booths.json"
            if not booths_file.exists():
                continue
            
            with open(booths_file) as f:
                meta = json.load(f)
            expected_bases = set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', []))
            
            results_file = OUTPUT_BASE / ac_id / "2024.json"
            if results_file.exists():
                with open(results_file) as f:
                    data = json.load(f)
                existing_bases = set(get_base_booth_no(k.split('-')[-1]) for k in data.get('results', {}).keys())
            else:
                existing_bases = set()
            
            missing = len(expected_bases - existing_bases)
            if missing > 50:  # Only process ACs with >50 missing
                gaps.append((ac_num, missing, len(expected_bases)))
        
        gaps.sort(key=lambda x: -x[1])
        
        print(f"\nProcessing {len(gaps)} ACs with >50 missing booths...\n")
        
        total_new = 0
        for ac_num, missing, expected in gaps[:20]:  # Top 20
            result = process_ac(ac_num, pc_data, schema)
            if result.get('new', 0) > 0:
                total_new += result['new']
        
        print(f"\n{'=' * 60}")
        print(f"Total new booths: {total_new}")


if __name__ == "__main__":
    main()
