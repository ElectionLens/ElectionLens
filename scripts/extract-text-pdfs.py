#!/usr/bin/env python3
"""
Extract booth data from text-based Form 20 PDFs.
Uses pdftotext -layout for reliable text extraction.
"""

import json
import subprocess
import re
from pathlib import Path
from collections import defaultdict

FORM20_DIR = Path.home() / "Desktop/GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
SCHEMA_FILE = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text from PDF using pdftotext."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    return result.stdout


def parse_data_row(line: str) -> tuple:
    """
    Parse a data row from Form 20.
    Returns (booth_no, votes_list, total_valid, nota, rejected) or None.
    
    Format: [Serial] [Booth] [C1] [C2] ... [Cn] [TotalValid] [NOTA] [Rejected] [Total] [Tendered]
    """
    # Extract all numbers from the line
    numbers = re.findall(r'\b\d+\b', line)
    
    if len(numbers) < 7:  # Need at least serial, booth, some votes, totals
        return None
    
    try:
        numbers = [int(n) for n in numbers]
    except:
        return None
    
    # First is serial, second is booth number
    serial = numbers[0]
    booth_no = numbers[1]
    
    # Validate booth number (should be reasonable)
    if booth_no < 1 or booth_no > 999:
        return None
    
    # Last 5 columns: [TotalValid] [NOTA] [Rejected] [Total] [Tendered]
    # Actually structure varies. Let's detect it by finding the total column.
    
    # The "Total" column (2nd from end) should equal TotalValid + Rejected
    # Let's work backwards
    tendered = numbers[-1]
    total = numbers[-2]
    rejected = numbers[-3]
    nota = numbers[-4]
    total_valid = numbers[-5]
    
    # Validate: total should ≈ total_valid + rejected (small rounding ok)
    if abs(total - (total_valid + rejected)) > 5:
        # Maybe different format, try without NOTA at end
        # Some formats: [TotalValid] [Rejected] [Total] [Tendered]
        total = numbers[-2]
        rejected = numbers[-3]
        total_valid = numbers[-4]
        nota = 0  # Not in this position
        
        if abs(total - (total_valid + rejected)) > 5:
            return None
    
    # Candidate votes are between booth and totals
    votes = numbers[2:-5]  # Excludes serial, booth, and last 5 summary columns
    
    if len(votes) < 2:  # Need at least some candidate votes
        return None
    
    return (booth_no, votes, total_valid, nota, rejected)


def extract_ac(ac_num: int) -> dict:
    """Extract booth data for a single AC."""
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {}
    
    text = extract_pdf_text(pdf_path)
    if not text.strip():
        return {}  # Likely scanned PDF
    
    results = {}
    lines = text.split('\n')
    
    # Track consecutive successful parses to detect data section
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Skip header lines
        if 'FORM 20' in line or 'Serial' in line or 'Polling' in line:
            continue
        if 'Total' in line and 'Valid' in line:
            continue
        if 'Electors' in line:
            continue
        
        # Try to parse as data row
        if line and line[0].isdigit():
            parsed = parse_data_row(line)
            if parsed:
                booth_no, votes, total_valid, nota, rejected = parsed
                booth_id = f"TN-{ac_num:03d}-{booth_no:03d}"
                
                # Add NOTA to votes array (convention: last element)
                votes_with_nota = votes + [nota]
                
                results[booth_id] = {
                    'votes': votes_with_nota,
                    'total': total_valid,
                    'rejected': rejected
                }
    
    return results


def get_existing_booths(ac_id: str) -> set:
    """Get set of booth numbers already extracted."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return set()
    
    with open(results_file) as f:
        data = json.load(f)
    
    return set(int(k.split('-')[-1]) for k in data.get('results', {}).keys())


def save_results(ac_id: str, new_results: dict):
    """Merge new results into existing file."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
    else:
        data = {'results': {}, 'year': 2024}
    
    # Merge results
    for booth_id, result in new_results.items():
        if booth_id not in data['results']:
            data['results'][booth_id] = result
    
    data['totalBooths'] = len(data['results'])
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)


def main():
    # Get list of ACs with gaps
    gaps = []
    for ac_dir in sorted(OUTPUT_BASE.iterdir()):
        if not ac_dir.is_dir() or not ac_dir.name.startswith('TN-'):
            continue
        
        ac_id = ac_dir.name
        ac_num = int(ac_id.split('-')[1])
        
        booths_file = ac_dir / "booths.json"
        results_file = ac_dir / "2024.json"
        
        if not results_file.exists():
            continue
        
        with open(results_file) as f:
            data = json.load(f)
        
        extracted = len(data.get('results', {}))
        expected = data.get('totalBooths', extracted)
        
        if booths_file.exists():
            with open(booths_file) as f:
                meta = json.load(f)
            expected = meta.get('totalBooths', expected)
        
        if extracted < expected:
            gaps.append((ac_num, expected - extracted, ac_id))
    
    gaps.sort(key=lambda x: -x[1])  # Sort by gap size
    
    print(f"Processing {len(gaps)} ACs with gaps...")
    print()
    
    total_added = 0
    
    for ac_num, gap, ac_id in gaps:
        pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
        if not pdf_path.exists():
            continue
        
        existing = get_existing_booths(ac_id)
        results = extract_ac(ac_num)
        
        if not results:
            print(f"{ac_id}: No text content (scanned?)")
            continue
        
        # Filter to only new booths
        new_results = {}
        for booth_id, result in results.items():
            booth_no = int(booth_id.split('-')[-1])
            if booth_no not in existing:
                new_results[booth_id] = result
        
        if new_results:
            save_results(ac_id, new_results)
            print(f"{ac_id}: +{len(new_results)} booths (was gap: {gap})")
            total_added += len(new_results)
        else:
            # Check how many we could parse
            parsed_count = len(results)
            if parsed_count > 0:
                print(f"{ac_id}: 0 new (parsed {parsed_count}, all exist)")
            else:
                print(f"{ac_id}: No parseable rows")
    
    print()
    print(f"Total added: {total_added} booths")


if __name__ == "__main__":
    main()
