#!/usr/bin/env python3
"""
Extract transposed format - systematic page-by-page approach.

Strategy:
1. Split by page markers
2. For each page, extract booth IDs from "Polling Station No" line
3. For each page, extract all candidate vote rows
4. Aggregate votes across pages
5. Use vote totals to match PDF order to official order
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


def parse_page(lines: list, page_num: int):
    """Parse a single page of transposed data."""
    booth_ids = []
    candidate_rows = {}  # candidate_idx -> list of votes
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if not line:
            i += 1
            continue
        
        # Find Polling Station No line
        if 'Polling Station' in line or 'Station No' in line:
            # Booth IDs might be on this line or the next
            parts = re.findall(r'\b(\d+[A-Z]?)\b', line)
            # Filter out likely row indices (1, 2)
            booth_ids = [p for p in parts if not (p.isdigit() and int(p) <= 2)]
            
            # Check next lines if not enough
            if len(booth_ids) < 5:
                for j in range(1, 3):
                    if i + j < len(lines):
                        next_line = lines[i + j].strip()
                        if not next_line:
                            continue
                        # Skip if it contains party/candidate keywords
                        if any(x in next_line.upper() for x in ['PARTY', 'INDEPENDENT', 'KAZHAGAM']):
                            continue
                        more_parts = re.findall(r'\b(\d+[A-Z]?)\b', next_line)
                        more_booth_ids = [p for p in more_parts if not (p.isdigit() and int(p) <= 2)]
                        if len(more_booth_ids) >= 5:
                            booth_ids = more_booth_ids
                            break
            i += 1
            continue
        
        # Skip meta rows
        skip = ['SL. NO', 'FORM 20', 'GENERAL', 'ASSEMBLY', 'Electors', 
                'Total of valid', 'rejected', 'NOTA', 'tendered', 'Total']
        if any(x.lower() in line.lower() for x in skip):
            i += 1
            continue
        
        # Parse candidate vote rows
        nums = re.findall(r'\b(\d+)\b', line)
        
        # A valid candidate row has: N votes + candidate_idx
        if len(booth_ids) >= 5 and len(nums) >= len(booth_ids) + 1:
            votes = [int(nums[j]) for j in range(len(booth_ids))]
            cand_idx = int(nums[len(booth_ids)])
            
            if 3 <= cand_idx <= 25:
                # Store votes for this candidate row
                if cand_idx not in candidate_rows:
                    candidate_rows[cand_idx] = {}
                
                for j, booth_id in enumerate(booth_ids):
                    candidate_rows[cand_idx][booth_id] = votes[j]
        
        i += 1
    
    return booth_ids, candidate_rows


def parse_transposed_pdf(pdf_path: Path, num_candidates: int):
    """Parse entire transposed PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None, None
    
    text = result.stdout
    
    # Split by page markers
    pages = re.split(r'Page \d+ of \d+', text)
    
    all_booth_ids = set()
    all_candidate_votes = defaultdict(dict)  # cand_idx -> {booth_id: votes}
    
    for page_num, page_text in enumerate(pages):
        lines = page_text.split('\n')
        booth_ids, candidate_rows = parse_page(lines, page_num)
        
        if booth_ids:
            all_booth_ids.update(booth_ids)
        
        for cand_idx, booth_votes in candidate_rows.items():
            for booth_id, votes in booth_votes.items():
                all_candidate_votes[cand_idx][booth_id] = votes
    
    return all_candidate_votes, sorted(all_booth_ids, 
        key=lambda x: (int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0, x))


def match_by_vote_totals(candidate_votes: dict, official_candidates: list):
    """Match PDF candidates to official by vote totals."""
    # Calculate total votes per PDF candidate
    pdf_totals = {}
    for cand_idx, booth_votes in candidate_votes.items():
        pdf_totals[cand_idx] = sum(booth_votes.values())
    
    # Official totals (excluding NOTA)
    official_totals = [(i, c['votes'], c['name']) for i, c in enumerate(official_candidates) 
                       if c['party'] != 'NOTA']
    
    # Sort both by votes descending
    pdf_sorted = sorted(pdf_totals.items(), key=lambda x: x[1], reverse=True)
    official_sorted = sorted(official_totals, key=lambda x: x[1], reverse=True)
    
    print(f"  PDF totals (top 5):")
    for idx, total in pdf_sorted[:5]:
        print(f"    PDF {idx}: {total:,}")
    
    print(f"  Official totals (top 5):")
    for idx, total, name in official_sorted[:5]:
        print(f"    Off {idx}: {total:,} ({name})")
    
    # Match by vote total similarity
    mapping = {}
    used_official = set()
    
    for pdf_idx, pdf_total in pdf_sorted:
        best_match = -1
        best_diff = float('inf')
        
        for off_idx, off_total, name in official_sorted:
            if off_idx in used_official:
                continue
            
            diff = abs(pdf_total - off_total)
            if diff < best_diff:
                best_diff = diff
                best_match = off_idx
        
        if best_match >= 0:
            # Only match if within 20% of expected
            pct_diff = best_diff / official_candidates[best_match]['votes'] * 100 if official_candidates[best_match]['votes'] > 0 else 100
            if pct_diff < 30:
                mapping[pdf_idx] = best_match
                used_official.add(best_match)
    
    return mapping


def build_and_validate(candidate_votes: dict, mapping: dict, booth_ids: list, 
                       official: dict, ac_id: str):
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
    
    # Validate
    col_totals = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    errors = []
    print(f"  Validation:")
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
    
    # Save
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    booth_list = []
    for booth_id in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x.split('-')[-1]).group()) if re.search(r'\d+', x.split('-')[-1]) else 0, x)):
        booth_no = booth_id.split('-')[-1]
        booth_list.append({
            "id": booth_id, "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "regular", "name": f"Booth {booth_no}",
            "address": f"{ac_name} - Booth {booth_no}", "area": ac_name
        })
    
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
        print(f"  No PDF found")
        return False
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    
    candidate_votes, booth_ids = parse_transposed_pdf(pdf_path, num_candidates)
    
    if not candidate_votes or not booth_ids:
        print(f"  Failed to parse")
        return False
    
    print(f"  Found {len(booth_ids)} booths, {len(candidate_votes)} candidate rows")
    
    # Match by vote totals
    mapping = match_by_vote_totals(candidate_votes, official['candidates'])
    print(f"  Matched {len(mapping)}/{num_candidates} candidates")
    
    results, error = build_and_validate(candidate_votes, mapping, booth_ids, official, ac_id)
    
    if results:
        print(f"  ✅ Saved {len(results)} booths ({error:.1f}% avg error)")
        return True
    else:
        print(f"  ❌ Error too high ({error:.1f}%)")
        return False


def main():
    official_data = load_official_data()
    
    # Test
    ac_id = 'TN-071'
    name = official_data.get(ac_id, {}).get('constituencyName', ac_id)
    print(f"\n{'='*50}")
    print(f"{ac_id} {name}")
    print('='*50)
    process_ac(ac_id, official_data)


if __name__ == "__main__":
    main()
