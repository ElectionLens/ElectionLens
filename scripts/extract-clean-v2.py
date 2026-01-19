#!/usr/bin/env python3
"""
Clean extraction of TN 2021 booth data - v2

Handles various PDF formats more robustly.
"""

import json
import os
import re
import subprocess
from pathlib import Path

FORM20_DIR = Path(os.path.expanduser("~/Desktop/TNLA_2021_PDFs"))
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/elections/ac/TN/2021.json")


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def extract_pdf_text(pdf_path: Path) -> str:
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, check=True
        )
        return result.stdout
    except:
        return ""


def parse_pdf_data(text: str, num_candidates: int) -> list:
    """Parse booth data from PDF text."""
    lines = text.split('\n')
    booths = []
    
    for line in lines:
        # Match line starting with booth pattern: SlNo BoothNo(with optional suffix)
        match = re.match(r'^\s*(\d{1,3})\s+(\d{1,3}[A-Za-z]*(?:\([AW]\))?[MW]?)\s+(\d+)', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2).strip()
        
        # Skip if looks like header row (SlNo too high)
        if sl_no > 500:
            continue
        
        # Extract all numbers from the line
        all_nums = re.findall(r'\d+', line)
        
        # Skip SlNo and BoothNo
        nums = [int(n) for n in all_nums[2:]]
        
        # Filter out pincodes (6-digit numbers starting with 6)
        nums = [n for n in nums if not (100000 <= n <= 999999 and str(n)[0] == '6')]
        
        # Need at least candidates + 3 trailing columns
        min_cols = num_candidates + 3
        if len(nums) < min_cols:
            continue
        
        # The structure is: [candidate votes] [TotalValid] [Rejected] [NOTA] [Total] ...
        # We want the candidate votes
        # Total should be close to sum of all candidate votes
        
        # Try to find where totals start
        found = False
        for trailing in [3, 4, 5, 6]:
            cand_end = len(nums) - trailing
            if cand_end < num_candidates:
                continue
            
            votes = nums[:cand_end]
            total_valid = nums[cand_end] if cand_end < len(nums) else 0
            
            # Validate: sum should be close to total_valid
            vote_sum = sum(votes)
            if abs(vote_sum - total_valid) <= total_valid * 0.1 + 50:
                booths.append({
                    'booth_no': booth_no,
                    'votes': votes[:num_candidates],  # Limit to num_candidates
                    'total': total_valid
                })
                found = True
                break
        
        if not found:
            # Fallback: take first num_candidates columns
            booths.append({
                'booth_no': booth_no,
                'votes': nums[:num_candidates],
                'total': nums[num_candidates] if len(nums) > num_candidates else sum(nums[:num_candidates])
            })
    
    return booths


def greedy_match_and_remap(booths: list, official_candidates: list) -> tuple:
    """Match columns to candidates and calculate error."""
    if not booths:
        return {}, 100.0
    
    num_official = len(official_candidates)
    num_cols = len(booths[0]['votes'])
    
    # Calculate column totals
    col_totals = [0] * num_cols
    for b in booths:
        for i, v in enumerate(b['votes']):
            if i < num_cols:
                col_totals[i] += v
    
    # Greedy matching
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
    
    # Remap booths
    results = {}
    for b in booths:
        new_votes = [0] * num_official
        for col_idx, off_idx in col_to_off.items():
            if col_idx < len(b['votes']):
                new_votes[off_idx] = b['votes'][col_idx]
        
        booth_id = b['booth_no']
        results[booth_id] = {
            'votes': new_votes,
            'total': b['total'],
            'rejected': 0
        }
    
    # Calculate error
    totals = [0] * num_official
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_official:
                totals[i] += v
    
    errors = []
    for i in range(min(3, num_official)):
        off = official_candidates[i]['votes']
        calc = totals[i]
        if off > 100:
            errors.append(abs(calc - off) / off * 100)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    return results, avg_error


