#!/usr/bin/env python3
"""
Final booth data fixer for Tamil Nadu 2021 elections.

Strategy:
1. Detect PDF format (simple vs address-containing)
2. Extract data with format-specific parsing
3. Use vote-total matching to align columns with official candidates
4. Validate against official totals
5. Only save if validation passes
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Optional

# Configuration
FORM20_DIR = Path(os.path.expanduser("~/Desktop/TNLA_2021_PDFs"))
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/elections/ac/TN/2021.json")


def load_official_data() -> dict:
    with open(ELECTION_DATA, 'r') as f:
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


def detect_format(text: str) -> str:
    """Detect PDF format type."""
    lines = text.split('\n')
    
    # Count lines with pincode patterns (6-digit starting with 6)
    pincode_lines = 0
    data_lines = 0
    
    for line in lines:
        if re.match(r'^\s*\d{1,3}\s+\d{1,3}', line):
            data_lines += 1
            if re.search(r'\b6\d{5}\b', line):
                pincode_lines += 1
    
    if data_lines == 0:
        return "unknown"
    
    # If >50% of data lines have pincodes, it's address format
    if pincode_lines > data_lines * 0.3:
        return "address"
    
    return "simple"


def parse_simple_format(text: str, ac_id: str) -> List[Dict]:
    """Parse simple format: SlNo BoothNo [Votes...] TotalValid Rejected NOTA Total"""
    data = []
    lines = text.split('\n')
    
    for line in lines:
        # Match: SlNo BoothNo followed by numbers
        match = re.match(r'^\s*(\d{1,3})\s+(\d{1,3}[A-Za-z]*(?:\s*[A-Z]?\([AW]\))?(?:\s*[MW])?)\s+(\d+)', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2).strip().replace(' ', '')
        
        if sl_no > 500:
            continue
        
        # Extract all numbers after booth number
        numbers = [int(n) for n in re.findall(r'\d+', line)[2:]]
        
        if len(numbers) < 5:
            continue
        
        data.append({
            'booth_no': booth_no,
            'numbers': numbers
        })
    
    return data


def parse_address_format(text: str, ac_id: str) -> List[Dict]:
    """Parse address format: SlNo BoothNo Address [Votes...] Totals"""
    data = []
    lines = text.split('\n')
    
    for line in lines:
        # Match line starting with SlNo
        match = re.match(r'^\s*(\d{1,3})\s+(\d{1,3}[A-Za-z]*(?:\s*[A-Z]?\([AW]\))?(?:\s*[MW])?)\s+', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2).strip().replace(' ', '')
        
        if sl_no > 500:
            continue
        
        # Extract all numbers
        all_numbers = re.findall(r'\d+', line)
        
        # Filter out pincodes (6-digit starting with 6)
        numbers = []
        for n in all_numbers[2:]:  # Skip SlNo and BoothNo
            num = int(n)
            if len(n) == 6 and 600000 <= num <= 699999:
                continue
            numbers.append(num)
        
        if len(numbers) < 5:
            continue
        
        data.append({
            'booth_no': booth_no,
            'numbers': numbers
        })
    
    return data


def determine_columns(data: List[Dict], num_official: int) -> Tuple[int, int]:
    """Determine candidate columns and trailing columns."""
    if not data:
        return 0, 0
    
    # Find most common length
    lengths = {}
    for d in data:
        n = len(d['numbers'])
        lengths[n] = lengths.get(n, 0) + 1
    
    most_common = max(lengths.keys(), key=lambda x: lengths[x])
    
    # Trailing columns: TotalValid, Rejected, NOTA, Total [, Electors, Pct...]
    # Try different trailing counts, prefer one that gives close to num_official
    for trailing in [3, 4, 5, 6, 7]:
        cand_cols = most_common - trailing
        if abs(cand_cols - num_official) <= 2:
            return cand_cols, trailing
    
    return most_common - 4, 4


def extract_votes(data: List[Dict], num_cand_cols: int, num_trailing: int, ac_id: str) -> dict:
    """Extract booth results with consistent column count."""
    results = {}
    
    for d in data:
        nums = d['numbers']
        total_cols = num_cand_cols + num_trailing
        
        if len(nums) < total_cols:
            continue
        
        # Take first num_cand_cols as candidate votes
        votes = nums[:num_cand_cols]
        
        # TotalValid is first of trailing columns
        total_valid = nums[num_cand_cols] if len(nums) > num_cand_cols else sum(votes)
        
        # Validate: sum of votes should be reasonably close to total_valid
        # Allow more tolerance since NOTA might be separate
        vote_sum = sum(votes)
        if total_valid > 0 and vote_sum > total_valid * 2:
            # Vote sum way too high - probably parsing error
            continue
        
        booth_id = f"{ac_id}-{d['booth_no']}"
        results[booth_id] = {
            'votes': votes,
            'total': total_valid,
            'rejected': 0
        }
    
    return results


def match_columns_to_candidates(results: dict, official_candidates: list) -> Tuple[dict, float]:
    """
    Match extracted columns to official candidates.
    
    Strategy: Use 1:1 positional matching first (PDF col i -> official candidate i).
    This works when PDF column order matches official order (sorted by votes).
    
    If that fails, try greedy vote-total matching.
    """
    if not results:
        return {}, 100.0
    
    first = next(iter(results.values()))
    num_cols = len(first['votes'])
    num_official = len(official_candidates)
    
    # Calculate column totals
    col_totals = [0] * num_cols
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cols:
                col_totals[i] += v
    
    # Strategy 1: Direct positional mapping (PDF col i -> official i)
    # This works if booth vote columns are in same order as official
    direct_results = {}
    for booth_id, data in results.items():
        votes = data['votes'][:num_official] + [0] * max(0, num_official - len(data['votes']))
        direct_results[booth_id] = {
            'votes': votes[:num_official],
            'total': data['total'],
            'rejected': data['rejected']
        }
    
    # Calculate direct mapping error
    direct_totals = [0] * num_official
    for r in direct_results.values():
        for i, v in enumerate(r['votes']):
            if i < num_official:
                direct_totals[i] += v
    
    direct_errors = []
    for i, off_cand in enumerate(official_candidates):
        off_votes = off_cand['votes']
        calc_votes = direct_totals[i] if i < len(direct_totals) else 0
        if off_votes > 100:
            pct = abs(calc_votes - off_votes) / off_votes * 100
            direct_errors.append(pct)
    
    direct_avg = sum(direct_errors) / len(direct_errors) if direct_errors else 100
    
    # If direct mapping is good (<20% avg error), use it
    if direct_avg < 20:
        return direct_results, direct_avg
    
    # Strategy 2: Greedy vote-total matching
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
    
    # Reorder results using greedy mapping
    greedy_results = {}
    for booth_id, data in results.items():
        new_votes = [0] * num_official
        for col_idx, off_idx in col_to_off.items():
            if col_idx < len(data['votes']):
                new_votes[off_idx] = data['votes'][col_idx]
        
        greedy_results[booth_id] = {
            'votes': new_votes,
            'total': data['total'],
            'rejected': data['rejected']
        }
    
    # Calculate greedy error
    greedy_totals = [0] * num_official
    for r in greedy_results.values():
        for i, v in enumerate(r['votes']):
            if i < num_official:
                greedy_totals[i] += v
    
    greedy_errors = []
    for i, off_cand in enumerate(official_candidates):
        off_votes = off_cand['votes']
        calc_votes = greedy_totals[i]
        if off_votes > 100:
            pct = abs(calc_votes - off_votes) / off_votes * 100
            greedy_errors.append(pct)
    
    greedy_avg = sum(greedy_errors) / len(greedy_errors) if greedy_errors else 100
    
    # Return whichever is better
    if direct_avg <= greedy_avg:
        return direct_results, direct_avg
    else:
        return greedy_results, greedy_avg


def save_results(results: dict, candidates: list, ac_id: str, ac_name: str):
    """Save booth data to files."""
    # Build booth metadata
    booths = []
    for booth_id in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x.split('-')[-1]).group()) if re.search(r'\d+', x.split('-')[-1]) else 0, x)):
        booth_no = booth_id.split('-')[-1]
        booths.append({
            "id": booth_id, "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "women" if '(W)' in booth_no.upper() or booth_no.upper().endswith('W') else "regular",
            "name": f"Booth {booth_no}", "address": f"{ac_name} - Booth {booth_no}", "area": ac_name
        })
    
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    with open(output_dir / "booths.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "state": "Tamil Nadu",
            "totalBooths": len(booths), "lastUpdated": "2021-04-06",
            "source": "Tamil Nadu CEO - Form 20", "booths": booths
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')} 
                          for c in candidates],
            "results": results
        }, f, indent=2)


def process_ac(ac_num: int, official_data: dict) -> Tuple[bool, str, float]:
    """Process a single AC. Returns (success, message, error_pct)."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return False, "PDF not found", 100
    
    official = official_data.get(ac_id)
    if not official:
        return False, "No official data", 100
    
    ac_name = official.get('constituencyName', ac_id)
    official_candidates = official['candidates']
    num_official = len(official_candidates)
    
    # Extract text
    text = extract_pdf_text(pdf_path)
    if not text:
        return False, "Failed to extract PDF", 100
    
    # Detect format
    fmt = detect_format(text)
    
    # Parse based on format
    if fmt == "simple":
        data = parse_simple_format(text, ac_id)
    elif fmt == "address":
        data = parse_address_format(text, ac_id)
    else:
        return False, f"Unknown format", 100
    
    if not data:
        return False, "No data extracted", 100
    
    # Determine column structure
    num_cand_cols, num_trailing = determine_columns(data, num_official)
    
    # Extract votes
    results = extract_votes(data, num_cand_cols, num_trailing, ac_id)
    
    if not results:
        return False, "No valid booths", 100
    
    # Match to official candidates
    results, avg_error = match_columns_to_candidates(results, official_candidates)
    
    # Save if error is acceptable
    if avg_error < 25:  # 25% threshold
        save_results(results, official_candidates, ac_id, ac_name)
        return True, f"{len(results)} booths, {fmt} format", avg_error
    else:
        return False, f"High error ({avg_error:.1f}%)", avg_error


