#!/usr/bin/env python3
"""
Extract booth data from column-oriented PDF format.

In this format:
- Each ROW is a candidate
- Each COLUMN is a booth
- We need to transpose the data to get booth-wise votes

Structure:
    SL. NO.       | 18    17    16    15    ...
    Polling Stn   | booth booth booth booth ...
    CANDIDATE_A   | v1    v2    v3    v4    ...
    CANDIDATE_B   | v1    v2    v3    v4    ...
    ...
    Total Valid   | t1    t2    t3    t4    ...
"""

import json
import os
import re
import subprocess
from pathlib import Path
from collections import defaultdict

FORM20_DIR = Path(os.path.expanduser("~/Desktop/TNLA_2021_PDFs"))
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/lsb/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/lsb/public/data/elections/ac/TN/2021.json")


def extract_pdf_text(pdf_path: Path) -> str:
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, check=True
        )
        return result.stdout
    except:
        return ""


def parse_column_format(text: str, official_candidates: list) -> dict:
    """Parse column-oriented PDF where rows are candidates and columns are booths."""
    lines = text.split('\n')
    
    # Find all data rows - rows with 10+ numbers
    data_rows = []
    for line in lines:
        nums = re.findall(r'\d+', line)
        if len(nums) >= 10:
            # Check if this line has a candidate/field label at the end
            data_rows.append({
                'nums': [int(n) for n in nums],
                'line': line
            })
    
    if len(data_rows) < 5:
        return {}
    
    # Group rows by their apparent "type" based on the ending text
    # Row types: SL_NO, POLLING_STATION, CANDIDATE_X, TOTAL, NOTA, etc.
    
    # First, find the polling station row to get booth numbers
    booth_numbers = []
    candidate_rows = []
    total_row = None
    
    for row in data_rows:
        line = row['line'].upper()
        
        # Skip SL. NO. row
        if 'SL. NO' in line or 'SL.NO' in line:
            continue
        
        # Skip station/polling rows
        if 'POLLING' in line or 'STATION' in line:
            # Use these numbers as booth indices
            booth_numbers = row['nums']
            continue
        
        # Total valid votes row
        if 'TOTAL' in line and 'VALID' in line:
            total_row = row['nums']
            continue
        
        # Skip NOTA, rejected, tendered
        if 'NOTA' in line or 'REJECTED' in line or 'TENDERED' in line:
            continue
        
        # Check if this matches a candidate name
        for off_cand in official_candidates:
            name_parts = off_cand['name'].upper().split()
            # Check if any significant part of the name is in the line
            for part in name_parts:
                if len(part) > 3 and part in line:
                    candidate_rows.append({
                        'candidate': off_cand['name'],
                        'nums': row['nums']
                    })
                    break
    
    if not booth_numbers:
        # Use first row as booth numbers
        if data_rows:
            booth_numbers = data_rows[0]['nums']
    
    if len(candidate_rows) < 3 or len(booth_numbers) < 10:
        return {}
    
    num_booths = len(booth_numbers)
    num_candidates = len(official_candidates)
    
    # Initialize results - transpose: columns become booths
    results = {}
    
    for col_idx in range(num_booths):
        booth_no = str(booth_numbers[col_idx])
        
        # Collect votes from each candidate row for this booth
        votes = [0] * num_candidates
        
        for cand_row in candidate_rows:
            # Find which official candidate this matches
            cand_name = cand_row['candidate']
            for off_idx, off_cand in enumerate(official_candidates):
                if off_cand['name'] == cand_name:
                    if col_idx < len(cand_row['nums']):
                        votes[off_idx] = cand_row['nums'][col_idx]
                    break
        
        total = total_row[col_idx] if total_row and col_idx < len(total_row) else sum(votes)
        
        if sum(votes) > 0:
            results[booth_no] = {
                'votes': votes,
                'total': total,
                'rejected': 0
            }
    
    return results


def greedy_match(results: dict, official_candidates: list) -> tuple:
    """Match columns to candidates using greedy vote-total matching."""
    if not results:
        return {}, 100.0
    
    num_official = len(official_candidates)
    
    # Calculate column totals
    col_totals = [0] * num_official
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_official:
                col_totals[i] += v
    
    # Calculate error
    errors = []
    for i in range(min(3, num_official)):
        off = official_candidates[i]['votes']
        calc = col_totals[i]
        if off > 100:
            errors.append(abs(calc - off) / off * 100)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    return results, avg_error


def save_booth_data(ac_id: str, results: dict, official_candidates: list, ac_name: str):
    """Save booth data to files."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    booth_list = []
    full_results = {}
    
    for booth_no in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', str(x)).group()) if re.search(r'\d+', str(x)) else 0, str(x))):
        booth_id = f"{ac_id}-{booth_no}"
        booth_list.append({
            "id": booth_id, "boothNo": str(booth_no),
            "num": int(re.search(r'\d+', str(booth_no)).group()) if re.search(r'\d+', str(booth_no)) else 0,
            "type": "women" if '(W)' in str(booth_no).upper() or str(booth_no).upper().endswith('W') else "regular",
            "name": f"Booth {booth_no}", "address": f"{ac_name} - Booth {booth_no}", "area": ac_name
        })
        full_results[booth_id] = results[booth_no]
    
    with open(output_dir / "booths.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "state": "Tamil Nadu",
            "totalBooths": len(booth_list), "lastUpdated": "2021-04-06",
            "source": "Tamil Nadu CEO - Form 20", "booths": booth_list
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(full_results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')} 
                          for c in official_candidates],
            "results": full_results
        }, f, indent=2)


def process_ac(ac_num: int, official_data: dict) -> tuple:
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return False, "PDF not found", 100
    
    official = official_data.get(ac_id)
    if not official:
        return False, "No official data", 100
    
    text = extract_pdf_text(pdf_path)
    if len(text) < 1000:
        return False, "Scanned PDF", 100
    
    results = parse_column_format(text, official['candidates'])
    
    if len(results) < 10:
        return False, f"Only {len(results)} booths", 100
    
    results, avg_error = greedy_match(results, official['candidates'])
    
    ac_name = official.get('constituencyName', ac_id)
    
    if avg_error < 25:
        save_booth_data(ac_id, results, official['candidates'], ac_name)
        return True, f"{len(results)} booths", avg_error
    
    return False, f"High error ({avg_error:.1f}%)", avg_error


def main():
    official_data = json.load(open(ELECTION_DATA))
    
    # Target column-format ACs
    target_acs = [70, 71, 73, 74, 75]  # Gingee, Mailam, Vanur, Villupuram, Vikravandi
    
    print("Processing column-format PDFs...")
    for ac_num in target_acs:
        ac_id = f"TN-{ac_num:03d}"
        official = official_data.get(ac_id, {})
        ac_name = official.get('constituencyName', ac_id)
        
        success, msg, error = process_ac(ac_num, official_data)
        
        if success:
            print(f"✅ [{ac_num:03d}] {ac_name}: {error:.1f}% ({msg})")
        else:
            print(f"❌ [{ac_num:03d}] {ac_name}: {msg}")


if __name__ == "__main__":
    main()
