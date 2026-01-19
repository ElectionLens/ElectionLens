#!/usr/bin/env python3
"""
Extract booth data from row-per-booth format PDFs.

Format: Sl.No | Booth | C1 | C2 | ... | Cn | TotalValid | Rejected | NOTA | Total
"""

import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/dcy/public/data/elections/ac/TN/2021.json")
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/dcy/public/data/booths/TN")


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def parse_row_format_pdf(pdf_path: Path, num_candidates: int):
    """Parse a row-per-booth format PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    text = result.stdout
    lines = text.split('\n')
    
    # Expected columns: Sl.No + Booth + num_candidates votes + TotalValid + Rejected + NOTA + Total
    min_cols = num_candidates + 4  # 4 = SlNo + Booth + (ValidTotal + Rejected + NOTA + Total trailing)
    
    booth_data = []
    
    for line in lines:
        nums = re.findall(r'\b(\d+)\b', line)
        
        # Data rows have: SlNo, BoothNo, votes for each candidate, then totals
        if len(nums) >= min_cols:
            try:
                sl_no = int(nums[0])
                booth_no = nums[1]
                
                # Skip if booth number is too high (likely a header or total row)
                if sl_no > 1000:
                    continue
                
                # Extract candidate votes (positions 2 to 2+num_candidates)
                votes = [int(nums[i]) for i in range(2, min(2 + num_candidates, len(nums) - 4))]
                
                # Pad if needed
                while len(votes) < num_candidates:
                    votes.append(0)
                
                # Get total (should be near the end)
                total_valid = int(nums[-4]) if len(nums) >= 4 else sum(votes)
                
                booth_data.append({
                    'booth_no': booth_no,
                    'votes': votes,
                    'total': sum(votes)  # Recalculate to be safe
                })
            except (ValueError, IndexError):
                continue
    
    return booth_data


def match_columns_to_official(booth_data: list, official_candidates: list):
    """Match extracted columns to official candidates by vote totals."""
    if not booth_data:
        return None, 100
    
    num_cols = len(booth_data[0]['votes'])
    num_official = len(official_candidates)
    
    # Calculate column totals
    col_totals = [0] * num_cols
    for b in booth_data:
        for i, v in enumerate(b['votes']):
            if i < num_cols:
                col_totals[i] += v
    
    # Scale factor (booth data excludes postal)
    col_sum = sum(col_totals)
    official_sum = sum(c['votes'] for c in official_candidates if c['party'] != 'NOTA')
    scale = official_sum / col_sum if col_sum > 0 else 1
    
    # Greedy matching
    mapping = {}  # col_idx -> official_idx
    used_official = set()
    
    # Sort columns by total
    col_sorted = sorted(range(num_cols), key=lambda i: col_totals[i], reverse=True)
    
    for col_idx in col_sorted:
        scaled_col = col_totals[col_idx] * scale
        
        best_match = -1
        best_diff = float('inf')
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official or off_cand['party'] == 'NOTA':
                continue
            
            diff = abs(scaled_col - off_cand['votes'])
            if diff < best_diff:
                best_diff = diff
                best_match = off_idx
        
        if best_match >= 0:
            pct_diff = best_diff / official_candidates[best_match]['votes'] * 100 if official_candidates[best_match]['votes'] > 0 else 100
            if pct_diff < 30:
                mapping[col_idx] = best_match
                used_official.add(best_match)
    
    return mapping, scale


def remap_and_save(booth_data: list, mapping: dict, official: dict, ac_id: str):
    """Remap booth votes and save."""
    num_candidates = len(official['candidates'])
    ac_name = official.get('constituencyName', ac_id)
    
    results = {}
    for b in booth_data:
        booth_id = f"{ac_id}-{b['booth_no']}"
        
        new_votes = [0] * num_candidates
        for col_idx, off_idx in mapping.items():
            if col_idx < len(b['votes']):
                new_votes[off_idx] = b['votes'][col_idx]
        
        if sum(new_votes) > 0:
            results[booth_id] = {
                'votes': new_votes,
                'total': sum(new_votes),
                'rejected': 0
            }
    
    # Validate
    col_totals = [0] * num_candidates
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    errors = []
    for i in range(min(3, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = col_totals[i]
        if off > 100:
            errors.append(abs(calc - off) / off * 100)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error > 25:
        return False, avg_error
    
    # Save
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    booth_list = [{
        "id": bid, "boothNo": bid.split('-')[-1],
        "num": int(re.search(r'\d+', bid.split('-')[-1]).group()) if re.search(r'\d+', bid.split('-')[-1]) else 0,
        "type": "regular", "name": f"Booth {bid.split('-')[-1]}",
        "address": f"{ac_name} - Booth {bid.split('-')[-1]}", "area": ac_name
    } for bid in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x.split('-')[-1]).group()) if re.search(r'\d+', x.split('-')[-1]) else 0, x))]
    
    with open(output_dir / "booths.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "state": "Tamil Nadu",
            "totalBooths": len(booth_list), "lastUpdated": "2021-04-06",
            "source": "Tamil Nadu CEO - Form 20", "booths": booth_list
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
                          for c in official['candidates']],
            "results": results
        }, f, indent=2)
    
    return True, avg_error


def process_ac(ac_id: str, official_data: dict):
    """Process a single AC."""
    ac_num = int(ac_id.replace('TN-', ''))
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return False, "No PDF"
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    
    booth_data = parse_row_format_pdf(pdf_path, num_candidates)
    
    if not booth_data:
        return False, "Parse failed"
    
    mapping, scale = match_columns_to_official(booth_data, official['candidates'])
    
    if not mapping or len(mapping) < 5:
        return False, f"Only {len(mapping) if mapping else 0} matches"
    
    success, error = remap_and_save(booth_data, mapping, official, ac_id)
    
    return success, error


def main():
    official_data = load_official_data()
    
    # Process specific ACs
    target_acs = ['TN-006', 'TN-009', 'TN-124', 'TN-183']
    
    print("Processing row-format ACs...\n")
    
    for ac_id in target_acs:
        name = official_data[ac_id].get('constituencyName', ac_id)
        success, result = process_ac(ac_id, official_data)
        status = "✅" if success else "❌"
        print(f"  {status} {ac_id} {name}: {result}")


if __name__ == "__main__":
    main()
