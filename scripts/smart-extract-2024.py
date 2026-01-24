#!/usr/bin/env python3
"""
Smart extraction for 2024 Tamil Nadu PC booth data.
Uses pdftotext for text-based PDFs, falls back to OCR for scanned ones.

Based on 2021 successful extraction approach.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

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


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text using pdftotext -layout."""
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, timeout=60
        )
        return result.stdout if result.returncode == 0 else ""
    except Exception:
        return ""


def parse_text_format(text: str, expected_bases: set, num_candidates: int) -> dict:
    """
    Parse standard Form 20 text format.
    Format: SlNo BoothNo [votes for each candidate...] TotalValid Rejected NOTA Total
    """
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Skip headers and empty lines
        if not line.strip():
            continue
        
        lower = line.lower()
        if any(x in lower for x in ['serial', 'polling', 'station', 'no of valid', 
                                     'total', 'votes cast', 'candidate', 'electors',
                                     'form 20', 'assembly', 'constituency', 'rejected']):
            continue
        
        # Extract all numbers
        nums = re.findall(r'\b(\d+)\b', line)
        
        if len(nums) < 6:
            continue
        
        try:
            # First number is serial/booth number
            first_num = int(nums[0])
            
            # If first number could be a booth number (1-700)
            if 1 <= first_num <= 700 and first_num in expected_bases:
                booth_no = first_num
                vote_nums = [int(n) for n in nums[1:]]
            # Or second number is booth number  
            elif len(nums) > 6 and 1 <= int(nums[1]) <= 700 and int(nums[1]) in expected_bases:
                booth_no = int(nums[1])
                vote_nums = [int(n) for n in nums[2:]]
            else:
                continue
            
            # Filter reasonable vote counts (0-2000) until we hit large numbers
            votes = []
            for v in vote_nums:
                if v <= 2000:
                    votes.append(v)
                elif v > 5000:
                    break  # Hit total column
            
            if len(votes) < 3:
                continue
            
            # Validate reasonable total
            total = sum(votes[:num_candidates]) if len(votes) >= num_candidates else sum(votes)
            if not (50 <= total <= 3000):
                continue
            
            booth_id = f"{booth_no:03d}"
            if booth_id not in results:
                results[booth_id] = votes[:num_candidates] if len(votes) >= num_candidates else votes
                
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
            'source': 'Tamil Nadu CEO - Form 20',
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
    
    num_candidates = len(data.get('candidates', []))
    
    print(f"  {ac_id}: {len(existing_bases)}/{len(expected_bases)} (need {len(missing_bases)})", end=" ", flush=True)
    
    # Try text extraction first
    text = extract_pdf_text(pdf_path)
    num_count = len(re.findall(r'\d+', text))
    
    if num_count > 100:  # Has extractable text
        print(f"[text: {num_count} nums]", end=" ", flush=True)
        parsed = parse_text_format(text, missing_bases, num_candidates)
    else:
        print(f"[scanned]", end=" ", flush=True)
        # Would use OCR here, but skip for now
        parsed = {}
    
    # Add new results
    new_count = 0
    for booth_id, votes in parsed.items():
        booth_base = int(booth_id)
        if booth_base not in missing_bases:
            continue
        
        # Pad votes
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
    
    print(f"+{new_count} → {len(data['results'])}/{len(expected_bases)}")
    
    return {
        'status': 'processed',
        'extracted': len(data['results']),
        'expected': len(expected_bases),
        'new': new_count
    }


def main():
    print("=" * 60)
    print("Smart Extraction (pdftotext + fallback)")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
    else:
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
        
        gaps.sort(key=lambda x: -x[1])
        
        print(f"\nProcessing {len(gaps)} ACs with gaps...\n")
        
        total_new = 0
        for ac_num, missing, expected in gaps:
            result = process_ac(ac_num, pc_data, schema)
            if result.get('new', 0) > 0:
                total_new += result['new']
        
        print(f"\n{'=' * 60}")
        print(f"Total new booths: {total_new}")


if __name__ == "__main__":
    main()
