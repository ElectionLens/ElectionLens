#!/usr/bin/env python3
"""
Final fix for 2021 booth data - handles column mapping and various PDF formats.
"""

import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_text(pdf_path):
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True, timeout=60
    )
    return result.stdout


def parse_all_number_rows(text, min_numbers=8):
    """Extract all rows with enough numbers."""
    rows = []
    for line in text.split('\n'):
        # Clean line
        line = re.sub(r'[,|]', ' ', line)
        numbers = re.findall(r'\b(\d+)\b', line)
        
        if len(numbers) >= min_numbers:
            rows.append([int(n) for n in numbers])
    
    return rows


def find_booth_column(rows):
    """Identify which column contains booth numbers (1-500 range, mostly unique)."""
    if not rows:
        return -1
    
    num_cols = min(5, min(len(r) for r in rows))
    
    best_col = -1
    best_score = 0
    
    for col in range(num_cols):
        values = [r[col] for r in rows if col < len(r)]
        
        # Score: count of values in 1-500 range, penalty for duplicates
        in_range = sum(1 for v in values if 1 <= v <= 500)
        unique = len(set(values))
        score = in_range * unique / len(values) if values else 0
        
        if score > best_score:
            best_score = score
            best_col = col
    
    return best_col


def extract_booths(rows, booth_col, num_candidates):
    """Extract booth data from rows."""
    results = {}
    
    for row in rows:
        if booth_col >= len(row):
            continue
        
        booth_no = row[booth_col]
        if not (1 <= booth_no <= 500):
            continue
        
        # Votes start after booth column
        vote_start = booth_col + 1
        
        # Get candidate votes
        if vote_start + num_candidates > len(row):
            continue
        
        votes = row[vote_start:vote_start + num_candidates]
        
        # Total should be after candidates (or sum)
        total_idx = vote_start + num_candidates
        if total_idx < len(row):
            total = row[total_idx]
            # Verify it's close to sum
            if abs(total - sum(votes)) > 20:
                total = sum(votes)
        else:
            total = sum(votes)
        
        booth_key = str(booth_no)
        if booth_key not in results:
            results[booth_key] = {
                'votes': votes,
                'total': total,
                'rejected': 0
            }
    
    return results


def match_columns_to_official(results, official_candidates):
    """
    Match extracted columns to official candidates by vote totals.
    Returns reordered results.
    """
    if not results:
        return results, False
    
    first_result = next(iter(results.values()))
    num_cols = len(first_result['votes'])
    
    # Sum each column
    col_sums = [0] * num_cols
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cols:
                col_sums[i] += v
    
    # Official totals
    official_totals = [(i, c.get('votes', 0)) for i, c in enumerate(official_candidates)]
    
    # Greedy matching: match each official candidate to closest column
    mapping = {}  # col_idx -> official_idx
    used_cols = set()
    
    # Sort official by votes (highest first) to prioritize top candidates
    for off_idx, off_total in sorted(official_totals, key=lambda x: -x[1]):
        best_col = -1
        best_ratio = 0
        
        for col_idx, col_sum in enumerate(col_sums):
            if col_idx in used_cols:
                continue
            
            if off_total > 0:
                ratio = col_sum / off_total
                # Good match: 0.9-1.1
                if 0.85 <= ratio <= 1.15:
                    if best_col < 0 or abs(ratio - 1.0) < abs(best_ratio - 1.0):
                        best_col = col_idx
                        best_ratio = ratio
        
        if best_col >= 0:
            mapping[best_col] = off_idx
            used_cols.add(best_col)
    
    # Check if top 2 are mapped
    top2_mapped = 0 in mapping.values() and 1 in mapping.values()
    
    if not top2_mapped or len(mapping) < 2:
        return results, False
    
    # Reorder results
    reordered = {}
    for booth_no, result in results.items():
        old_votes = result['votes']
        new_votes = [0] * len(official_candidates)
        
        for col_idx, off_idx in mapping.items():
            if col_idx < len(old_votes) and off_idx < len(new_votes):
                new_votes[off_idx] = old_votes[col_idx]
        
        reordered[booth_no] = {
            'votes': new_votes,
            'total': result['total'],
            'rejected': result['rejected']
        }
    
    return reordered, True


