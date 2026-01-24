#!/usr/bin/env python3
"""
Parse Surya OCR results for AC027 (Shozhinganallur).
"""

import json
import re
from collections import defaultdict
from pathlib import Path

OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
OUTPUT_PATH = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-027/2021.json")
SURYA_PATH = Path("/tmp/surya_ocr_ac027/AC027/results.json")


def load_data():
    with open(SURYA_PATH) as f:
        surya = json.load(f)
    with open(OFFICIAL_PATH) as f:
        official = json.load(f)
    return surya, official


def extract_columns(pages):
    """Extract text organized by columns from all pages."""
    all_data = []
    
    for page in pages:
        page_num = page.get('page', 0)
        text_lines = page.get('text_lines', [])
        
        # Group by x-coordinate (columns)
        cols = defaultdict(list)
        for line in text_lines:
            text = line.get('text', '').strip()
            if not text:
                continue
            
            x = line['polygon'][0][0]
            y = line['polygon'][0][1]
            
            # Skip header area (y < 300)
            if y < 300:
                continue
            
            # Bucket by x position (80px buckets)
            col_bucket = int(x // 80) * 80
            cols[col_bucket].append((y, text))
        
        all_data.append((page_num, cols))
    
    return all_data


def parse_booth_data(all_data, num_candidates):
    """Parse booth numbers and votes from columnar data."""
    results = {}
    
    for page_num, cols in all_data:
        # Column 80 contains booth numbers
        booth_col = cols.get(80, [])
        
        # Sort by y position
        booth_col.sort()
        
        # Extract booths at each y position
        for y, text in booth_col:
            # Skip if not a valid booth number
            if not re.match(r'^\d+[A-Z]?$', text):
                continue
            
            booth_no = text
            
            # Get votes from other columns at similar y position
            votes = []
            
            # Vote columns start at x=160 and go every 80px
            for col_x in range(160, 160 + num_candidates * 80, 80):
                col_data = cols.get(col_x, [])
                
                # Find closest y match
                best_match = None
                best_dist = 20  # Max y distance
                
                for cy, ctext in col_data:
                    dist = abs(cy - y)
                    if dist < best_dist and re.match(r'^\d+$', ctext):
                        best_dist = dist
                        best_match = int(ctext)
                
                if best_match is not None:
                    votes.append(best_match)
                else:
                    votes.append(0)
            
            # Pad or truncate to num_candidates
            while len(votes) < num_candidates:
                votes.append(0)
            votes = votes[:num_candidates]
            
            total = sum(votes)
            if total > 0 and booth_no not in results:
                results[booth_no] = {
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
    
    # Extract columnar data
    all_data = extract_columns(pages)
    
    # Parse booth data
    results = parse_booth_data(all_data, len(candidates))
    
    print(f"\nExtracted {len(results)} booths")
    
    # Validate against official
    col_sums = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums):
                col_sums[i] += v
    
    print(f"\nValidation:")
    for i in range(min(5, len(candidates))):
        off_total = candidates[i].get('votes', 0)
        extracted = col_sums[i]
        ratio = extracted / off_total if off_total > 0 else 0
        status = "✓" if 0.90 <= ratio <= 1.10 else "✗"
        print(f"  {status} {candidates[i].get('party'):8}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
    # Save results
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
    
    print(f"\n✅ Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
