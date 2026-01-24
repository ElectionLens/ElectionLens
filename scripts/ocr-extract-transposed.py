#!/usr/bin/env python3
"""
Extract booth data from transposed Form 20 PDFs using Tesseract OCR.
Handles the format where each row has: [booth_no, booth_no, votes...]
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from collections import defaultdict

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


def ocr_pdf(pdf_path: Path, dpi: int = 250) -> str:
    """Convert PDF to images and OCR all pages."""
    all_text = []
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        
        subprocess.run(
            ['pdftoppm', '-png', '-r', str(dpi), str(pdf_path), str(tmpdir / 'page')],
            capture_output=True, timeout=180
        )
        
        pages = sorted(tmpdir.glob('page-*.png')) or sorted(tmpdir.glob('page*.png'))
        
        for page in pages:
            result = subprocess.run(
                ['tesseract', str(page), 'stdout', '--psm', '3', '-l', 'eng'],
                capture_output=True, text=True, timeout=60
            )
            if result.returncode == 0:
                all_text.append(result.stdout)
    
    return '\n'.join(all_text)


def parse_booth_rows(text: str, num_candidates: int, expected_bases: set) -> dict:
    """
    Parse OCR text to extract booth data.
    Format: each row has [booth_no, booth_no, vote1, vote2, ...]
    """
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Find all numbers in line
        nums = re.findall(r'\d+', line)
        
        # Need at least booth_no + booth_no + a few votes
        if len(nums) < 5:
            continue
        
        # Check if first two numbers are the same (booth number pattern)
        try:
            if nums[0] == nums[1]:
                booth_no = int(nums[0])
                
                # Validate booth number is in expected range
                if booth_no not in expected_bases:
                    continue
                
                # Extract votes (skip the two booth numbers)
                votes = []
                for n in nums[2:]:
                    v = int(n)
                    # Vote counts are typically 0-2000
                    if v <= 2000:
                        votes.append(v)
                    elif v > 100000:
                        # Likely a concatenated number, skip
                        break
                
                # Need at least 3 votes
                if len(votes) >= 3:
                    # Trim to candidate count
                    if len(votes) > num_candidates:
                        votes = votes[:num_candidates]
                    
                    total = sum(votes)
                    # Validate reasonable total
                    if 50 <= total <= 3000:
                        booth_id = f"{booth_no:03d}"
                        if booth_id not in results:
                            results[booth_id] = votes
            
            # Also try pattern where first number is different (row index vs booth no)
            elif len(nums) >= 6:
                # Try second number as booth
                booth_no = int(nums[1])
                if booth_no in expected_bases:
                    votes = []
                    for n in nums[2:]:
                        v = int(n)
                        if v <= 2000:
                            votes.append(v)
                        elif v > 100000:
                            break
                    
                    if len(votes) >= 3:
                        if len(votes) > num_candidates:
                            votes = votes[:num_candidates]
                        
                        total = sum(votes)
                        if 50 <= total <= 3000:
                            booth_id = f"{booth_no:03d}"
                            if booth_id not in results:
                                results[booth_id] = votes
                                
        except (ValueError, IndexError):
            continue
    
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
    
    # Get expected booth numbers (base numbers only)
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
    
    # OCR the PDF
    print(f"  OCR {ac_id} ({len(missing_bases)} missing)...", end=" ", flush=True)
    
    try:
        ocr_text = ocr_pdf(pdf_path)
        parsed = parse_booth_rows(ocr_text, num_candidates, missing_bases)
        
        # Add new results
        new_count = 0
        for booth_id, votes in parsed.items():
            booth_base = int(booth_id)
            
            # Skip if already have this booth
            if booth_base in existing_bases:
                continue
            
            # Pad votes to candidate count
            while len(votes) < num_candidates:
                votes.append(0)
            
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
        
        final_count = len(data['results'])
        print(f"+{new_count} → {final_count}/{len(expected_bases)}")
        
        return {
            'status': 'processed',
            'extracted': final_count,
            'expected': len(expected_bases),
            'new': new_count
        }
        
    except Exception as e:
        print(f"error: {e}")
        return {'status': 'error', 'error': str(e)}


def main():
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        # Process specific AC
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
    else:
        # Process all ACs with gaps
        total_new = 0
        processed = 0
        
        # Find ACs with gaps
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
            if missing > 0:
                gaps.append((ac_num, missing, len(expected_bases)))
        
        # Sort by missing count
        gaps.sort(key=lambda x: -x[1])
        
        print(f"Processing {len(gaps)} ACs with gaps...\n")
        
        for ac_num, missing, expected in gaps:
            result = process_ac(ac_num, pc_data, schema)
            if result.get('new', 0) > 0:
                total_new += result['new']
            processed += 1
        
        print(f"\n{'='*50}")
        print(f"Processed: {processed} ACs")
        print(f"New booths extracted: {total_new:,}")


if __name__ == "__main__":
    main()
