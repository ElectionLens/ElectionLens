#!/usr/bin/env python3
"""
Parse Surya OCR results for multiple ACs.
Based on successful AC027 parsing approach.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
BOOTH_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

# Surya results locations
SURYA_RESULTS = {
    '100': '/tmp/surya_2021_all/AC100_new/AC100/results.json',
    '130': '/tmp/surya_2021_all/AC130_new/AC130/results.json',
    '184': '/tmp/surya_2021_all/AC184/AC184/results.json',
}


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def analyze_columns(pages):
    """Analyze column structure by summing numbers per x-bucket."""
    col_sums = defaultdict(int)
    col_counts = defaultdict(int)
    
    for page in pages:
        text_lines = page.get('text_lines', [])
        
        for line in text_lines:
            text = line.get('text', '').strip()
            y = line['polygon'][0][1]
            x = line['polygon'][0][0]
            
            if y < 300 or not re.match(r'^\d+$', text):
                continue
            
            val = int(text)
            if val > 5000:  # Skip totals
                continue
            
            bucket = int(x // 50) * 50
            col_sums[bucket] += val
            col_counts[bucket] += 1
    
    return col_sums, col_counts


def find_column_mapping(col_sums, candidates):
    """Find mapping from PDF column buckets to official candidates."""
    # Filter columns with significant vote totals
    significant_cols = [(bucket, total) for bucket, total in col_sums.items() 
                        if 10000 < total < 300000]
    significant_cols.sort(key=lambda x: x[0])  # Sort by x position
    
    print(f"  Significant columns: {len(significant_cols)}")
    for bucket, total in significant_cols[:6]:
        print(f"    x={bucket}: {total:,}")
    
    # Try to match each column to a candidate
    mapping = {}  # bucket -> candidate_idx
    used = set()
    
    for bucket, col_total in significant_cols:
        best_match = -1
        best_ratio = 0
        
        for idx, c in enumerate(candidates):
            if idx in used:
                continue
            
            off_total = c.get('votes', 0)
            if off_total > 0:
                ratio = col_total / off_total
                if 0.7 <= ratio <= 1.3:
                    if best_match < 0 or abs(ratio - 1.0) < abs(best_ratio - 1.0):
                        best_ratio = ratio
                        best_match = idx
        
        if best_match >= 0:
            mapping[bucket] = best_match
            used.add(best_match)
            print(f"    Mapped x={bucket} → {candidates[best_match].get('party')} ({best_ratio:.2f}x)")
    
    return mapping


def extract_booth_data(pages, mapping, num_candidates):
    """Extract booth data using discovered column mapping."""
    results = {}
    
    for page in pages:
        text_lines = page.get('text_lines', [])
        
        # Group by row (y position)
        rows = defaultdict(list)
        for line in text_lines:
            text = line.get('text', '').strip()
            y = line['polygon'][0][1]
            x = line['polygon'][0][0]
            
            if y < 300 or not text:
                continue
            
            row_y = int(y // 14) * 14
            rows[row_y].append((x, text))
        
        # Process each row
        for row_y, items in rows.items():
            # Find booth number (typically x < 160, format: number or numberA)
            booth = None
            for x, text in items:
                if 80 < x < 160 and re.match(r'^\d+[A-Z]?$', text):
                    booth = text
                    break
            
            if not booth:
                continue
            
            # Extract votes using mapping
            votes = [0] * num_candidates
            
            for x, text in items:
                if not re.match(r'^\d+$', text):
                    continue
                
                val = int(text)
                if val > 2000:
                    continue
                
                # Find matching column bucket
                bucket = int(x // 50) * 50
                if bucket in mapping:
                    cand_idx = mapping[bucket]
                    if cand_idx < num_candidates:
                        votes[cand_idx] = val
            
            total = sum(votes)
            if total > 0 and booth not in results:
                results[booth] = {
                    'votes': votes,
                    'total': total,
                    'rejected': 0
                }
    
    return results


def process_ac(ac_num, surya_path, official):
    """Process single AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    if not Path(surya_path).exists():
        print(f"\n{ac_id}: Surya results not found")
        return False
    
    ac_official = official.get(ac_id, {})
    candidates = ac_official.get('candidates', [])
    
    print(f"\n{'='*60}")
    print(f"{ac_id} - {ac_official.get('constituencyName', '?')}")
    print(f"{'='*60}")
    print(f"  Official candidates: {len(candidates)}")
    
    with open(surya_path) as f:
        surya = json.load(f)
    
    # Get the key (AC### format)
    key = list(surya.keys())[0]
    pages = surya[key]
    print(f"  OCR pages: {len(pages)}")
    
    # Analyze columns
    col_sums, col_counts = analyze_columns(pages)
    
    # Find column mapping
    mapping = find_column_mapping(col_sums, candidates)
    
    if len(mapping) < 2:
        print(f"  ❌ Could not find enough column mappings")
        return False
    
    # Extract booth data
    results = extract_booth_data(pages, mapping, len(candidates))
    print(f"\n  Extracted {len(results)} booths")
    
    # Validate
    col_sums_check = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums_check):
                col_sums_check[i] += v
    
    print(f"\n  Validation (top 5):")
    all_good = True
    for i in range(min(5, len(candidates))):
        off_total = candidates[i].get('votes', 0)
        extracted = col_sums_check[i]
        ratio = extracted / off_total if off_total > 0 else 0
        status = "✓" if 0.70 <= ratio <= 1.30 else "✗"
        if ratio < 0.70 or ratio > 1.30:
            all_good = False
        print(f"    {status} {candidates[i].get('party'):10}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
    # Check booth winners
    off_top2 = set(c.get('party') for c in candidates[:2])
    
    total = sum(col_sums_check)
    valid_idx = [i for i in range(len(candidates)-1) if total > 0 and col_sums_check[i]/total >= 0.03]
    
    wins = defaultdict(int)
    for r in results.values():
        if valid_idx:
            best = max(valid_idx, key=lambda i: r['votes'][i] if i < len(r['votes']) else 0)
            party = candidates[best].get('party', '?')
            wins[party] += 1
    
    wins_sorted = sorted(wins.items(), key=lambda x: -x[1])
    wins_top2 = set(p for p, _ in wins_sorted[:2])
    
    print(f"\n  Booth wins: {dict(wins_sorted[:5])}")
    print(f"  Official top 2: {off_top2}")
    print(f"  Extracted top 2: {wins_top2}")
    
    match = wins_top2 == off_top2
    print(f"  Winner match: {'✓' if match else '✗'}")
    
    if not match or len(results) < 100:
        print(f"  ❌ Not saving - {'wrong winners' if not match else 'too few booths'}")
        return False
    
    # Save
    output_path = BOOTH_BASE / ac_id / '2021.json'
    final_results = {f"{ac_id}-{k}": v for k, v in results.items()}
    
    cands_out = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND'),
        'symbol': c.get('symbol', '')
    } for i, c in enumerate(candidates)]
    
    output = {
        'acId': ac_id,
        'acName': ac_official.get('constituencyName', ''),
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(final_results),
        'source': 'Tamil Nadu CEO - Form 20 (Surya OCR)',
        'candidates': cands_out,
        'results': final_results
    }
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n  ✅ Saved {len(final_results)} booths to {output_path}")
    return True


def main():
    official = load_official()
    
    success = 0
    for ac_str, path in SURYA_RESULTS.items():
        if process_ac(int(ac_str), path, official):
            success += 1
    
    print(f"\n{'='*60}")
    print(f"Processed: {success}/{len(SURYA_RESULTS)} ACs successfully")


if __name__ == "__main__":
    main()
