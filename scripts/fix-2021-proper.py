#!/usr/bin/env python3
"""
Properly re-extract 2021 booth data, handling candidate order correctly.

The Form 20 PDFs have candidates in ballot paper order (typically alphabetical by party),
while official results are sorted by votes. We need to map columns correctly.
"""

import json
import re
import subprocess
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

# All flagged ACs
ALL_ACS = [22, 63, 64, 65, 66, 68, 72, 74, 76, 88, 112, 113, 137, 141, 184, 196, 224, 
           94, 100, 128, 130, 145, 173, 204, 208, 32, 33, 34, 35, 43, 108]


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_text(pdf_path):
    """Extract text from PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True, timeout=60
    )
    return result.stdout


def parse_header_candidates(text):
    """Try to extract candidate/party order from PDF header."""
    lines = text.split('\n')
    
    # Look for party names in header area (first 100 lines)
    parties_found = []
    party_patterns = [
        r'Dravida Munnetra.*Kazhagam|DMK',
        r'Bharatiya Janata.*Party|BJP',
        r'Indian National Congress|INC|Congress',
        r'All India Anna.*Dravida.*Munnetra|ADMK|AIADMK',
        r'Naam Tamilar.*Katchi|NTK',
        r'Makkal Needhi Maiam|MNM',
        r'Bahujan Samaj.*Party|BSP',
        r'Communist Party.*\(Marxist\)|CPM|CPI\(M\)',
        r'Communist Party of India|CPI[^(]',
        r'Pattali Makkal Katchi|PMK',
        r'Viduthalai Chiruthaigal.*Katchi|VCK',
        r'Desiya Murpokku Dravida|DMDK',
        r'Amma Makkal Munnettra|AMMK',
        r'Independent|IND',
    ]
    
    return parties_found


def parse_booth_rows(text, expected_cols):
    """Parse booth data rows from text."""
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Skip if line doesn't have enough numbers
        numbers = re.findall(r'\b(\d+)\b', line)
        if len(numbers) < expected_cols + 3:  # serial + booth + candidates + totals
            continue
        
        # Try to identify as a data row
        # Format: Serial, Booth, Cand1, Cand2, ..., Total, Rejected, NOTA, GrandTotal, Tendered
        try:
            serial = int(numbers[0])
            if serial > 600:  # Not a valid serial
                continue
            
            # Booth number is second (might have suffix like "A")
            booth_match = re.search(r'\b(\d+)\b\s*(\([A-Z]\))?', line)
            if not booth_match:
                continue
            
            # Find booth pattern more carefully
            # Look for pattern: number followed by optional (A), (B), etc.
            booth_patterns = re.findall(r'\b(\d+)(?:\s*\(([A-Z])\))?', line)
            
            if len(booth_patterns) < 2:
                continue
            
            # Second pattern should be booth number
            booth_no = booth_patterns[1][0]
            if booth_patterns[1][1]:  # Has suffix
                booth_no = f"{booth_no}({booth_patterns[1][1]})"
            
            booth_num = int(booth_patterns[1][0])
            if not (1 <= booth_num <= 500):
                continue
            
            # Extract vote columns - they come after the booth number
            # Find position of booth in numbers array
            booth_idx = -1
            for i, n in enumerate(numbers[1:], 1):
                if n == booth_patterns[1][0]:
                    booth_idx = i
                    break
            
            if booth_idx < 0:
                continue
            
            # Votes start after booth number
            votes_start = booth_idx + 1
            
            # Expected: candidate votes, then Total, Rejected, NOTA, Total, Tendered
            remaining = [int(n) for n in numbers[votes_start:]]
            
            if len(remaining) < expected_cols + 4:
                continue
            
            # Last 4 are: Total, Rejected, NOTA, GrandTotal (ignore Tendered)
            candidate_votes = remaining[:expected_cols]
            total_valid = remaining[expected_cols] if len(remaining) > expected_cols else sum(candidate_votes)
            
            results[booth_no] = {
                'votes': candidate_votes,
                'total': total_valid,
                'rejected': remaining[expected_cols + 1] if len(remaining) > expected_cols + 1 else 0
            }
            
        except (ValueError, IndexError):
            continue
    
    return results


def validate_and_reorder(results, official_candidates, pdf_text):
    """
    Validate results and reorder to match official candidate order.
    
    The tricky part: Form 20 has candidates in ballot order, 
    official results are sorted by votes.
    """
    if not results:
        return results, False
    
    # Get number of columns from first result
    first_result = next(iter(results.values()))
    num_cols = len(first_result['votes'])
    
    # Sum each column
    col_sums = [0] * num_cols
    for r in results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < num_cols:
                col_sums[i] += v
    
    # Try to match columns to official candidates by vote totals
    # Official candidates are sorted by votes (descending)
    official_totals = [c.get('votes', 0) for c in official_candidates]
    
    # Find best mapping: which PDF column maps to which official candidate
    # Use a greedy approach - match columns with closest vote totals
    column_to_official = {}
    used_officials = set()
    
    for col_idx in range(min(num_cols, len(official_totals))):
        col_total = col_sums[col_idx]
        
        # Find closest unused official candidate
        best_match = -1
        best_diff = float('inf')
        
        for off_idx, off_total in enumerate(official_totals):
            if off_idx in used_officials:
                continue
            diff = abs(col_total - off_total)
            # Also consider ratio
            ratio = col_total / off_total if off_total > 0 else 0
            if 0.8 <= ratio <= 1.2:  # Good match
                if diff < best_diff:
                    best_diff = diff
                    best_match = off_idx
        
        if best_match >= 0:
            column_to_official[col_idx] = best_match
            used_officials.add(best_match)
    
    # Check if we have good coverage of top candidates
    top2_matched = 0 in column_to_official.values() and 1 in column_to_official.values()
    
    if not top2_matched:
        # Can't confidently reorder, return as-is
        return results, False
    
    # Reorder results based on mapping
    reordered_results = {}
    for booth_id, result in results.items():
        old_votes = result['votes']
        new_votes = [0] * len(official_candidates)
        
        for col_idx, off_idx in column_to_official.items():
            if col_idx < len(old_votes) and off_idx < len(new_votes):
                new_votes[off_idx] = old_votes[col_idx]
        
        reordered_results[booth_id] = {
            'votes': new_votes,
            'total': result['total'],
            'rejected': result['rejected']
        }
    
    return reordered_results, True


def process_ac(ac_num, official_data):
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return None, None, "PDF not found"
    
    official = official_data.get(ac_id, {})
    ac_name = official.get('constituencyName', '')
    candidates = official.get('candidates', [])
    num_candidates = len(candidates)
    
    print(f"\n📍 {ac_id} - {ac_name}")
    print(f"   {num_candidates} candidates")
    
    # Extract text
    text = extract_text(pdf_path)
    
    if not text or len(text) < 1000:
        return None, candidates, "No text extracted (scanned PDF?)"
    
    # Parse booth rows
    # Try with different expected column counts
    best_results = {}
    
    for try_cols in [num_candidates, num_candidates + 1, num_candidates - 1]:
        if try_cols < 5:
            continue
        results = parse_booth_rows(text, try_cols)
        if len(results) > len(best_results):
            best_results = results
    
    if not best_results:
        return None, candidates, "Could not parse booth data"
    
    print(f"   {len(best_results)} booths extracted")
    
    # Validate and potentially reorder
    final_results, was_reordered = validate_and_reorder(best_results, candidates, text)
    
    if was_reordered:
        print(f"   ↻ Columns reordered to match official")
    
    # Validate
    num_cols = len(candidates)
    col_sums = [0] * num_cols
    for r in final_results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < num_cols:
                col_sums[i] += v
    
    issues = 0
    for i in range(min(2, len(candidates))):
        oc = candidates[i]
        official_votes = oc.get('votes', 0)
        extracted = col_sums[i] if i < num_cols else 0
        ratio = extracted / official_votes if official_votes > 0 else 0
        status = "✓" if 0.9 <= ratio <= 1.1 else "✗"
        if not (0.9 <= ratio <= 1.1):
            issues += 1
        print(f"   {status} {oc.get('party', '?'):8}: {extracted:>8,} / {official_votes:>8,} ({ratio:.2f}x)")
    
    # Convert booth IDs to proper format
    formatted_results = {}
    for booth_no, result in final_results.items():
        booth_id = f"{ac_id}-{booth_no}"
        formatted_results[booth_id] = result
    
    return formatted_results, candidates, "OK" if issues == 0 else "Partial"


def save_results(ac_id, ac_name, results, candidates):
    """Save results to JSON."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cands_out = []
    for i, c in enumerate(candidates):
        cands_out.append({
            'slNo': i + 1,
            'name': c.get('name', f'Candidate {i+1}'),
            'party': c.get('party', 'IND'),
            'symbol': c.get('symbol', '')
        })
    
    output = {
        'acId': ac_id,
        'acName': ac_name,
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(results),
        'source': 'Tamil Nadu CEO - Form 20 (Re-extracted)',
        'candidates': cands_out,
        'results': results
    }
    
    output_file = output_dir / '2021.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    return output_file


def main():
    import sys
    
    print("=" * 60)
    print("2021 Booth Data Fix - Proper Extraction")
    print("=" * 60)
    
    official = load_official()
    
    if len(sys.argv) > 1:
        acs = [int(sys.argv[1])]
    else:
        acs = ALL_ACS
    
    print(f"\n🚀 Processing {len(acs)} ACs...")
    
    success = 0
    partial = 0
    failed = []
    
    for ac_num in acs:
        ac_id = f"TN-{ac_num:03d}"
        official_ac = official.get(ac_id, {})
        
        results, candidates, status = process_ac(ac_num, official)
        
        if results and status in ["OK", "Partial"]:
            save_results(ac_id, official_ac.get('constituencyName', ''), results, candidates)
            
            if status == "OK":
                success += 1
            else:
                partial += 1
        else:
            print(f"   ❌ {status}")
            failed.append(ac_num)
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ Success: {success}")
    print(f"⚠️ Partial: {partial}")
    print(f"❌ Failed: {len(failed)} - {failed}")


if __name__ == "__main__":
    main()
