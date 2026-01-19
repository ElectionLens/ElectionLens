#!/usr/bin/env python3
"""
Extract booth data from PDFs with wide column spacing.

Format: SlNo BoothNo [13 candidate votes] TotalValid Rejected NOTA Total [Tendered]
Example: 1 1 263 1 0 5 18 333 3 2 11 0 1 2 2 641 0 6 647 0
"""

import json
import os
import re
import subprocess
from pathlib import Path

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


def parse_wide_format(text: str, num_candidates: int) -> list:
    """Parse PDF with wide column spacing."""
    booths = []
    
    for line in text.split('\n'):
        # Skip non-data lines
        if any(skip in line.upper() for skip in [
            'SL. NO', 'FORM 20', 'TOTAL NO', 'DATE OF', 'NO. OF VALID',
            'ASSEMBLY', 'GENERAL ELECTION', 'ELECTORS'
        ]):
            continue
        
        # Skip lines with candidate/party names
        if any(party in line.upper() for party in [
            'DMK', 'ADMK', 'PMK', 'NTK', 'AMMK', 'AIADMK', 'BSP', 'BJP', 'INC',
            'INDEPENDENT', 'KAZHAGAM', 'KATCHI', 'MAKKAL', 'MUNNETRA', 'DRAVIDA',
            'PARTY', 'SAMAJ', 'BAHUJAN'
        ]):
            continue
        
        # Skip lines ending with names
        if re.search(r'[A-Z]+\s+[A-Z]\..*$', line):
            continue
        
        # Match data lines starting with booth pattern
        match = re.match(r'^\s*(\d{1,3})\s+(\d{1,3}[A-Za-z]*)\s+(\d+)', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2)
        booth_num = int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0
        
        # Skip if SlNo is too high (likely a total row)
        if sl_no > 500:
            continue
        
        # Skip if booth number is way too high (likely spurious data)
        if booth_num > 500:
            continue
        
        # Skip if SlNo and BoothNo don't match typical patterns
        # Usually booth numbers are close to SlNo (within ±10)
        if abs(sl_no - booth_num) > 50 and sl_no < 100:
            continue
        
        # Extract all numbers from line
        all_nums = re.findall(r'\d+', line)
        
        # Skip SlNo and BoothNo
        nums = [int(n) for n in all_nums[2:]]
        
        # Skip header rows (consecutive numbers)
        if len(nums) >= 5:
            if all(nums[i+1] == nums[i] + 1 for i in range(min(5, len(nums)-1))):
                continue
            if all(nums[i+1] == nums[i] - 1 for i in range(min(5, len(nums)-1))):
                continue
        
        # Need at least num_candidates + 3 (TotalValid, Rejected, NOTA)
        min_cols = num_candidates + 3
        if len(nums) < min_cols:
            continue
        
        # Extract votes - first num_candidates numbers
        votes = nums[:num_candidates]
        
        # TotalValid should be close to sum of votes
        total_valid_idx = num_candidates
        total_valid = nums[total_valid_idx] if total_valid_idx < len(nums) else 0
        
        # NOTA is at position num_candidates + 2
        nota_idx = num_candidates + 2
        nota = nums[nota_idx] if nota_idx < len(nums) else 0
        
        # Validate: sum of votes + NOTA should be close to TotalValid
        vote_sum = sum(votes)
        expected = vote_sum + nota
        
        if abs(expected - total_valid) <= 10:
            booths.append({
                'booth_no': booth_no,
                'votes': votes,
                'total': total_valid
            })
        elif abs(vote_sum - total_valid) <= 10:
            # NOTA might be included in votes or separate
            booths.append({
                'booth_no': booth_no,
                'votes': votes,
                'total': total_valid
            })
    
    return booths


def greedy_match(booths: list, official_candidates: list) -> tuple:
    """Match columns to candidates using greedy vote-total matching."""
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
    
    # Check if already aligned
    errors = []
    for i in range(min(3, num_official)):
        off = official_candidates[i]['votes']
        calc = col_totals[i] if i < len(col_totals) else 0
        if off > 100:
            errors.append(abs(calc - off) / off * 100)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error < 20:
        # Already good, convert to dict format
        results = {}
        for b in booths:
            votes = b['votes'][:num_official] + [0] * max(0, num_official - len(b['votes']))
            results[b['booth_no']] = {
                'votes': votes[:num_official],
                'total': b['total'],
                'rejected': 0
            }
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
    results = {}
    for b in booths:
        new_votes = [0] * num_official
        for col_idx, off_idx in col_to_off.items():
            if col_idx < len(b['votes']):
                new_votes[off_idx] = b['votes'][col_idx]
        
        results[b['booth_no']] = {
            'votes': new_votes,
            'total': b['total'],
            'rejected': 0
        }
    
    # Recalculate error
    new_totals = [0] * num_official
    for data in results.values():
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
    
    return results, min(avg_error, new_avg)


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
    
    num_candidates = len(official['candidates'])
    booths = parse_wide_format(text, num_candidates)
    
    if len(booths) < 10:
        return False, f"Only {len(booths)} booths", 100
    
    results, avg_error = greedy_match(booths, official['candidates'])
    
    ac_name = official.get('constituencyName', ac_id)
    
    if avg_error < 25:
        save_booth_data(ac_id, results, official['candidates'], ac_name)
        return True, f"{len(booths)} booths", avg_error
    
    return False, f"High error ({avg_error:.1f}%)", avg_error


def main():
    official_data = json.load(open(ELECTION_DATA))
    
    # Find all problematic ACs with >15% error
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
    
    print(f"Processing {len(problems)} problematic ACs with wide-spacing parser...")
    
    improved = 0
    for ac_num in sorted(problems):
        ac_id = f"TN-{ac_num:03d}"
        official = official_data.get(ac_id, {})
        ac_name = official.get('constituencyName', ac_id)
        
        success, msg, error = process_ac(ac_num, official_data)
        
        if success and error < 15:
            print(f"✅ [{ac_num:03d}] {ac_name}: {error:.1f}% ({msg})")
            improved += 1
        elif success:
            print(f"⚠️ [{ac_num:03d}] {ac_name}: {error:.1f}% ({msg})")
    
    print(f"\nImproved: {improved}/{len(problems)}")


if __name__ == "__main__":
    main()
