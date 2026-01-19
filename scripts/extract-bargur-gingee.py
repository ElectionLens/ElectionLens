#!/usr/bin/env python3
"""
Specialized extraction for address-containing PDFs (like Bargur, Gingee).

Strategy: Find vote columns by looking for the "total" column that matches sum of votes.
"""

import json
import re
import subprocess
from pathlib import Path

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/elections/ac/TN/2021.json")


def extract_pdf_text(pdf_path: Path) -> str:
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, check=True
        )
        return result.stdout
    except:
        return ""


def find_vote_start(nums: list, num_candidates: int) -> tuple:
    """Find where vote columns start by matching sum to a total column.
    
    Returns: (start_index, format_type)
    format_type: 'nota_before_total' or 'total_before_nota' or 'simple'
    
    Format A: [candidate votes] [NOTA] [TotalValid] ... (NOTA counted in TotalValid)
    Format B: [candidate votes] [TotalValid] [Rejected] [NOTA] [Total] (NOTA separate)
    """
    
    min_cols = num_candidates + 3
    if len(nums) < min_cols:
        return -1, None
    
    # Try Format A: [votes] [NOTA] [TotalValid]
    # TotalValid = sum(votes) + NOTA
    for start in range(len(nums) - num_candidates - 2):
        votes = nums[start:start + num_candidates]
        nota = nums[start + num_candidates]
        total = nums[start + num_candidates + 1]
        
        expected = sum(votes) + nota
        if abs(expected - total) <= 5:
            return start, 'nota_before_total'
    
    # Try Format B: [votes] [TotalValid] where TotalValid = sum(votes)
    for start in range(len(nums) - num_candidates - 1):
        votes = nums[start:start + num_candidates]
        total = nums[start + num_candidates]
        
        expected = sum(votes)
        if abs(expected - total) <= 5:
            return start, 'total_before_nota'
    
    # Looser matching
    for start in range(len(nums) - num_candidates - 1):
        votes = nums[start:start + num_candidates]
        total = nums[start + num_candidates]
        
        expected = sum(votes)
        if expected > 0 and abs(expected - total) <= total * 0.1 + 20:
            return start, 'simple'
    
    return -1, None


def parse_address_format(text: str, num_candidates: int) -> list:
    """Parse PDF with address columns."""
    booths = []
    
    for line in text.split('\n'):
        # Skip obvious header/metadata lines
        if 'SL. NO.' in line or 'TOTAL' in line.upper() or 'VALID' in line.upper():
            continue
        
        # Skip lines that contain candidate/party names (these are header rows)
        if re.search(r'(DMK|ADMK|PMK|NTK|AMMK|AIADMK|BSP|BJP|INC|INDEPENDENT|KATCHI|KAZHAGAM|MAKKAL|PARTY|NEEDHI|MUNNETRA|DRAVIDA)', line, re.IGNORECASE):
            continue
        
        # Skip lines that end with a person's name pattern
        if re.search(r'[A-Z]+\s+[A-Z]\.[\sA-Z\.]+$', line):
            continue
        
        # Skip lines with NOTA, rejected, tendered
        if 'NOTA' in line or 'rejected' in line.lower() or 'tendered' in line.lower():
            continue
        
        # Match line starting with booth pattern
        match = re.match(r'^\s*(\d{1,3})\s+(\d{1,3}[A-Za-z]*(?:\([AW]\))?[MW]?)\s+', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2).strip()
        
        if sl_no > 500:
            continue
        
        # Get all numbers
        all_nums = [int(n) for n in re.findall(r'\d+', line)]
        
        # Skip SlNo and BoothNo
        nums = all_nums[2:]
        
        if len(nums) < num_candidates + 3:
            continue
        
        # Skip header rows (numbers are consecutive or reverse consecutive)
        if len(nums) >= 5:
            is_consecutive = all(nums[i+1] == nums[i] + 1 for i in range(min(5, len(nums)-1)))
            is_reverse = all(nums[i+1] == nums[i] - 1 for i in range(min(5, len(nums)-1)))
            if (is_consecutive or is_reverse) and nums[0] < 30:
                continue
        
        # Find where votes start
        start, fmt = find_vote_start(nums, num_candidates)
        
        if start < 0:
            # Fallback: assume first few numbers might be address-related
            # Try skipping likely pincode components (3-digit numbers 600-699)
            cleaned = []
            skip_count = 0
            for n in nums:
                if skip_count < 4 and (600 <= n <= 699 or 100 <= n <= 199):
                    skip_count += 1
                    continue
                cleaned.append(n)
            
            if len(cleaned) >= num_candidates + 3:
                start, fmt = find_vote_start(cleaned, num_candidates)
                if start >= 0:
                    nums = cleaned
        
        if start < 0:
            continue
        
        votes = nums[start:start + num_candidates]
        
        # Get total based on format
        if fmt == 'nota_before_total':
            # NOTA is at position start + num_candidates
            # TotalValid is at position start + num_candidates + 1
            total_idx = start + num_candidates + 1
            total = nums[total_idx] if total_idx < len(nums) else sum(votes)
        else:
            # TotalValid is at position start + num_candidates
            total_idx = start + num_candidates
            total = nums[total_idx] if total_idx < len(nums) else sum(votes)
        
        # Basic validation
        vote_sum = sum(votes)
        if vote_sum == 0 or (total > 0 and vote_sum > total * 2):
            continue
        
        booths.append({
            'booth_no': booth_no,
            'votes': votes,
            'total': total
        })
    
    return booths


def greedy_match(booths: list, official_candidates: list) -> tuple:
    """Match columns to candidates using greedy vote-total matching."""
    if not booths:
        return {}, 100.0
    
    num_official = len(official_candidates)
    num_cols = len(booths[0]['votes'])
    
    # Column totals
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


def save_booth_data(ac_id: str, results: dict, official_candidates: list, ac_name: str):
    """Save booth data to files."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    booth_list = []
    full_results = {}
    
    for booth_no in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0, x)):
        booth_id = f"{ac_id}-{booth_no}"
        booth_list.append({
            "id": booth_id, "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "women" if '(W)' in booth_no.upper() or booth_no.upper().endswith('W') else "regular",
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
    if not text:
        return False, "Empty PDF", 100
    
    num_candidates = len(official['candidates'])
    booths = parse_address_format(text, num_candidates)
    
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
    
    print(f"Processing {len(problems)} problematic ACs...")
    
    improved = 0
    for ac_num in sorted(problems):
        ac_id = f"TN-{ac_num:03d}"
        official = official_data.get(ac_id, {})
        ac_name = official.get('constituencyName', ac_id)
        
        success, msg, error = process_ac(ac_num, official_data)
        
        if success and error < 15:
            print(f"✅ [{ac_num:03d}] {ac_name}: {error:.1f}% ({msg})")
            improved += 1
    
    print(f"\nImproved: {improved}/{len(problems)}")


if __name__ == "__main__":
    main()
