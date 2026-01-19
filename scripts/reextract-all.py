#!/usr/bin/env python3
"""
Re-extract building names from PDFs for all problematic ACs.
Handles standard format: SL.NO | BOOTH_NO | Building | Polling Areas | Type
"""

import json
import subprocess
import re
from pathlib import Path

PDF_DIR = Path.home() / "Desktop" / "TN_PollingStations_English"
BOOTHS_DIR = Path("public/data/booths/TN")

BUILDING_KEYWORDS = ['school', 'college', 'building', 'office', 'hall', 'panchayat',
                     'government', 'govt', 'municipal', 'facing', 'wing', 'portion',
                     'terraced', 'tiled', 'floor', 'room', 'anganwadi', 'welfare',
                     'church', 'temple', 'mosque', 'library', 'community', 'kalyana']

def extract_pdf_text(pdf_path):
    """Extract text from PDF."""
    try:
        result = subprocess.run(['pdftotext', '-raw', str(pdf_path), '-'],
                               capture_output=True, text=True, timeout=60)
        return result.stdout
    except:
        return ""

def has_building_keyword(text):
    """Check if text has building keyword."""
    return any(kw in text.lower() for kw in BUILDING_KEYWORDS)

def is_polling_area(text):
    """Check if text is polling area data."""
    return bool(re.match(r'^\(\d+\)-|^\d+\)|street|nagar|colony|village', text, re.IGNORECASE))

def parse_standard_format(text):
    """Parse standard format PDFs."""
    booths = {}
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if not line:
            i += 1
            continue
        
        # Skip headers
        if any(x.lower() in line.lower() for x in ['sl.no', 'polling station', 
                                                    'list of polling', 'page ',
                                                    'location and name', 'polling area',
                                                    'assembly', 'parliamentary', 
                                                    '1 2 3 4 5', 'station type']):
            i += 1
            continue
        
        # Match: "SL_NO BOOTH_NO" pattern
        m = re.match(r'^(\d{1,3})\s+(\d+)\s*(.*)$', line)
        if m:
            booth_no = m.group(2)
            rest = m.group(3).strip()
            
            building_lines = []
            
            # If rest has building keyword, use it
            if rest and has_building_keyword(rest) and not is_polling_area(rest):
                # Find where polling area starts
                polling_start = None
                for pattern in [r'\(\d+\)-', r'\d+\)[^0-9]']:
                    pm = re.search(pattern, rest)
                    if pm:
                        polling_start = pm.start()
                        break
                
                if polling_start and polling_start > 10:
                    building_lines.append(rest[:polling_start].strip())
                elif not polling_start:
                    building_lines.append(rest)
            
            # Continue collecting building info from next lines
            j = i + 1
            while j < len(lines):
                next_line = lines[j].strip()
                
                if not next_line:
                    j += 1
                    continue
                
                # Stop at polling area
                if re.match(r'^\(\d+\)-', next_line) or re.match(r'^\d+\)[A-Z]', next_line):
                    break
                
                # Stop at voter type
                if next_line.upper() in ['ALL VOTERS', 'WOMEN ONLY', 'MEN ONLY']:
                    break
                
                # Stop at next booth
                if re.match(r'^\d{1,3}\s+\d+', next_line):
                    break
                
                # Skip headers
                if any(x.lower() in next_line.lower() for x in ['sl.no', 'page ', 'list of']):
                    j += 1
                    continue
                
                # Check if building info
                if has_building_keyword(next_line) or (len(next_line) > 5 and not is_polling_area(next_line)):
                    # Check for polling area in this line
                    polling_start = None
                    for pattern in [r'\(\d+\)-', r'\d+\)[A-Z]']:
                        pm = re.search(pattern, next_line)
                        if pm:
                            polling_start = pm.start()
                            break
                    
                    if polling_start and polling_start > 10:
                        building_lines.append(next_line[:polling_start].strip())
                    elif not polling_start:
                        building_lines.append(next_line)
                
                j += 1
            
            # Combine building info
            if building_lines:
                full_addr = ' '.join(building_lines)
                full_addr = re.sub(r'\s+', ' ', full_addr).strip()
                full_addr = full_addr.rstrip(',').strip()
                
                if len(full_addr) > 15 and has_building_keyword(full_addr):
                    booth_key = str(int(booth_no))
                    parts = full_addr.split(',')
                    name = parts[0].strip()
                    if len(parts) > 1 and len(name) < 25:
                        name = f"{parts[0].strip()}, {parts[1].strip()}"
                    
                    booths[booth_key] = {
                        'name': name,
                        'address': full_addr
                    }
            
            i = j
        else:
            i += 1
    
    return booths

def fix_ac(ac_id):
    """Fix an AC by re-extracting from PDF."""
    ac_num = ac_id.split('-')[1]
    pdf_path = PDF_DIR / f"AC{ac_num}.pdf"
    booths_path = BOOTHS_DIR / ac_id / "booths.json"
    
    if not pdf_path.exists() or not booths_path.exists():
        return 0, 0
    
    text = extract_pdf_text(pdf_path)
    if not text:
        return 0, 0
    
    pdf_booths = parse_standard_format(text)
    
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
        
        # Check if current is bad (no building keyword, or has street patterns)
        is_bad = (
            not has_building_keyword(current_addr) or
            'street' in current_name.lower()[:20] or
            'nagar' in current_name.lower()[:15] or
            'colony' in current_name.lower()[:15] or
            ':' in current_name[:20] or
            'Polling Station' in current_name
        )
        
        if is_bad and booth_key in pdf_booths:
            pdf_info = pdf_booths[booth_key]
            if has_building_keyword(pdf_info['address']):
                booth['name'] = pdf_info['name']
                booth['address'] = pdf_info['address']
                updated += 1
    
    if updated > 0:
        with open(booths_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, len(data['booths'])

def main():
    print("Re-extracting building names from PDFs...")
    
    # All TN ACs
    total_updated = 0
    
    for ac_dir in sorted(BOOTHS_DIR.iterdir()):
        ac_id = ac_dir.name
        updated, total = fix_ac(ac_id)
        if updated > 0:
            print(f"  {ac_id}: fixed {updated}/{total}")
        total_updated += updated
    
    print(f"\nTotal fixed: {total_updated}")

if __name__ == "__main__":
    main()
