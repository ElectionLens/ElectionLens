#!/usr/bin/env python3
"""Fix HOSUR (TN-055) - use SL as key to avoid losing booth variants"""

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


def parse_hosur():
    """Parse HOSUR using SL number as key"""
    ac_id = "TN-055"
    official = load_official(ac_id)
    text = get_pdf_text(55)
    lines = text.split('\n')
    
    num_cand = 19
    expected_totals = [117199, 105475, 460, 11391, 127, 145, 6536, 806, 64, 54, 72, 124, 80, 132, 395, 585, 628, 361, 1968]
    
    skip_patterns = ['Polling Station', 'Total', 'Postal', 'Candidate',
                     'Party', 'FORM', 'Page', 'SL. NO', 'NONE OF']
    
    booth_pattern = re.compile(r'(\d{1,3}[AM]?(?:\([WA]\))?)', re.IGNORECASE)
    sl_pattern = re.compile(r'^\s*(\d+)\s')
    
    # Find all valid data rows
    data_rows = []
    
    for i, line in enumerate(lines):
        if any(x in line for x in skip_patterns):
            continue
        
        numbers = []
        for n in re.findall(r'\b(\d+)\b', line):
            if re.match(r'^63\d{4}$', n) or n in ['2021', '2020']:
                continue
            numbers.append(int(n))
        
        if len(numbers) < 20:
            continue
        
        for start in range(0, min(4, len(numbers) - 20)):
            votes = numbers[start:start + num_cand]
            total_idx = start + num_cand
            
            if total_idx >= len(numbers):
                continue
            
            claimed_total = numbers[total_idx]
            if abs(sum(votes) - claimed_total) <= 2 and 50 <= claimed_total <= 2500:
                sl_match = sl_pattern.match(line)
                sl_no = int(sl_match.group(1)) if sl_match else None
                
                if sl_no is None or sl_no < 1 or sl_no > 510:
                    continue
                
                # Find booth number for display
                booth_no = None
                for j in range(max(0, i-2), min(len(lines), i+2)):
                    booths = booth_pattern.findall(lines[j])
                    for b in booths:
                        if re.match(r'^\d{1,3}[AM]?(\([WA]\))?$', b, re.IGNORECASE):
                            num_part = int(re.match(r'\d+', b).group())
                            if num_part <= 400 and num_part >= 1:
                                booth_no = b.upper()
                                break
                    if booth_no:
                        break
                
                if not booth_no:
                    booth_no = str(sl_no)
                
                data_rows.append({
                    'sl': sl_no,
                    'booth': booth_no,
                    'votes': votes,
                    'total': sum(votes)
                })
                break
    
    print(f"Found {len(data_rows)} valid data rows")
    
    # Use SL as key to preserve all booths
    results = {}
    for row in data_rows:
        sl_key = str(row['sl'])
        results[sl_key] = {
            'boothNo': row['booth'],
            'votes': row['votes'],
            'total': row['total']
        }
    
    print(f"Unique booths (by SL): {len(results)}")
    
    # Calculate column totals
    col_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes']):
            col_totals[i] += v
    
    total_votes = sum(col_totals)
    expected_total = sum(expected_totals)
    
    print(f"\nTotal votes: {total_votes:,} vs Expected: {expected_total:,} ({total_votes/expected_total*100:.1f}%)")
    
    # Map columns to official candidates
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    
    pdf_to_official = {}
    used = set()
    
    scale = total_votes / expected_total
    
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
        
        if best_match is not None and best_diff < 0.25:
            pdf_to_official[pdf_idx] = best_match
            used.add(best_match)
    
    # Fill remaining
    unmatched_pdf = [i for i in range(num_cand) if i not in pdf_to_official]
    unmatched_off = [i for i in range(len(official_cands)) if i not in used]
    for pdf_idx, off_idx in zip(sorted(unmatched_pdf), unmatched_off):
        pdf_to_official[pdf_idx] = off_idx
    
    # Remap booth votes
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
    
    return ac_id, official_cands, final_results


def save_and_verify(ac_id, candidates, results):
    """Save and verify accuracy"""
    booth_totals = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    total_booth = sum(booth_totals)
    expected = [117199, 105475, 460, 11391, 127, 145, 6536, 806, 64, 54, 72, 124, 80, 132, 395, 585, 628, 361, 1968]
    expected_total = sum(expected)
    
    print(f"\nFinal verification:")
    print(f"Booths: {len(results)}")
    print(f"Total votes: {total_booth:,} vs Expected: {expected_total:,} ({total_booth/expected_total*100:.1f}%)")
    
    errors = []
    scale = total_booth / expected_total
    
    for i, c in enumerate(candidates[:8]):
        booth_val = booth_totals[i]
        scaled_expected = c['votes'] * scale
        
        if scaled_expected > 100:
            err = abs(booth_val - scaled_expected) / scaled_expected * 100
            errors.append(err)
            status = "✓" if err < 15 else "✗"
            print(f"  {status} {c['name'][:25]:<25} Booth={booth_val:>7,} vs Scaled={scaled_expected:>7,.0f} ({err:.1f}%)")
    
    avg_err = sum(errors) / len(errors) if errors else 0
    print(f"\n  Average error: {avg_err:.1f}%")
    
    # Save
    booth_dir = DATA_DIR / f"booths/TN/{ac_id}"
    booth_dir.mkdir(parents=True, exist_ok=True)
    
    data = {
        'candidates': [{'name': c['name'], 'party': c['party']} for c in candidates],
        'results': results
    }
    
    with open(booth_dir / '2021.json', 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n✅ Saved {len(results)} booths to {booth_dir / '2021.json'}")
    return avg_err


if __name__ == '__main__':
    print("=" * 60)
    print("Fixing HOSUR (TN-055)")
    print("=" * 60)
    
    ac_id, candidates, results = parse_hosur()
    save_and_verify(ac_id, candidates, results)
