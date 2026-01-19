#!/usr/bin/env python3
"""
Fix ACs with special PDF format where booth number comes first,
then building name, then "NUM All Voters", then polling areas.

Format:
256
Panchayat Union Elementary School,
Tiled South Building K.Pudupatti
622202
256 All Voters
1) Kaikulanvayal (R.V.) ...
"""

import json
import subprocess
import re
from pathlib import Path

PDF_DIR = Path.home() / "Desktop" / "TN_PollingStations_English"
BOOTHS_DIR = Path("public/data/booths/TN")

def extract_pdf_text(pdf_path):
    """Extract text from PDF."""
    try:
        result = subprocess.run(['pdftotext', '-raw', str(pdf_path), '-'],
                               capture_output=True, text=True, timeout=60)
        return result.stdout
    except:
        return ""

def parse_special_format(text):
    """Parse the special format where booth number comes first alone."""
    booths = {}
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Skip empty and header lines
        if not line:
            i += 1
            continue
        
        if any(x.lower() in line.lower() for x in ['list of polling', 'polling station', 
                                                    'page number', 'location and name',
                                                    'polling area', 'whether for',
                                                    'assembly', 'parliamentary', 'sl.']):
            i += 1
            continue
        
        # Look for single booth number (just digits)
        if re.match(r'^\d{1,3}$', line):
            booth_no = line
            building_lines = []
            
            j = i + 1
            while j < len(lines):
                next_line = lines[j].strip()
                
                if not next_line:
                    j += 1
                    continue
                
                # Stop at "NUM All Voters" pattern
                if re.match(r'^\d+\s+All Voters', next_line, re.IGNORECASE):
                    break
                
                # Stop at next booth number
                if re.match(r'^\d{1,3}$', next_line):
                    break
                
                # Stop at polling area
                if re.match(r'^\d+\)\s*[A-Z]', next_line):
                    break
                
                # Skip headers
                if any(x.lower() in next_line.lower() for x in ['list of polling', 'page number']):
                    j += 1
                    continue
                
                # This is building info
                building_lines.append(next_line)
                j += 1
            
            if building_lines:
                full_addr = ' '.join(building_lines)
                full_addr = re.sub(r'\s+', ' ', full_addr).strip()
                full_addr = full_addr.rstrip(',').strip()
                
                if len(full_addr) > 15:
                    # Get name from first parts
                    parts = full_addr.split(',')
                    name = parts[0].strip()
                    if len(parts) > 1 and len(name) < 30:
                        name = f"{parts[0].strip()}, {parts[1].strip()}"
                    
                    booth_key = str(int(booth_no))
                    booths[booth_key] = {
                        'name': name,
                        'address': full_addr
                    }
            
            i = j
        else:
            i += 1
    
    return booths

def fix_ac(ac_id):
    """Fix an AC with special format."""
    ac_num = ac_id.split('-')[1]
    pdf_path = PDF_DIR / f"AC{ac_num}.pdf"
    booths_path = BOOTHS_DIR / ac_id / "booths.json"
    
    if not pdf_path.exists() or not booths_path.exists():
        return 0, 0
    
    text = extract_pdf_text(pdf_path)
    if not text:
        return 0, 0
    
    pdf_booths = parse_special_format(text)
    
    if not pdf_booths:
        return 0, 0
    
    with open(booths_path) as f:
        data = json.load(f)
    
    updated = 0
    for booth in data['booths']:
        booth_no = booth.get('boothNo', '')
        booth_key = re.sub(r'[A-Z\(\)]', '', booth_no)
        if booth_key.isdigit():
            booth_key = str(int(booth_key))
        
        current_name = booth.get('name', '')
        current_addr = booth.get('address', '')
        
        # Check if current is garbage (has R.V. or polling area patterns)
        is_garbage = (
            '(R.V' in current_name or
            '(R.V' in current_addr or
            ') ' in current_name[:20] or
            current_name.startswith('1)') or
            'All Voters' in current_name
        )
        
        if is_garbage and booth_key in pdf_booths:
            pdf_info = pdf_booths[booth_key]
            booth['name'] = pdf_info['name']
            booth['address'] = pdf_info['address']
            updated += 1
    
    if updated > 0:
        with open(booths_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, len(data['booths'])

def main():
    print("Fixing ACs with special PDF format...")
    
    # ACs that have this special format - try ALL ACs with issues
    special_acs = [f'TN-{str(i).zfill(3)}' for i in range(1, 235)]
    
    total_updated = 0
    
    for ac_id in sorted(special_acs):
        updated, total = fix_ac(ac_id)
        if updated > 0:
            print(f"  {ac_id}: fixed {updated}/{total}")
        total_updated += updated
    
    print(f"\nTotal fixed: {total_updated}")

if __name__ == "__main__":
    main()
