#!/usr/bin/env python3
"""
Fix booths.json totalBooths to match actual Form 20 PDF booth counts.
This aligns metadata with Form 20 as the ground truth.
"""

import subprocess
import re
import json
from pathlib import Path

FORM20_DIR = Path.home() / "Desktop/GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

# Known scanned ACs - can't determine count from PDF text
SCANNED_ACS = set([1, 3, 4, 5, 6, 9, 28, 29, 30, 31, 38, 39, 40, 41, 42, 
                  151, 152, 153, 154, 155, 156, 188, 189, 191, 192, 193, 
                  194, 213, 214, 215, 216, 217, 218])

# ACs where we already verified Form 20 count manually
VERIFIED_COUNTS = {
    7: 440,
    81: 236,
    82: 284,
    117: 465,
}


def get_pdf_booth_count(ac_num):
    """Count unique booth numbers in PDF row format."""
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return 0
    
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    text = result.stdout
    
    booths = set()
    for line in text.split('\n'):
        line = line.strip()
        if not line or not line[0].isdigit():
            continue
        
        numbers = re.findall(r'\b\d+\b', line)
        if len(numbers) >= 7:
            try:
                numbers = [int(n) for n in numbers]
                booth_no = numbers[1]
                
                if 1 <= booth_no <= 700:
                    # Validate it's a real data row
                    total = numbers[-2]
                    rejected = numbers[-3]
                    total_valid = numbers[-5]
                    
                    if abs(total - (total_valid + rejected)) <= 5:
                        booths.add(booth_no)
            except:
                pass
    
    return len(booths)


def fix_metadata(ac_num, new_total):
    """Update totalBooths in both booths.json and 2024.json."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Update booths.json
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if booths_file.exists():
        with open(booths_file) as f:
            data = json.load(f)
        old_total = data.get('totalBooths', 'not set')
        data['totalBooths'] = new_total
        with open(booths_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    # Update 2024.json
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
        data['totalBooths'] = len(data.get('results', {}))
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)


def main():
    fixed = 0
    skipped_scanned = 0
    already_correct = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        
        # Skip scanned ACs
        if ac_num in SCANNED_ACS:
            skipped_scanned += 1
            continue
        
        # Use verified count if available
        if ac_num in VERIFIED_COUNTS:
            pdf_count = VERIFIED_COUNTS[ac_num]
        else:
            pdf_count = get_pdf_booth_count(ac_num)
        
        if pdf_count == 0:
            continue
        
        # Check current metadata
        booths_file = OUTPUT_BASE / ac_id / "booths.json"
        if booths_file.exists():
            with open(booths_file) as f:
                data = json.load(f)
            current_total = data.get('totalBooths', 0)
            
            if current_total != pdf_count:
                fix_metadata(ac_num, pdf_count)
                print(f"{ac_id}: {current_total} -> {pdf_count}")
                fixed += 1
            else:
                already_correct += 1
    
    print()
    print(f"Fixed: {fixed} ACs")
    print(f"Already correct: {already_correct} ACs")
    print(f"Skipped (scanned): {skipped_scanned} ACs")


if __name__ == "__main__":
    main()
