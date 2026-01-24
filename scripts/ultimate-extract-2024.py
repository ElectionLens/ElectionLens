#!/usr/bin/env python3
"""
Ultimate extraction script combining all successful 2021 techniques.

Techniques:
1. Multiple DPI levels (150, 200, 250, 300, 400)
2. Multiple Tesseract PSM modes (3, 4, 6, 11)
3. Image preprocessing (contrast, sharpen, threshold)
4. Multiple parsing formats (standard, transposed, wide, pipe-separated)
5. OCR artifact cleanup
6. Vote total validation
7. Greedy column matching
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from collections import defaultdict

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Install: pip install pdf2image pytesseract pillow")
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
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def clean_ocr_num(s: str) -> int:
    """Clean OCR number artifacts."""
    if not s:
        return None
    s = str(s)
    # Common OCR substitutions
    s = s.replace('O', '0').replace('o', '0')
    s = s.replace('I', '1').replace('l', '1').replace('|', '1')
    s = s.replace('S', '5').replace('s', '5')
    s = s.replace('B', '8')
    s = s.replace(')', '0').replace('(', '')
    s = s.replace('[', '').replace(']', '')
    s = s.replace('{', '').replace('}', '')
    s = re.sub(r'[^\d]', '', s)
    try:
        return int(s) if s else None
    except:
        return None


def preprocess_image(image, method='standard'):
    """Apply different preprocessing methods."""
    if image.mode != 'L':
        image = image.convert('L')
    
    if method == 'standard':
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
        image = image.filter(ImageFilter.SHARPEN)
    
    elif method == 'high_contrast':
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0)
        image = image.filter(ImageFilter.SHARPEN)
        image = image.filter(ImageFilter.SHARPEN)
    
    elif method == 'threshold':
        # Binarize
        image = image.point(lambda x: 255 if x > 128 else 0, '1')
        image = image.convert('L')
    
    elif method == 'invert':
        image = ImageOps.invert(image)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    
    return image


def ocr_with_config(image, psm=6, preprocess='standard'):
    """OCR with specific configuration."""
    processed = preprocess_image(image.copy(), preprocess)
    config = f'--psm {psm} -l eng'
    try:
        text = pytesseract.image_to_string(processed, config=config)
        return text
    except:
        return ""


def extract_all_numbers(text: str) -> list:
    """Extract all numbers from text, cleaning OCR artifacts."""
    # Clean the text first
    text = text.replace('|', ' ').replace('[', ' ').replace(']', ' ')
    text = re.sub(r'[oO](?=\d)', '0', text)
    text = re.sub(r'(?<=\d)[oO]', '0', text)
    text = re.sub(r'(?<=\d)[lI]', '1', text)
    text = re.sub(r'[lI](?=\d)', '1', text)
    
    return re.findall(r'\d+', text)


def parse_standard_row(line: str, expected_bases: set, num_candidates: int) -> dict:
    """Parse: [Serial] [Booth] [votes...] [totals]"""
    nums = extract_all_numbers(line)
    if len(nums) < 5:
        return None
    
    # Pattern 1: First two same (booth = serial)
    if nums[0] == nums[1]:
        booth_no = int(nums[0])
        if booth_no in expected_bases:
            votes = [int(n) for n in nums[2:] if int(n) <= 2000][:num_candidates]
            if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                return {f"{booth_no:03d}": votes}
    
    # Pattern 2: First is serial, second is booth
    if len(nums) >= 6:
        serial = int(nums[0])
        booth_no = int(nums[1])
        if 1 <= serial <= 700 and booth_no in expected_bases:
            votes = [int(n) for n in nums[2:] if int(n) <= 2000][:num_candidates]
            if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                return {f"{booth_no:03d}": votes}
    
    # Pattern 3: Just booth followed by votes
    booth_no = int(nums[0])
    if booth_no in expected_bases:
        votes = [int(n) for n in nums[1:] if int(n) <= 2000][:num_candidates]
        if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
            return {f"{booth_no:03d}": votes}
    
    return None


def parse_pipe_format(line: str, expected_bases: set, num_candidates: int) -> dict:
    """Parse pipe-separated format."""
    if '|' not in line:
        return None
    
    parts = re.split(r'\s*\|\s*', line.strip())
    if len(parts) < 2:
        return None
    
    try:
        first = clean_ocr_num(parts[0])
        if first and first in expected_bases:
            rest = ' '.join(parts[1:])
            nums = extract_all_numbers(rest)
            votes = [int(n) for n in nums if int(n) <= 2000][:num_candidates]
            if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                return {f"{first:03d}": votes}
    except:
        pass
    return None


def aggressive_parse(text: str, expected_bases: set, num_candidates: int) -> dict:
    """Very aggressive parsing - try everything."""
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        line_lower = line.lower()
        
        # Skip obvious headers
        if any(x in line_lower for x in ['polling', 'station', 'total', 'valid', 
                                          'serial', 'candidate', 'rejected', 'nota',
                                          'form 20', 'assembly', 'electors', 'constituency']):
            continue
        
        # Try standard parsing
        result = parse_standard_row(line, expected_bases, num_candidates)
        if result:
            results.update(result)
            continue
        
        # Try pipe format
        result = parse_pipe_format(line, expected_bases, num_candidates)
        if result:
            results.update(result)
            continue
        
        # Ultra-aggressive: look for any booth number followed by enough numbers
        nums = extract_all_numbers(line)
        if len(nums) >= 4:
            for i, n in enumerate(nums[:-3]):
                booth_no = int(n)
                if booth_no in expected_bases and f"{booth_no:03d}" not in results:
                    votes = [int(x) for x in nums[i+1:] if int(x) <= 2000][:num_candidates]
                    if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                        results[f"{booth_no:03d}"] = votes
                        break
    
    return results


def process_pdf_ultimate(pdf_path: Path, expected_bases: set, num_candidates: int) -> dict:
    """Process PDF with all techniques."""
    all_results = {}
    
    # DPI and preprocessing combinations to try
    configs = [
        (200, 'standard'),
        (250, 'standard'),
        (300, 'standard'),
        (200, 'high_contrast'),
        (300, 'high_contrast'),
        (400, 'standard'),
        (150, 'threshold'),
        (200, 'invert'),
    ]
    
    # PSM modes to try
    psm_modes = [6, 3, 4, 11]
    
    remaining = expected_bases.copy()
    
    for dpi, preprocess in configs:
        if not remaining:
            break
        
        print(f"      DPI {dpi}, {preprocess}...", end=" ", flush=True)
        
        try:
            images = convert_from_path(str(pdf_path), dpi=dpi)
        except Exception as e:
            print(f"error: {e}")
            continue
        
        page_results = {}
        
        for page_num, image in enumerate(images):
            for psm in psm_modes:
                text = ocr_with_config(image, psm=psm, preprocess=preprocess)
                parsed = aggressive_parse(text, remaining, num_candidates)
                
                for booth_id, votes in parsed.items():
                    if booth_id not in page_results:
                        page_results[booth_id] = votes
        
        new_found = len(page_results)
        print(f"+{new_found}")
        
        # Add to all results
        for booth_id, votes in page_results.items():
            if booth_id not in all_results:
                all_results[booth_id] = votes
                booth_base = int(booth_id)
                remaining.discard(booth_base)
        
        # If we found a lot, the current config is working
        if new_found > len(expected_bases) * 0.3:
            break
    
    return all_results


def try_pdftotext(pdf_path: Path, missing_bases: set, num_candidates: int) -> dict:
    """Try extracting with pdftotext first (for text-based PDFs)."""
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, timeout=30
        )
        text = result.stdout
        
        # Check if it has extractable text
        nums = extract_all_numbers(text)
        if len(nums) < 100:
            return {}  # Probably scanned
        
        print(f"    [pdftotext: {len(nums)} nums]", end=" ", flush=True)
        return aggressive_parse(text, missing_bases, num_candidates)
    except:
        return {}


def process_ac(ac_num: int, pc_data: dict, schema: dict) -> dict:
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if not booths_file.exists():
        return {'status': 'no_metadata'}
    
    with open(booths_file) as f:
        meta = json.load(f)
    
    expected_bases = set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', []))
    
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
            'source': 'Tamil Nadu CEO - Form 20 (OCR Ultimate)',
            'candidates': [{'slNo': i+1, 'name': c.get('name', ''), 'party': c.get('party', '')} 
                          for i, c in enumerate(candidates)],
            'results': {}
        }
        existing_bases = set()
    
    missing_bases = expected_bases - existing_bases
    if not missing_bases:
        return {'status': 'complete', 'extracted': len(existing_bases)}
    
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {'status': 'no_pdf', 'missing': len(missing_bases)}
    
    num_candidates = len(data.get('candidates', []))
    
    print(f"\n  {ac_id}: {len(existing_bases)}/{len(expected_bases)} (need {len(missing_bases)})", end=" ", flush=True)
    
    # First try pdftotext (fast, works for text-based PDFs)
    extracted = try_pdftotext(pdf_path, missing_bases, num_candidates)
    
    # If pdftotext didn't find much, use OCR
    if len(extracted) < len(missing_bases) * 0.3:
        remaining = missing_bases - set(int(k) for k in extracted.keys())
        if remaining:
            print(f"\n    [OCR for {len(remaining)} remaining]")
            ocr_extracted = process_pdf_ultimate(pdf_path, remaining, num_candidates)
            extracted.update(ocr_extracted)
    else:
        print(f"+{len(extracted)}")
    
    # Add results
    new_count = 0
    for booth_id, votes in extracted.items():
        while len(votes) < num_candidates:
            votes.append(0)
        votes = votes[:num_candidates]
        
        full_booth_id = f"{ac_id}-{booth_id}"
        if full_booth_id not in data['results']:
            data['results'][full_booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            new_count += 1
    
    data['totalBooths'] = len(data['results'])
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"    TOTAL: +{new_count} → {len(data['results'])}/{len(expected_bases)}")
    
    return {
        'status': 'processed',
        'extracted': len(data['results']),
        'expected': len(expected_bases),
        'new': new_count
    }


def main():
    print("=" * 60)
    print("ULTIMATE EXTRACTION - All 2021 Techniques Combined")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
    else:
        # Find ACs with biggest gaps
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
            if missing > 20:
                gaps.append((ac_num, missing, len(expected_bases)))
        
        gaps.sort(key=lambda x: -x[1])
        
        print(f"\nProcessing {len(gaps)} ACs with >20 missing booths...\n")
        
        total_new = 0
        for ac_num, missing, expected in gaps[:30]:  # Top 30
            result = process_ac(ac_num, pc_data, schema)
            if result.get('new', 0) > 0:
                total_new += result['new']
        
        print(f"\n{'=' * 60}")
        print(f"Total new booths extracted: {total_new}")


if __name__ == "__main__":
    main()