def process_ac(ac_num, official_data):
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return None, "PDF not found"
    
    official = official_data.get(ac_id, {})
    ac_name = official.get('constituencyName', '')
    candidates = official.get('candidates', [])
    num_candidates = len(candidates)
    
    print(f"\n📍 {ac_id} - {ac_name} ({num_candidates} candidates)")
    
    # Extract text
    text = extract_text(pdf_path)
    if not text or len(text) < 500:
        return None, "No text (scanned?)"
    
    # Parse all number rows
    rows = parse_all_number_rows(text, min_numbers=num_candidates + 3)
    print(f"   Found {len(rows)} data rows")
    
    if len(rows) < 10:
        return None, f"Too few rows ({len(rows)})"
    
    # Find booth column
    booth_col = find_booth_column(rows)
    if booth_col < 0:
        return None, "Could not find booth column"
    
    print(f"   Booth column: {booth_col}")
    
    # Extract booth data
    results = extract_booths(rows, booth_col, num_candidates)
    print(f"   Extracted {len(results)} booths")
    
    if len(results) < 10:
        return None, f"Too few booths ({len(results)})"
    
    # Match columns to official
    reordered, success = match_columns_to_official(results, candidates)
    
    if success:
        print(f"   ↻ Columns matched to official")
    
    # Validate
    col_sums = [0] * num_candidates
    for r in reordered.values():
        for i, v in enumerate(r['votes']):
            if i < num_candidates:
                col_sums[i] += v
    
    all_good = True
    for i in range(min(2, len(candidates))):
        oc = candidates[i]
        official_votes = oc.get('votes', 0)
        extracted = col_sums[i]
        ratio = extracted / official_votes if official_votes > 0 else 0
        status = "✓" if 0.95 <= ratio <= 1.05 else "✗"
        if not (0.95 <= ratio <= 1.05):
            all_good = False
        print(f"   {status} {oc.get('party', '?'):8}: {extracted:>8,} / {official_votes:>8,} ({ratio:.2f}x)")
    
    # Convert booth IDs
    final_results = {}
    for booth_no, result in reordered.items():
        booth_id = f"{ac_id}-{booth_no}"
        final_results[booth_id] = result
    
    return final_results, "OK" if all_good else "Partial"


def save_results(ac_id, ac_name, results, candidates):
    """Save results."""
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
        'source': 'Tamil Nadu CEO - Form 20',
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
    print("2021 Final Fix - All Text-based PDFs")
    print("=" * 60)
    
    official = load_official()
    
    # Text-based issue ACs
    TEXT_ACS = [65, 74, 76, 88, 94, 100, 112, 113, 128, 130, 145, 149, 184, 204, 208, 212, 224]
    
    if len(sys.argv) > 1:
        acs = [int(sys.argv[1])]
    else:
        acs = TEXT_ACS
    
    print(f"\n🚀 Processing {len(acs)} ACs...")
    
    success = 0
    partial = 0
    failed = []
    
    for ac_num in acs:
        ac_id = f"TN-{ac_num:03d}"
        official_ac = official.get(ac_id, {})
        
        results, status = process_ac(ac_num, official)
        
        if results and status in ["OK", "Partial"]:
            save_results(ac_id, official_ac.get('constituencyName', ''), results, official_ac.get('candidates', []))
            
            if status == "OK":
                success += 1
            else:
                partial += 1
        else:
            print(f"   ❌ {status}")
            failed.append(ac_num)
    
    print("\n" + "=" * 60)
    print(f"✅ Success: {success}")
    print(f"⚠️ Partial: {partial}")
    print(f"❌ Failed: {len(failed)} - {failed}")


if __name__ == "__main__":
    main()
