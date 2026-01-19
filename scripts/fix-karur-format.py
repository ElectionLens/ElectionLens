#!/usr/bin/env python3
"""
Fix ACs with Karur-style PDF format where:
- Booth number is in column 1
- Locality in column 2
- Building name in column 3 (multi-line)
- Polling area in column 4

Format example:
1 Punjai        Panchayat Union Elementary    1.Punjai...    All Voters
  Kadambankurichi School, West Facing North
                Building Punjai
                Kadambankurichi 639113
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

def parse_karur_format(text, ac_id):
    """Parse Karur-style format."""
    booths = {}
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if not line:
            i += 1
            continue
        
        # Skip headers and page info
        if any(x.lower() in line.lower() for x in ['polling station', 'locality', 
                                                    'page ', 'assemb', 'parliamen',
                                                    'whether for', 'polling area']):
            i += 1
            continue
        
        # Match line starting with booth number (1-3 digits) followed by text
        m = re.match(r'^(\d{1,3})\s+([A-Za-z].*?)(?:\s{2,}|$)', line)
        if m:
            booth_no = m.group(1)
            locality = m.group(2).strip()
            
            # Find building info - look for keywords
            building_parts = []
            
            # Check rest of this line for building
            rest_of_line = line[m.end():].strip()
            if rest_of_line and has_building_keyword(rest_of_line):
                # Extract just the building part (before polling area)
                pa_match = re.search(r'\d+\.[A-Z]', rest_of_line)
                if pa_match:
                    building_parts.append(rest_of_line[:pa_match.start()].strip())
                else:
                    building_parts.append(rest_of_line)
            
            # Look at subsequent lines for more building info
            j = i + 1
            while j < len(lines) and j < i + 10:
                next_line = lines[j].strip()
                
                if not next_line:
                    j += 1
                    continue
                
                # Stop at next booth number
                if re.match(r'^\d{1,3}\s+[A-Z]', next_line):
                    break
                
                # Stop at "All Voters" etc
                if next_line in ['All Voters', 'Women Only', 'Men Only']:
                    break
                
                # Stop at page break
                if 'page' in next_line.lower() or 'assemb' in next_line.lower():
                    break
                
                # Check if this line has building keyword or is continuation
                if has_building_keyword(next_line):
                    # Extract building part
                    pa_match = re.search(r'\d+\.[A-Z]', next_line)
                    if pa_match:
                        building_parts.append(next_line[:pa_match.start()].strip())
                    else:
                        building_parts.append(next_line)
                elif building_parts:
                    # Check if continuation (no leading number)
                    if not re.match(r'^\d+\.', next_line) and next_line[0].isupper():
                        # Might be building continuation if short
                        if len(next_line) < 40 and not any(kw in next_line.lower() for kw in ['ward', 'r.v', 'p)', '(p']):
                            building_parts.append(next_line)
                
                j += 1
            
            # Combine building info
            if building_parts:
                full_addr = ' '.join(building_parts)
                full_addr = re.sub(r'\s+', ' ', full_addr).strip()
                full_addr = full_addr.rstrip(',').strip()
                
                if len(full_addr) > 10 and has_building_keyword(full_addr):
                    booth_key = str(int(booth_no))
                    parts = full_addr.split(',')
                    name = parts[0].strip()
                    if len(parts) > 1 and len(name) < 25:
                        name = f"{parts[0].strip()}, {parts[1].strip()}"
                    
                    booths[booth_key] = {
                        'name': name,
                        'address': full_addr
                    }
            
            i = j if j > i + 1 else i + 1
        else:
            i += 1
    
    return booths

def fix_ac(ac_id):
    """Fix an AC with Karur-style format."""
    ac_num = ac_id.split('-')[1]
    pdf_path = PDF_DIR / f"AC{ac_num}.pdf"
    booths_path = BOOTHS_DIR / ac_id / "booths.json"
    
    if not pdf_path.exists() or not booths_path.exists():
        return 0, 0
    
    text = extract_pdf_text(pdf_path)
    if not text:
        return 0, 0
    
    pdf_booths = parse_karur_format(text, ac_id)
    
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
        
        # Only fix if current is fallback
        if 'Polling Station' in current_name and booth_key in pdf_booths:
            pdf_info = pdf_booths[booth_key]
            booth['name'] = pdf_info['name']
            booth['address'] = pdf_info['address']
            updated += 1
    
    if updated > 0:
        with open(booths_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, len(data['booths'])

def main():
    print("Fixing ACs with Karur-style PDF format...")
    
    # ACs with many "Polling Station" fallbacks
    problem_acs = [
        'TN-135', 'TN-132', 'TN-129', 'TN-131', 'TN-134', 'TN-169',
        'TN-110', 'TN-172', 'TN-023', 'TN-056', 'TN-067', 'TN-095',
        'TN-124', 'TN-149', 'TN-165'
    ]
    
    total_updated = 0
    
    for ac_id in problem_acs:
        updated, total = fix_ac(ac_id)
        if updated > 0:
            print(f"  {ac_id}: fixed {updated}/{total}")
        total_updated += updated
    
    print(f"\nTotal fixed: {total_updated}")

if __name__ == "__main__":
    main()
