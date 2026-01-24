#!/usr/bin/env python3
"""
Super-aggressive OCR extraction with advanced techniques.

New techniques:
1. OEM modes (0-3)
2. Very high DPI (500, 600)  
3. Adaptive thresholding
4. Morphological operations (erosion, dilation)
5. Regional extraction (table area focus)
6. Row-by-row parsing
7. Multiple threshold values
"""

import json
import os
import re
import subprocess
import sys
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
    if not s:
        return None
    s = str(s)
    s = s.replace('O', '0').replace('o', '0')
    s = s.replace('I', '1').replace('l', '1').replace('|', '1')
    s = s.replace('S', '5').replace('s', '5')
    s = s.replace('B', '8').replace('G', '6').replace('g', '9')
    s = s.replace(')', '0').replace('(', '')
    s = s.replace('[', '').replace(']', '').replace('{', '').replace('}', '')
    s = s.replace('?', '7').replace('Z', '2').replace('z', '2')
    s = re.sub(r'[^\d]', '', s)
    try:
        return int(s) if s else None
    except:
        return None


def adaptive_threshold_pil(image, threshold=128):
    """Apply thresholding using PIL."""
    if image.mode != 'L':
        image = image.convert('L')
    return image.point(lambda x: 255 if x > threshold else 0, '1').convert('L')


def morphological_ops_pil(image, operation='dilate'):
    """Apply morphological-like operations using PIL filters."""
    if image.mode != 'L':
        image = image.convert('L')
    
    if operation == 'dilate':
        image = image.filter(ImageFilter.MaxFilter(3))
    elif operation == 'erode':
        image = image.filter(ImageFilter.MinFilter(3))
    elif operation == 'open':
        image = image.filter(ImageFilter.MinFilter(3))
        image = image.filter(ImageFilter.MaxFilter(3))
    elif operation == 'close':
        image = image.filter(ImageFilter.MaxFilter(3))
        image = image.filter(ImageFilter.MinFilter(3))
    
    return image


def preprocess_advanced(image, method='standard'):
    """Advanced preprocessing methods."""
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
        image = image.filter(ImageFilter.SHARPEN)
    
    elif method == 'threshold_low':
        image = image.point(lambda x: 255 if x > 100 else 0, '1')
        image = image.convert('L')
    
    elif method == 'threshold_high':
        image = image.point(lambda x: 255 if x > 160 else 0, '1')
        image = image.convert('L')
    
    elif method == 'adaptive':
        image = adaptive_threshold_pil(image, 128)
    
    elif method == 'morpho_open':
        image = morphological_ops_pil(image, 'open')
    
    elif method == 'morpho_close':
        image = morphological_ops_pil(image, 'close')
    
    elif method == 'invert':
        image = ImageOps.invert(image)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    
    elif method == 'denoise':
        image = image.filter(ImageFilter.MedianFilter(3))
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    
    elif method == 'zoom':
        # Zoom 2x for better OCR
        w, h = image.size
        image = image.resize((w*2, h*2), Image.Resampling.LANCZOS)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    
    return image


def ocr_with_all_modes(image, preprocess='standard'):
    """Try all OCR modes and combine results."""
    processed = preprocess_advanced(image.copy(), preprocess)
    
    all_text = []
    
    # Try different PSM modes
    for psm in [6, 3, 4, 11]:
        # Try different OEM modes (0=Legacy, 1=LSTM, 2=Both, 3=Default)
        for oem in [3, 1]:
            try:
                config = f'--psm {psm} --oem {oem} -l eng'
                text = pytesseract.image_to_string(processed, config=config)
                if text.strip():
                    all_text.append(text)
            except:
                pass
    
    return '\n'.join(all_text)


def extract_all_numbers(text: str) -> list:
    text = text.replace('|', ' ').replace('[', ' ').replace(']', ' ')
    text = re.sub(r'[oO](?=\d)', '0', text)
    text = re.sub(r'(?<=\d)[oO]', '0', text)
    text = re.sub(r'(?<=\d)[lI]', '1', text)
    text = re.sub(r'[lI](?=\d)', '1', text)
    return re.findall(r'\d+', text)