def process_ac(ac_num: int, official_data: dict) -> tuple:
    """Process a single AC. Returns (improved, old_error, new_error)."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return False, 100, 100
    
    official = official_data.get(ac_id)
    if not official:
        return False, 100, 100
    
    # Check current error
    booth_path = OUTPUT_BASE / ac_id / "2021.json"
    old_error = 100
    if booth_path.exists():
        with open(booth_path) as f:
            booth = json.load(f)
        
        num_cand = len(booth.get('candidates', []))
        totals = [0] * num_cand
        for r in booth.get('results', {}).values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    totals[i] += v
        
        errors = []
        for i in range(min(3, len(official['candidates']))):
            off = official['candidates'][i]['votes']
            calc = totals[i] if i < len(totals) else 0
            if off > 100:
                errors.append(abs(calc - off) / off * 100)
        old_error = sum(errors) / len(errors) if errors else 100
    
    # Already good?
    if old_error < 15:
        return False, old_error, old_error
    
    # Extract PDF
    text = extract_pdf_text(pdf_path)
    if not text or len(text) < 100:
        return False, old_error, 100
    
    # Parse
    num_candidates = len(official['candidates'])
    booths = parse_pdf_data(text, num_candidates)
    
    if len(booths) < 10:
        return False, old_error, 100
    
    # Match and remap
    results, new_error = greedy_match_and_remap(booths, official['candidates'])
    
    if new_error >= old_error:
        return False, old_error, new_error
    
    # Save improved data
    ac_name = official.get('constituencyName', ac_id)
    
    # Build booth metadata
    booth_list = []
    for booth_no in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0, x)):
        booth_list.append({
            "id": f"{ac_id}-{booth_no}",
            "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "women" if '(W)' in booth_no.upper() or booth_no.upper().endswith('W') else "regular",
            "name": f"Booth {booth_no}",
            "address": f"{ac_name} - Booth {booth_no}",
            "area": ac_name
        })
    
    # Convert results keys to full booth IDs
    full_results = {}
    for booth_no, data in results.items():
        full_results[f"{ac_id}-{booth_no}"] = data
    
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
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
                          for c in official['candidates']],
            "results": full_results
        }, f, indent=2)
    
    return True, old_error, new_error


def main():
    print("=" * 70)
    print("Clean Extraction v2 - TN 2021 Booth Data")
    print("=" * 70)
    
    official_data = load_official_data()
    
    # Find problematic ACs
    problems = []
    for ac_id in official_data.keys():
        booth_path = OUTPUT_BASE / ac_id / "2021.json"
        if not booth_path.exists():
            problems.append(int(ac_id.replace('TN-', '')))
            continue
        
        with open(booth_path) as f:
            booth = json.load(f)
        
        official = official_data[ac_id]
        num_cand = len(booth.get('candidates', []))
        totals = [0] * num_cand
        for r in booth.get('results', {}).values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    totals[i] += v
        
        errors = []
        for i in range(min(3, len(official['candidates']))):
            off = official['candidates'][i]['votes']
            calc = totals[i] if i < len(totals) else 0
            if off > 100:
                errors.append(abs(calc - off) / off * 100)
        
        avg = sum(errors) / len(errors) if errors else 100
        if avg >= 15:
            problems.append(int(ac_id.replace('TN-', '')))
    
    print(f"Found {len(problems)} problematic ACs")
    
    improved = 0
    for ac_num in sorted(problems):
        success, old_err, new_err = process_ac(ac_num, official_data)
        ac_id = f"TN-{ac_num:03d}"
        ac_name = official_data.get(ac_id, {}).get('constituencyName', ac_id)
        
        if success:
            print(f"  ✅ [{ac_num:03d}] {ac_name}: {old_err:.1f}% → {new_err:.1f}%")
            improved += 1
        else:
            print(f"  ❌ [{ac_num:03d}] {ac_name}: {old_err:.1f}% (no improvement)")
    
    print(f"\nImproved: {improved}/{len(problems)}")
    
    # Final count
    good_count = 0
    for ac_id in official_data.keys():
        booth_path = OUTPUT_BASE / ac_id / "2021.json"
        if not booth_path.exists():
            continue
        
        with open(booth_path) as f:
            booth = json.load(f)
        
        num_cand = len(booth.get('candidates', []))
        totals = [0] * num_cand
        for r in booth.get('results', {}).values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    totals[i] += v
        
        errors = []
        for i in range(min(3, len(official_data[ac_id]['candidates']))):
            off = official_data[ac_id]['candidates'][i]['votes']
            calc = totals[i] if i < len(totals) else 0
            if off > 100:
                errors.append(abs(calc - off) / off * 100)
        
        avg = sum(errors) / len(errors) if errors else 100
        if avg < 15:
            good_count += 1
    
    print(f"\nFinal: {good_count}/{len(official_data)} good ACs ({good_count/len(official_data)*100:.1f}%)")


if __name__ == "__main__":
    main()
