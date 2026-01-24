#!/usr/bin/env python3
"""
Parse Surya OCR results for AC027 - Final version with correct columns.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
OUTPUT_PATH = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-027/2021.json")
SURYA_PATH = Path("/tmp/surya_ocr_ac027/AC027/results.json")

# Column ranges for top candidates (based on analysis)
# Maps (x_min, x_max) -> official candidate index
COLUMN_MAP = [
    ((150, 200), 0),   # DMK
    ((200, 250), 1),   # ADMK
    ((250, 310), None),  # Skip (minor)
    ((310, 360), None),  # Skip (minor)
    ((350, 400), 2),   # NTK
    ((400, 450), 3),   # MNM
    ((450, 500), 4),   # DMDK
]


def load_data():
    with open(SURYA_PATH) as f:
        surya = json.load(f)
    with open(OFFICIAL_PATH) as f:
        official = json.load(f)
    return surya, official


def extract_booth_data(pages, num_candidates):
    """Extract booth data from OCR pages."""
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
            # Find booth number (x ~100-160, format: number or numberA)
            booth = None
            for x, text in items:
                if 100 < x < 160 and re.match(r'^\d+[A-Z]?$', text):
                    booth = text
                    break
            
            if not booth:
                continue
            
            # Initialize votes array
            votes = [0] * num_candidates
            
            # Extract votes from each column
            for (x_min, x_max), off_idx in COLUMN_MAP:
                if off_idx is None or off_idx >= num_candidates:
                    continue
                
                for x, text in items:
                    if x_min <= x <= x_max and re.match(r'^\d+$', text):
                        val = int(text)
                        if val <= 2000:  # Sanity check
                            votes[off_idx] = val
                            break
            
            total = sum(votes)
            if total > 0 and booth not in results:
                results[booth] = {
                    'votes': votes,
                    'total': total,
                    'rejected': 0
                }
    
    return results


def main():
    surya, official = load_data()
    
    ac_official = official.get('TN-027', {})
    candidates = ac_official.get('candidates', [])
    
    print(f"AC027 - Shozhinganallur")
    print(f"Official candidates: {len(candidates)}")
    
    pages = surya['AC027']
    print(f"OCR pages: {len(pages)}")
    
    # Extract booth data
    results = extract_booth_data(pages, len(candidates))
    print(f"\nExtracted {len(results)} booths")
    
    # Validate
    col_sums = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums):
                col_sums[i] += v
    
    print(f"\nValidation (top 5 candidates):")
    all_good = True
    for i in range(min(5, len(candidates))):
        off_total = candidates[i].get('votes', 0)
        extracted = col_sums[i]
        ratio = extracted / off_total if off_total > 0 else 0
        status = "✓" if 0.85 <= ratio <= 1.15 else "✗"
        if ratio < 0.85 or ratio > 1.15:
            all_good = False
        print(f"  {status} {candidates[i].get('party'):8}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
    # Check booth winners
    off_top2 = {candidates[0].get('party'), candidates[1].get('party')}
    
    # Count booth wins (3% filter)
    total = sum(col_sums)
    valid_idx = [i for i in range(len(candidates)) if total > 0 and col_sums[i] / total >= 0.03]
    
    wins = defaultdict(int)
    for r in results.values():
        if valid_idx:
            best = max(valid_idx, key=lambda i: r['votes'][i] if i < len(r['votes']) else 0)
            party = candidates[best].get('party', '?')
            wins[party] += 1
    
    wins_top2 = set(sorted(wins.keys(), key=lambda p: -wins[p])[:2])
    
    print(f"\nBooth wins: {dict(sorted(wins.items(), key=lambda x: -x[1])[:5])}")
    print(f"Official top 2: {off_top2}")
    print(f"Wins top 2: {wins_top2}")
    print(f"Match: {'✓' if wins_top2 == off_top2 else '✗'}")
    
    # Save
    final_results = {f"TN-027-{k}": v for k, v in results.items()}
    
    cands_out = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND'),
        'symbol': c.get('symbol', '')
    } for i, c in enumerate(candidates)]
    
    output = {
        'acId': 'TN-027',
        'acName': 'SHOZHINGANALLUR',
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(final_results),
        'source': 'Tamil Nadu CEO - Form 20 (Surya OCR)',
        'candidates': cands_out,
        'results': final_results
    }
    
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✅ Saved {len(final_results)} booths")


if __name__ == "__main__":
    main()
