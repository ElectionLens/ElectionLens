#!/usr/bin/env python3
"""
Fix 2021 booth data - handle adjacent columns for similar-vote candidates.
Maps consecutive PDF columns to official candidates by matching totals.
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


def parse_pdf(text, official_candidates):
    """Parse PDF and find column mapping."""
    # Extract data rows
    data_rows = []
    for line in text.split('\n'):
        nums = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
        if len(nums) >= 5:
            data_rows.append(nums)
    
    if not data_rows:
        return None, None, None
    
    # Find booth column (col 1 usually, sequential 1-500)
    booth_col = 1
    for col in [1, 0, 2]:
        if col >= len(data_rows[0]):
            continue
        values = [r[col] for r in data_rows if col < len(r)]
        in_range = sum(1 for v in values if 1 <= v <= 500)
        unique = len(set(v for v in values if 1 <= v <= 500))
        if in_range > len(values) * 0.7 and unique > 50:
            booth_col = col
            break
    
    # First vote column is typically booth_col + 1
    first_vote_col = booth_col + 1
    
    # Sum columns starting from first_vote_col
    max_cols = max(len(r) for r in data_rows)
    col_sums = []
    for c in range(first_vote_col, min(max_cols, first_vote_col + 25)):
        total = sum(r[c] for r in data_rows if c < len(r))
        col_sums.append((c, total))
    
    # Official totals sorted by ballot order (we need to figure this out)
    # Try matching consecutive columns to candidates
    mapping = {}  # pdf_col -> official_idx
    
    # Sort candidates by votes to create vote-sorted list
    off_sorted = sorted(enumerate(official_candidates), 
                       key=lambda x: x[1].get('votes', 0), reverse=True)
    
    # Try to find each candidate's column
    used_cols = set()
    for off_idx, cand in off_sorted:
        off_total = cand.get('votes', 0)
        if off_total < 50:
            continue
        
        best_col = -1
        best_ratio = 0
        
        for pdf_col, col_sum in col_sums:
            if pdf_col in used_cols:
                continue
            if col_sum < 50:
                continue
            
            ratio = col_sum / off_total if off_total > 0 else 0
            
            # Accept if within 20% (relaxed for similar-value candidates)
            if 0.80 <= ratio <= 1.20:
                if best_col < 0 or abs(ratio - 1.0) < abs(best_ratio - 1.0):
                    best_ratio = ratio
                    best_col = pdf_col
        
        if best_col >= 0:
            mapping[best_col] = off_idx
            used_cols.add(best_col)
    
    return mapping, col_sums, data_rows, booth_col


def extract_booth_data(data_rows, mapping, booth_col, num_candidates):
    """Extract booth data."""
    results = {}
    
    for row in data_rows:
        if booth_col >= len(row):
            continue
        
        booth_no = row[booth_col]
        if not (1 <= booth_no <= 500):
            continue
        
        booth_key = str(booth_no)
        if booth_key in results:
            continue
        
        # Build votes in official order
        votes = [0] * num_candidates
        for pdf_col, off_idx in mapping.items():
            if pdf_col < len(row) and off_idx < num_candidates:
                votes[off_idx] = row[pdf_col]
        
        total = sum(votes)
        if total > 50:
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
    
    result = parse_pdf(text, candidates)
    if not result or result[0] is None:
        return None, "Could not parse"
    
    mapping, col_sums, data_rows, booth_col = result
    
    print(f"   {len(data_rows)} rows, {len(mapping)} mapped, booth_col={booth_col}")
    
    # Show mapping
    for off_idx in range(min(5, len(candidates))):
        party = candidates[off_idx].get('party', '?')
        off_total = candidates[off_idx].get('votes', 0)
        pdf_col = next((c for c, o in mapping.items() if o == off_idx), None)
        if pdf_col is not None:
            col_sum = next((s for c, s in col_sums if c == pdf_col), 0)
            ratio = col_sum / off_total if off_total > 0 else 0
            print(f"   {party:12} ← Col {pdf_col:2} ({ratio:.2f}x)")
        else:
            print(f"   {party:12} ← NOT FOUND")
    
    if len(mapping) < 2:
        return None, "Not enough columns mapped"
    
    results = extract_booth_data(data_rows, mapping, booth_col, len(candidates))
    print(f"   {len(results)} booths")
    
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
        print(f"   {status} {candidates[i].get('party'):12}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
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
    
    FIX_ACS = [74, 100, 112, 130, 149, 184, 224]
    
    if len(sys.argv) > 1:
        FIX_ACS = [int(sys.argv[1])]
    
    print(f"Processing {len(FIX_ACS)} ACs...")
    
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


if __name__ == "__main__":
    main()
