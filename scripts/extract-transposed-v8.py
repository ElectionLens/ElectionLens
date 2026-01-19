#!/usr/bin/env python3
"""
Extract transposed format - handle booth IDs on line AFTER "Polling Station No".

Page 12+ format:
  Line N:      99    2                  Polling Station No.
  Line N+1:    106   105A   105   104   103   102   101   100   99A
  
Booth IDs are: 106, 105A, 105, 104, 103, 102, 101, 100, 99A (from line N+1)
Plus potentially 99 from line N (before "2")
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


def extract_booth_ids_from_context(lines: list, ps_line_idx: int):
    """Extract booth IDs from around the Polling Station No line."""
    booth_ids = []
    
    ps_line = lines[ps_line_idx]
    
    # Get numbers BEFORE "Polling Station" text
    ps_pos = ps_line.find('Polling Station')
    if ps_pos == -1:
        ps_pos = ps_line.find('Station No')
    
    before_ps = ps_line[:ps_pos] if ps_pos > 0 else ""
    parts_before = re.findall(r'\b(\d+[A-Z]?)\b', before_ps)
    
    # Filter out row index (typically "2" at the end before "Polling Station")
    if parts_before and parts_before[-1] in ['2', '1']:
        parts_before = parts_before[:-1]
    
    # Check line AFTER for the main booth IDs
    if ps_line_idx + 1 < len(lines):
        next_line = lines[ps_line_idx + 1].strip()
        # Skip empty or party lines
        if next_line and not any(x in next_line.upper() for x in 
            ['PARTY', 'INDEPENDENT', 'KAZHAGAM', 'DESIYA', 'DRAVIDA', 'MUNNETRA', 'MAKKAL']):
            next_parts = re.findall(r'\b(\d+[A-Z]?)\b', next_line)
            if len(next_parts) >= 5:
                booth_ids = next_parts
    
    # If not enough from next line, check the line itself
    if len(booth_ids) < 5:
        # Try to get booth IDs from the PS line itself
        all_parts = re.findall(r'\b(\d+[A-Z]?)\b', ps_line)
        # Remove trailing row index
        if all_parts and all_parts[-1] in ['2', '1']:
            all_parts = all_parts[:-1]
        if len(all_parts) >= 5:
            booth_ids = all_parts
    
    # Add any overflow booth IDs from before the PS text
    if parts_before and len(parts_before) > 0:
        # These should be inserted in the correct position
        # Usually they're booth IDs that didn't fit on the previous line
        for p in parts_before:
            if p not in booth_ids:
                booth_ids.insert(0, p)
    
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
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Find Polling Station No line
        if 'Polling Station' in stripped or 'Station No' in stripped:
            booth_ids = extract_booth_ids_from_context(lines, i)
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
                       'KAZHAGAM.', 'ANNA MGR DRAVIDA', 'MAKKAL KALGAM']
        if stripped.upper() in party_lines:
            i += 1
            continue
        
        # Parse candidate vote row
        nums = re.findall(r'\b(\d+)\b', stripped)
        
        if len(current_booth_ids) >= 5 and len(nums) >= len(current_booth_ids) + 1:
            votes = [int(nums[j]) for j in range(len(current_booth_ids))]
            cand_idx = int(nums[len(current_booth_ids)])
            
            if 3 <= cand_idx <= 20:
                for j, booth_id in enumerate(current_booth_ids):
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
    
    if avg_error > 20:
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
