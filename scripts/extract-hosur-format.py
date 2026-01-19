#!/usr/bin/env python3
"""
Extract booth data from HOSUR-style format (addresses mixed with vote data).
"""

import json
import re
import subprocess
from pathlib import Path

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/dcy/public/data/elections/ac/TN/2021.json")
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/dcy/public/data/booths/TN")


def extract_hosur_format(pdf_path: Path, num_candidates: int):
    """Extract booth data from HOSUR-style format."""
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], 
                           capture_output=True, text=True)
    if result.returncode != 0:
        return None
    
    lines = result.stdout.split('\n')
    booth_data = {}
    seen_sl_nos = set()
    
    for line in lines:
        # Look for data rows: start with serial number + booth number
        # Pattern: "  1   1  " or " 12  12M " etc
        match = re.match(r'^\s*(\d+)\s+(\d+[A-Z]?)\s+', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2)
        
        # Skip duplicates
        if sl_no in seen_sl_nos:
            continue
        
        # Extract all numbers from line
        all_nums = re.findall(r'\b(\d+)\b', line)
        
        # Filter out postal codes (6 digits starting with 6) and percentages
        clean_nums = []
        for n in all_nums:
            val = int(n)
            # Skip: postal codes (6 digits starting with 6), years, percentages
            if len(n) == 6 and n.startswith('6'):
                continue
            if len(n) == 3 and n.startswith('6'):  # Like 635
                continue
            clean_nums.append(val)
        
        # Need enough numbers for: sl_no + booth + candidates + totals
        if len(clean_nums) < num_candidates + 4:
            continue
        
        # Extract vote columns (after sl_no and booth_no)
        # The vote section starts at index 2 and has num_candidates values
        votes = []
        for i in range(2, min(2 + num_candidates, len(clean_nums))):
            v = clean_nums[i]
            if v < 3000:  # Vote counts per booth shouldn't exceed this
                votes.append(v)
            else:
                break  # Hit a total column
        
        if len(votes) >= num_candidates - 2:  # Allow some missing
            # Pad to exact length
            while len(votes) < num_candidates:
                votes.append(0)
            votes = votes[:num_candidates]
            
            seen_sl_nos.add(sl_no)
            booth_data[booth_no] = votes
    
    return booth_data


def match_and_save(booth_data: dict, official: dict, ac_id: str):
    """Match columns to official and save."""
    if not booth_data:
        return False, "No data"
    
    num_cand = len(official['candidates'])
    sample = list(booth_data.values())[0]
    num_cols = len(sample)
    
    # Calculate column totals
    col_totals = [0] * num_cols
    for votes in booth_data.values():
        for i, v in enumerate(votes):
            if i < num_cols:
                col_totals[i] += v
    
    # Scale factor
    pdf_sum = sum(col_totals)
    official_sum = sum(c['votes'] for c in official['candidates'] if c['party'] != 'NOTA')
    scale = official_sum / pdf_sum if pdf_sum > 0 else 1
    
    # Greedy match
    mapping = {}
    used = set()
    col_sorted = sorted(range(num_cols), key=lambda i: col_totals[i], reverse=True)
    
    for col_idx in col_sorted:
        scaled = col_totals[col_idx] * scale
        best = -1
        best_diff = float('inf')
        
        for off_idx, c in enumerate(official['candidates']):
            if off_idx in used or c['party'] == 'NOTA':
                continue
            diff = abs(scaled - c['votes'])
            if diff < best_diff:
                best_diff = diff
                best = off_idx
        
        if best >= 0:
            pct = best_diff / official['candidates'][best]['votes'] * 100 if official['candidates'][best]['votes'] > 0 else 100
            if pct < 30:
                mapping[col_idx] = best
                used.add(best)
    
    if len(mapping) < 5:
        return False, f"Only {len(mapping)} matches"
    
    # Build results
    results = {}
    ac_name = official.get('constituencyName', ac_id)
    
    for booth_no, votes in booth_data.items():
        bid = f"{ac_id}-{booth_no}"
        new_votes = [0] * num_cand
        
        for col_idx, off_idx in mapping.items():
            if col_idx < len(votes):
                new_votes[off_idx] = votes[col_idx]
        
        if sum(new_votes) > 0:
            results[bid] = {
                'votes': new_votes,
                'total': sum(new_votes),
                'rejected': 0
            }
    
    # Validate
    new_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cand:
                new_totals[i] += v
    
    errors = []
    for i in range(min(3, num_cand)):
        off = official['candidates'][i]['votes']
        calc = new_totals[i]
        sc = calc * scale
        if off > 100:
            errors.append(abs(sc - off) / off * 100)
    
    avg_err = sum(errors) / len(errors) if errors else 100
    
    if avg_err > 20 or scale > 2.0:
        return False, f"Error {avg_err:.1f}%, scale {scale:.2f}"
    
    # Save
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
                          for c in official['candidates']],
            "results": results
        }, f, indent=2)
    
    return True, f"OK ({avg_err:.1f}%, {len(results)} booths)"


def main():
    with open(ELECTION_DATA) as f:
        official_data = json.load(f)
    
    # Test on HOSUR-style ACs
    test_acs = ['TN-055', 'TN-117', 'TN-136']
    
    for ac_id in test_acs:
        ac_num = int(ac_id.replace('TN-', ''))
        pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
        
        official = official_data[ac_id]
        num_cand = len(official['candidates'])
        name = official.get('constituencyName', ac_id)
        
        booth_data = extract_hosur_format(pdf_path, num_cand)
        
        if booth_data:
            success, msg = match_and_save(booth_data, official, ac_id)
            status = "✅" if success else "❌"
        else:
            status = "❌"
            msg = "Parse failed"
        
        print(f"{status} {ac_id} {name}: {msg}")


if __name__ == "__main__":
    main()
