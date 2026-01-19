#!/usr/bin/env python3
"""Fix ACs with transposed PDF format (booths in columns)"""

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


def extract_transposed(ac_id, num_cand):
    """Extract from transposed format (booths in columns)"""
    ac_num = int(ac_id.replace('TN-', ''))
    text = get_pdf_text(ac_num)
    lines = text.split('\n')
    
    # In transposed format:
    # Row 1: Booth numbers (10, 9, 8, 7, 6, 5, 4, 3, 2, 1, ...)
    # Row 2: Polling station numbers
    # Rows 3+: Candidate names and vote counts
    
    # Collect all data rows
    booth_votes = defaultdict(lambda: [0] * num_cand)
    
    current_booths = []
    candidate_idx = 0
    
    for line in lines:
        # Skip certain headers
        if 'FORM 20' in line or 'Assembly' in line or 'Electors' in line:
            continue
        
        # Extract numbers from line
        numbers = re.findall(r'\b(\d+)\b', line)
        
        if not numbers:
            continue
        
        nums = [int(n) for n in numbers]
        
        # Check if this is a booth number row (numbers 1-10 or similar at start)
        # Booth rows typically have numbers in descending or sequential order
        if len(nums) >= 5 and all(1 <= n <= 700 for n in nums[:5]):
            # Check if it's a valid booth sequence
            is_booth_row = False
            
            # Check for descending order (10, 9, 8, 7...)
            if nums[0] > nums[1] and all(nums[i] >= nums[i+1] for i in range(min(5, len(nums)-1))):
                is_booth_row = True
            
            # Check for ascending + padding pattern
            if any('SL' in line.upper() or 'NO' in line.upper() for _ in [1]):
                is_booth_row = True
            
            if is_booth_row and len(nums) >= 5:
                # This is likely a booth number row
                # Booths are in reverse order typically
                current_booths = nums[:10] if len(nums) >= 10 else nums
                candidate_idx = 0
                continue
        
        # Check if this is a vote data row
        if current_booths and len(nums) >= len(current_booths) - 2:
            # This could be vote data for a candidate
            votes = nums[:len(current_booths)]
            
            # Map votes to booths
            for i, booth_no in enumerate(current_booths):
                if i < len(votes) and candidate_idx < num_cand:
                    booth_votes[str(booth_no)][candidate_idx] += votes[i]
            
            candidate_idx += 1
    
    return booth_votes


def extract_transposed_v2(ac_id, num_cand):
    """Alternative transposed extraction - page by page"""
    ac_num = int(ac_id.replace('TN-', ''))
    text = get_pdf_text(ac_num)
    
    # Split by page markers
    pages = re.split(r'Page \d+ of \d+', text)
    
    booth_votes = defaultdict(lambda: [0] * num_cand)
    
    for page in pages:
        lines = page.strip().split('\n')
        
        # Find booth header row
        booth_row = None
        vote_rows = []
        
        for i, line in enumerate(lines):
            numbers = re.findall(r'\b(\d+)\b', line)
            if not numbers:
                continue
            
            nums = [int(n) for n in numbers]
            
            # Check for SL. NO. row or descending number sequence
            if 'SL' in line.upper() or (len(nums) >= 5 and nums[0] > nums[1]):
                booth_row = nums
                continue
            
            if booth_row and len(nums) >= 3:
                # Could be vote data
                vote_rows.append(nums)
        
        if booth_row and vote_rows:
            # Process this page
            for cand_idx, votes in enumerate(vote_rows[:num_cand]):
                for booth_idx, booth_no in enumerate(booth_row):
                    if booth_idx < len(votes) and booth_no <= 700:
                        booth_votes[str(booth_no)][cand_idx] = votes[booth_idx]
    
    return booth_votes


def process_transposed(ac_id):
    """Process a transposed format AC"""
    print(f"\nProcessing {ac_id} (transposed)")
    
    official = load_official(ac_id)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    num_cand = len(official_cands)
    
    print(f"  Candidates: {num_cand}")
    
    # Try extraction
    booth_votes = extract_transposed(ac_id, num_cand)
    
    if not booth_votes:
        booth_votes = extract_transposed_v2(ac_id, num_cand)
    
    if not booth_votes:
        print(f"  No data extracted")
        return False
    
    print(f"  Extracted {len(booth_votes)} booths")
    
    # Build results
    results = {}
    for booth_no, votes in booth_votes.items():
        if sum(votes) > 0:
            results[booth_no] = {
                'boothNo': booth_no,
                'votes': votes,
                'total': sum(votes)
            }
    
    if not results:
        print(f"  No valid results")
        return False
    
    # Calculate totals
    col_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes']):
            col_totals[i] += v
    
    total_booth = sum(col_totals)
    total_official = sum(c['votes'] for c in official_cands)
    coverage = total_booth / total_official * 100 if total_official > 0 else 0
    
    print(f"  Coverage: {coverage:.1f}%")
    
    if coverage < 30:
        print(f"  Coverage too low")
        return False
    
    # Map columns by vote totals
    pdf_to_official = {}
    used = set()
    scale = total_booth / total_official
    
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
        
        if best_match is not None and best_diff < 0.5:
            pdf_to_official[pdf_idx] = best_match
            used.add(best_match)
    
    # Fill unmatched
    for pdf_idx in range(num_cand):
        if pdf_idx not in pdf_to_official:
            for off_idx in range(len(official_cands)):
                if off_idx not in used:
                    pdf_to_official[pdf_idx] = off_idx
                    used.add(off_idx)
                    break
    
    # Remap
    final_results = {}
    for booth_key, r in results.items():
        remapped = [0] * len(official_cands)
        for pdf_idx, off_idx in pdf_to_official.items():
            if pdf_idx < len(r['votes']) and off_idx < len(remapped):
                remapped[off_idx] = r['votes'][pdf_idx]
        final_results[booth_key] = {
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
    
    if avg_err < 15:
        booth_dir = DATA_DIR / f"booths/TN/{ac_id}"
        booth_dir.mkdir(parents=True, exist_ok=True)
        
        data = {
            'candidates': [{'name': c['name'], 'party': c['party']} for c in official_cands],
            'results': final_results
        }
        
        with open(booth_dir / '2021.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"  ✅ Saved")
        return True
    
    return False


def main():
    # ACs with transposed format
    transposed_acs = [
        'TN-159',  # KATTUMANNARKOIL
        'TN-221',  # KADAYANALLUR
        'TN-120',  # COIMBATORE SOUTH
        'TN-224',  # TIRUNELVELI
        'TN-226',  # PALAYAMCOTTAI
        'TN-136',  # KRISHNARAYAPURAM
    ]
    
    success = 0
    for ac_id in transposed_acs:
        if process_transposed(ac_id):
            success += 1
    
    print(f"\nProcessed: {success}/{len(transposed_acs)}")


if __name__ == '__main__':
    main()
