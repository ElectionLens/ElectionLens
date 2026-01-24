#!/usr/bin/env python3
"""
Parse Surya OCR results for AC027 - Fixed column mapping.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
OUTPUT_PATH = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-027/2021.json")
SURYA_PATH = Path("/tmp/surya_ocr_ac027/AC027/results.json")

# Column X ranges for each data column (based on analysis)
VOTE_COLUMNS = [
    (180, 210),   # Col 0 - DMK
    (220, 250),   # Col 1 - ADMK  
    (270, 310),   # Col 2 - minor
    (315, 370),   # Col 3 - NTK
    (390, 420),   # Col 4 - MNM
    (430, 470),   # Col 5 - DMDK
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
            # Find booth number (x ~80-135, format: number or numberA)
            booth = None
            for x, text in items:
                if 120 < x < 145 and re.match(r'^\d+[A-Z]?$', text):
                    booth = text
                    break
            
            if not booth:
                continue
            
            # Extract votes from columns
            votes = [0] * num_candidates
            
            for col_idx, (x_min, x_max) in enumerate(VOTE_COLUMNS):
                if col_idx >= num_candidates:
                    break
                
                for x, text in items:
                    if x_min <= x <= x_max and re.match(r'^\d+$', text):
                        votes[col_idx] = int(text)
                        break
            
            total = sum(votes)
            if total > 0 and booth not in results:
                results[booth] = {
                    'votes': votes,
                    'total': total,
                    'rejected': 0
                }
    
    return results


def find_column_mapping(results, official_candidates):
    """Find mapping from PDF columns to official candidate order."""
    # Sum each column
    num_cols = len(VOTE_COLUMNS)
    col_sums = [0] * num_cols
    
    for r in results.values():
        for i, v in enumerate(r['votes'][:num_cols]):
            col_sums[i] += v
    
    print("PDF column sums:")
    for i, cs in enumerate(col_sums):
        print(f"  Col {i}: {cs:>10,}")
    
    # Try to match to official candidates
    mapping = {}  # pdf_col -> official_idx
    used_officials = set()
    
    for pdf_col, col_sum in enumerate(col_sums):
        if col_sum < 1000:
            continue
        
        best_match = -1
        best_ratio = 0
        
        for off_idx, c in enumerate(official_candidates):
            if off_idx in used_officials:
                continue
            
            off_total = c.get('votes', 0)
            if off_total > 0:
                ratio = col_sum / off_total
                if 0.85 <= ratio <= 1.15:
                    if best_match < 0 or abs(ratio - 1.0) < abs(best_ratio - 1.0):
                        best_ratio = ratio
                        best_match = off_idx
        
        if best_match >= 0:
            mapping[pdf_col] = best_match
            used_officials.add(best_match)
            print(f"  Mapping: Col {pdf_col} → {official_candidates[best_match].get('party')} ({best_ratio:.2f}x)")
    
    return mapping


def remap_results(results, mapping, num_candidates):
    """Remap votes from PDF column order to official candidate order."""
    remapped = {}
    
    for booth, data in results.items():
        new_votes = [0] * num_candidates
        
        for pdf_col, off_idx in mapping.items():
            if pdf_col < len(data['votes']) and off_idx < num_candidates:
                new_votes[off_idx] = data['votes'][pdf_col]
        
        remapped[booth] = {
            'votes': new_votes,
            'total': sum(new_votes),
            'rejected': 0
        }
    
    return remapped


def main():
    surya, official = load_data()
    
    ac_official = official.get('TN-027', {})
    candidates = ac_official.get('candidates', [])
    
    print(f"AC027 - Shozhinganallur")
    print(f"Official candidates: {len(candidates)}")
    
    pages = surya['AC027']
    print(f"OCR pages: {len(pages)}")
    
    # Extract booth data
    results = extract_booth_data(pages, len(VOTE_COLUMNS))
    print(f"\nExtracted {len(results)} booths")
    
    # Find column mapping
    print("\nFinding column mapping...")
    mapping = find_column_mapping(results, candidates)
    
    # Remap results
    if mapping:
        results = remap_results(results, mapping, len(candidates))
    
    # Validate
    col_sums = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums):
                col_sums[i] += v
    
    print(f"\nValidation (top 5 candidates):")
    for i in range(min(5, len(candidates))):
        off_total = candidates[i].get('votes', 0)
        extracted = col_sums[i]
        ratio = extracted / off_total if off_total > 0 else 0
        status = "✓" if 0.90 <= ratio <= 1.10 else "✗"
        print(f"  {status} {candidates[i].get('party'):8}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
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
