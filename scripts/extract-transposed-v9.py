#!/usr/bin/env python3
"""
Extract transposed format - Fixed booth ID extraction from multi-line formats.

The booth ID row can span 2 lines in complex ways:
  Line N:   24    [space]    23    22    21    20    19    18    17    16    2    Polling Station No.
  Line N+1: 23A

Actual booth IDs: 24, 23A, 23, 22, 21, 20, 19, 18, 17, 16 (10 booths)

The data rows then have 10 vote columns:
  7     4     14    21    14    0     6     9     8     7     3   SUNDARESAN. A

Strategy: Look at "Total of valid votes" row to determine the correct column count,
then use that to parse data rows correctly.
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


def get_column_count_from_total_row(lines: list, start_idx: int):
    """Find "Total of valid votes" row and count columns."""
    for i in range(start_idx, min(start_idx + 100, len(lines))):
        line = lines[i]
        if 'Total of valid votes' in line or '17                  Total' in line:
            nums = re.findall(r'\b(\d+)\b', line)
            # Last number is the row index (17)
            if nums and nums[-1] in ['17', '18', '19', '20', '21']:
                return len(nums) - 1
    return None


def extract_booth_ids_smart(lines: list, ps_line_idx: int, expected_count: int):
    """Extract booth IDs using expected column count."""
    booth_ids = []
    
    # Collect from PS line and surrounding lines
    for offset in range(-1, 3):
        idx = ps_line_idx + offset
        if 0 <= idx < len(lines):
            line = lines[idx]
            # Skip metadata
            if any(x in line.upper() for x in ['FORM 20', 'GENERAL', 'ASSEMBLY', 
                                                'DESIYA', 'DRAVIDA', 'KAZHAGAM']):
                continue
            parts = re.findall(r'\b(\d+[A-Z]?)\b', line)
            for p in parts:
                # Skip row indices (1, 2) and very small numbers that appear alone
                if p in ['1', '2'] and len(parts) <= 3:
                    continue
                if p not in booth_ids:
                    booth_ids.append(p)
    
    # Sort by booth number (numeric part)
    def booth_sort_key(b):
        num = int(re.search(r'\d+', b).group()) if re.search(r'\d+', b) else 0
        has_suffix = 1 if re.search(r'[A-Z]', b) else 0
        return (num, has_suffix)
    
    # Remove any that seem like row indices (standalone small numbers)
    booth_ids = [b for b in booth_ids if not (b.isdigit() and int(b) <= 2)]
    
    # If we have more than expected, take the ones that match expected count
    # They should form a contiguous range
    if len(booth_ids) > expected_count and expected_count:
        booth_ids = booth_ids[:expected_count]
    
    return booth_ids


def parse_transposed_pdf(pdf_path: Path, num_candidates: int):
    """Parse transposed format PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None, None
    
    text = result.stdout
    lines = text.split('\n')
    
    all_candidate_votes = defaultdict(dict)
    all_booth_ids = set()
    current_booth_ids = []
    current_col_count = 10  # default
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Find Polling Station No line
        if 'Polling Station' in stripped or 'Station No' in stripped:
            # Get expected column count from Total row
            col_count = get_column_count_from_total_row(lines, i)
            if col_count and col_count >= 5:
                current_col_count = col_count
            
            booth_ids = extract_booth_ids_smart(lines, i, current_col_count)
            if len(booth_ids) >= 5:
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
        
        # Skip party-only lines
        party_lines = ['DESIYA MURPOKKU', 'DRAVIDA KAZHAGAM', 'DRAVIDA MUNNETRA', 
                       'KAZHAGAM.', 'ANNA MGR DRAVIDA', 'MAKKAL KALGAM', 'No. of valid votes']
        if stripped.upper() in party_lines or 'valid votes cast' in stripped.lower():
            i += 1
            continue
        
        # Parse candidate vote row using current_col_count
        nums = re.findall(r'\b(\d+)\b', stripped)
        
        # Use col_count to determine number of vote columns
        if len(nums) >= current_col_count + 1:
            votes = [int(nums[j]) for j in range(current_col_count)]
            cand_idx = int(nums[current_col_count])
            
            if 3 <= cand_idx <= 20:
                # Map votes to booth IDs
                for j in range(min(len(votes), len(current_booth_ids))):
                    booth_id = current_booth_ids[j]
                    all_candidate_votes[cand_idx][booth_id] = votes[j]
        
        i += 1
    
    sorted_booths = sorted(all_booth_ids, 
        key=lambda x: (int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0, x))
    
    return all_candidate_votes, sorted_booths


