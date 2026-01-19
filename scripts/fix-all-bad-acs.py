#!/usr/bin/env python3
"""
Fix all bad ACs by re-parsing PDFs and using vote-total matching for candidate alignment.
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


def parse_row_format(pdf_path: Path, num_candidates: int):
    """Parse row-per-booth format PDF."""
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], 
                           capture_output=True, text=True)
    if result.returncode != 0:
        return None
    
    lines = result.stdout.split('\n')
    booth_data = {}
    seen_sl_nos = set()
    
    for line in lines:
        nums = re.findall(r'\b(\d+)\b', line)
        
        # Need at least: SlNo + Booth + candidates + totals
        min_cols = num_candidates + 4
        if len(nums) < min_cols:
            continue
        
        try:
            sl_no = int(nums[0])
            booth_no = nums[1]
            
            if sl_no < 1 or sl_no > 1000:
                continue
            if sl_no in seen_sl_nos:
                continue
            
            # Determine vote columns based on total column count
            # Votes are typically columns 2 to 2+num_candidates
            vote_end = min(2 + num_candidates, len(nums) - 4)
            votes = [int(nums[i]) for i in range(2, vote_end)]
            
            # Validate: total should be in last few columns
            total_candidates = sum(votes)
            if total_candidates > 0:
                seen_sl_nos.add(sl_no)
                booth_data[booth_no] = votes
        except (ValueError, IndexError):
            continue
    
    return booth_data


def parse_transposed_format(pdf_path: Path, num_candidates: int):
    """Parse transposed format (columns = booths, rows = candidates)."""
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], 
                           capture_output=True, text=True)
    if result.returncode != 0:
        return None
    
    text = result.stdout
    lines = text.split('\n')
    
    # Check if transposed by looking for "SL. NO" header pattern
    is_transposed = any('SL. NO' in l.upper() and any(str(i) in l for i in range(7, 15)) 
                       for l in lines[:50])
    
    if not is_transposed:
        return None
    
    # Transposed parsing logic (simplified)
    all_candidate_votes = defaultdict(dict)
    all_booth_ids = set()
    current_booth_ids = []
    current_col_count = 10
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Find booth IDs from "Polling Station" rows
        if 'Polling Station' in stripped or 'Station No' in stripped:
            # Try to find column count from nearby Total row
            for j in range(i, min(i + 100, len(lines))):
                if 'Total of valid votes' in lines[j]:
                    t_nums = re.findall(r'\b(\d+)\b', lines[j])
                    if t_nums and t_nums[-1] in ['17', '18', '19', '20', '21']:
                        current_col_count = len(t_nums) - 1
                    break
            
            # Extract booth IDs from context
            booth_ids = []
            for offset in range(-1, 3):
                idx = i + offset
                if 0 <= idx < len(lines):
                    parts = re.findall(r'\b(\d+[A-Z]?)\b', lines[idx])
                    for p in parts:
                        if p not in ['1', '2'] and p not in booth_ids:
                            booth_ids.append(p)
            
            if len(booth_ids) >= 5:
                booth_ids = booth_ids[:current_col_count]
                current_booth_ids = booth_ids
                all_booth_ids.update(booth_ids)
            i += 1
            continue
        
        # Skip meta rows
        skip = ['SL. NO', 'FORM 20', 'GENERAL', 'ASSEMBLY', 'Electors', 
                'Total of valid', 'rejected', 'NOTA', 'tendered', 'Total', 'Page ']
        if any(x.lower() in stripped.lower() for x in skip) or not stripped:
            i += 1
            continue
        
        # Parse candidate rows
        nums = re.findall(r'\b(\d+)\b', stripped)
        if len(current_booth_ids) >= 5 and len(nums) >= len(current_booth_ids) + 1:
            votes = [int(nums[j]) for j in range(min(len(current_booth_ids), len(nums) - 1))]
            cand_idx = int(nums[len(current_booth_ids)]) if len(nums) > len(current_booth_ids) else 0
            
            if 3 <= cand_idx <= 25:
                for j, bid in enumerate(current_booth_ids[:len(votes)]):
                    all_candidate_votes[cand_idx][bid] = votes[j]
        
        i += 1
    
    if not all_booth_ids:
        return None
    
    # Convert to booth_data format
    booth_data = {}
    for booth_id in all_booth_ids:
        votes = []
        for cand_idx in sorted(all_candidate_votes.keys()):
            votes.append(all_candidate_votes[cand_idx].get(booth_id, 0))
        if sum(votes) > 0:
            booth_data[booth_id] = votes
    
    return booth_data


def match_columns_to_official(booth_data: dict, official_candidates: list):
    """Match extracted columns to official candidates by vote totals."""
    if not booth_data:
        return None, 100
    
    # Get column count from first booth
    sample_votes = list(booth_data.values())[0]
    num_cols = len(sample_votes)
    num_official = len(official_candidates)
    
    # Calculate column totals
    col_totals = [0] * num_cols
    for votes in booth_data.values():
        for i, v in enumerate(votes):
            if i < num_cols:
                col_totals[i] += v
    
    # Scale factor
    col_sum = sum(col_totals)
    official_sum = sum(c['votes'] for c in official_candidates if c['party'] != 'NOTA')
    scale = official_sum / col_sum if col_sum > 0 else 1
    
    # Greedy matching
    mapping = {}  # col_idx -> official_idx
    used_official = set()
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


def build_and_save(booth_data: dict, mapping: dict, official: dict, ac_id: str):
    """Build results and save if good enough."""
    num_candidates = len(official['candidates'])
    ac_name = official.get('constituencyName', ac_id)
    
    results = {}
    for booth_no, votes in booth_data.items():
        booth_id = f"{ac_id}-{booth_no}"
        new_votes = [0] * num_candidates
        
        for col_idx, off_idx in mapping.items():
            if col_idx < len(votes):
                new_votes[off_idx] = votes[col_idx]
        
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
    
    pdf_sum = sum(col_totals)
    official_sum = sum(c['votes'] for c in official['candidates'] if c['party'] != 'NOTA')
    scale = official_sum / pdf_sum if pdf_sum > 0 else 1
    
    errors = []
    for i in range(min(3, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = col_totals[i]
        scaled = calc * scale
        if off > 100:
            errors.append(abs(scaled - off) / off * 100)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error > 20 or scale > 2.0:
        return False, avg_error, scale
    
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
    
    return True, avg_error, scale


def process_ac(ac_id: str, official_data: dict):
    """Process a single AC."""
    ac_num = int(ac_id.replace('TN-', ''))
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return False, "No PDF", 0
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    
    # Try row format first
    booth_data = parse_row_format(pdf_path, num_candidates)
    
    # If not enough data, try transposed
    if not booth_data or len(booth_data) < 50:
        transposed_data = parse_transposed_format(pdf_path, num_candidates)
        if transposed_data and len(transposed_data) > len(booth_data or {}):
            booth_data = transposed_data
    
    if not booth_data or len(booth_data) < 20:
        return False, "Parse failed", 0
    
    mapping, scale = match_columns_to_official(booth_data, official['candidates'])
    
    if not mapping or len(mapping) < 5:
        return False, f"Only {len(mapping) if mapping else 0} matches", 0
    
    success, error, scale = build_and_save(booth_data, mapping, official, ac_id)
    
    if success:
        return True, f"{error:.1f}%", scale
    else:
        return False, f"Error {error:.1f}%, scale {scale:.2f}", scale


def main():
    official_data = load_official_data()
    
    # Bad ACs to fix
    bad_acs = [
        'TN-007', 'TN-055', 'TN-065', 'TN-070', 'TN-073', 'TN-074',
        'TN-117', 'TN-120', 'TN-134', 'TN-136', 'TN-137', 'TN-145',
        'TN-159', 'TN-184', 'TN-185', 'TN-186', 'TN-187', 'TN-212',
        'TN-213', 'TN-221', 'TN-224', 'TN-225', 'TN-226', 'TN-227',
        'TN-231', 'TN-232'
    ]
    
    print("Fixing bad ACs...\n")
    
    success_count = 0
    for ac_id in bad_acs:
        name = official_data[ac_id].get('constituencyName', ac_id)
        ok, msg, scale = process_ac(ac_id, official_data)
        status = "✅" if ok else "❌"
        print(f"  {status} {ac_id} {name}: {msg}")
        if ok:
            success_count += 1
    
    print(f"\nFixed: {success_count}/{len(bad_acs)}")


if __name__ == "__main__":
    main()
