#!/usr/bin/env python3
"""
Extract booth data from transposed/rotated PDF format.

These PDFs have columns for booths and rows for candidates:
  SL. NO.           7    6    5    4    3    2    1    1
  Polling Station   6    5    4    3    2    1A   1    2
  CANDIDATE_A      58   21   14    1   15    5    7    3
  CANDIDATE_B      23   45   67   89   12   34   56   78
  ...
  Total           xxx  xxx  xxx  xxx  xxx  xxx  xxx  xxx
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


def parse_transposed_format(text: str, official_candidates: list) -> dict:
    """Parse transposed PDF format where columns are booths."""
    lines = text.split('\n')
    
    # Find booth numbers from "Polling Station No." row
    booth_row = None
    booth_numbers = []
    
    for i, line in enumerate(lines):
        if 'Polling Station' in line or 'Station No' in line:
            booth_row = i
            # Extract booth numbers from this line
            parts = line.split()
            for p in parts:
                if re.match(r'^\d+[A-Za-z]*(\([AW]\))?$', p):
                    booth_numbers.append(p)
            break
    
    if not booth_numbers:
        # Try finding from "SL. NO." row
        for i, line in enumerate(lines):
            if 'SL. NO' in line:
                nums = re.findall(r'\b(\d+)\b', line)
                if len(nums) > 5:  # Likely booth indices
                    booth_numbers = nums[1:]  # Skip the SL. NO. itself
                break
    
    if len(booth_numbers) < 10:
        return {}
    
    num_booths = len(booth_numbers)
    num_candidates = len(official_candidates)
    
    # Initialize booth data
    booths = {bn: {'votes': [0] * num_candidates, 'total': 0} for bn in booth_numbers}
    
    # Find candidate rows and extract votes
    candidate_idx = 0
    for line in lines:
        # Skip non-data lines
        if any(skip in line.upper() for skip in ['SL. NO', 'POLLING', 'TOTAL', 'VALID', 'REJECTED', 'NOTA', 'TENDERED']):
            continue
        
        # Extract numbers from line
        nums = re.findall(r'\b(\d+)\b', line)
        
        # If we have roughly the same number of values as booths, this might be a candidate row
        if len(nums) >= num_booths * 0.8:
            # Try to match with a candidate
            if candidate_idx < num_candidates:
                # Check if line contains candidate name
                for off_idx, off_cand in enumerate(official_candidates):
                    name_parts = off_cand['name'].upper().split()
                    if any(part in line.upper() for part in name_parts if len(part) > 2):
                        # Assign votes to booths
                        for j, bn in enumerate(booth_numbers):
                            if j < len(nums):
                                booths[bn]['votes'][off_idx] = int(nums[j])
                        break
    
    # Extract totals
    for line in lines:
        if 'Total of valid' in line or ('Total' in line and 'valid' in line.lower()):
            nums = re.findall(r'\b(\d+)\b', line)
            for j, bn in enumerate(booth_numbers):
                if j < len(nums):
                    booths[bn]['total'] = int(nums[j])
            break
    
    # Filter out empty booths
    results = {}
    for bn, data in booths.items():
        if sum(data['votes']) > 0 or data['total'] > 0:
            results[bn] = data
    
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
    
    # Check if already aligned
    errors = []
    for i in range(min(3, num_official)):
        off = official_candidates[i]['votes']
        calc = col_totals[i]
        if off > 100:
            errors.append(abs(calc - off) / off * 100)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error < 25:
        return results, avg_error
    
    # Try greedy matching
    official_sorted = sorted(enumerate(official_candidates), 
                            key=lambda x: x[1]['votes'], reverse=True)
    col_sorted = sorted(enumerate(col_totals), key=lambda x: x[1], reverse=True)
    
    col_to_off = {}
    used = set()
    
    for col_idx, col_total in col_sorted:
        best_match = None
        best_diff = float('inf')
        
        for off_idx, off_cand in official_sorted:
            if off_idx in used:
                continue
            
            off_total = off_cand['votes']
            diff = abs(col_total - off_total)
            if diff <= off_total * 0.25 + 500 and diff < best_diff:
                best_diff = diff
                best_match = off_idx
        
        if best_match is not None:
            col_to_off[col_idx] = best_match
            used.add(best_match)
    
    # Remap
    remapped = {}
    for bn, data in results.items():
        new_votes = [0] * num_official
        for col_idx, off_idx in col_to_off.items():
            if col_idx < len(data['votes']):
                new_votes[off_idx] = data['votes'][col_idx]
        
        remapped[bn] = {
            'votes': new_votes,
            'total': data['total'],
            'rejected': 0
        }
    
    # Recalculate error
    new_totals = [0] * num_official
    for data in remapped.values():
        for i, v in enumerate(data['votes']):
            if i < num_official:
                new_totals[i] += v
    
    new_errors = []
    for i in range(min(3, num_official)):
        off = official_candidates[i]['votes']
        calc = new_totals[i]
        if off > 100:
            new_errors.append(abs(calc - off) / off * 100)
    
    new_avg = sum(new_errors) / len(new_errors) if new_errors else 100
    
    if new_avg < avg_error:
        return remapped, new_avg
    
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
    
    results = parse_transposed_format(text, official['candidates'])
    
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
    
    # Target transposed-format ACs
    target_acs = [70, 71, 73, 74, 75]  # Gingee, Mailam, Vanur, Villupuram, Vikravandi
    
    print("Processing transposed-format PDFs...")
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