def match_by_vote_totals(candidate_votes: dict, official_candidates: list, threshold=0.25):
    """Match PDF candidates to official by vote totals."""
    pdf_totals = {idx: sum(votes.values()) for idx, votes in candidate_votes.items()}
    
    pdf_sum = sum(pdf_totals.values())
    official_sum = sum(c['votes'] for c in official_candidates if c['party'] != 'NOTA')
    scale = official_sum / pdf_sum if pdf_sum > 0 else 1
    
    mapping = {}
    used_official = set()
    pdf_sorted = sorted(pdf_totals.items(), key=lambda x: x[1], reverse=True)
    
    for pdf_idx, pdf_total in pdf_sorted:
        scaled_pdf = pdf_total * scale
        best_match = -1
        best_diff = float('inf')
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official or off_cand['party'] == 'NOTA':
                continue
            diff = abs(scaled_pdf - off_cand['votes'])
            if diff < best_diff:
                best_diff = diff
                best_match = off_idx
        
        if best_match >= 0:
            pct_diff = best_diff / official_candidates[best_match]['votes'] * 100 if official_candidates[best_match]['votes'] > 0 else 100
            if pct_diff < threshold * 100:
                mapping[pdf_idx] = best_match
                used_official.add(best_match)
    
    return mapping, scale


def build_and_validate(candidate_votes: dict, mapping: dict, booth_ids: list, 
                       official: dict, ac_id: str, scale: float):
    """Build results and validate."""
    num_candidates = len(official['candidates'])
    ac_name = official.get('constituencyName', ac_id)
    
    results = {}
    for booth_id in booth_ids:
        votes = [0] * num_candidates
        for pdf_idx, off_idx in mapping.items():
            if booth_id in candidate_votes.get(pdf_idx, {}):
                votes[off_idx] = candidate_votes[pdf_idx][booth_id]
        
        if sum(votes) > 0:
            full_booth_id = f"{ac_id}-{booth_id}"
            results[full_booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
    
    col_totals = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    errors = []
    print(f"  Validation (scale={scale:.2f}):")
    for i in range(min(5, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = col_totals[i]
        if off > 100:
            pct = abs(calc - off) / off * 100
            errors.append(pct)
            status = "✓" if pct < 10 else "✗"
            print(f"    {status} {official['candidates'][i]['party']}: Off={off:,} Calc={calc:,} ({pct:.1f}%)")
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error > 15:
        return None, avg_error
    
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
            "source": "Tamil Nadu CEO - Form 20 (Transposed)", "booths": booth_list
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
                          for c in official['candidates']],
            "results": results
        }, f, indent=2)
    
    return results, avg_error


def process_ac(ac_id: str, official_data: dict):
    """Process a single AC."""
    ac_num = int(ac_id.replace('TN-', ''))
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return False
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    
    candidate_votes, booth_ids = parse_transposed_pdf(pdf_path, num_candidates)
    
    if not candidate_votes or not booth_ids:
        print(f"  Failed to parse")
        return False
    
    print(f"  Found {len(booth_ids)} booths, {len(candidate_votes)} candidate rows")
    
    mapping, scale = match_by_vote_totals(candidate_votes, official['candidates'])
    print(f"  Matched {len(mapping)}/{num_candidates} candidates (scale={scale:.2f})")
    
    results, error = build_and_validate(candidate_votes, mapping, booth_ids, official, ac_id, scale)
    
    if results:
        print(f"  ✅ Saved {len(results)} booths ({error:.1f}% avg error)")
        return True
    else:
        print(f"  ❌ Error too high ({error:.1f}%)")
        return False


def main():
    official_data = load_official_data()
    
    ac_id = 'TN-071'
    name = official_data.get(ac_id, {}).get('constituencyName', ac_id)
    print(f"\n{'='*50}")
    print(f"{ac_id} {name}")
    print('='*50)
    process_ac(ac_id, official_data)


if __name__ == "__main__":
    main()