def identify_problematic_acs() -> List[Tuple[int, float]]:
    """Identify ACs needing re-extraction."""
    problems = []
    official_data = load_official_data()
    
    for ac_dir in os.listdir(OUTPUT_BASE):
        if not ac_dir.startswith('TN-'):
            continue
        
        booth_path = OUTPUT_BASE / ac_dir / "2021.json"
        if not booth_path.exists():
            ac_num = int(ac_dir.replace('TN-', ''))
            problems.append((ac_num, 100.0))
            continue
        
        with open(booth_path) as f:
            booth = json.load(f)
        
        official = official_data.get(ac_dir)
        if not official:
            continue
        
        # Calculate error
        num_cand = len(booth.get('candidates', []))
        totals = [0] * num_cand
        for r in booth.get('results', {}).values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    totals[i] += v
        
        # Check top 3 error
        errors = []
        for i in range(min(3, len(official['candidates']))):
            off = official['candidates'][i]['votes']
            calc = totals[i] if i < len(totals) else 0
            if off > 100:
                errors.append(abs(calc - off) / off * 100)
        
        avg_error = sum(errors) / len(errors) if errors else 100
        
        if avg_error > 15:
            ac_num = int(ac_dir.replace('TN-', ''))
            problems.append((ac_num, avg_error))
    
    return sorted(problems, key=lambda x: x[1], reverse=True)


