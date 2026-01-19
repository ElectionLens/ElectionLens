#!/usr/bin/env python3
"""Fix ALANGUDI (TN-182) - keep all booth variants (M, A(W)) separate"""

import json
import re
import subprocess
from pathlib import Path

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
DATA_DIR = Path("public/data")

def load_official(ac_id):
    with open(DATA_DIR / "elections/ac/TN/2021.json") as f:
        return json.load(f)[ac_id]

def get_pdf_text(ac_num):
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], 
                          capture_output=True, text=True)
    return result.stdout


def parse_alangudi():
    """Parse ALANGUDI keeping all booth variants separate"""
    ac_id = "TN-182"
    official = load_official(ac_id)
    text = get_pdf_text(182)
    
    # 11 candidates (excluding NOTA)
    num_cand = 11
    
    # PDF column to Official candidate mapping
    pdf_to_official = {0: 5, 1: 1, 2: 0, 3: 2, 4: 8, 5: 9, 6: 3, 7: 4, 8: 10, 9: 6, 10: 7}
    
    results = {}
    lines = text.split('\n')
    
    skip_patterns = ['Polling Station', 'Candidate', 'Party', 'FORM', 
                     'Assembly', 'SL. NO', 'Electors',
                     'Bahujan', 'Dravida', 'Naam', 'Communist',
                     'Amma Makkal', 'Makkal Needhi', 'Independent',
                     'Total No.of', 'recorded', 'votes Polled', 'Page ']
    
    for line in lines:
        # Skip headers
        skip = any(p in line for p in skip_patterns)
        if skip or 'Total' in line or 'Postal' in line:
            continue
        
        # Extract booth number with suffix (e.g., "1M", "14A(W)")
        booth_match = re.search(r'^\s*(\d+)\s+(\d+[AM]?(?:\([WA]\))?)\s', line, re.IGNORECASE)
        if booth_match:
            sl_no = int(booth_match.group(1))
            booth_no = booth_match.group(2).upper()
        else:
            # Try just SL number for plain booths
            sl_match = re.match(r'^\s*(\d+)\s', line)
            if sl_match:
                sl_no = int(sl_match.group(1))
                booth_no = None
            else:
                continue
        
        if sl_no < 1 or sl_no > 320:
            continue
        
        numbers = re.findall(r'\b(\d+)\b', line)
        if len(numbers) < 14:
            continue
        
        nums = [int(n) for n in numbers]
        
        # Determine vote_start:
        # If booth has suffix (M, A(W)), vote_start = 1
        # If booth is pure number parsed, vote_start = 2
        for vote_start in [1, 2]:
            if vote_start > len(nums) - num_cand - 1:
                continue
            
            pdf_votes = nums[vote_start:vote_start + num_cand]
            if len(pdf_votes) < num_cand:
                continue
            
            total_idx = vote_start + num_cand
            if total_idx >= len(nums):
                continue
            
            claimed_total = nums[total_idx]
            calc_total = sum(pdf_votes)
            
            if abs(claimed_total - calc_total) <= 2 and 50 <= claimed_total <= 2000:
                # Determine final booth number
                if vote_start == 1:
                    # Booth has suffix, use text-extracted booth
                    final_booth = booth_no if booth_no else str(sl_no)
                else:
                    # Booth is nums[1], check if it's a valid booth number
                    if nums[1] < 300:
                        final_booth = str(nums[1])
                    else:
                        final_booth = str(sl_no)
                
                # Remap to official order
                official_votes = [0] * num_cand
                for pdf_idx, off_idx in pdf_to_official.items():
                    if pdf_idx < len(pdf_votes) and off_idx < num_cand:
                        official_votes[off_idx] = pdf_votes[pdf_idx]
                
                # Use FULL booth identifier as key (including suffix)
                booth_key = final_booth
                
                if booth_key not in results:
                    results[booth_key] = {
                        'boothNo': final_booth,
                        'votes': official_votes,
                        'total': sum(official_votes)
                    }
                break
    
    print(f"Extracted {len(results)} booths")
    
    # Calculate totals
    booth_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes'][:num_cand]):
            booth_totals[i] += v
    
    total_votes = sum(booth_totals)
    
    # Expected PDF booth totals mapped to official order
    expected_booth = [86743, 61918, 15403, 2899, 1221, 442, 343, 199, 179, 163, 154]
    expected_total = sum(expected_booth)
    
    print(f"\nTotal votes: {total_votes:,} vs Expected: {expected_total:,} ({total_votes/expected_total*100:.1f}%)")
    
    print(f"\nBooth totals vs Expected:")
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    errors = []
    for i, c in enumerate(official_cands[:num_cand]):
        booth_val = booth_totals[i]
        expected = expected_booth[i]
        if expected > 50:
            err = abs(booth_val - expected) / expected * 100
            errors.append(err)
            status = "✓" if err < 5 else "✗"
            print(f"  {status} {c['name'][:25]:<25} Booth={booth_val:>6} vs Expected={expected:>6} ({err:.1f}%)")
    
    avg_err = sum(errors) / len(errors) if errors else 0
    print(f"\n  Average error: {avg_err:.1f}%")
    
    return ac_id, official_cands, results


def save_booth_data(ac_id, candidates, results):
    """Save booth data"""
    booth_dir = DATA_DIR / f"booths/TN/{ac_id}"
    booth_dir.mkdir(parents=True, exist_ok=True)
    
    cand_list = [{'name': c['name'], 'party': c['party']} for c in candidates[:11]]
    
    data = {
        'candidates': cand_list,
        'results': results
    }
    
    with open(booth_dir / '2021.json', 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n✅ Saved {len(results)} booths to {booth_dir / '2021.json'}")


if __name__ == '__main__':
    print("=" * 60)
    print("Fixing ALANGUDI (TN-182)")
    print("=" * 60)
    
    ac_id, candidates, results = parse_alangudi()
    
    if len(results) >= 280:
        save_booth_data(ac_id, candidates, results)
    else:
        print(f"\n❌ Only extracted {len(results)} booths, expected ~311")
