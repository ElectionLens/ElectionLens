#!/usr/bin/env python3
"""
Fix booth data for Tamil Nadu 2021 elections - Version 4.

Key insight: Extract candidate names from PDF header and match to official names.
The PDF column order differs from official order (which is sorted by votes).
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Dict, Tuple
from difflib import SequenceMatcher

# Configuration
FORM20_DIR = Path(os.path.expanduser("~/Desktop/TNLA_2021_PDFs"))
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/axi/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/axi/public/data/elections/ac/TN/2021.json")


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


def normalize_name(name: str) -> str:
    """Normalize candidate name for matching."""
    name = name.upper().strip()
    name = re.sub(r'[.,\-]', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    return name


def name_similarity(name1: str, name2: str) -> float:
    """Calculate similarity between two names."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    
    # Exact match
    if n1 == n2:
        return 1.0
    
    # Check if one contains the other
    if n1 in n2 or n2 in n1:
        return 0.9
    
    # Sequence matching
    return SequenceMatcher(None, n1, n2).ratio()


def extract_header_candidates(text: str) -> List[str]:
    """Extract candidate names from PDF header."""
    lines = text.split('\n')
    
    # Find lines with candidate names (usually uppercase, no numbers)
    candidate_lines = []
    in_header = False
    
    for line in lines:
        # Start collecting after "No. of valid votes" header
        if 'No. of valid votes' in line or 'valid votes cast' in line:
            in_header = True
            continue
        
        # Stop at data lines (start with numbers)
        if in_header and re.match(r'^\s*\d+\s+\d+\s+\d+', line):
            break
        
        if in_header:
            # Extract words that look like names (uppercase, 3+ chars)
            words = re.findall(r'[A-Z][A-Z\s\.]{2,}', line)
            for w in words:
                w = w.strip()
                if len(w) > 2 and w not in ['DMK', 'DMDK', 'BSP', 'NTK', 'PMK', 'IJK', 
                                            'IND', 'AMMK', 'AMAK', 'NOTA', 'TOTAL']:
                    candidate_lines.append(w)
    
    # Remove duplicates while preserving order
    seen = set()
    unique = []
    for c in candidate_lines:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    
    return unique


def match_candidates(pdf_names: List[str], official_candidates: list) -> Dict[int, int]:
    """Match PDF column indices to official candidate indices."""
    mapping = {}
    used_officials = set()
    
    for pdf_idx, pdf_name in enumerate(pdf_names):
        best_match = None
        best_score = 0.5  # Minimum threshold
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_officials:
                continue
            
            score = name_similarity(pdf_name, off_cand['name'])
            if score > best_score:
                best_score = score
                best_match = off_idx
        
        if best_match is not None:
            mapping[pdf_idx] = best_match
            used_officials.add(best_match)
    
    return mapping


def parse_data_lines(text: str, ac_id: str) -> List[Dict]:
    """Parse booth data lines from PDF."""
    lines = text.split('\n')
    data = []
    
    for line in lines:
        # Match data line: SlNo BoothNo followed by numbers
        match = re.match(r'^\s*(\d{1,3})\s+(\d{1,3}[A-Za-z]*(?:\s*[A-Z]?\s*\([AW]\))?(?:\s*[MW])?)\s+', line)
        if not match:
            continue
        
        sl_no = int(match.group(1))
        booth_no = match.group(2).strip().replace(' ', '')
        
        if sl_no > 500:
            continue
        
        # Extract all numbers from the line
        all_nums = re.findall(r'\d+', line)
        
        # Filter out pincodes (6-digit numbers starting with 6)
        numbers = []
        for n in all_nums:
            if len(n) == 6 and n.startswith('6'):
                continue
            numbers.append(int(n))
        
        if len(numbers) < 6:
            continue
        
        # Skip first 2 (SlNo, BoothNo)
        vote_data = numbers[2:]
        
        data.append({
            'sl_no': sl_no,
            'booth_no': booth_no,
            'votes': vote_data
        })
    
    return data


def determine_column_structure(data: List[Dict], num_official: int) -> Tuple[int, int]:
    """Determine number of candidate columns and trailing columns."""
    if not data:
        return 0, 0
    
    # Most common total column count
    counts = {}
    for d in data:
        n = len(d['votes'])
        counts[n] = counts.get(n, 0) + 1
    
    most_common = max(counts.keys(), key=lambda x: counts[x])
    
    # Trailing columns: TotalValid, Rejected, NOTA, Total, [Electors], [Pct]
    # Try different trailing counts
    for trailing in [3, 4, 5, 6]:
        candidate_cols = most_common - trailing
        if candidate_cols >= num_official - 2 and candidate_cols <= num_official + 2:
            return candidate_cols, trailing
    
    # Default: assume 4 trailing
    return most_common - 4, 4