def main():
    print("=" * 70)
    print("Tamil Nadu 2021 Booth Data - Final Fix")
    print("=" * 70)
    
    official_data = load_official_data()
    print(f"\nLoaded {len(official_data)} constituencies")
    
    # Identify problems
    problems = identify_problematic_acs()
    print(f"Found {len(problems)} ACs needing fix (>15% error)")
    
    if not problems:
        print("\n✅ All data looks good!")
        return
    
    # Process each
    improved = 0
    still_bad = []
    
    for ac_num, old_error in problems:
        ac_id = f"TN-{ac_num:03d}"
        official = official_data.get(ac_id, {})
        ac_name = official.get('constituencyName', ac_id)
        
        success, msg, new_error = process_ac(ac_num, official_data)
        
        if success and new_error < old_error:
            print(f"  ✅ [{ac_num:03d}] {ac_name}: {old_error:.1f}% → {new_error:.1f}% ({msg})")
            improved += 1
        elif success:
            print(f"  ⚠️ [{ac_num:03d}] {ac_name}: {new_error:.1f}% ({msg})")
        else:
            print(f"  ❌ [{ac_num:03d}] {ac_name}: {msg}")
            still_bad.append(ac_num)
    
    print("\n" + "=" * 70)
    print(f"Improved: {improved}/{len(problems)}")
    print(f"Still problematic: {len(still_bad)}")
    
    # Final validation
    print("\n" + "=" * 70)
    print("Final Validation")
    print("=" * 70)
    
    final_problems = identify_problematic_acs()
    good = len(official_data) - len(final_problems)
    print(f"Good ACs (<15% error): {good}")
    print(f"Problematic ACs: {len(final_problems)}")


if __name__ == "__main__":
    main()
