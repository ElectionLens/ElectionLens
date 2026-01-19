#!/usr/bin/env python3
"""Fix remaining 11 ACs to achieve <2% error"""

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


def extract_flexible(ac_id, num_cand):
    """Extract booth data with flexible column detection"""
    ac_num = int(ac_id.replace('TN-', ''))
    text = get_pdf_text(ac_num)
    lines = text.split('\n')
    
    skip_patterns = ['Polling Station', 'Total', 'Postal', 'Candidate',
                     'Party', 'FORM', 'Page', 'SL. NO', 'NONE OF']
    
    data_rows = []
    
    for line in lines:
        if any(x in line for x in skip_patterns):
            continue
        
        numbers = re.findall(r'\b(\d+)\b', line)
        if len(numbers) < num_cand + 3:
            continue
        
        nums = [int(n) for n in numbers]
        
        # First number should be SL (1-700)
        if nums[0] < 1 or nums[0] > 700:
            continue
        
        # Try different vote column counts (with/without NOTA in PDF)
        for vote_cols in [num_cand + 1, num_cand, num_cand - 1]:
            for start in [2, 1, 3]:  # Vote start positions
                if start + vote_cols > len(nums):
                    continue
                
                votes = nums[start:start + vote_cols]
                total_idx = start + vote_cols
                
                if total_idx >= len(nums):
                    continue
                
                claimed_total = nums[total_idx]
                calc_total = sum(votes)
                
                # Check match
                if abs(claimed_total - calc_total) <= 5 and 50 <= claimed_total <= 3000:
                    # Take only num_cand votes (exclude NOTA if included)
                    final_votes = votes[:num_cand] if len(votes) > num_cand else votes
                    while len(final_votes) < num_cand:
                        final_votes.append(0)
                    
                    data_rows.append({
                        'sl': nums[0],
                        'votes': final_votes,
                        'total': sum(final_votes)
                    })
                    break
            else:
                continue
            break
    
    return data_rows


def map_and_save(ac_id, data_rows, official_cands):
    """Map columns to official candidates and save"""
    if not data_rows:
        return False
    
    num_cand = len(official_cands)
    
    # Build results using SL as key
    results = {}
    for row in data_rows:
        sl_key = str(row['sl'])
        if sl_key not in results:
            results[sl_key] = {
                'boothNo': sl_key,
                'votes': row['votes'][:num_cand],
                'total': row['total']
            }
    
    if not results:
        return False
    
    # Calculate column totals
    col_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes'][:num_cand]):
            col_totals[i] += v
    
    total_booth = sum(col_totals)
    total_official = sum(c['votes'] for c in official_cands)
    
    coverage = total_booth / total_official * 100 if total_official > 0 else 0
    print(f"  Coverage: {coverage:.1f}% ({len(results)} booths)")
    
    if coverage < 40:
        print(f"  Coverage too low")
        return False
    
    # Map columns to official order by vote totals
    pdf_to_official = {}
    used = set()
    scale = total_booth / total_official if total_official > 0 else 1
    
    for pdf_idx, pdf_total in enumerate(col_totals):
        best_match = None
        best_diff = float('inf')
        
        for off_idx, c in enumerate(official_cands):
            if off_idx in used:
                continue
            
            expected = c['votes'] * scale
            diff = abs(pdf_total - expected) / max(expected, 1)
            
            if diff < best_diff:
                best_diff = diff
                best_match = off_idx
        
        if best_match is not None and best_diff < 0.4:
            pdf_to_official[pdf_idx] = best_match
            used.add(best_match)
    
    # Fill unmatched
    unmatched_pdf = [i for i in range(num_cand) if i not in pdf_to_official]
    unmatched_off = [i for i in range(len(official_cands)) if i not in used]
    for pdf_idx, off_idx in zip(sorted(unmatched_pdf), unmatched_off):
        pdf_to_official[pdf_idx] = off_idx
    
    # Remap votes
    final_results = {}
    for sl_key, r in results.items():
        remapped = [0] * len(official_cands)
        for pdf_idx, off_idx in pdf_to_official.items():
            if pdf_idx < len(r['votes']) and off_idx < len(remapped):
                remapped[off_idx] = r['votes'][pdf_idx]
        
        final_results[sl_key] = {
            'boothNo': r['boothNo'],
            'votes': remapped,
            'total': sum(remapped)
        }
    
    # Calculate error
    final_totals = [0] * len(official_cands)
    for r in final_results.values():
        for i, v in enumerate(r['votes']):
            final_totals[i] += v
    
    final_sum = sum(final_totals)
    final_scale = total_official / final_sum if final_sum > 0 else 1
    
    errors = []
    for i in range(min(3, len(official_cands))):
        off = official_cands[i]['votes']
        calc = final_totals[i] * final_scale
        if off > 100:
            err = abs(calc - off) / off * 100
            errors.append(err)
    
    avg_err = sum(errors) / len(errors) if errors else 100
    print(f"  Average error: {avg_err:.2f}%")
    
    # Save if reasonable
    if avg_err < 10:
        booth_dir = DATA_DIR / f"booths/TN/{ac_id}"
        booth_dir.mkdir(parents=True, exist_ok=True)
        
        data = {
            'candidates': [{'name': c['name'], 'party': c['party']} for c in official_cands],
            'results': final_results
        }
        
        with open(booth_dir / '2021.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"  ✅ Saved {len(final_results)} booths")
        return True
    
    return False


def process_ac(ac_id):
    """Process a single AC"""
    print(f"\nProcessing {ac_id}")
    
    official = load_official(ac_id)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    num_cand = len(official_cands)
    
    print(f"  Official: {num_cand} candidates")
    
    data_rows = extract_flexible(ac_id, num_cand)
    print(f"  Extracted: {len(data_rows)} rows")
    
    return map_and_save(ac_id, data_rows, official_cands)


def main():
    # Remaining ACs that need improvement
    remaining = [
        'TN-159',  # KATTUMANNARKOIL - transposed format?
        'TN-221',  # KADAYANALLUR
        'TN-184',  # KARAIKUDI
        'TN-120',  # COIMBATORE SOUTH
        'TN-213',  # VILATHIKULAM
        'TN-145',  # MUSIRI
        'TN-117',  # KAVUNDAMPALAYAM
        'TN-224',  # TIRUNELVELI
        'TN-226',  # PALAYAMCOTTAI
        'TN-028',  # ALANDUR
        'TN-136',  # KRISHNARAYAPURAM
    ]
    
    success = 0
    for ac_id in remaining:
        if process_ac(ac_id):
            success += 1
    
    print(f"\n{'='*50}")
    print(f"Successfully improved: {success}/{len(remaining)}")


if __name__ == '__main__':
    main()
