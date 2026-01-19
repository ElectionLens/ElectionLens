#!/usr/bin/env python3
"""Fix the final 2 problematic ACs: HOSUR (TN-055) and ALANGUDI (TN-182)"""

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


def fix_hosur():
    """Fix HOSUR (TN-055) - multi-line addresses mixed with vote data"""
    ac_id = "TN-055"
    official = load_official(ac_id)
    text = get_pdf_text(55)
    
    # Official candidates (sorted by votes)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    
    # From PDF header analysis, the column order in HOSUR PDF is:
    # [4] DMK (Prakaash.Y), [5] ADMK (Jyothi.S), [6] Veerath Thiyagi, [7] Naam Tamilar (Ezhilan),
    # [8] Shiv Sena (Sundar), [9] NGPP (Selvam), [10] MNM (Masood), [11] AMMK,
    # [12] Anna Puratchi (Jeyaseelan), [13-21] Independents, [22] NOTA
    
    # PDF booth totals row: 117199 105475 460 11391 127 145 6536 806 64 54 72 124 80 132 395 585 628 361 1968
    # This corresponds to: DMK, ADMK, Veerath, NTK, Shiv, NGPP, MNM, AMMK, ...
    
    pdf_order = [
        'DMK', 'ADMK', 'Veerath Thiyagi Viswanathadoss Thozhilalarkal Katchi', 
        'NTK', 'SHS', 'New Generation People\'s Party', 'MNM', 'AMMK',
        'Anna Puratchi Thalaivar Amma Dravida Munnetra Kazhagam',
        'IND', 'IND', 'IND', 'IND', 'IND', 'IND', 'IND', 'IND', 'IND'
    ]
    
    # Official candidates (we need to map PDF columns to official order)
    # Official order (by votes): DMK (118231), ADMK (105864), NTK (11422), MNM (6563), ...
    
    results = {}
    
    lines = text.split('\n')
    
    for line in lines:
        # Skip non-data lines
        if 'Polling Station' in line or 'Total' in line or 'Postal' in line:
            continue
        if 'Candidate' in line or 'Party' in line or 'FORM' in line:
            continue
        
        # Extract all numbers from line
        numbers = re.findall(r'\b(\d+)\b', line)
        
        # A valid booth data line should have exactly 24+ numbers:
        # SL, Booth, 19 votes, total, rejected, total_with_rejected, electors
        # But since addresses are mixed, we look for patterns
        
        if len(numbers) < 22:
            continue
        
        numbers = [int(n) for n in numbers]
        
        # First number should be SL.NO (1-503)
        sl_no = numbers[0]
        if sl_no < 1 or sl_no > 510:
            continue
        
        # The votes are 19 columns (excluding NOTA which is column 22)
        # Find the sequence that sums close to a reasonable total
        
        # Try different starting positions
        best_start = None
        best_score = float('inf')
        
        for start in range(1, min(5, len(numbers) - 20)):
            # Get 19 potential vote values
            potential_votes = numbers[start:start+19]
            if len(potential_votes) < 19:
                continue
            
            vote_sum = sum(potential_votes)
            
            # Check if there's a total column after votes
            total_idx = start + 19
            if total_idx < len(numbers):
                claimed_total = numbers[total_idx]
                # Score based on how close sum is to claimed total
                score = abs(vote_sum - claimed_total)
                if score < best_score and vote_sum > 100 and vote_sum < 2000:
                    best_score = score
                    best_start = start
        
        if best_start is None:
            continue
        
        # Extract votes using best starting position
        votes = numbers[best_start:best_start+19]
        
        # Booth number is likely numbers[1] if start > 1, or need to extract from text
        booth_no = numbers[1] if len(numbers) > 1 else sl_no
        
        # Map PDF column order to official candidate order
        # PDF: DMK(0), ADMK(1), Veerath(2), NTK(3), Shiv(4), NGPP(5), MNM(6), AMMK(7), ...
        # Official (by votes): DMK(0), ADMK(1), NTK(2), MNM(3), AMMK(4), ...
        
        # Create mapping from PDF position to official position
        # Official candidates:
        # 0: DMK, 1: ADMK, 2: NTK, 3: MNM, 4: AMMK, 5: Geetha Lakshmi (IND)
        # PDF columns:
        # 0: DMK, 1: ADMK, 2: Veerath, 3: NTK, 4: Shiv, 5: NGPP, 6: MNM, 7: AMMK
        
        # Map based on party matching
        mapped_votes = [0] * len(official_cands)
        
        # DMK -> 0
        mapped_votes[0] = votes[0]  # DMK
        # ADMK -> 1  
        mapped_votes[1] = votes[1]  # ADMK
        # Veerath -> will be matched later
        # NTK -> 2
        if len(votes) > 3:
            mapped_votes[2] = votes[3]  # NTK at PDF position 3
        # MNM -> 3
        if len(votes) > 6:
            mapped_votes[3] = votes[6]  # MNM at PDF position 6
        # AMMK -> 4
        if len(votes) > 7:
            mapped_votes[4] = votes[7]  # AMMK at PDF position 7
        
        # For remaining candidates, just copy remaining votes in order
        pdf_pos = [2, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        off_pos = 5
        for pp in pdf_pos:
            if pp < len(votes) and off_pos < len(mapped_votes):
                mapped_votes[off_pos] = votes[pp]
                off_pos += 1
        
        booth_key = str(booth_no)
        if booth_key not in results or results[booth_key]['total'] < sum(mapped_votes):
            results[booth_key] = {
                'boothNo': booth_key,
                'votes': mapped_votes,
                'total': sum(mapped_votes)
            }
    
    return ac_id, official_cands, results


def fix_hosur_simple():
    """Simpler fix for HOSUR - just extract all rows and aggregate"""
    ac_id = "TN-055"
    official = load_official(ac_id)
    text = get_pdf_text(55)
    
    # Get all official candidates
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    num_cand = len(official_cands)  # Should be 19
    
    print(f"HOSUR has {num_cand} candidates (excl NOTA)")
    
    results = {}
    lines = text.split('\n')
    
    # Track booth data by SL number
    booth_data = {}
    
    for line in lines:
        # Skip headers and footers
        if any(x in line for x in ['Polling Station', 'Total', 'Postal', 'Candidate', 
                                    'Party', 'FORM', 'Page', 'SL. NO', 'NONE OF']):
            continue
        
        # Look for lines with vote data pattern: sequences of small numbers followed by a larger total
        numbers = re.findall(r'\b(\d+)\b', line)
        if len(numbers) < 10:
            continue
        
        nums = [int(n) for n in numbers]
        
        # Check if first number could be SL.NO (1-503)
        if nums[0] < 1 or nums[0] > 510:
            continue
        
        sl_no = nums[0]
        
        # Find where votes start by looking for total pattern
        # Total should be sum of ~19 preceding values
        for end_idx in range(20, len(nums)):
            potential_total = nums[end_idx]
            if potential_total < 200 or potential_total > 2000:
                continue
            
            # Check if preceding 19 numbers sum to this total
            for start_idx in range(1, end_idx - 18):
                vote_window = nums[start_idx:start_idx + 19]
                if len(vote_window) == 19:
                    if abs(sum(vote_window) - potential_total) <= 2:
                        # Found matching votes!
                        booth_no = nums[1] if start_idx > 1 else sl_no
                        
                        booth_key = str(booth_no)
                        if booth_key not in booth_data or booth_data[booth_key]['total'] < potential_total:
                            booth_data[booth_key] = {
                                'sl': sl_no,
                                'boothNo': booth_key,
                                'votes': vote_window,
                                'total': potential_total
                            }
                        break
    
    print(f"Extracted {len(booth_data)} unique booths")
    
    # Now we need to map the vote columns to official candidates
    # Calculate booth totals per column
    col_totals = [0] * 19
    for bd in booth_data.values():
        for i, v in enumerate(bd['votes']):
            col_totals[i] += v
    
    print(f"Column totals: {col_totals[:5]}")
    
    # Expected PDF booth totals:
    # 117199 (DMK), 105475 (ADMK), 460, 11391 (NTK), 127, 145, 6536 (MNM), 806 (AMMK), ...
    
    # Find best mapping from columns to official candidates
    official_booth_totals = [
        117199,  # DMK
        105475,  # ADMK
        11391,   # NTK (Geetha Lakshmi actually, but NTK has most among smaller)
        6536,    # MNM
        806,     # AMMK
        # ... smaller ones
    ]
    
    # Map column 0 -> DMK, column 1 -> ADMK, column 3 -> NTK, column 6 -> MNM, column 7 -> AMMK
    # PDF column to official index mapping:
    pdf_to_official = {
        0: 0,   # DMK
        1: 1,   # ADMK
        3: 2,   # NTK (Geetha Lakshmi)
        6: 3,   # MNM
        7: 4,   # AMMK
    }
    
    # Build full mapping based on vote totals
    # Sort official candidates by votes
    official_sorted = sorted(range(len(official_cands)), 
                            key=lambda i: official_cands[i]['votes'], reverse=True)
    
    # Remaining PDF columns to assign
    assigned_pdf = set(pdf_to_official.keys())
    assigned_off = set(pdf_to_official.values())
    
    remaining_pdf = [i for i in range(19) if i not in assigned_pdf]
    remaining_off = [i for i in range(len(official_cands)) if i not in assigned_off]
    
    # Match remaining by vote totals
    for off_idx in remaining_off:
        target = official_cands[off_idx]['votes']
        best_col = None
        best_diff = float('inf')
        for col in remaining_pdf:
            diff = abs(col_totals[col] - target)
            if diff < best_diff:
                best_diff = diff
                best_col = col
        if best_col is not None:
            pdf_to_official[best_col] = off_idx
            remaining_pdf.remove(best_col)
    
    # Remap all booth votes
    for booth_key, bd in booth_data.items():
        remapped = [0] * len(official_cands)
        for pdf_col, off_idx in pdf_to_official.items():
            if pdf_col < len(bd['votes']) and off_idx < len(remapped):
                remapped[off_idx] = bd['votes'][pdf_col]
        
        results[booth_key] = {
            'boothNo': booth_key,
            'votes': remapped,
            'total': sum(remapped)
        }
    
    return ac_id, official_cands, results


def fix_alangudi():
    """Fix ALANGUDI (TN-182) - correct candidate mapping"""
    ac_id = "TN-182"
    official = load_official(ac_id)
    text = get_pdf_text(182)
    
    # Official candidates (sorted by votes in the JSON, winner first)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    
    # From PDF header:
    # (3) BSP, (4) ADMK, (5) DMK, (6) NTK, (7) MIP, (8) CPI, (9) AMMK, (10) MNM, (11) AMK, (12) IND, (13) IND
    
    # PDF booth totals: BSP=442, ADMK=61918, DMK=86743, NTK=15403, MIP=179, CPI=163, AMMK=2899, MNM=1221, AMK=154, IND=343, IND=199
    
    # Official order (by votes):
    # 0: SIVA.V.MEYYANATHAN (DMK) = 87935 total (86743 + 1192)
    # 1: DHARMA THANGAVEL (ADMK) = 62088 total (61918 + 170)
    # 2: C.THIRUCHELVAM (NTK) = 15477
    # 3: D.VIDANGAR (AMMK) = 2924
    # 4: N.VAIRAVAN (MNM) = 1230
    # ...
    
    # So PDF column mapping to official:
    # PDF[0]=BSP -> Off[?], PDF[1]=ADMK -> Off[1], PDF[2]=DMK -> Off[0], PDF[3]=NTK -> Off[2]
    
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Skip headers
        if any(x in line for x in ['Polling Station', 'Total', 'Postal', 'Candidate',
                                    'FORM', 'Assembly', 'Electors', 'SL. NO']):
            continue
        
        numbers = re.findall(r'\b(\d+)\b', line)
        if len(numbers) < 15:
            continue
        
        nums = [int(n) for n in numbers]
        
        # First number is SL.NO
        sl_no = nums[0]
        if sl_no < 1 or sl_no > 320:
            continue
        
        # Second number could be booth number (1-242)
        # Votes start at position 2
        
        # Look for total (sum of 11 vote columns)
        for vote_start in range(2, min(5, len(nums) - 12)):
            votes = nums[vote_start:vote_start + 11]
            if len(votes) < 11:
                continue
            
            total_idx = vote_start + 11
            if total_idx >= len(nums):
                continue
            
            claimed_total = nums[total_idx]
            calc_total = sum(votes)
            
            if abs(claimed_total - calc_total) <= 5:
                # Found valid votes
                booth_no = nums[1] if vote_start > 2 else sl_no
                
                # Map PDF columns to official order
                # PDF: BSP(0), ADMK(1), DMK(2), NTK(3), MIP(4), CPI(5), AMMK(6), MNM(7), AMK(8), IND(9), IND(10)
                # Official: DMK(0), ADMK(1), NTK(2), AMMK(3), MNM(4), AMK(5), BSP(6), IND(7), IND(8), MIP(9), CPI(10)
                
                pdf_to_official = {
                    0: 6,   # BSP -> position 6 (based on votes)
                    1: 1,   # ADMK -> 1
                    2: 0,   # DMK -> 0
                    3: 2,   # NTK -> 2
                    4: 9,   # MIP -> 9
                    5: 10,  # CPI -> 10
                    6: 3,   # AMMK -> 3
                    7: 4,   # MNM -> 4
                    8: 5,   # AMK -> 5
                    9: 7,   # IND -> 7
                    10: 8,  # IND -> 8
                }
                
                remapped = [0] * len(official_cands)
                for pdf_idx, off_idx in pdf_to_official.items():
                    if pdf_idx < len(votes) and off_idx < len(remapped):
                        remapped[off_idx] = votes[pdf_idx]
                
                booth_key = str(booth_no)
                if booth_key not in results:
                    results[booth_key] = {
                        'boothNo': booth_key,
                        'votes': remapped,
                        'total': sum(remapped)
                    }
                break
    
    print(f"ALANGUDI: Extracted {len(results)} booths")
    
    return ac_id, official_cands, results


def save_booth_data(ac_id, candidates, results):
    """Save booth data to file"""
    booth_dir = DATA_DIR / f"booths/TN/{ac_id}"
    booth_dir.mkdir(parents=True, exist_ok=True)
    
    # Create candidate list in official order
    cand_list = [{
        'name': c['name'],
        'party': c['party']
    } for c in candidates]
    
    data = {
        'candidates': cand_list,
        'results': results
    }
    
    with open(booth_dir / '2021.json', 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"Saved {len(results)} booths to {booth_dir / '2021.json'}")


def verify_accuracy(ac_id, candidates, results):
    """Calculate accuracy for the extraction"""
    # Calculate booth totals
    num_cand = len(candidates)
    booth_totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cand:
                booth_totals[i] += v
    
    # Compare with official (accounting for postal)
    official = load_official(ac_id)
    
    errors = []
    for i, c in enumerate(candidates[:5]):
        booth_val = booth_totals[i] if i < len(booth_totals) else 0
        official_val = c['votes']
        if official_val > 100:
            # Error should be small since postal is separate
            # Get postal from existing data if available
            postal_file = DATA_DIR / f"elections/ac/TN/2021.json"
            err = abs(booth_val - official_val) / official_val * 100
            errors.append(err)
            status = "✓" if err < 10 else "✗"
            print(f"  {status} {c['name'][:25]}: Booth={booth_val:,} vs Official={official_val:,} ({err:.1f}% diff)")
    
    avg_err = sum(errors) / len(errors) if errors else 0
    print(f"\n  Average error: {avg_err:.1f}%")
    
    return avg_err


if __name__ == '__main__':
    print("=" * 60)
    print("Fixing final 2 ACs: HOSUR and ALANGUDI")
    print("=" * 60)
    
    # Fix HOSUR
    print("\n" + "=" * 40)
    print("Fixing HOSUR (TN-055)")
    print("=" * 40)
    
    ac_id, candidates, results = fix_hosur_simple()
    
    if len(results) > 350:
        print(f"\nExtracted {len(results)} booths")
        err = verify_accuracy(ac_id, candidates, results)
        
        if err < 15:  # Accept if reasonable
            save_booth_data(ac_id, candidates, results)
        else:
            print("Error too high, not saving")
    else:
        print(f"Only extracted {len(results)} booths, need more")
    
    # Fix ALANGUDI
    print("\n" + "=" * 40)
    print("Fixing ALANGUDI (TN-182)")
    print("=" * 40)
    
    ac_id, candidates, results = fix_alangudi()
    
    if len(results) > 200:
        print(f"\nExtracted {len(results)} booths")
        err = verify_accuracy(ac_id, candidates, results)
        
        if err < 15:
            save_booth_data(ac_id, candidates, results)
        else:
            print("Error too high, not saving")
    else:
        print(f"Only extracted {len(results)} booths, need more")
