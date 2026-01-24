#!/usr/bin/env python3
"""
Fill gaps in booth data using high-DPI OCR.
Processes one AC at a time, only extracting missing booths.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

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


def ocr_pdf(pdf_path: Path, dpi: int = 300) -> str:
    """OCR with high DPI."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        
        subprocess.run(
            ['pdftoppm', '-png', '-r', str(dpi), str(pdf_path), str(tmpdir / 'page')],
            capture_output=True, timeout=180
        )
        
        pages = sorted(tmpdir.glob('page-*.png')) or sorted(tmpdir.glob('page*.png'))
        
        all_text = []
        for page in pages:
            result = subprocess.run(
                ['tesseract', str(page), 'stdout', '--psm', '6'],
                capture_output=True, text=True, timeout=60
            )
            if result.returncode == 0:
                all_text.append(result.stdout)
        
        return '\n'.join(all_text)


def parse_all_booths(text: str, valid_booth_nos: set) -> dict:
    """Parse all booth data from OCR text."""
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Clean OCR artifacts
        line = line.replace('|', ' ').replace('[', '').replace(']', '')
        line = re.sub(r'[oO](?=\d)', '0', line)
        line = re.sub(r'(?<=\d)[oO]', '0', line)
        line = re.sub(r'(?<=\d)[lI]', '1', line)
        line = re.sub(r'[lI](?=\d)', '1', line)
        line = re.sub(r'\s+', ' ', line).strip()
        
        if not line:
            continue
        
        lower = line.lower()
        if any(x in lower for x in ['polling', 'station', 'total valid', 'grand total', 'serial', 'candidate', 'rejected']):
            continue
        
        numbers = re.findall(r'\d+', line)
        if len(numbers) < 4:
            continue
        
        # Try booth number as first or second number
        for start_idx in [0, 1]:
            if start_idx >= len(numbers):
                continue
                
            booth_no = numbers[start_idx]
            if booth_no not in valid_booth_nos:
                continue
            
            vote_numbers = [int(n) for n in numbers[start_idx+1:]]
            votes = [v for v in vote_numbers if v < 5000]
            
            if len(votes) >= 3:
                total = sum(votes[:10])  # Sum first 10 vote columns
                if 50 <= total <= 3500:
                    if booth_no not in results:
                        results[booth_no] = votes
                    break
    
    return results


def process_ac(ac_num: int, pc_data: dict, schema: dict):
    """Process single AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Load metadata
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if not booths_file.exists():
        return 0, 0
    
    with open(booths_file) as f:
        meta = json.load(f)
    
    valid_booth_nos = set(str(b.get('boothNo', '')) for b in meta.get('booths', []))
    expected = len(valid_booth_nos)
    
    # Load existing results
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
        existing = set(k.split('-')[-1] for k in data.get('results', {}).keys())
    else:
        # Create new file structure
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
        existing = set()
    
    missing = valid_booth_nos - existing
    if not missing:
        return len(existing), expected
    
    # OCR the PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return len(existing), expected
    
    print(f"  OCR {ac_id} ({len(missing)} missing)...", end=" ", flush=True)
    
    try:
        ocr_text = ocr_pdf(pdf_path, dpi=300)
        parsed = parse_all_booths(ocr_text, valid_booth_nos)
        
        # Get candidate count
        num_candidates = len(data.get('candidates', []))
        
        # Add new results
        new_count = 0
        for booth_no, votes in parsed.items():
            if booth_no in existing:
                continue
            
            # Pad/trim votes
            while len(votes) < num_candidates:
                votes.append(0)
            votes = votes[:num_candidates]
            
            booth_id = f"{ac_id}-{booth_no}"
            data['results'][booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            new_count += 1
        
        data['totalBooths'] = len(data['results'])
        
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"+{new_count} → {len(data['results'])}/{expected}")
        return len(data['results']), expected
        
    except Exception as e:
        print(f"error: {e}")
        return len(existing), expected


def main():
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        # Process specific AC
        ac_num = int(sys.argv[1])
        extracted, expected = process_ac(ac_num, pc_data, schema)
        print(f"TN-{ac_num:03d}: {extracted}/{expected}")
    else:
        # Process all ACs with gaps
        total_extracted = 0
        total_expected = 0
        
        for ac_num in range(1, 235):
            ac_id = f"TN-{ac_num:03d}"
            
            # Check if there's a gap
            booths_file = OUTPUT_BASE / ac_id / "booths.json"
            results_file = OUTPUT_BASE / ac_id / "2024.json"
            
            if not booths_file.exists():
                continue
            
            with open(booths_file) as f:
                meta = json.load(f)
            expected = meta.get('totalBooths', len(meta.get('booths', [])))
            
            if results_file.exists():
                with open(results_file) as f:
                    data = json.load(f)
                extracted = len(data.get('results', {}))
            else:
                extracted = 0
            
            if extracted < expected:
                ext, exp = process_ac(ac_num, pc_data, schema)
                total_extracted += ext
                total_expected += exp
            else:
                total_extracted += extracted
                total_expected += expected
        
        print(f"\nTotal: {total_extracted}/{total_expected} ({total_extracted/total_expected*100:.1f}%)")


if __name__ == "__main__":
    main()