def process_ac(ac_num: int, official_data: dict) -> Tuple[bool, str]:
    """Process a single AC and return success status and message."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return False, "PDF not found"
    
    official = official_data.get(ac_id)
    if not official:
        return False, "No official data"
    
    ac_name = official.get('constituencyName', ac_id)
    official_candidates = official['candidates']
    num_official = len(official_candidates)
    
    # Extract PDF text
    text = extract_pdf_text(pdf_path)
    if not text:
        return False, "Failed to extract PDF"
    
    # Extract candidate names from header
    pdf_candidates = extract_header_candidates(text)
    
    # Match to official candidates
    col_mapping = match_candidates(pdf_candidates, official_candidates)
    
    # Parse data lines
    data_lines = parse_data_lines(text, ac_id)
    if not data_lines:
        return False, "No data lines found"
    
    # Determine column structure
    num_cand_cols, num_trailing = determine_column_structure(data_lines, num_official)
    
    # Build results
    results = {}
    for d in data_lines:
        votes = d['votes']
        
        if len(votes) < num_cand_cols + num_trailing:
            continue
        
        # Extract candidate votes (before trailing columns)
        cand_votes = votes[:num_cand_cols]
        total_valid = votes[num_cand_cols] if len(votes) > num_cand_cols else sum(cand_votes)
        
        # Reorder according to official candidate order
        official_votes = [0] * num_official
        for pdf_col, off_idx in col_mapping.items():
            if pdf_col < len(cand_votes):
                official_votes[off_idx] = cand_votes[pdf_col]
        
        booth_id = f"{ac_id}-{d['booth_no']}"
        results[booth_id] = {
            'votes': official_votes,
            'total': total_valid,
            'rejected': 0
        }
    
    if not results:
        return False, "No valid booths extracted"
    
    # Validate
    totals = [0] * num_official
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_official:
                totals[i] += v
    
    # Calculate average error
    errors = []
    for i, (calc, off) in enumerate(zip(totals, [c['votes'] for c in official_candidates])):
        if off > 0:
            pct = abs(calc - off) / off * 100
            if pct > 15 and off > 500:
                errors.append((official_candidates[i]['name'], calc, off, pct))
    
    # Build output data
    candidates = [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
                  for c in official_candidates]
    
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
    
    # Save
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
            "totalBooths": len(results), "candidates": candidates, "results": results
        }, f, indent=2)
    
    msg = f"{len(results)} booths, {len(col_mapping)}/{len(pdf_candidates)} cols matched"
    if errors:
        msg += f", {len(errors)} errors"
    
    return len(errors) <= 2, msg


def identify_bad_acs() -> List[int]:
    """Identify ACs with significant vote discrepancies."""
    bad = []
    
    official_data = load_official_data()
    
    for ac_dir in os.listdir(OUTPUT_BASE):
        if not ac_dir.startswith('TN-'):
            continue
        
        booth_path = OUTPUT_BASE / ac_dir / "2021.json"
        if not booth_path.exists():
            continue
        
        with open(booth_path) as f:
            booth = json.load(f)
        
        official = official_data.get(ac_dir)
        if not official:
            continue
        
        # Calculate totals
        num_cand = len(booth.get('candidates', []))
        totals = [0] * num_cand
        for r in booth.get('results', {}).values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    totals[i] += v
        
        # Check for significant errors
        for i, (calc, off) in enumerate(zip(totals, [c['votes'] for c in official['candidates']])):
            if off > 1000:  # Significant candidate
                pct = abs(calc - off) / off * 100
                if pct > 20:
                    bad.append(int(ac_dir.replace('TN-', '')))
                    break
    
    return sorted(bad)


def main():
    print("=" * 60)
    print("Tamil Nadu 2021 Booth Data Fixer - v4")
    print("(Using header candidate name matching)")
    print("=" * 60)
    
    official_data = load_official_data()
    print(f"\nLoaded {len(official_data)} constituencies")
    
    bad_acs = identify_bad_acs()
    print(f"Found {len(bad_acs)} ACs with >20% error")
    
    if not bad_acs:
        print("\n✅ All data looks good!")
        return
    
    success = 0
    failed = []
    
    for ac_num in bad_acs:
        ac_id = f"TN-{ac_num:03d}"
        official = official_data.get(ac_id, {})
        ac_name = official.get('constituencyName', ac_id)
        
        ok, msg = process_ac(ac_num, official_data)
        status = "✅" if ok else "⚠️"
        print(f"  {status} [{ac_num:03d}] {ac_name}: {msg}")
        
        if ok:
            success += 1
        else:
            failed.append(ac_num)
    
    print("\n" + "=" * 60)
    print(f"Processed: {success}/{len(bad_acs)} successfully")
    if failed:
        print(f"Issues: {len(failed)} ACs")


if __name__ == "__main__":
    main()
