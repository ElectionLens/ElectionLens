#!/usr/bin/env python3
"""
Targeted extraction - focus on specific missing booth numbers.
Uses pattern matching to find booth numbers and associated votes.
"""

import json
import os
import re
import sys
from pathlib import Path

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter
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


def targeted_ocr(image, target_booths: set, num_candidates: int) -> dict:
    """OCR specifically looking for target booth numbers."""
    results = {}
    
    # Convert to grayscale and enhance
    if image.mode != 'L':
        gray = image.convert('L')
    else:
        gray = image
    
    # Try multiple preprocessing
    preprocesses = [
        lambda img: ImageEnhance.Contrast(img).enhance(1.5),
        lambda img: ImageEnhance.Contrast(img).enhance(2.0),
        lambda img: img.point(lambda x: 255 if x > 120 else 0),
        lambda img: img.point(lambda x: 255 if x > 150 else 0),
    ]
    
    for prep in preprocesses:
        processed = prep(gray.copy())
        processed = processed.filter(ImageFilter.SHARPEN)
        
        # OCR with different modes
        for psm in [6, 3, 4]:
            try:
                text = pytesseract.image_to_string(processed, config=f'--psm {psm} -l eng')
            except:
                continue
            
            # Search for target booth patterns
            for line in text.split('\n'):
                # Clean common OCR errors
                line = line.replace('O', '0').replace('o', '0')
                line = line.replace('I', '1').replace('l', '1').replace('|', '1')
                
                nums = re.findall(r'\d+', line)
                if len(nums) < 4:
                    continue
                
                # Look for target booth numbers
                for i, num in enumerate(nums[:-3]):
                    booth_no = int(num)
                    if booth_no in target_booths and f"{booth_no:03d}" not in results:
                        # Check if this looks like a valid booth row
                        # Pattern: booth booth votes... OR serial booth votes...
                        votes_start = i + 1
                        if i > 0 and int(nums[i-1]) == booth_no:
                            votes_start = i + 1
                        elif i < len(nums) - 1 and nums[i] == nums[i+1]:
                            votes_start = i + 2
                        
                        remaining = nums[votes_start:]
                        votes = []
                        for v in remaining:
                            val = int(v)
                            if val <= 2000:
                                votes.append(val)
                            if len(votes) >= num_candidates:
                                break
                        
                        if len(votes) >= 3 and 50 <= sum(votes) <= 3000:
                            results[f"{booth_no:03d}"] = votes[:num_candidates]
    
    return results


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
            'source': 'Tamil Nadu CEO - Form 20 (Targeted)',
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
    
    print(f"\n  {ac_id}: need {len(missing_bases)} booths")
    print(f"    Looking for: {sorted(list(missing_bases))[:20]}...")
    
    # Process each page targeting specific booths
    all_extracted = {}
    
    for dpi in [200, 300, 400]:
        remaining = missing_bases - set(int(k) for k in all_extracted.keys())
        if not remaining:
            break
        
        print(f"    DPI {dpi}...", end=" ", flush=True)
        
        try:
            images = convert_from_path(str(pdf_path), dpi=dpi)
        except Exception as e:
            print(f"err")
            continue
        
        batch = {}
        for image in images:
            found = targeted_ocr(image, remaining, num_candidates)
            for k, v in found.items():
                if k not in batch:
                    batch[k] = v
        
        print(f"+{len(batch)}")
        all_extracted.update(batch)
    
    # Add to results
    new_count = 0
    for booth_id, votes in all_extracted.items():
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
    
    return {'new': new_count}


def main():
    print("=" * 60)
    print("TARGETED EXTRACTION - Focus on Missing Booths")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
        return
    
    # Get ACs with gaps
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
    print(f"\n{len(gaps)} ACs with gaps\n")
    
    total = 0
    for ac_num, _ in gaps[:30]:
        result = process_ac(ac_num, pc_data, schema)
        total += result.get('new', 0)
    
    print(f"\n{'=' * 60}")
    print(f"Total new: {total}")


if __name__ == "__main__":
    main()