def aggressive_parse(text: str, expected_bases: set, num_candidates: int) -> dict:
    """Very aggressive parsing."""
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        line_lower = line.lower()
        
        if any(x in line_lower for x in ['polling', 'station', 'total', 'valid', 
                                          'serial', 'candidate', 'rejected', 'nota',
                                          'form 20', 'assembly', 'electors', 'constituency']):
            continue
        
        nums = extract_all_numbers(line)
        if len(nums) < 4:
            continue
        
        # Pattern 1: First two same (booth = serial)
        if nums[0] == nums[1]:
            booth_no = int(nums[0])
            if booth_no in expected_bases and f"{booth_no:03d}" not in results:
                votes = [int(n) for n in nums[2:] if int(n) <= 2000][:num_candidates]
                if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                    results[f"{booth_no:03d}"] = votes
                    continue
        
        # Pattern 2: First is serial, second is booth
        if len(nums) >= 6:
            serial = int(nums[0])
            booth_no = int(nums[1])
            if 1 <= serial <= 700 and booth_no in expected_bases and f"{booth_no:03d}" not in results:
                votes = [int(n) for n in nums[2:] if int(n) <= 2000][:num_candidates]
                if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                    results[f"{booth_no:03d}"] = votes
                    continue
        
        # Pattern 3: Booth followed by votes
        booth_no = int(nums[0])
        if booth_no in expected_bases and f"{booth_no:03d}" not in results:
            votes = [int(n) for n in nums[1:] if int(n) <= 2000][:num_candidates]
            if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                results[f"{booth_no:03d}"] = votes
                continue
        
        # Pattern 4: Any booth number in line
        for i, n in enumerate(nums[:-3]):
            booth_no = int(n)
            if booth_no in expected_bases and f"{booth_no:03d}" not in results:
                votes = [int(x) for x in nums[i+1:] if int(x) <= 2000][:num_candidates]
                if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                    results[f"{booth_no:03d}"] = votes
                    break
    
    return results


def process_pdf_super(pdf_path: Path, expected_bases: set, num_candidates: int) -> dict:
    """Super aggressive PDF processing."""
    all_results = {}
    
    # Extended configurations
    configs = [
        (200, 'standard'),
        (250, 'standard'),
        (300, 'standard'),
        (400, 'standard'),
        (500, 'standard'),
        (200, 'high_contrast'),
        (300, 'high_contrast'),
        (150, 'threshold_low'),
        (150, 'threshold_high'),
        (200, 'adaptive'),
        (200, 'morpho_open'),
        (200, 'morpho_close'),
        (200, 'invert'),
        (200, 'denoise'),
        (150, 'zoom'),
        (600, 'standard'),
    ]
    
    remaining = expected_bases.copy()
    
    for dpi, preprocess in configs:
        if not remaining:
            break
        
        print(f"      {dpi}dpi {preprocess}...", end=" ", flush=True)
        
        try:
            images = convert_from_path(str(pdf_path), dpi=dpi)
        except Exception as e:
            print(f"err")
            continue
        
        page_results = {}
        
        for page_num, image in enumerate(images):
            text = ocr_with_all_modes(image, preprocess=preprocess)
            parsed = aggressive_parse(text, remaining, num_candidates)
            
            for booth_id, votes in parsed.items():
                if booth_id not in page_results:
                    page_results[booth_id] = votes
        
        new_found = len(page_results)
        print(f"+{new_found}")
        
        for booth_id, votes in page_results.items():
            if booth_id not in all_results:
                all_results[booth_id] = votes
                booth_base = int(booth_id)
                remaining.discard(booth_base)
        
        if new_found > len(expected_bases) * 0.4:
            break
    
    return all_results


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
            'source': 'Tamil Nadu CEO - Form 20 (Super OCR)',
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
    
    print(f"\n  {ac_id}: {len(existing_bases)}/{len(expected_bases)} (need {len(missing_bases)})")
    
    extracted = process_pdf_super(pdf_path, missing_bases, num_candidates)
    
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
    
    print(f"    → +{new_count} = {len(data['results'])}/{len(expected_bases)}")
    
    return {
        'status': 'processed',
        'extracted': len(data['results']),
        'expected': len(expected_bases),
        'new': new_count
    }


def main():
    print("=" * 60)
    print("SUPER OCR - Advanced Techniques")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
    else:
        gaps = []
        for ac_num in range(1, 235):
            ac_id = f"TN-{ac_num:03d}"
            
            booths_file = OUTPUT_BASE / ac_id / "booths.json"
            if not booths_file.exists():
                continue
            
            with open(booths_file) as f:
                meta = json.load(f)
            expected = set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', []))
            
            results_file = OUTPUT_BASE / ac_id / "2024.json"
            if results_file.exists():
                with open(results_file) as f:
                    data = json.load(f)
                existing = set(get_base_booth_no(k.split('-')[-1]) for k in data.get('results', {}).keys())
            else:
                existing = set()
            
            missing = len(expected - existing)
            if missing > 5:
                gaps.append((ac_num, missing, len(expected)))
        
        gaps.sort(key=lambda x: -x[1])
        
        print(f"\nProcessing {len(gaps)} ACs with >5 missing booths...\n")
        
        total_new = 0
        for ac_num, missing, expected in gaps[:50]:
            result = process_ac(ac_num, pc_data, schema)
            if result.get('new', 0) > 0:
                total_new += result['new']
        
        print(f"\n{'=' * 60}")
        print(f"Total new booths: {total_new}")


if __name__ == "__main__":
    main()
