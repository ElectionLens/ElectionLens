#!/usr/bin/env python3
"""Fix ACs with low coverage by re-extracting booth data"""

import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict

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


def extract_booth_data(ac_id, num_cand):
    """Extract all booth data from PDF using multiple strategies"""
    ac_num = int(ac_id.replace('TN-', ''))
    text = get_pdf_text(ac_num)
    lines = text.split('\n')
    
    # Skip patterns
    skip_patterns = ['Polling Station', 'Total', 'Postal', 'Candidate',
                     'Party', 'FORM', 'Page', 'SL. NO', 'NONE OF', 
                     'Assembly', 'valid votes', 'Electors', 'Persentage']
    
    data_rows = []
    
    for i, line in enumerate(lines):
        if any(x in line for x in skip_patterns):
            continue
        
        # Extract numbers, filtering pincodes
        numbers = []
        for n in re.findall(r'\b(\d+)\b', line):
            if re.match(r'^6[0-3]\d{4}$', n):  # Skip pincodes
                continue
            if n in ['2021', '2020', '2019']:
                continue
            numbers.append(int(n))
        
        if len(numbers) < num_cand + 3:
            continue
        
        # Try to find valid vote sequence
        for start in range(0, min(5, len(numbers) - num_cand - 1)):
            votes = numbers[start:start + num_cand]
            total_idx = start + num_cand
            
            if total_idx >= len(numbers):
                continue
            
            claimed_total = numbers[total_idx]
            calc_total = sum(votes)
            
            # Check if this is valid
            if abs(claimed_total - calc_total) <= 5 and 50 <= claimed_total <= 3000:
                # Get SL number
                sl_match = re.match(r'^\s*(\d+)\s', line)
                sl_no = int(sl_match.group(1)) if sl_match else None
                
                if sl_no and 1 <= sl_no <= 700:
                    data_rows.append({
                        'sl': sl_no,
                        'votes': votes,
                        'total': calc_total
                    })
                break
    
    return data_rows


def process_ac(ac_id):
    """Process a single AC"""
    print(f"\n{'='*60}")
    print(f"Processing {ac_id}")
    print('='*60)
    
    official = load_official(ac_id)
    
    # Get official candidates (excluding NOTA)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    num_cand = len(official_cands)
    
    print(f"Official candidates: {num_cand}")
    
    # Extract booth data
    data_rows = extract_booth_data(ac_id, num_cand)
    
    if not data_rows:
        print(f"No data rows extracted!")
        return False
    
    print(f"Extracted {len(data_rows)} data rows")
    
    # Build results using SL as key
    results = {}
    for row in data_rows:
        sl_key = str(row['sl'])
        if sl_key not in results:
            results[sl_key] = {
                'boothNo': sl_key,
                'votes': row['votes'],
                'total': row['total']
            }
    
    print(f"Unique booths: {len(results)}")
    
    # Calculate totals
    col_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cand:
                col_totals[i] += v
    
    total_booth = sum(col_totals)
    total_official = sum(c['votes'] for c in official_cands)
    
    print(f"Total votes: {total_booth:,} vs Official: {total_official:,}")
    coverage = total_booth / total_official * 100 if total_official > 0 else 0
    print(f"Coverage: {coverage:.1f}%")
    
    if coverage < 50:
        print("Coverage too low, not saving")
        return False
    
    # Map columns to official candidates
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
        
        if best_match is not None and best_diff < 0.3:
            pdf_to_official[pdf_idx] = best_match
            used.add(best_match)
    
    # Fill remaining
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
            if i < len(final_totals):
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
    print(f"Average error: {avg_err:.2f}%")
    
    # Save if better than 10% error
    if avg_err < 10:
        booth_dir = DATA_DIR / f"booths/TN/{ac_id}"
        booth_dir.mkdir(parents=True, exist_ok=True)
        
        data = {
            'candidates': [{'name': c['name'], 'party': c['party']} for c in official_cands],
            'results': final_results
        }
        
        with open(booth_dir / '2021.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"✅ Saved {len(final_results)} booths")
        return True
    else:
        print(f"❌ Error too high")
        return False


def main():
    # ACs with low coverage that need fixing
    problematic = [
        'TN-159',  # 24.6%
        'TN-117',  # 50.1%
        'TN-184',  # 54.4%
        'TN-221',  # 64.3%
        'TN-226',  # 70.5%
        'TN-224',  # 76.2%
        'TN-009',  # 78.8%
        'TN-145',  # 78.7%
        'TN-120',  # 79.2%
        'TN-232',  # 79.7%
        'TN-134',  # 81.6%
        'TN-183',  # 81.2%
        'TN-231',  # 83.1%
        'TN-213',  # 85.3%
        'TN-136',  # 86.7%
        'TN-028',  # 87.5%
        'TN-126',  # 90.2%
        'TN-077',  # 94.4%
        'TN-142',  # 95.6%
        'TN-048',  # 96.1%
        'TN-169',  # 97.2%
        'TN-219',  # 97.4%
        'TN-096',  # 98.5%
        'TN-153',  # 98.7%
        'TN-102',  # 98.2%
        'TN-125',  # 102.9%
        'TN-023',  # 103.7%
        'TN-095',  # 103.1%
        'TN-165',  # 106.0%
        'TN-162',  # 108.0%
        'TN-098',  # 109.6%
    ]
    
    success = 0
    for ac_id in problematic:
        if process_ac(ac_id):
            success += 1
    
    print(f"\n{'='*60}")
    print(f"Successfully processed: {success}/{len(problematic)}")
    print('='*60)


if __name__ == '__main__':
    main()
