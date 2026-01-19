#!/usr/bin/env python3
"""Final fix for the remaining 8 ACs to achieve <2% error"""

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
    result = subprocess.run(['pdftotext', '-layout', str(FORM20_DIR / f'AC{ac_num:03d}.pdf'), '-'], 
                           capture_output=True, text=True)
    return result.stdout


def extract_row_format(text, num_cand):
    """Standard row format - one booth per line"""
    lines = text.split('\n')
    data_rows = []
    
    for line in lines:
        if any(x in line for x in ['Polling', 'Total', 'Postal', 'Candidate', 'Party', 'FORM', 'Page', 'SL']):
            continue
        
        numbers = re.findall(r'\b(\d+)\b', line)
        if len(numbers) < num_cand + 3:
            continue
        
        nums = [int(n) for n in numbers]
        
        if nums[0] < 1 or nums[0] > 700:
            continue
        
        for vote_cols in [num_cand + 1, num_cand, num_cand - 1]:
            for start in [1, 2, 3]:
                if start + vote_cols > len(nums):
                    continue
                
                votes = nums[start:start + vote_cols]
                total_idx = start + vote_cols
                
                if total_idx >= len(nums):
                    continue
                
                claimed_total = nums[total_idx]
                calc_total = sum(votes)
                
                if abs(claimed_total - calc_total) <= 5 and 30 <= claimed_total <= 3000:
                    final_votes = votes[:num_cand]
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


def extract_transposed_format(text, num_cand):
    """Transposed format - booths in columns, candidates in rows"""
    lines = text.split('\n')
    
    # Split by pages
    pages = re.split(r'Page \d+', text)
    
    all_booth_votes = defaultdict(lambda: [0] * num_cand)
    
    for page in pages:
        page_lines = page.strip().split('\n')
        
        # Find header with booth numbers
        booth_header = None
        for i, line in enumerate(page_lines):
            numbers = re.findall(r'\b(\d+)\b', line)
            if len(numbers) >= 5:
                # Check if looks like booth header (decreasing or SL pattern)
                nums = [int(n) for n in numbers]
                if all(1 <= n <= 700 for n in nums[:5]):
                    booth_header = nums
                    cand_start = i + 1
                    break
        
        if not booth_header:
            continue
        
        # Extract vote rows
        cand_idx = 0
        for line in page_lines[cand_start:]:
            numbers = re.findall(r'\b(\d+)\b', line)
            if not numbers:
                continue
            
            nums = [int(n) for n in numbers]
            
            # Skip if looks like header or total row
            if any(n > 3000 for n in nums[:5]):
                continue
            
            # Map votes to booths
            for bi, booth_no in enumerate(booth_header):
                if bi < len(nums) and cand_idx < num_cand:
                    all_booth_votes[str(booth_no)][cand_idx] = nums[bi]
            
            cand_idx += 1
            if cand_idx >= num_cand:
                break
    
    # Convert to data rows
    data_rows = []
    for booth_no, votes in all_booth_votes.items():
        if sum(votes) > 0:
            data_rows.append({
                'sl': int(booth_no),
                'votes': votes,
                'total': sum(votes)
            })
    
    return data_rows


def process_ac(ac_id):
    """Process AC with multiple extraction strategies"""
    print(f"\n{ac_id}")
    
    ac_num = int(ac_id.replace('TN-', ''))
    text = get_pdf_text(ac_num)
    
    official = load_official(ac_id)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    num_cand = len(official_cands)
    
    # Try row format first
    data_rows = extract_row_format(text, num_cand)
    
    if len(data_rows) < 50:  # Too few, try transposed
        transposed_rows = extract_transposed_format(text, num_cand)
        if len(transposed_rows) > len(data_rows):
            data_rows = transposed_rows
            print(f"  Using transposed format")
    
    if not data_rows:
        print(f"  No data extracted")
        return False
    
    # Build results
    results = {}
    for row in data_rows:
        sl_key = str(row['sl'])
        if sl_key not in results:
            results[sl_key] = {
                'boothNo': sl_key,
                'votes': row['votes'],
                'total': row['total']
            }
    
    print(f"  Extracted {len(results)} booths")
    
    # Calculate totals
    booth_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cand:
                booth_totals[i] += v
    
    total_booth = sum(booth_totals)
    total_official = sum(c['votes'] for c in official_cands)
    coverage = total_booth / total_official * 100 if total_official > 0 else 0
    
    print(f"  Coverage: {coverage:.1f}%")
    
    if coverage < 30:
        print(f"  Coverage too low")
        return False
    
    # Map columns
    scale = total_booth / total_official
    pdf_to_official = {}
    used = set()
    
    for pdf_idx, pdf_total in enumerate(booth_totals):
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
    
    # Fill remaining
    for pdf_idx in range(num_cand):
        if pdf_idx not in pdf_to_official:
            for off_idx in range(len(official_cands)):
                if off_idx not in used:
                    pdf_to_official[pdf_idx] = off_idx
                    used.add(off_idx)
                    break
    
    # Remap
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
            errors.append(abs(calc - off) / off * 100)
    
    avg_err = sum(errors) / len(errors) if errors else 100
    print(f"  Error: {avg_err:.2f}%")
    
    # Save if improved or < 5%
    current_file = DATA_DIR / f'booths/TN/{ac_id}/2021.json'
    save = False
    
    if current_file.exists():
        with open(current_file) as f:
            current = json.load(f)
        
        # Calculate current error
        current_totals = [0] * len(current['candidates'])
        for r in current['results'].values():
            for i, v in enumerate(r.get('votes', [])):
                if i < len(current_totals):
                    current_totals[i] += v
        
        current_sum = sum(current_totals)
        c_scale = total_official / current_sum if current_sum > 0 else 1
        
        c_errors = []
        for i in range(min(3, len(official_cands))):
            off = official_cands[i]['votes']
            calc = current_totals[i] * c_scale if i < len(current_totals) else 0
            if off > 100:
                c_errors.append(abs(calc - off) / off * 100)
        
        current_err = sum(c_errors) / len(c_errors) if c_errors else 100
        
        if avg_err < current_err:
            save = True
            print(f"  Improved from {current_err:.2f}% to {avg_err:.2f}%")
    else:
        save = True
    
    if save:
        booth_dir = DATA_DIR / f'booths/TN/{ac_id}'
        booth_dir.mkdir(parents=True, exist_ok=True)
        
        data = {
            'candidates': [{'name': c['name'], 'party': c['party']} for c in official_cands],
            'results': final_results
        }
        
        with open(booth_dir / '2021.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"  ✅ Saved")
        return avg_err < 2
    
    return False


def main():
    remaining = [
        'TN-159',  # 8.40%
        'TN-221',  # 4.45%
        'TN-184',  # 3.62%
        'TN-120',  # 3.54%
        'TN-224',  # 2.73%
        'TN-145',  # 2.63%
        'TN-226',  # 2.61%
        'TN-136',  # 2.46%
    ]
    
    success = 0
    for ac_id in remaining:
        if process_ac(ac_id):
            success += 1
    
    print(f"\n{'='*50}")
    print(f"Achieved <2%: {success}/{len(remaining)}")


if __name__ == '__main__':
    main()
