#!/usr/bin/env python3
"""
Extract booth data from transposed format PDFs - Fixed version.

The transposed format has:
- Multiple pages, each showing ~7 booths (columns)
- Each candidate row has: vote1 vote2 ... voteN candidate_idx [party] candidate_name
- We need to accumulate votes across all pages per candidate

Key fix: Track votes per (booth_id, pdf_candidate_idx) pair, then aggregate.
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


def normalize_name(name: str) -> str:
    """Normalize candidate name for matching."""
    name = name.upper()
    name = re.sub(r'[^A-Z\s]', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()


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
    
    # Track votes: candidate_idx -> {booth_id: votes}
    candidate_votes = defaultdict(dict)
    candidate_names = {}  # candidate_idx -> name string from first occurrence
    
    current_booth_ids = []
    all_booth_ids = set()
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        
        # Detect Polling Station No row (has booth IDs)
        if 'Polling Station' in stripped or 'Station No' in stripped:
            parts = re.findall(r'\b(\d+[A-Z]?)\b', stripped)
            if len(parts) >= 3:
                # Remove the row index (typically "2" at the end)
                if parts[-1] in ['2', '1']:
                    parts = parts[:-1]
                current_booth_ids = parts
                all_booth_ids.update(parts)
            continue
        
        # Skip non-data rows
        skip_patterns = ['SL. NO', 'FORM 20', 'GENERAL ELECTION', 'ASSEMBLY CONSTITUENCY',
                        'No. of Electors', 'Total of valid', 'rejected', 'NOTA', 
                        'tendered', 'Total', 'Page ']
        if any(x.lower() in stripped.lower() for x in skip_patterns):
            continue
        
        # Parse candidate data row
        nums = re.findall(r'\b(\d+)\b', stripped)
        
        if len(nums) >= len(current_booth_ids) + 1 and len(current_booth_ids) >= 5:
            # Check if this could be a candidate row
            # The candidate index should be after the booth votes
            possible_idx = int(nums[len(current_booth_ids)])
            
            # Valid candidate indices are 3-16 typically (row 3 = first candidate)
            if 3 <= possible_idx <= num_candidates + 5:
                votes = [int(nums[i]) for i in range(len(current_booth_ids))]
                
                # Store votes for each booth
                for i, booth_id in enumerate(current_booth_ids):
                    candidate_votes[possible_idx][booth_id] = votes[i]
                
                # Extract candidate name (if not already stored)
                if possible_idx not in candidate_names:
                    text_part = stripped
                    # Remove all numbers
                    for n in nums[:len(current_booth_ids)+1]:
                        text_part = text_part.replace(n, '', 1)
                    text_part = re.sub(r'\s+', ' ', text_part).strip()
                    candidate_names[possible_idx] = text_part
    
    return candidate_votes, candidate_names, sorted(all_booth_ids, 
        key=lambda x: (int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0, x))


def match_candidates(candidate_names: dict, official_candidates: list):
    """Match PDF candidates to official candidates by name."""
    mapping = {}  # pdf_idx -> official_idx
    used_official = set()
    
    for pdf_idx in sorted(candidate_names.keys()):
        pdf_name = normalize_name(candidate_names[pdf_idx])
        if not pdf_name:
            continue
        
        best_match = -1
        best_score = 0
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official:
                continue
            
            off_name = normalize_name(off_cand['name'])
            
            # Score by word overlap
            pdf_words = set(pdf_name.split())
            off_words = set(off_name.split())
            
            if len(pdf_words) == 0 or len(off_words) == 0:
                continue
            
            common = len(pdf_words & off_words)
            score = common / max(len(pdf_words), len(off_words))
            
            # Boost score if party matches
            if off_cand['party'].upper() in candidate_names[pdf_idx].upper():
                score += 0.3
            
            if score > best_score:
                best_score = score
                best_match = off_idx
        
        if best_score >= 0.3 and best_match >= 0:
            mapping[pdf_idx] = best_match
            used_official.add(best_match)
    
    return mapping


def build_results(candidate_votes: dict, mapping: dict, booth_ids: list, 
                  num_candidates: int, ac_id: str):
    """Build results dictionary."""
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
    
    return results


def validate_and_save(results: dict, ac_id: str, official_data: dict):
    """Validate and save results."""
    if not results:
        return False, 100
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    ac_name = official.get('constituencyName', ac_id)
    
    # Calculate totals
    col_totals = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    # Check errors
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
    
    if avg_error > 30:
        return False, avg_error
    
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
    
    result = parse_transposed_pdf(pdf_path, num_candidates)
    if result[0] is None:
        print(f"  Failed to parse")
        return False
    
    candidate_votes, candidate_names, booth_ids = result
    
    print(f"  Found {len(booth_ids)} booths, {len(candidate_names)} candidate rows")
    
    # Match candidates
    mapping = match_candidates(candidate_names, official['candidates'])
    print(f"  Matched {len(mapping)}/{num_candidates} candidates")
    
    # Debug: Show mapping
    for pdf_idx, off_idx in sorted(mapping.items())[:5]:
        print(f"    PDF {pdf_idx} -> Off {off_idx}: {candidate_names.get(pdf_idx, '')[:40]} -> {official['candidates'][off_idx]['name']}")
    
    # Build results
    results = build_results(candidate_votes, mapping, booth_ids, num_candidates, ac_id)
    
    if not results:
        print(f"  No results built")
        return False
    
    success, error = validate_and_save(results, ac_id, official_data)
    
    if success:
        print(f"  ✅ Saved {len(results)} booths ({error:.1f}% avg error)")
    else:
        print(f"  ❌ Error too high ({error:.1f}%)")
    
    return success


def main():
    official_data = load_official_data()
    
    # Test with one AC first
    transposed_acs = ['TN-071']
    
    print("Testing transposed format extraction...\n")
    
    for ac_id in transposed_acs:
        name = official_data.get(ac_id, {}).get('constituencyName', ac_id)
        print(f"\n{'='*50}")
        print(f"{ac_id} {name}")
        print('='*50)
        process_ac(ac_id, official_data)


if __name__ == "__main__":
    main()
