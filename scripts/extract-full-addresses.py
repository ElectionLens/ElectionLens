#!/usr/bin/env python3
"""
Extract full booth addresses from Tamil Nadu polling station PDFs.
Uses -raw mode for cleaner text extraction.

Address format: "Building Name, Building Details, Location-Pincode"
Example: "Panchayat Union Primary School, North Building South Facing, Egumadurai-601201"
"""

import json
import subprocess
import re
from pathlib import Path

# Paths
PDF_DIR = Path.home() / "Desktop" / "TN_PollingStations_English"
BOOTHS_DIR = Path("public/data/booths/TN")

def extract_pdf_text(pdf_path):
    """Extract text from PDF using pdftotext raw mode."""
    try:
        result = subprocess.run(
            ["pdftotext", "-raw", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=60
        )
        return result.stdout
    except Exception as e:
        return ""

def parse_booths_raw(text):
    """Parse booth data from raw PDF text output."""
    booths = {}
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Skip headers and empty lines
        if not line or any(x in line for x in ['Polling Station', 'Sl.No', 'List of Polling',
                                               'Page Number', 'Assembly', 'Parliamentary',
                                               'Location and name', 'Polling Areas',
                                               'station No', '1 2 3 4 5', 'Whether for']):
            i += 1
            continue
        
        # Try to match booth entry - two formats:
        # Format 1: "SL_NO BOOTH_NO" alone on a line
        # Format 2: "SL_NO BOOTH_NO Building_text..." all on one line
        
        match1 = re.match(r'^(\d{1,3})\s+(\d+[A-Z]*(?:\([WM]\))?)\s*$', line)  # Format 1
        match2 = re.match(r'^(\d{1,3})\s+(\d+[A-Z]*(?:\([WM]\))?)\s+(.+)$', line)  # Format 2
        
        if match1 or match2:
            if match1:
                booth_no = match1.group(2)
                first_building_text = ""
            else:
                booth_no = match2.group(2)
                first_building_text = match2.group(3)
            
            # Collect building address lines
            building_lines = []
            if first_building_text:
                building_lines.append(first_building_text)
            
            voter_type = ""
            j = i + 1
            
            while j < len(lines):
                next_line = lines[j].strip()
                
                if not next_line:
                    j += 1
                    continue
                
                # Check if this is polling areas (starts with 1. or (1)- or similar)
                if re.match(r'^(\(\d+\)-|\d+\.[A-Z])', next_line):
                    break
                
                # Check if this is voter type
                if next_line.lower() in ['all voters', 'women only', 'men only']:
                    voter_type = next_line.title()
                    break
                
                # Check if this is a new booth entry (starts with two numbers)
                if re.match(r'^\d{1,3}\s+\d+', next_line):
                    break
                
                # Skip headers
                if any(x in next_line for x in ['Polling Station', 'Sl.No', 'List of Polling',
                                                'Page Number', 'Assembly', 'Parliamentary',
                                                'Location and name', '1 2 3 4 5', 'Whether for']):
                    j += 1
                    continue
                
                # This is part of the building address
                building_lines.append(next_line)
                j += 1
            
            # Combine building lines into address
            if building_lines:
                full_address = ' '.join(building_lines)
                full_address = re.sub(r'\s+', ' ', full_address).strip()
                full_address = re.sub(r',\s*,', ',', full_address)
                full_address = full_address.rstrip(',')
                
                # Get short name (first part before comma)
                short_name = full_address.split(',')[0].strip()
                
                # Normalize booth key to just the number
                booth_key = booth_no.replace('M', '').replace('A(W)', '').replace('(W)', '')
                if booth_key.isdigit():
                    booth_key = str(int(booth_key))
                
                if booth_key not in booths or len(full_address) > len(booths[booth_key].get('address', '')):
                    booths[booth_key] = {
                        'name': short_name,
                        'address': full_address,
                        'voter_type': voter_type
                    }
            
            i = j
        else:
            i += 1
    
    return booths

def update_booth_data(ac_id, pdf_booths):
    """Update booth data with addresses from PDF."""
    booths_file = BOOTHS_DIR / ac_id / "booths.json"
    
    if not booths_file.exists():
        return 0, 0
    
    with open(booths_file, 'r') as f:
        data = json.load(f)
    
    updated = 0
    total = len(data['booths'])
    
    for booth in data['booths']:
        booth_no_raw = booth.get('boothNo', '')
        # Get numeric part only
        booth_no_num = re.sub(r'[A-Z\(\)]', '', booth_no_raw)
        
        keys_to_try = [booth_no_raw, booth_no_num]
        if booth_no_num.isdigit():
            keys_to_try.extend([booth_no_num.lstrip('0'), str(int(booth_no_num))])
        
        for key in keys_to_try:
            if key in pdf_booths:
                pdf_info = pdf_booths[key]
                if pdf_info['address'] and len(pdf_info['address']) > 10:
                    booth['name'] = pdf_info['name']
                    booth['address'] = pdf_info['address']
                    booth['area'] = pdf_info['voter_type'] if pdf_info['voter_type'] else ""
                    updated += 1
                    break
    
    if updated > 0:
        with open(booths_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, total

def main():
    print("Extracting booth addresses from polling station PDFs...")
    print()
    
    pdf_files = sorted(PDF_DIR.glob("AC*.pdf"))
    print(f"Found {len(pdf_files)} PDFs")
    
    total_updated = 0
    total_booths = 0
    low_coverage = []
    
    for pdf_file in pdf_files:
        ac_num = pdf_file.stem.replace("AC", "").zfill(3)
        ac_id = f"TN-{ac_num}"
        
        text = extract_pdf_text(pdf_file)
        if not text:
            continue
        
        pdf_booths = parse_booths_raw(text)
        updated, total = update_booth_data(ac_id, pdf_booths)
        
        if total > 0:
            pct = (updated / total) * 100
            if pct < 80:
                low_coverage.append((ac_id, pct, updated, total))
        
        total_updated += updated
        total_booths += total
    
    print(f"\nTotal: {total_updated}/{total_booths} booths updated ({(total_updated/total_booths*100):.1f}%)")
    
    if low_coverage:
        print(f"\nACs with <80% coverage ({len(low_coverage)}):")
        for ac_id, pct, updated, total in sorted(low_coverage, key=lambda x: x[1])[:15]:
            print(f"  {ac_id}: {updated}/{total} ({pct:.1f}%)")
        if len(low_coverage) > 15:
            print(f"  ... and {len(low_coverage) - 15} more")

if __name__ == "__main__":
    main()
