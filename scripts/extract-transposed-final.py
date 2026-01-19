#!/usr/bin/env python3
"""
Extract booth data from transposed format PDFs (Villupuram district style).

Key insights:
1. Each page shows ~7-10 booths (columns) x all candidates (rows)
2. Row 1: Column indices (7 6 5 4 3 2 1 + "SL.NO.")
3. Row 2: Polling Station Numbers (actual booth IDs)
4. Rows 3-N: Candidate votes + row index + party/name
5. PDF candidate order != official order (PDF uses ballot order)

We need to:
1. Parse all pages to collect booth IDs and votes
2. Match PDF candidates to official candidates by name
3. Reorder votes to match official candidate order
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


def parse_transposed_pdf(pdf_path: Path, num_candidates: int, ac_id: str):
    """Parse transposed format PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None, None
    
    text = result.stdout
    lines = text.split('\n')
    
    # Data structures
    all_booth_ids = []  # All booth IDs across all pages
    candidate_data = {}  # candidate_idx -> {name, party, votes: []}
    
    current_booth_ids = []
    current_page_booths = []
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        
        # Detect page boundary
        if 'SL. NO' in stripped.upper() and len(current_page_booths) > 0:
            # New page - save current booth IDs
            all_booth_ids.extend(current_page_booths)
            current_page_booths = []
            current_booth_ids = []
        
        # Detect Polling Station No row
        if 'Polling Station' in stripped or 'Station No' in stripped:
            # Extract booth IDs
            parts = re.findall(r'\b(\d+[A-Z]?)\b', stripped)
            if len(parts) >= 3:
                # Last number is usually the row index (2), remove it
                booth_ids = parts[:-1] if parts[-1] == '2' else parts
                current_booth_ids = booth_ids  # Left to right as they appear
                current_page_booths = booth_ids[:]
            continue
        
        # Skip header/footer lines
        if any(x in stripped.upper() for x in ['SL. NO', 'FORM 20', 'GENERAL ELECTION', 
                                                 'ASSEMBLY CONSTITUENCY', 'No. of Electors']):
            continue
        
        # Parse data rows
        # Format: votes... candidate_idx [party] [candidate_name]
        nums = re.findall(r'\b(\d+)\b', stripped)
        
        if len(nums) >= len(current_booth_ids) + 1 and len(current_booth_ids) > 0:
            # Check if last number is a candidate index (typically 3-20)
            possible_idx = int(nums[len(current_booth_ids)])
            
            if 3 <= possible_idx <= 25:
                # This is a candidate row
                votes = [int(nums[i]) for i in range(len(current_booth_ids))]
                
                # Extract party/name from the text after numbers
                text_part = stripped
                for n in nums[:len(current_booth_ids)+1]:
                    text_part = text_part.replace(n, '', 1)
                text_part = re.sub(r'\s+', ' ', text_part).strip()
                
                if possible_idx not in candidate_data:
                    candidate_data[possible_idx] = {
                        'name': text_part,
                        'votes': {}
                    }
                
                # Store votes by booth ID
                for i, booth_id in enumerate(current_booth_ids):
                    if booth_id not in candidate_data[possible_idx]['votes']:
                        candidate_data[possible_idx]['votes'][booth_id] = votes[i]
    
    # Add last page's booths
    if current_page_booths:
        all_booth_ids.extend(current_page_booths)
    
    # Deduplicate booth IDs while preserving order
    seen = set()
    unique_booth_ids = []
    for b in all_booth_ids:
        if b not in seen:
            seen.add(b)
            unique_booth_ids.append(b)
    
    return unique_booth_ids, candidate_data


def match_candidates(candidate_data: dict, official_candidates: list):
    """Match PDF candidates to official candidates by name."""
    # Build mapping from PDF candidate index to official index
    mapping = {}
    
    for pdf_idx, pdf_data in candidate_data.items():
        pdf_name = normalize_name(pdf_data['name'])
        
        best_match = -1
        best_score = 0
        
        for off_idx, off_cand in enumerate(official_candidates):
            off_name = normalize_name(off_cand['name'])
            
            # Calculate match score
            pdf_words = set(pdf_name.split())
            off_words = set(off_name.split())
            
            if len(pdf_words) == 0 or len(off_words) == 0:
                continue
            
            common = len(pdf_words & off_words)
            score = common / max(len(pdf_words), len(off_words))
            
            if score > best_score:
                best_score = score
                best_match = off_idx
        
        if best_score >= 0.5:
            mapping[pdf_idx] = best_match
    
    return mapping


def build_results(booth_ids: list, candidate_data: dict, mapping: dict, 
                  num_candidates: int, ac_id: str):
    """Build results dict with votes in official candidate order."""
    results = {}
    
    for booth_id in booth_ids:
        votes = [0] * num_candidates
        
        for pdf_idx, off_idx in mapping.items():
            if pdf_idx in candidate_data:
                v = candidate_data[pdf_idx]['votes'].get(booth_id, 0)
                if off_idx < num_candidates:
                    votes[off_idx] = v
        
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
            status = "✓" if pct < 5 else "✗"
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
    
    booth_ids, candidate_data = parse_transposed_pdf(pdf_path, num_candidates, ac_id)
    
    if not booth_ids or not candidate_data:
        print(f"  Failed to parse")
        return False
    
    print(f"  Found {len(booth_ids)} booths, {len(candidate_data)} candidates in PDF")
    
    # Match candidates
    mapping = match_candidates(candidate_data, official['candidates'])
    print(f"  Matched {len(mapping)}/{num_candidates} candidates")
    
    # Build results
    results = build_results(booth_ids, candidate_data, mapping, num_candidates, ac_id)
    
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
    
    # Transposed format ACs
    transposed_acs = ['TN-071', 'TN-072', 'TN-074', 'TN-075', 'TN-076', 'TN-159']
    
    print("Processing transposed format ACs...\n")
    
    success_count = 0
    for ac_id in transposed_acs:
        name = official_data.get(ac_id, {}).get('constituencyName', ac_id)
        print(f"\n{'='*50}")
        print(f"{ac_id} {name}")
        print('='*50)
        if process_ac(ac_id, official_data):
            success_count += 1
    
    print(f"\n\nSuccess: {success_count}/{len(transposed_acs)}")


if __name__ == "__main__":
    main()
