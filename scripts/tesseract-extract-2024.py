#!/usr/bin/env python3
"""
Tesseract OCR extraction for 2024 TN booth data.
Extracts booth-wise votes from Form 20 PDFs.

Usage:
    python scripts/tesseract-extract-2024.py 7       # Process AC 7
    python scripts/tesseract-extract-2024.py         # Process all ACs with empty votes
"""

import json
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter
except ImportError:
    print("Install required packages:")
    print("  pip install pdf2image pytesseract pillow")
    sys.exit(1)

# Configuration
FORM20_DIR = Path.home() / "Desktop" / "GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    """Load PC data and schema."""
    with open(PC_DATA_PATH) as f:
        pc_data = json.load(f)
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id: str, schema: dict) -> tuple:
    """Get PC ID and info for an AC."""
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id, pc_info.get('name', '')
    return None, None


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


def ocr_page(image, method='standard'):
    """Run OCR on a page image."""
    processed = preprocess_image(image.copy())
    
    # Try multiple PSM modes
    all_text = []
    for psm in [6, 4, 3]:
        try:
            config = f'--psm {psm} -l eng'
            text = pytesseract.image_to_string(processed, config=config)
            if text.strip():
                all_text.append(text)
        except Exception:
            pass
    
    return '\n'.join(all_text)


def clean_number(s: str) -> int:
    """Clean OCR'd number."""
    if not s:
        return None
    s = str(s)
    # Common OCR errors
    s = s.replace('O', '0').replace('o', '0')
    s = s.replace('I', '1').replace('l', '1').replace('|', '1')
    s = s.replace('S', '5').replace('s', '5')
    s = s.replace('B', '8').replace('G', '6')
    s = s.replace(')', '0').replace('(', '')
    s = s.replace('?', '7').replace('Z', '2')
    s = re.sub(r'[^\d]', '', s)
    try:
        return int(s) if s else None
    except:
        return None


def parse_booth_line(line: str, expected_booths: set, num_candidates: int) -> tuple:
    """Parse a line to extract booth data."""
    # Skip header lines
    lower = line.lower()
    if any(x in lower for x in ['polling', 'station', 'serial', 'candidate', 
                                  'total', 'valid', 'rejected', 'nota',
                                  'form 20', 'assembly', 'electors', 'constituency']):
        return None, None
    
    # Extract all numbers from the line
    nums = re.findall(r'\b(\d+)\b', line)
    if len(nums) < 4:
        return None, None
    
    try:
        # Try different patterns for booth number
        booth_no = None
        votes_start = 0
        
        # Pattern 1: First number is booth
        if 1 <= int(nums[0]) <= 700:
            booth_candidate = int(nums[0])
            if booth_candidate in expected_booths:
                booth_no = booth_candidate
                votes_start = 1
        
        # Pattern 2: Second number is booth (first is serial)
        if booth_no is None and len(nums) > 5:
            if 1 <= int(nums[1]) <= 700 and int(nums[1]) in expected_booths:
                booth_no = int(nums[1])
                votes_start = 2
        
        if booth_no is None:
            return None, None
        
        # Extract votes
        votes = []
        for n in nums[votes_start:]:
            v = int(n)
            if v <= 2500:  # Reasonable vote count
                votes.append(v)
            elif v > 5000:
                break  # Likely hit total column
            if len(votes) >= num_candidates:
                break
        
        # Validate
        if len(votes) < 3:
            return None, None
        
        total = sum(votes[:num_candidates]) if len(votes) >= num_candidates else sum(votes)
        if not (50 <= total <= 3000):
            return None, None
        
        # Pad votes if needed
        while len(votes) < num_candidates:
            votes.append(0)
        
        return f"{booth_no:03d}", votes[:num_candidates]
    
    except (ValueError, IndexError):
        return None, None


