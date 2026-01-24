#!/usr/bin/env python3
"""
Extract booth data from Form 20 PDFs with transposed table format.
In transposed format, booth numbers are column headers and candidates are rows.
"""

import subprocess
import re
import json
from pathlib import Path
from collections import defaultdict

FORM20_DIR = Path.home() / "Desktop/GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text from PDF using pdftotext."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    return result.stdout


def parse_transposed_section(text: str) -> dict:
    """Parse transposed table sections where booth numbers are column headers."""
    results = defaultdict(lambda: {'votes': [], 'total': 0})
    lines = text.split('\n')
    
    current_booths = []  # List of booth numbers from header
    candidate_idx = 0
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        
        # Look for booth number header row
        # Format: "36    35    34    33    32    31    ... Serial No"
        if re.search(r'Serial\s*No', line, re.I) and re.match(r'^\d+', line):
            # Extract booth numbers from this line
            numbers = re.findall(r'\b\d+\b', line)
            if len(numbers) >= 5:
                # Filter to reasonable booth numbers
                booths = [int(n) for n in numbers if 1 <= int(n) <= 700]
                if len(booths) >= 5:
                    current_booths = booths
                    candidate_idx = 0
                    continue
        
        # Look for data rows (candidate vote rows in transposed format)
        # These are lines with many numbers matching booth count
        if current_booths:
            numbers = re.findall(r'\b\d+\b', line)
            if len(numbers) >= len(current_booths) * 0.8:  # At least 80% of expected columns
                # This is a candidate vote row
                votes = [int(n) for n in numbers[:len(current_booths)]]
                
                # Assign votes to each booth
                for j, booth_no in enumerate(current_booths):
                    if j < len(votes):
                        results[booth_no]['votes'].append(votes[j])
                
                candidate_idx += 1
                
                # Check if this might be the "Total of Valid Votes" row
                # (usually has larger numbers)
                avg_vote = sum(votes) / len(votes) if votes else 0
                if avg_vote > 300 and candidate_idx > 3:
                    # This might be total row, store it
                    for j, booth_no in enumerate(current_booths):
                        if j < len(votes):
                            results[booth_no]['total'] = votes[j]
    
    return dict(results)


def parse_row_format(text: str) -> dict:
    """Parse standard row format (booth as row, candidates as columns)."""
    results = {}
    
    for line in text.split('\n'):
        line = line.strip()
        if not line or not line[0].isdigit():
            continue
        
        numbers = re.findall(r'\b\d+\b', line)
        if len(numbers) < 7:
            continue
        
        numbers = [int(n) for n in numbers]
        booth_no = numbers[1]
        
        if booth_no < 1 or booth_no > 700:
            continue
        
        # Last 5: TotalValid, NOTA, Rejected, Total, Tendered
        total = numbers[-2]
        rejected = numbers[-3]
        nota = numbers[-4]
        total_valid = numbers[-5]
        
        # Validate
        if abs(total - (total_valid + rejected)) > 5:
            continue
        
        votes = numbers[2:-5] + [nota]
        
        results[booth_no] = {
            'votes': votes,
            'total': total_valid,
            'rejected': rejected
        }
    
    return results


def extract_ac(ac_num: int) -> dict:
    """Extract booth data for a single AC using both formats."""
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {}
    
    text = extract_pdf_text(pdf_path)
    if not text.strip():
        return {}
    
    # First try row format
    row_results = parse_row_format(text)
    
    # Then try transposed format
    trans_results = parse_transposed_section(text)
    
    # Merge results (prefer row format when both have data)
    all_results = {}
    ac_id = f"TN-{ac_num:03d}"
    
    all_booths = set(row_results.keys()) | set(trans_results.keys())
    
    for booth_no in all_booths:
        booth_id = f"{ac_id}-{booth_no:03d}"
        
        if booth_no in row_results:
            all_results[booth_id] = row_results[booth_no]
        elif booth_no in trans_results:
            t_data = trans_results[booth_no]
            # For transposed, we may not have clean totals
            all_results[booth_id] = {
                'votes': t_data['votes'],
                'total': t_data['total'] if t_data['total'] > 0 else sum(t_data['votes']),
                'rejected': 0
            }
    
    return all_results


def get_existing_booths(ac_id: str) -> set:
    """Get set of booth numbers already extracted."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return set()
    
    with open(results_file) as f:
        data = json.load(f)
    
    booths = set()
    for k in data.get('results', {}).keys():
        m = re.match(r'^(\d+)', k.split('-')[-1])
        if m:
            booths.add(int(m.group(1)))
    return booths


def save_results(ac_id: str, new_results: dict):
    """Merge new results into existing file."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
    else:
        data = {'results': {}, 'year': 2024}
    
    added = 0
    for booth_id, result in new_results.items():
        if booth_id not in data['results']:
            data['results'][booth_id] = result
            added += 1
    
    data['totalBooths'] = len(data['results'])
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return added


def main():
    # Process ACs that have text content
    scanned_acs = set([1, 3, 4, 5, 6, 9, 28, 29, 30, 31, 38, 39, 40, 41, 42, 
                      151, 152, 153, 154, 155, 156, 188, 189, 191, 192, 193, 
                      194, 213, 214, 215, 216, 217, 218])
    
    total_added = 0
    
    for ac_num in range(1, 235):
        if ac_num in scanned_acs:
            continue
        
        ac_id = f"TN-{ac_num:03d}"
        existing = get_existing_booths(ac_id)
        
        results = extract_ac(ac_num)
        if not results:
            continue
        
        # Filter to new booths
        new_results = {}
        for booth_id, result in results.items():
            booth_no = int(booth_id.split('-')[-1])
            if booth_no not in existing:
                new_results[booth_id] = result
        
        if new_results:
            added = save_results(ac_id, new_results)
            print(f"{ac_id}: +{added} booths")
            total_added += added
    
    print()
    print(f"Total added: {total_added} booths")


if __name__ == "__main__":
    main()
