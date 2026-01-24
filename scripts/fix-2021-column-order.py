#!/usr/bin/env python3
"""
Fix 2021 booth data by correctly mapping PDF column order to official candidate order.
PDF columns are in ballot paper order, official results are sorted by votes.
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
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], 
                          capture_output=True, text=True, timeout=60)
    return result.stdout


def find_column_to_candidate_mapping(text, official_candidates):
    """
    Find mapping from PDF column index to official candidate index.
    PDF columns are in ballot order, officials are sorted by votes.
    """
    # Extract all rows with numeric data
    data_rows = []
    for line in text.split('\n'):
        nums = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
        if len(nums) >= 5:
            data_rows.append(nums)
    
    if not data_rows:
        return None
    
    # Sum each column
    max_cols = max(len(r) for r in data_rows)
    col_sums = [0] * max_cols
    for r in data_rows:
        for i, v in enumerate(r):
            col_sums[i] += v
    
    # Try to match each column sum to an official candidate's total
    # Official candidates are sorted by votes (descending)
    mapping = {}  # pdf_col -> official_idx
    
    # For each official candidate, find the best matching column
    used_cols = set()
    official_totals = [(i, c.get('votes', 0)) for i, c in enumerate(official_candidates)]
    
    for off_idx, off_total in official_totals:
        if off_total < 50:
            continue
        
        best_col = -1
        best_diff = float('inf')
        
        for col_idx, col_sum in enumerate(col_sums):
            if col_idx in used_cols:
                continue
            if col_sum < 50:
                continue
            
            # Check if this column matches
            diff = abs(col_sum - off_total)
            ratio = col_sum / off_total if off_total > 0 else 0
            
            # Accept if within 15%
            if 0.85 <= ratio <= 1.15 and diff < best_diff:
                best_diff = diff
                best_col = col_idx
        
        if best_col >= 0:
            mapping[best_col] = off_idx
            used_cols.add(best_col)
    
    return mapping, col_sums, data_rows


def extract_booth_data(data_rows, mapping, num_candidates):
    """Extract booth data using the column mapping."""
    results = {}
    
    # Find booth column (usually col 1 or 2, values 1-500)
    booth_col = 1  # Default
    for col in range(min(3, len(data_rows[0]) if data_rows else 0)):
        values = [r[col] for r in data_rows if col < len(r)]
        in_range = sum(1 for v in values if 1 <= v <= 500)
        unique = len(set(v for v in values if 1 <= v <= 500))
        if in_range > len(values) * 0.5 and unique > 50:
            booth_col = col
            break
    
    for row in data_rows:
        if booth_col >= len(row):
            continue
        
        booth_no = row[booth_col]
        if not (1 <= booth_no <= 500):
            continue
        
        booth_key = str(booth_no)
        if booth_key in results:
            continue
        
        # Build votes array in OFFICIAL order
        votes = [0] * num_candidates
        for pdf_col, off_idx in mapping.items():
            if pdf_col < len(row) and off_idx < num_candidates:
                votes[off_idx] = row[pdf_col]
        
        total = sum(votes)
        if total > 50:  # Minimum votes per booth
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
    
    result = find_column_to_candidate_mapping(text, candidates)
    if not result:
        return None, "Could not parse columns"
    
    mapping, col_sums, data_rows = result
    
    print(f"   {len(data_rows)} data rows, {len(mapping)} columns mapped")
    
    # Show mapping for top candidates
    for off_idx in range(min(5, len(candidates))):
        party = candidates[off_idx].get('party', '?')
        off_total = candidates[off_idx].get('votes', 0)
        # Find which PDF column maps to this candidate
        pdf_col = next((c for c, o in mapping.items() if o == off_idx), None)
        if pdf_col is not None:
            ratio = col_sums[pdf_col] / off_total if off_total > 0 else 0
            print(f"   {party:8} ← Col {pdf_col:2} ({ratio:.2f}x)")
        else:
            print(f"   {party:8} ← NOT FOUND")
    
    if len(mapping) < 2:
        return None, "Could not map enough columns"
    
    results = extract_booth_data(data_rows, mapping, len(candidates))
    print(f"   {len(results)} booths extracted")
    
    if len(results) < 50:
        return None, f"Too few booths ({len(results)})"
    
    # Validate
    col_sums_new = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums_new):
                col_sums_new[i] += v
    
    all_good = True
    for i in range(min(2, len(candidates))):
        off_total = candidates[i].get('votes', 0)
        extracted = col_sums_new[i]
        ratio = extracted / off_total if off_total > 0 else 0
        status = "✓" if 0.95 <= ratio <= 1.05 else "✗"
        if not (0.95 <= ratio <= 1.05):
            all_good = False
        print(f"   {status} {candidates[i].get('party'):8}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
    # Add AC prefix
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
    
    # ACs with column mapping issues
    FIX_ACS = [74, 100, 112, 130, 149, 184, 224]
    
    if len(sys.argv) > 1:
        FIX_ACS = [int(sys.argv[1])]
    
    print(f"Fixing column mapping for {len(FIX_ACS)} ACs...")
    
    success = partial = 0
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
    
    print(f"\n✅ {success} | ⚠️ {partial} | ❌ {len(failed)}")
    if failed:
        print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
