#!/usr/bin/env python3
"""
Final push for 100% - Fast targeted extraction.
Focus on high DPI and zoom techniques that have proven effective.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Install: pip install pdf2image pytesseract pillow")
    sys.exit(1)

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


def preprocess(image, method):
    if image.mode != 'L':
        image = image.convert('L')
    
    if method == 'contrast':
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0)
        image = image.filter(ImageFilter.SHARPEN)
    elif method == 'thresh100':
        image = image.point(lambda x: 255 if x > 100 else 0)
    elif method == 'thresh140':
        image = image.point(lambda x: 255 if x > 140 else 0)
    elif method == 'thresh180':
        image = image.point(lambda x: 255 if x > 180 else 0)
    elif method == 'zoom':
        w, h = image.size
        image = image.resize((w*2, h*2), Image.Resampling.LANCZOS)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    elif method == 'invert':
        image = ImageOps.invert(image)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
    
    return image


def ocr_image(image, preprocess_method):
    processed = preprocess(image.copy(), preprocess_method)
    
    # Try most effective PSM modes
    texts = []
    for psm in [6, 3]:
        try:
            config = f'--psm {psm} -l eng'
            text = pytesseract.image_to_string(processed, config=config)
            if text.strip():
                texts.append(text)
        except:
            pass
    
    return '\n'.join(texts)


def parse_booth_data(text: str, expected_bases: set, num_candidates: int) -> dict:
    results = {}
    
    for line in text.split('\n'):
        line_lower = line.lower()
        if any(x in line_lower for x in ['polling', 'station', 'total', 'valid', 
                                          'serial', 'candidate', 'rejected', 'nota',
                                          'form', 'assembly', 'electors']):
            continue
        
        # Clean and extract numbers
        line = line.replace('|', ' ').replace('[', ' ').replace(']', ' ')
        line = re.sub(r'[oO](?=\d)', '0', line)
        line = re.sub(r'(?<=\d)[oO]', '0', line)
        nums = re.findall(r'\d+', line)
        
        if len(nums) < 4:
            continue
        
        # Pattern: booth booth votes...
        if nums[0] == nums[1]:
            booth_no = int(nums[0])
            if booth_no in expected_bases and f"{booth_no:03d}" not in results:
                votes = [int(n) for n in nums[2:] if int(n) <= 2000][:num_candidates]
                if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                    results[f"{booth_no:03d}"] = votes
                    continue
        
        # Pattern: serial booth votes...
        if len(nums) >= 5:
            serial = int(nums[0])
            booth_no = int(nums[1])
            if 1 <= serial <= 700 and booth_no in expected_bases and f"{booth_no:03d}" not in results:
                votes = [int(n) for n in nums[2:] if int(n) <= 2000][:num_candidates]
                if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                    results[f"{booth_no:03d}"] = votes
                    continue
        
        # Pattern: any booth in line
        for i, n in enumerate(nums[:-3]):
            booth_no = int(n)
            if booth_no in expected_bases and f"{booth_no:03d}" not in results:
                votes = [int(x) for x in nums[i+1:] if int(x) <= 2000][:num_candidates]
                if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                    results[f"{booth_no:03d}"] = votes
                    break
    
    return results


def process_pdf(pdf_path: Path, expected_bases: set, num_candidates: int) -> dict:
    all_results = {}
    remaining = expected_bases.copy()
    
    # High DPI + preprocessing combinations (most effective)
    configs = [
        (500, 'contrast'),
        (600, 'contrast'),
        (400, 'thresh100'),
        (400, 'thresh140'),
        (400, 'thresh180'),
        (300, 'zoom'),
        (500, 'invert'),
    ]
    
    for dpi, prep in configs:
        if not remaining:
            break
        
        print(f"    {dpi}dpi+{prep}...", end=" ", flush=True)
        
        try:
            images = convert_from_path(str(pdf_path), dpi=dpi)
        except Exception as e:
            print("err")
            continue
        
        batch_results = {}
        for image in images:
            text = ocr_image(image, prep)
            parsed = parse_booth_data(text, remaining, num_candidates)
            for k, v in parsed.items():
                if k not in batch_results:
                    batch_results[k] = v
        
        new = len(batch_results)
        print(f"+{new}")
        
        for booth_id, votes in batch_results.items():
            if booth_id not in all_results:
                all_results[booth_id] = votes
                remaining.discard(int(booth_id))
        
        if new > len(expected_bases) * 0.3:
            break
    
    return all_results


def process_ac(ac_num: int, pc_data: dict, schema: dict) -> dict:
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
            'source': 'Tamil Nadu CEO - Form 20 (Final Push)',
            'candidates': [{'slNo': i+1, 'name': c.get('name', ''), 'party': c.get('party', '')} 
                          for i, c in enumerate(candidates)],
            'results': {}
        }
        existing_bases = set()
    
    missing_bases = expected_bases - existing_bases
    if not missing_bases:
        return {'status': 'complete'}
    
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {'status': 'no_pdf'}
    
    num_candidates = len(data.get('candidates', []))
    
    print(f"\n  {ac_id}: {len(existing_bases)}/{len(expected_bases)} (need {len(missing_bases)})")
    
    extracted = process_pdf(pdf_path, missing_bases, num_candidates)
    
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
    
    return {'new': new_count, 'extracted': len(data['results']), 'expected': len(expected_bases)}


def main():
    print("=" * 60)
    print("FINAL PUSH - High DPI + Threshold Combinations")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
        return
    
    # Get all ACs with gaps
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
        if missing > 0:
            gaps.append((ac_num, missing))
    
    gaps.sort(key=lambda x: -x[1])
    print(f"\n{len(gaps)} ACs with gaps, processing top 50...\n")
    
    total = 0
    for ac_num, missing in gaps[:50]:
        result = process_ac(ac_num, pc_data, schema)
        total += result.get('new', 0)
    
    print(f"\n{'=' * 60}")
    print(f"Total new: {total}")


if __name__ == "__main__":
    main()
