#!/usr/bin/env python3
"""
Aggressive OCR extraction for 2024 PC booth data.
Tries multiple DPI, PSM modes, and lenient parsing.
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


def load_booth_metadata(ac_id):
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if booths_file.exists():
        with open(booths_file) as f:
            data = json.load(f)
        return data, set(str(b.get('boothNo', '')) for b in data.get('booths', []))
    return {}, set()


def ocr_pdf_aggressive(pdf_path: Path) -> dict:
    """Try multiple OCR configurations and merge results."""
    all_results = {}
    
    configs = [
        {'dpi': 150, 'psm': 6},
        {'dpi': 300, 'psm': 6},
        {'dpi': 150, 'psm': 4},
        {'dpi': 300, 'psm': 4},
        {'dpi': 200, 'psm': 11},
    ]
    
    for config in configs:
        results = ocr_with_config(pdf_path, config['dpi'], config['psm'])
        # Merge - keep entries we don't have yet
        for booth_id, data in results.items():
            if booth_id not in all_results:
                all_results[booth_id] = data
    
    return all_results


def ocr_with_config(pdf_path: Path, dpi: int, psm: int) -> dict:
    """OCR with specific configuration."""
    results = {}
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        
        # Convert PDF to images
        subprocess.run(
            ['pdftoppm', '-png', '-r', str(dpi), str(pdf_path), str(tmpdir / 'page')],
            capture_output=True, timeout=120
        )
        
        pages = sorted(tmpdir.glob('page-*.png')) or sorted(tmpdir.glob('page*.png'))
        
        for page in pages:
            result = subprocess.run(
                ['tesseract', str(page), 'stdout', '--psm', str(psm)],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                page_results = parse_ocr_text(result.stdout)
                for booth_id, data in page_results.items():
                    if booth_id not in results:
                        results[booth_id] = data
    
    return results


def parse_ocr_text(text: str) -> dict:
    """Parse OCR text with lenient matching."""
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Heavy cleanup
        line = line.replace('|', ' ').replace('[', '').replace(']', '')
        line = re.sub(r'[oO](?=\d)', '0', line)
        line = re.sub(r'(?<=\d)[oO]', '0', line)
        line = re.sub(r'(?<=\d)[lI]', '1', line)
        line = re.sub(r'[lI](?=\d)', '1', line)
        line = re.sub(r'\s+', ' ', line).strip()
        
        if not line:
            continue
        
        # Skip obvious headers
        lower = line.lower()
        if any(x in lower for x in ['polling', 'station', 'total valid', 'grand total', 'serial', 'sl.no', 'candidate', 'name of', 'rejected']):
            continue
        
        # Extract all numbers
        numbers = re.findall(r'\d+', line)
        
        if len(numbers) < 4:
            continue
        
        # Try different interpretations
        booth_data = try_parse_booth_line(numbers)
        if booth_data:
            booth_no, votes = booth_data
            booth_id = f"TEMP-{booth_no}"
            if booth_id not in results:
                results[booth_id] = {'booth_no': booth_no, 'votes': votes}
    
    return results


def try_parse_booth_line(numbers: list) -> tuple:
    """Try to extract booth number and votes from number list."""
    if len(numbers) < 4:
        return None
    
    # Try: first number is booth
    booth_no = int(numbers[0])
    if 1 <= booth_no <= 600:
        votes = [int(n) for n in numbers[1:] if int(n) < 5000]
        if len(votes) >= 3:
            total = sum(votes)
            if 50 <= total <= 3000:
                return str(booth_no), votes
    
    # Try: second number is booth (first is serial)
    if len(numbers) > 4:
        booth_no = int(numbers[1])
        if 1 <= booth_no <= 600:
            votes = [int(n) for n in numbers[2:] if int(n) < 5000]
            if len(votes) >= 3:
                total = sum(votes)
                if 50 <= total <= 3000:
                    return str(booth_no), votes
    
    return None


def process_ac(ac_num: int, pc_data: dict, schema: dict, existing_booth_nos: set) -> dict:
    """Process AC and return new booth results."""
    ac_id = f"TN-{ac_num:03d}"
    
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {}
    
    pc_id = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        return {}
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    num_candidates = len(candidates)
    
    # Run aggressive OCR
    raw_results = ocr_pdf_aggressive(pdf_path)
    
    # Filter and format results
    new_results = {}
    for temp_id, data in raw_results.items():
        booth_no = data['booth_no']
        
        # Skip if we already have this booth
        if booth_no in existing_booth_nos:
            continue
        
        votes = data['votes']
        
        # Pad/trim to candidate count
        while len(votes) < num_candidates:
            votes.append(0)
        votes = votes[:num_candidates]
        
        booth_id = f"{ac_id}-{booth_no}"
        new_results[booth_id] = {
            'votes': votes,
            'total': sum(votes),
            'rejected': 0
        }
    
    return new_results


def main():
    print("=" * 60)
    print("Aggressive OCR Extraction for 100% Coverage")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    # Get ACs with gaps
    gaps = []
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        
        meta, valid_booths = load_booth_metadata(ac_id)
        expected = meta.get('totalBooths', len(meta.get('booths', [])))
        
        try:
            with open(OUTPUT_BASE / ac_id / '2024.json') as f:
                data = json.load(f)
            extracted = len(data.get('results', {}))
            existing_booth_nos = set(k.split('-')[-1] for k in data.get('results', {}).keys())
        except:
            extracted = 0
            existing_booth_nos = set()
        
        missing = expected - extracted
        if missing > 0:
            gaps.append((ac_num, ac_id, extracted, expected, missing, existing_booth_nos, valid_booths))
    
    gaps.sort(key=lambda x: -x[4])  # Sort by missing count
    
    print(f"\nProcessing {len(gaps)} ACs with gaps...")
    print(f"Total missing: {sum(g[4] for g in gaps):,} booths\n")
    
    total_new = 0
    
    for ac_num, ac_id, extracted, expected, missing, existing_booth_nos, valid_booths in gaps[:50]:  # Process top 50 gaps
        print(f"📍 {ac_id}: {extracted}/{expected} (missing {missing})", end=" ")
        sys.stdout.flush()
        
        try:
            new_results = process_ac(ac_num, pc_data, schema, existing_booth_nos)
            
            # Filter to only valid booth numbers
            valid_new = {k: v for k, v in new_results.items() 
                        if k.split('-')[-1] in valid_booths}
            
            if valid_new:
                # Load existing and merge
                results_file = OUTPUT_BASE / ac_id / '2024.json'
                if results_file.exists():
                    with open(results_file) as f:
                        data = json.load(f)
                else:
                    meta, _ = load_booth_metadata(ac_id)
                    pc_id = get_pc_for_ac(ac_id, schema)
                    pc_info = pc_data.get(pc_id, {})
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
                
                # Merge new results
                data['results'].update(valid_new)
                data['totalBooths'] = len(data['results'])
                
                with open(results_file, 'w') as f:
                    json.dump(data, f, indent=2)
                
                print(f"→ +{len(valid_new)} new booths")
                total_new += len(valid_new)
            else:
                print(f"→ no new")
                
        except Exception as e:
            print(f"→ error: {e}")
    
    print(f"\n{'='*60}")
    print(f"Total new booths extracted: {total_new:,}")


if __name__ == "__main__":
    main()