def process_pdf(pdf_path: Path, expected_booths: set, num_candidates: int) -> dict:
    """Process PDF with OCR."""
    results = {}
    
    # Convert PDF to images
    try:
        images = convert_from_path(str(pdf_path), dpi=200)
    except Exception as e:
        print(f"    Error converting PDF: {e}")
        return {}
    
    print(f"    Processing {len(images)} pages...")
    
    for page_num, image in enumerate(images):
        text = ocr_page(image)
        
        for line in text.split('\n'):
            booth_id, votes = parse_booth_line(line, expected_booths, num_candidates)
            if booth_id and booth_id not in results:
                results[booth_id] = votes
    
    return results


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
    expected_booths = set()
    for b in meta.get('booths', []):
        match = re.match(r'^0*(\d+)', str(b.get('boothNo', '')))
        if match:
            expected_booths.add(int(match.group(1)))
    
    # Load existing results
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
    else:
        data = {
            'acId': ac_id,
            'acName': meta.get('acName', ''),
            'year': 2024,
            'electionType': 'parliament',
            'totalBooths': 0,
            'source': 'Tamil Nadu CEO - Form 20',
            'candidates': [],
            'results': {}
        }
    
    # Count booths with empty votes
    empty_count = sum(1 for r in data.get('results', {}).values() 
                      if not r.get('votes') or len(r.get('votes', [])) == 0)
    
    if empty_count == 0:
        return {'status': 'complete', 'booths': len(data.get('results', {}))}
    
    print(f"\n{'='*60}")
    print(f"{ac_id} - {meta.get('acName', '')}")
    print(f"{'='*60}")
    print(f"  Expected: {len(expected_booths)} booths")
    print(f"  Existing: {len(data.get('results', {}))} booths ({empty_count} with empty votes)")
    
    # Get PC candidates
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"  ⚠️  Could not find PC for {ac_id}")
        return {'status': 'no_pc'}
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    
    if not candidates:
        print(f"  ⚠️  No candidates found for PC {pc_id}")
        return {'status': 'no_candidates'}
    
    print(f"  PC: {pc_id} ({pc_name}) - {len(candidates)} candidates")
    
    # Update candidates in output
    data['candidates'] = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND')
    } for i, c in enumerate(candidates)]
    
    # Check for PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        print(f"  ❌ PDF not found: {pdf_path}")
        return {'status': 'no_pdf'}
    
    # Process PDF
    extracted = process_pdf(pdf_path, expected_booths, len(candidates))
    
    if not extracted:
        print(f"  ❌ No booths extracted")
        return {'status': 'no_extraction'}
    
    print(f"  Extracted {len(extracted)} booths")
    
    # Merge results
    new_count = 0
    updated_count = 0
    
    for booth_key, votes in extracted.items():
        full_booth_id = f"{ac_id}-{booth_key}"
        
        if full_booth_id not in data['results']:
            data['results'][full_booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            new_count += 1
        elif not data['results'][full_booth_id].get('votes'):
            data['results'][full_booth_id]['votes'] = votes
            data['results'][full_booth_id]['total'] = sum(votes)
            updated_count += 1
    
    data['totalBooths'] = len(data['results'])
    data['source'] = 'Tamil Nadu CEO - Form 20 (Tesseract OCR)'
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"  ✅ Saved: +{new_count} new, {updated_count} updated = {len(data['results'])} total")
    
    # Validate
    validate_extraction(data, candidates)
    
    return {
        'status': 'success',
        'new': new_count,
        'updated': updated_count,
        'total': len(data['results'])
    }


def validate_extraction(data: dict, candidates: list):
    """Validate extracted data against official totals."""
    results = data.get('results', {})
    num_candidates = len(candidates)
    
    vote_totals = [0] * num_candidates
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                vote_totals[i] += v
    
    print(f"\n  Validation (top 3):")
    for i in range(min(3, num_candidates)):
        off_votes = candidates[i].get('votes', 0)
        extracted = vote_totals[i]
        ratio = extracted / off_votes if off_votes > 0 else 0
        status = "✓" if 0.7 <= ratio <= 1.3 else "✗"
        party = candidates[i].get('party', 'IND')
        print(f"    {status} {party:8}: {extracted:>8,} / {off_votes:>8,} ({ratio:.2f}x)")


def find_acs_needing_extraction() -> list:
    """Find ACs with empty votes."""
    needing = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        results_file = OUTPUT_BASE / ac_id / "2024.json"
        booths_file = OUTPUT_BASE / ac_id / "booths.json"
        
        if not booths_file.exists() or not results_file.exists():
            continue
        
        with open(results_file) as f:
            data = json.load(f)
        
        results = data.get('results', {})
        empty_count = sum(1 for r in results.values() 
                         if not r.get('votes') or len(r.get('votes', [])) == 0)
        
        if empty_count > len(results) * 0.1:  # More than 10% empty
            needing.append((ac_num, len(results), empty_count))
    
    needing.sort(key=lambda x: -x[2])  # Sort by empty count
    return needing


def main():
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        # Process specific AC(s)
        ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
        
        for ac_num in ac_nums:
            result = process_ac(ac_num, pc_data, schema)
            print(f"\nResult: {result}")
    else:
        # Show status
        needing = find_acs_needing_extraction()
        
        print("=" * 70)
        print("2024 TN Booth Data - Tesseract Extraction")
        print("=" * 70)
        print(f"\nFound {len(needing)} ACs with empty votes:\n")
        
        for ac_num, total, empty in needing[:20]:
            print(f"  TN-{ac_num:03d}: {total} booths, {empty} empty votes")
        
        if len(needing) > 20:
            print(f"  ... and {len(needing) - 20} more")
        
        print(f"\nTo process, run:")
        print(f"  python scripts/tesseract-extract-2024.py {needing[0][0]}")


if __name__ == "__main__":
    main()
