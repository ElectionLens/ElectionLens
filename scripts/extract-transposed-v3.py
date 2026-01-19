#!/usr/bin/env python3
"""
Extract booth data from transposed format PDFs (Villupuram district style).

Format:
- Each page shows 5-10 booths (columns) x all candidates (rows)
- Row 1: Column index headers (7, 6, 5, 4, 3, 2, 1 + "SL. NO.")
- Row 2: Polling Station No (actual booth IDs like 6, 5, 4, 3, 2, 1A, 1)
- Rows 3+: Votes for each candidate (number at start, party/name at end)
- Last data row: "Total of valid votes"

Multiple pages need to be combined to get all booths.
"""

import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/elections/ac/TN/2021.json")
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/booths/TN")


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def parse_transposed_page(lines: list, num_candidates: int):
    """Parse one page of transposed format data."""
    booth_ids = []
    candidate_votes = defaultdict(list)  # candidate_idx -> list of votes per booth
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Look for "Polling Station No" row
        if 'Polling Station' in line or 'Station No' in line:
            # Extract booth IDs from this line
            nums = re.findall(r'\b(\d+[A-Z]?)\b', line)
            booth_ids = [n for n in nums if not n.isalpha()]
            # Remove trailing row number if present
            if booth_ids and booth_ids[-1].isdigit() and int(booth_ids[-1]) < 10:
                booth_ids = booth_ids[:-1]
            # Reverse to get correct order
            booth_ids = list(reversed(booth_ids))
            i += 1
            continue
        
        # Look for data rows (start with numbers, end with party/name or just numbers)
        nums = re.findall(r'\b(\d+)\b', line)
        
        # Check if this is a candidate vote row
        if len(nums) >= len(booth_ids) - 1 and len(booth_ids) > 0:
            # Last number might be the candidate index
            if len(nums) > len(booth_ids):
                cand_idx = int(nums[-1]) - 1  # Convert to 0-indexed
                votes = [int(nums[j]) for j in range(len(booth_ids))]
                votes = list(reversed(votes))  # Reverse to match booth order
                
                if 0 <= cand_idx < num_candidates:
                    candidate_votes[cand_idx].extend(votes)
        
        i += 1
    
    return booth_ids, candidate_votes


def parse_transposed_pdf(pdf_path: Path, num_candidates: int, ac_id: str):
    """Parse a transposed format PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    text = result.stdout
    
    # Split by page markers
    pages = re.split(r'Page \d+ of \d+', text)
    
    all_booth_ids = []
    all_votes = defaultdict(list)  # candidate_idx -> list of votes
    
    for page in pages:
        lines = page.split('\n')
        booth_ids, candidate_votes = parse_transposed_page(lines, num_candidates)
        
        if booth_ids:
            all_booth_ids.extend(booth_ids)
            for cand_idx, votes in candidate_votes.items():
                all_votes[cand_idx].extend(votes)
    
    if not all_booth_ids:
        return None
    
    # Build results - each booth has votes from all candidates
    results = {}
    for booth_idx, booth_no in enumerate(all_booth_ids):
        votes = []
        for cand_idx in range(num_candidates):
            if booth_idx < len(all_votes.get(cand_idx, [])):
                votes.append(all_votes[cand_idx][booth_idx])
            else:
                votes.append(0)
        
        if sum(votes) > 0:
            booth_id = f"{ac_id}-{booth_no}"
            results[booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
    
    return results


def validate_and_save(results: dict, ac_id: str, official_data: dict):
    """Validate results and save if good enough."""
    if not results:
        return False, 100
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    ac_name = official.get('constituencyName', ac_id)
    
    # Calculate column totals
    col_totals = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    # Check errors for top 3 candidates
    errors = []
    for i in range(min(3, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = col_totals[i]
        if off > 100:
            pct = abs(calc - off) / off * 100
            errors.append(pct)
            print(f"    {official['candidates'][i]['party']}: Official={off:,} Calc={calc:,} ({pct:.1f}%)")
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error > 30:
        return False, avg_error
    
    # Save
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create booth list
    booth_list = []
    for booth_id in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x.split('-')[-1]).group()) if re.search(r'\d+', x.split('-')[-1]) else 0, x)):
        booth_no = booth_id.split('-')[-1]
        booth_list.append({
            "id": booth_id,
            "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "women" if booth_no.upper().endswith('W') or '(W)' in booth_no.upper() else "regular",
            "name": f"Booth {booth_no}",
            "address": f"{ac_name} - Booth {booth_no}",
            "area": ac_name
        })
    
    with open(output_dir / "booths.json", 'w') as f:
        json.dump({
            "acId": ac_id,
            "acName": ac_name,
            "state": "Tamil Nadu",
            "totalBooths": len(booth_list),
            "lastUpdated": "2021-04-06",
            "source": "Tamil Nadu CEO - Form 20 (Transposed)",
            "booths": booth_list
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id,
            "acName": ac_name,
            "year": 2021,
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
        print(f"  No PDF found")
        return False
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    
    results = parse_transposed_pdf(pdf_path, num_candidates, ac_id)
    
    if not results:
        print(f"  Failed to parse")
        return False
    
    print(f"  Parsed {len(results)} booths")
    success, error = validate_and_save(results, ac_id, official_data)
    
    if success:
        print(f"  ✅ Saved ({error:.1f}% error)")
    else:
        print(f"  ❌ Error too high ({error:.1f}%)")
    
    return success


def main():
    official_data = load_official_data()
    
    # ACs with transposed format (Villupuram district + others)
    transposed_acs = ['TN-071', 'TN-072', 'TN-074', 'TN-075', 'TN-076', 'TN-159']
    
    print("Processing transposed format ACs...")
    for ac_id in transposed_acs:
        name = official_data.get(ac_id, {}).get('constituencyName', ac_id)
        print(f"\n{ac_id} {name}:")
        process_ac(ac_id, official_data)


if __name__ == "__main__":
    main()
