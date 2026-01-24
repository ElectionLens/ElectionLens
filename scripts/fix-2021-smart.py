#!/usr/bin/env python3
"""
Smart 2021 extraction using discovered column mappings.
"""

import json
import re
import subprocess
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_text(pdf_path):
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], capture_output=True, text=True, timeout=60)
    return result.stdout


def get_data_rows(text):
    """Extract booth data rows."""
    rows = []
    for line in text.split('\n'):
        # Skip headers
        if any(x in line.lower() for x in ['polling', 'station', 'sl.no', 'candidate', 'serial']):
            continue
        
        numbers = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
        if len(numbers) >= 5:
            rows.append(numbers)
    
    return rows


def find_column_mapping(rows, official_candidates):
    """Find which PDF columns map to which official candidates."""
    if not rows:
        return {}
    
    max_cols = max(len(r) for r in rows)
    
    # Sum each column
    col_sums = [0] * max_cols
    for r in rows:
        for i, v in enumerate(r):
            col_sums[i] += v
    
    # Official totals
    official_totals = [c.get('votes', 0) for c in official_candidates]
    
    # Find best match for each official candidate
    mapping = {}  # pdf_col -> official_idx
    used_cols = set()
    
    # Match in order of official vote count (highest first)
    sorted_officials = sorted(enumerate(official_totals), key=lambda x: -x[1])
    
    for off_idx, off_total in sorted_officials:
        if off_total < 100:  # Skip very small candidates
            continue
        
        best_col = -1
        best_score = float('inf')
        
        for col_idx, col_sum in enumerate(col_sums):
            if col_idx in used_cols:
                continue
            if col_sum < 100:  # Skip empty columns
                continue
            
            ratio = col_sum / off_total if off_total > 0 else 0
            
            # Accept if within 10%
            if 0.9 <= ratio <= 1.1:
                score = abs(ratio - 1.0)
                if score < best_score:
                    best_score = score
                    best_col = col_idx
        
        if best_col >= 0:
            mapping[best_col] = off_idx
            used_cols.add(best_col)
    
    return mapping, col_sums


def extract_booth_data(rows, mapping, num_candidates):
    """Extract booth data using the mapping."""
    results = {}
    
    # Find booth column (should be 1-500 range, sequential)
    # Usually column 0, 1, or 2
    booth_col = -1
    for col in range(min(4, len(rows[0]) if rows else 0)):
        values = [r[col] for r in rows if col < len(r)]
        # Check if values are in booth range and mostly unique
        in_range = sum(1 for v in values if 1 <= v <= 500)
        unique = len(set(values))
        if in_range > len(values) * 0.8 and unique > len(values) * 0.7:
            booth_col = col
            break
    
    if booth_col < 0:
        booth_col = 1  # Default to column 1
    
    for row in rows:
        if booth_col >= len(row):
            continue
        
        booth_no = row[booth_col]
        if not (1 <= booth_no <= 500):
            continue
        
        booth_key = str(booth_no)
        if booth_key in results:
            continue
        
        # Build votes array in official order
        votes = [0] * num_candidates
        for pdf_col, off_idx in mapping.items():
            if pdf_col < len(row) and off_idx < num_candidates:
                votes[off_idx] = row[pdf_col]
        
        total = sum(votes)
        if total > 0:
            results[booth_key] = {
                'votes': votes,
                'total': total,
                'rejected': 0
            }
    
    return results


def process_ac(ac_num, official_data):
    """Process single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return None, "PDF not found"
    
    official = official_data.get(ac_id, {})
    ac_name = official.get('constituencyName', '')
    candidates = official.get('candidates', [])
    
    print(f"\n📍 {ac_id} - {ac_name}")
    
    text = extract_text(pdf_path)
    rows = get_data_rows(text)
    print(f"   {len(rows)} data rows found")
    
    if len(rows) < 50:
        return None, "Too few rows"
    
    # Find column mapping
    mapping, col_sums = find_column_mapping(rows, candidates)
    print(f"   Mapped {len(mapping)} columns")
    
    if len(mapping) < 2:
        return None, "Could not map columns"
    
    # Extract booth data
    results = extract_booth_data(rows, mapping, len(candidates))
    print(f"   {len(results)} booths extracted")
    
    if len(results) < 50:
        return None, "Too few booths"
    
    # Validate
    col_sums_new = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums_new):
                col_sums_new[i] += v
    
    all_good = True
    for i in range(min(2, len(candidates))):
        oc = candidates[i]
        official_votes = oc.get('votes', 0)
        extracted = col_sums_new[i]
        ratio = extracted / official_votes if official_votes > 0 else 0
        status = "✓" if 0.95 <= ratio <= 1.05 else "✗"
        if not (0.95 <= ratio <= 1.05):
            all_good = False
        print(f"   {status} {oc.get('party', '?'):8}: {extracted:>8,} / {official_votes:>8,} ({ratio:.2f}x)")
    
    # Add AC prefix to booth IDs
    final_results = {f"{ac_id}-{k}": v for k, v in results.items()}
    
    return final_results, "OK" if all_good else "Partial"


def save_results(ac_id, ac_name, results, candidates):
    """Save results."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cands_out = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND'),
        'symbol': c.get('symbol', '')
    } for i, c in enumerate(candidates)]
    
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
    
    with open(output_dir / '2021.json', 'w') as f:
        json.dump(output, f, indent=2)


def main():
    import sys
    
    official = load_official()
    
    # ACs to fix
    FIX_ACS = [74, 76, 88, 94, 100, 112, 113, 130, 145, 149, 184, 224]
    
    if len(sys.argv) > 1:
        FIX_ACS = [int(sys.argv[1])]
    
    print(f"Processing {len(FIX_ACS)} ACs...")
    
    success = 0
    partial = 0
    failed = []
    
    for ac_num in FIX_ACS:
        ac_id = f"TN-{ac_num:03d}"
        off = official.get(ac_id, {})
        
        results, status = process_ac(ac_num, official)
        
        if results:
            save_results(ac_id, off.get('constituencyName', ''), results, off.get('candidates', []))
            if status == "OK":
                success += 1
            else:
                partial += 1
        else:
            print(f"   ❌ {status}")
            failed.append(ac_num)
    
    print(f"\n✅ Success: {success}")
    print(f"⚠️ Partial: {partial}")  
    print(f"❌ Failed: {len(failed)}")


if __name__ == "__main__":
    main()
