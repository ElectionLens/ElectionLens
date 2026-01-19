#!/usr/bin/env python3
"""
Final booth data fixer for Tamil Nadu 2021 elections - v5.

Key improvement: Extract candidate names from PDF header to correctly
map vote columns to candidates.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from difflib import SequenceMatcher

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


def extract_header_names(text: str) -> List[str]:
    """Extract candidate names from the PDF header section."""
    lines = text.split('\n')
    
    # Find the header section (before first data line)
    header_lines = []
    for i, line in enumerate(lines):
        # Data line starts with booth number pattern
        if re.match(r'^\s*\d{1,3}\s+\d{1,3}[A-Z]?\s+\d', line):
            break
        header_lines.append(line)
    
    # Extract candidate names from header
    # Names typically have format: A.NAME or FIRSTNAME LASTNAME
    names = []
    
    # Combine relevant header lines (skip first few header lines)
    header_text = '\n'.join(header_lines[5:])  # Skip title lines
    
    # Find names with initials like "R.GANDHI", "S.M.SUGUMAR", "Dr.K.SATHIYARAJ"
    name_pattern = r'(?:Dr\.)?[A-Z]+(?:\.[A-Z]+)*\.[A-Z][A-Z]+(?:\s+[A-Z]+)?'
    found = re.findall(name_pattern, header_text)
    
    # Also find names without initials but in ALL CAPS
    for line in header_lines:
        # Look for isolated capitalized names
        matches = re.findall(r'\b([A-Z]{2,}(?:\s+[A-Z]{2,})*)\b', line)
        for m in matches:
            if len(m) > 3 and m not in ['NOTA', 'VALID', 'VOTES', 'TOTAL', 'REJECTED', 'TENDERED', 
                                         'POLLING', 'ADMK', 'DMK', 'IND', 'BSP', 'MNM', 'NTK', 
                                         'PMK', 'AMMK', 'BJP', 'INC', 'THE', 'AND', 'ALL', 'INDIA',
                                         'ANNA', 'DRAVIDA', 'MUNNETRA', 'BAHUJAN', 'SAMAJ', 'MAKKAL']:
                found.append(m)
    
    # Deduplicate while preserving order
    seen = set()
    for name in found:
        name = name.strip()
        if name and name not in seen and len(name) > 2:
            names.append(name)
            seen.add(name)
    
    return names


def name_similarity(name1: str, name2: str) -> float:
    """Calculate similarity between two names."""
    # Normalize names
    n1 = re.sub(r'[^A-Z]', '', name1.upper())
    n2 = re.sub(r'[^A-Z]', '', name2.upper())
    
    # Check for substring match
    if n1 in n2 or n2 in n1:
        return 0.9
    
    # Use sequence matcher
    return SequenceMatcher(None, n1, n2).ratio()


def match_names_to_official(pdf_names: List[str], official_candidates: List[dict]) -> Dict[int, int]:
    """Match extracted PDF names to official candidates.
    
    Returns: mapping from PDF column index to official candidate index.
    """
    mapping = {}
    used_official = set()
    
    for pdf_idx, pdf_name in enumerate(pdf_names):
        best_match = None
        best_score = 0.5  # Minimum threshold
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official:
                continue
            
            off_name = off_cand['name']
            score = name_similarity(pdf_name, off_name)
            
            if score > best_score:
                best_score = score
                best_match = off_idx
        
        if best_match is not None:
            mapping[pdf_idx] = best_match
            used_official.add(best_match)
    
    return mapping


def parse_data_lines(text: str, ac_id: str) -> List[Dict]:
    """Parse booth data lines from PDF."""
    data = []
    lines = text.split('\n')
    
    for line in lines:
        # Match line starting with booth number
        match = re.match(r'^\s*(\d{1,3})\s+(\d{1,3}[A-Za-z]*(?:\s*[A-Z]?\([AW]\))?(?:\s*[MW])?)\s+(\d+)', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2).strip().replace(' ', '')
        
        if sl_no > 500:  # Skip totals
            continue
        
        # Extract all numbers, filtering pincodes
        all_numbers = re.findall(r'\d+', line)
        numbers = []
        for n in all_numbers[2:]:  # Skip SlNo and BoothNo
            num = int(n)
            if len(n) == 6 and 600000 <= num <= 699999:
                continue  # Skip pincode
            numbers.append(num)
        
        if len(numbers) >= 5:
            data.append({
                'booth_no': booth_no,
                'numbers': numbers
            })
    
    return data


def extract_and_match(text: str, ac_id: str, official_candidates: list) -> Tuple[dict, float]:
    """Extract booth data and match to official candidates."""
    num_official = len(official_candidates)
    
    # Extract data lines
    data = parse_data_lines(text, ac_id)
    if not data:
        return {}, 100.0
    
    # Determine most common number of columns
    lengths = {}
    for d in data:
        n = len(d['numbers'])
        lengths[n] = lengths.get(n, 0) + 1
    
    most_common = max(lengths.keys(), key=lambda x: lengths[x])
    
    # Assume trailing columns: TotalValid, Rejected, NOTA, Total [, Tendered]
    for trailing in [3, 4, 5, 6]:
        num_cand_cols = most_common - trailing
        if abs(num_cand_cols - num_official) <= 2:
            break
    else:
        num_cand_cols = most_common - 4
    
    # Extract header names
    pdf_names = extract_header_names(text)
    
    # Create name-based mapping if possible
    if len(pdf_names) >= num_cand_cols * 0.7:  # At least 70% names found
        name_mapping = match_names_to_official(pdf_names[:num_cand_cols], official_candidates)
    else:
        name_mapping = {}
    
    # Build results
    results = {}
    for d in data:
        nums = d['numbers']
        if len(nums) < num_cand_cols:
            continue
        
        votes = nums[:num_cand_cols]
        total = nums[num_cand_cols] if len(nums) > num_cand_cols else sum(votes)
        
        # Skip if vote sum is way off
        vote_sum = sum(votes)
        if total > 0 and vote_sum > total * 2:
            continue
        
        # Map votes to official order
        if name_mapping:
            mapped_votes = [0] * num_official
            for pdf_idx, off_idx in name_mapping.items():
                if pdf_idx < len(votes):
                    mapped_votes[off_idx] = votes[pdf_idx]
        else:
            # Direct mapping (hope PDF order matches official)
            mapped_votes = votes[:num_official] + [0] * max(0, num_official - len(votes))
        
        booth_id = f"{ac_id}-{d['booth_no']}"
        results[booth_id] = {
            'votes': mapped_votes[:num_official],
            'total': total,
            'rejected': 0
        }
    
    # Calculate error
    totals = [0] * num_official
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_official:
                totals[i] += v
    
    errors = []
    for i, off_cand in enumerate(official_candidates):
        off_votes = off_cand['votes']
        calc_votes = totals[i] if i < len(totals) else 0
        if off_votes > 100:
            pct = abs(calc_votes - off_votes) / off_votes * 100
            errors.append(pct)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    return results, avg_error


def try_alternative_strategies(text: str, ac_id: str, official_candidates: list, 
                               current_results: dict, current_error: float) -> Tuple[dict, float]:
    """Try alternative extraction strategies to improve results."""
    
    if current_error < 15:  # Already good
        return current_results, current_error
    
    num_official = len(official_candidates)
    
    # Get current column totals
    first = next(iter(current_results.values())) if current_results else {'votes': [0] * num_official}
    num_cols = len(first['votes'])
    
    col_totals = [0] * num_cols
    for r in current_results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cols:
                col_totals[i] += v
    
    # Try greedy vote-total matching
    official_by_votes = sorted(enumerate(official_candidates), 
                               key=lambda x: x[1]['votes'], reverse=True)
    col_by_votes = sorted(enumerate(col_totals), key=lambda x: x[1], reverse=True)
    
    col_to_off = {}
    used = set()
    
    for col_idx, col_total in col_by_votes:
        best_match = None
        best_diff = float('inf')
        
        for off_idx, off_cand in official_by_votes:
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
    
    # Remap using greedy matching
    greedy_results = {}
    for booth_id, data in current_results.items():
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
    
    if greedy_avg < current_error:
        return greedy_results, greedy_avg
    
    return current_results, current_error


def save_results(results: dict, candidates: list, ac_id: str, ac_name: str):
    """Save booth data to files."""
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
    
    # Extract text
    text = extract_pdf_text(pdf_path)
    if not text:
        return False, "Failed to extract PDF", 100
    
    # Extract and match
    results, avg_error = extract_and_match(text, ac_id, official_candidates)
    
    if not results:
        return False, "No valid booths", 100
    
    # Try alternative strategies
    results, avg_error = try_alternative_strategies(text, ac_id, official_candidates, 
                                                     results, avg_error)
    
    # Save if error is acceptable
    if avg_error < 25:
        save_results(results, official_candidates, ac_id, ac_name)
        return True, f"{len(results)} booths", avg_error
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
        
        avg_error = sum(errors) / len(errors) if errors else 100
        
        if avg_error > 15:
            ac_num = int(ac_dir.replace('TN-', ''))
            problems.append((ac_num, avg_error))
    
    return sorted(problems, key=lambda x: x[1], reverse=True)


def main():
    print("=" * 70)
    print("Tamil Nadu 2021 Booth Data - v5 (Name-based matching)")
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
    
    # Save quality report
    report = {'good': good, 'problematic': len(final_problems), 'details': final_problems}
    with open('booth-quality-report-v5.json', 'w') as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
