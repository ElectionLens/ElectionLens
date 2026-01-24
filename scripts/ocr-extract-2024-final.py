#!/usr/bin/env python3
"""
Aggressive OCR extraction for scanned 2024 Form 20 PDFs.
Uses Tesseract with multiple preprocessing techniques.

Usage:
    uv run --with pdf2image --with pytesseract --with pillow python scripts/ocr-extract-2024-final.py 7
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Run with: uv run --with pdf2image --with pytesseract --with pillow python scripts/ocr-extract-2024-final.py")
    sys.exit(1)

# Configuration
FORM20_DIR = Path.home() / "Desktop" / "GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    with open(PC_DATA_PATH) as f:
        pc_data = json.load(f)
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id: str, schema: dict) -> tuple:
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id, pc_info.get('name', '')
    return None, None


def preprocess_image(image, method='standard'):
    """Apply various preprocessing techniques."""
    if image.mode != 'L':
        image = image.convert('L')
    
    if method == 'standard':
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
        image = image.filter(ImageFilter.SHARPEN)
    elif method == 'high_contrast':
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.5)
        image = image.filter(ImageFilter.SHARPEN)
    elif method == 'threshold':
        image = image.point(lambda x: 255 if x > 128 else 0, '1')
        image = image.convert('L')
    elif method == 'denoise':
        image = image.filter(ImageFilter.MedianFilter(3))
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    elif method == 'invert':
        image = ImageOps.invert(image)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    
    return image


def ocr_image(image, psm=6):
    """Run OCR with specified page segmentation mode."""
    config = f'--psm {psm} -l eng'
    return pytesseract.image_to_string(image, config=config)


def extract_numbers_from_line(line: str) -> list:
    """Extract numbers from OCR text, fixing common errors."""
    # Fix common OCR errors
    line = line.replace('O', '0').replace('o', '0')
    line = line.replace('I', '1').replace('l', '1').replace('|', '1')
    line = line.replace('S', '5').replace('s', '5')
    line = line.replace('B', '8').replace('G', '6')
    line = line.replace(')', '0').replace('(', '')
    line = line.replace('?', '7').replace('Z', '2')
    
    return re.findall(r'\b(\d+)\b', line)


def parse_ocr_text(text: str, num_candidates: int, max_booth: int = 500) -> dict:
    """Parse OCR text to extract booth data."""
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Skip header lines
        lower = line.lower()
        if any(x in lower for x in ['polling', 'station', 'serial', 'candidate',
                                      'total', 'valid', 'rejected', 'nota',
                                      'form', 'assembly', 'electors', 'constituency']):
            continue
        
        nums = extract_numbers_from_line(line)
        if len(nums) < 5:
            continue
        
        # Try different parsing patterns
        booth_no = None
        votes = []
        
        # Pattern 1: First two numbers same (serial = booth)
        if len(nums) >= 6 and nums[0] == nums[1]:
            try:
                booth_no = int(nums[0])
                if 1 <= booth_no <= max_booth:
                    vote_nums = [int(n) for n in nums[2:]]
                    votes = [v for v in vote_nums if v <= 2000][:num_candidates]
            except ValueError:
                pass
        
        # Pattern 2: First is serial, second is booth
        if not booth_no and len(nums) >= 7:
            try:
                serial = int(nums[0])
                booth_cand = int(nums[1])
                if 1 <= serial <= max_booth and 1 <= booth_cand <= max_booth:
                    booth_no = booth_cand
                    vote_nums = [int(n) for n in nums[2:]]
                    votes = [v for v in vote_nums if v <= 2000][:num_candidates]
            except ValueError:
                pass
        
        # Pattern 3: First number is booth
        if not booth_no and len(nums) >= 5:
            try:
                booth_cand = int(nums[0])
                if 1 <= booth_cand <= max_booth:
                    booth_no = booth_cand
                    vote_nums = [int(n) for n in nums[1:]]
                    votes = [v for v in vote_nums if v <= 2000][:num_candidates]
            except ValueError:
                pass
        
        if booth_no and len(votes) >= 3:
            total = sum(votes)
            if 50 <= total <= 3000:
                booth_id = f"{booth_no:03d}"
                if booth_id not in results:
                    # Pad votes
                    while len(votes) < num_candidates:
                        votes.append(0)
                    results[booth_id] = votes[:num_candidates]
    
    return results


def process_pdf_ocr(pdf_path: Path, num_candidates: int, max_booth: int = 500) -> dict:
    """Process PDF with multiple OCR configurations."""
    all_results = {}
    
    # DPI and preprocessing configurations to try
    configs = [
        (200, 'standard'),
        (250, 'standard'),
        (300, 'standard'),
        (200, 'high_contrast'),
        (300, 'high_contrast'),
        (200, 'threshold'),
        (200, 'denoise'),
    ]
    
    found_booths = set()
    
    for dpi, preprocess in configs:
        if len(found_booths) >= max_booth * 0.9:  # Stop if we have most booths
            break
        
        print(f"    Trying {dpi}dpi {preprocess}...", end=" ", flush=True)
        
        try:
            images = convert_from_path(str(pdf_path), dpi=dpi)
        except Exception as e:
            print(f"error: {e}")
            continue
        
        config_results = {}
        
        for page_num, image in enumerate(images):
            processed = preprocess_image(image.copy(), preprocess)
            
            # Try multiple PSM modes
            for psm in [6, 4, 3]:
                text = ocr_image(processed, psm=psm)
                parsed = parse_ocr_text(text, num_candidates, max_booth)
                
                for booth_id, votes in parsed.items():
                    if booth_id not in config_results:
                        config_results[booth_id] = votes
        
        new_found = 0
        for booth_id, votes in config_results.items():
            booth_num = int(booth_id)
            if booth_num not in found_booths:
                all_results[booth_id] = votes
                found_booths.add(booth_num)
                new_found += 1
        
        print(f"+{new_found} ({len(found_booths)} total)")
    
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
    
    # Get max booth number
    max_booth = max(
        int(re.match(r'^0*(\d+)', str(b.get('boothNo', '0'))).group(1))
        for b in meta.get('booths', [{'boothNo': '500'}])
    ) if meta.get('booths') else 500
    
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
    
    # Get booth numbers needing extraction
    needs_extraction = set()
    for k, v in data.get('results', {}).items():
        if not v.get('votes') or len(v.get('votes', [])) == 0:
            match = re.match(r'^TN-\d{3}-0*(\d+)', k)
            if match:
                needs_extraction.add(int(match.group(1)))
    
    if not needs_extraction:
        return {'status': 'complete', 'booths': len(data.get('results', {}))}
    
    print(f"\n{'='*60}")
    print(f"{ac_id} - {meta.get('acName', '')}")
    print(f"{'='*60}")
    print(f"  Total booths: {len(data.get('results', {}))}")
    print(f"  Needing votes: {len(needs_extraction)}")
    print(f"  Max booth number: {max_booth}")
    
    # Get PC candidates
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"  ⚠️  Could not find PC for {ac_id}")
        return {'status': 'no_pc'}
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    
    if not candidates:
        return {'status': 'no_candidates'}
    
    print(f"  PC: {pc_id} ({pc_name}) - {len(candidates)} candidates")
    
    # Update candidates
    data['candidates'] = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND')
    } for i, c in enumerate(candidates)]
    
    # Check PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {'status': 'no_pdf'}
    
    # Run OCR extraction
    print(f"  Running OCR extraction...")
    extracted = process_pdf_ocr(pdf_path, len(candidates), max_booth)
    
    if not extracted:
        print(f"  ❌ No booths extracted")
        return {'status': 'no_extraction'}
    
    print(f"  Extracted {len(extracted)} booths from OCR")
    
    # Update results
    updated_count = 0
    new_count = 0
    
    for booth_id, votes in extracted.items():
        booth_num = int(booth_id)
        full_booth_id = f"{ac_id}-{booth_id}"
        
        if full_booth_id in data['results']:
            if not data['results'][full_booth_id].get('votes'):
                data['results'][full_booth_id]['votes'] = votes
                data['results'][full_booth_id]['total'] = sum(votes)
                updated_count += 1
        else:
            data['results'][full_booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            new_count += 1
    
    data['totalBooths'] = len(data['results'])
    data['source'] = 'Tamil Nadu CEO - Form 20 (Tesseract OCR)'
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"  ✅ Saved: +{new_count} new, {updated_count} updated = {len(data['results'])} total")
    
    # Quick validation
    vote_totals = [0] * len(candidates)
    for r in data.get('results', {}).values():
        for i, v in enumerate(r.get('votes', [])):
            if i < len(vote_totals):
                vote_totals[i] += v
    
    print(f"\n  Validation (top 3):")
    for i in range(min(3, len(candidates))):
        off = candidates[i].get('votes', 0)
        ext = vote_totals[i]
        ratio = ext / off if off > 0 else 0
        status = "✓" if 0.7 <= ratio <= 1.3 else "✗"
        print(f"    {status} {candidates[i].get('party'):8}: {ext:>8,} / {off:>8,} ({ratio:.2f}x)")
    
    return {
        'status': 'success',
        'new': new_count,
        'updated': updated_count,
        'total': len(data['results'])
    }


def main():
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
        for ac_num in ac_nums:
            result = process_ac(ac_num, pc_data, schema)
            print(f"\nResult: {result}")
    else:
        print("Usage: python scripts/ocr-extract-2024-final.py <ac_num> [ac_num2...]")
        print("Example: python scripts/ocr-extract-2024-final.py 7")


if __name__ == "__main__":
    main()
