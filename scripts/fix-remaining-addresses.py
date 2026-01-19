#!/usr/bin/env python3
"""
Fix remaining ACs with <95% address coverage using multiple strategies.
"""

import json
import subprocess
import re
from pathlib import Path

# Paths
PDF_DIR = Path.home() / "Desktop" / "TN_PollingStations_English"
BOOTHS_DIR = Path("public/data/booths/TN")

# Building keywords
BUILDING_KEYWORDS = [
    'school', 'college', 'building', 'office', 'hall', 'center', 'centre',
    'panchayat', 'government', 'govt', 'municipal', 'facing', 'wing', 
    'portion', 'terraced', 'tiled', 'floor', 'room', 'aided', 'elementary',
    'primary', 'middle', 'high', 'anganwadi', 'r c c', 'rcc', 'block',
    'north', 'south', 'east', 'west', 'street', 'road', 'chennai', 'post'
]

def extract_pdf_text(pdf_path):
    """Extract text from PDF."""
    try:
        result = subprocess.run(['pdftotext', '-raw', str(pdf_path), '-'],
                               capture_output=True, text=True, timeout=60)
        return result.stdout
    except:
        return ""

def has_building_keyword(text):
    """Check if text contains building-related keywords."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in BUILDING_KEYWORDS)

def extract_addresses_format_special(text):
    """Extract addresses from special format PDFs (like TN-178)."""
    addresses = []
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if not line:
            i += 1
            continue
            
        # Skip headers
        if any(x.lower() in line.lower() for x in ['list of polling', 'polling station', 'page number',
                                                    'location and name', 'polling area', 'whether for',
                                                    'sl.', 'sl no', 'voters or', 'assembly', 'parliamentary']):
            i += 1
            continue
        
        # Look for booth number alone on a line
        if re.match(r'^\d{1,3}$', line):
            booth_num = int(line)
            building_lines = []
            j = i + 1
            
            while j < len(lines):
                next_line = lines[j].strip()
                
                if not next_line:
                    j += 1
                    continue
                
                # Stop at booth number followed by voter type
                if re.match(r'^\d+\s+(All Voters|Women only|Men only)', next_line, re.IGNORECASE):
                    break
                
                # Stop at polling areas
                if re.match(r'^(\d+\)|1\)|1\s+All|\d+\.[A-Z]|\(\d+\))', next_line):
                    break
                
                # Stop at next single booth number
                if re.match(r'^\d{1,3}$', next_line):
                    break
                
                # Skip headers
                if any(x.lower() in next_line.lower() for x in ['list of polling', 'page number', 'polling station']):
                    j += 1
                    continue
                
                # Add building line
                if has_building_keyword(next_line) or len(next_line) > 10:
                    building_lines.append(next_line)
                
                j += 1
            
            if building_lines:
                full_addr = ' '.join(building_lines)
                full_addr = re.sub(r'\s+', ' ', full_addr).strip().rstrip(',')
                
                if len(full_addr) > 15 and has_building_keyword(full_addr):
                    addresses.append({
                        'pdf_booth_num': booth_num,
                        'address': full_addr,
                        'name': full_addr.split(',')[0].strip()
                    })
            
            i = j
        else:
            i += 1
    
    return addresses

def extract_addresses_sequential(text):
    """Extract addresses from PDF in sequential order."""
    addresses = []
    lines = text.split('\n')
    
    i = 0
    current_booth = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        if not line:
            i += 1
            continue
        
        # Skip headers
        if any(x.lower() in line.lower() for x in ['sl.no', 'sl no', 'slno', 'polling station',
                                                    'list of polling', 'page ', 'assembly', 
                                                    'parliamentary', 'location and name',
                                                    'polling areas', 'building in which',
                                                    '1 2 3 4 5', 'whether for', 'voters or']):
            i += 1
            continue
        
        booth_match = None
        
        # Pattern: NUM NUM text or NUM NUM
        m = re.match(r'^(\d{1,3})\s+(\d+)\s*(.*)', line)
        if m:
            first_num = int(m.group(1))
            second_num = int(m.group(2))
            rest = m.group(3)
            if first_num == second_num or abs(first_num - second_num) <= 1:
                booth_match = (second_num, rest)
        
        # Pattern: NUM LOCALITY
        if not booth_match:
            m2 = re.match(r'^(\d{1,3})\s+([A-Z].+)', line)
            if m2:
                booth_match = (int(m2.group(1)), m2.group(2))
        
        # Pattern: VOTER_TYPE NUM NUM
        if not booth_match:
            m3 = re.match(r'^(ALL VOTERS|WOMEN ONLY|MEN ONLY)\s+(\d+)\s+(\d+)', line, re.IGNORECASE)
            if m3:
                booth_match = (int(m3.group(3)), "")
        
        if booth_match:
            booth_num, first_content = booth_match
            
            if current_booth == 0 or booth_num <= current_booth + 3:
                current_booth = booth_num
                
                building_lines = [first_content] if first_content else []
                j = i + 1
                
                while j < len(lines):
                    next_line = lines[j].strip()
                    
                    if not next_line:
                        j += 1
                        continue
                    
                    # Stop conditions
                    if next_line.lower() in ['all voters', 'women only', 'men only']:
                        j += 1
                        break
                    
                    if re.match(r'^(\d+\.[A-Z]|\(\d+\)-|\d+-\d+\.)', next_line):
                        break
                    
                    if re.match(r'^(\d{1,3})\s+(\d+|[A-Z])', next_line):
                        break
                    
                    if re.match(r'^(ALL VOTERS|WOMEN ONLY)', next_line, re.IGNORECASE):
                        break
                    
                    # Skip headers
                    if any(x.lower() in next_line.lower() for x in ['sl.no', 'page ', 'building in',
                                                                     'polling area', 'list of']):
                        j += 1
                        continue
                    
                    building_lines.append(next_line)
                    j += 1
                
                if building_lines:
                    full_addr = ' '.join(building_lines)
                    full_addr = re.sub(r'\s+', ' ', full_addr).strip()
                    
                    # Remove polling areas if present
                    for pattern in [r'\d+\.[A-Z][a-z]+\s+\(', r'\(\d+\)-', r'\d+-\d+\.']:
                        pm = re.search(pattern, full_addr)
                        if pm and pm.start() > 20:
                            full_addr = full_addr[:pm.start()].strip()
                    
                    full_addr = full_addr.rstrip(',').strip()
                    
                    if len(full_addr) > 15 and has_building_keyword(full_addr):
                        addresses.append({
                            'pdf_booth_num': booth_num,
                            'address': full_addr,
                            'name': full_addr.split(',')[0].strip()
                        })
                
                i = j
            else:
                i += 1
        else:
            i += 1
    
    return addresses

def fix_ac(ac_id):
    """Fix an AC using best strategy."""
    ac_num = ac_id.split('-')[1]
    pdf_path = PDF_DIR / f"AC{ac_num}.pdf"
    booths_path = BOOTHS_DIR / ac_id / "booths.json"
    
    if not pdf_path.exists() or not booths_path.exists():
        return 0, 0
    
    text = extract_pdf_text(pdf_path)
    if not text:
        return 0, 0
    
    # Try multiple extraction strategies
    addresses1 = extract_addresses_sequential(text)
    addresses2 = extract_addresses_format_special(text)
    
    best_addresses = addresses1 if len(addresses1) >= len(addresses2) else addresses2
    
    if not best_addresses:
        return 0, 0
    
    # Load JSON
    with open(booths_path) as f:
        data = json.load(f)
    
    # Sort booths by numeric value
    def booth_sort_key(b):
        num = re.sub(r'[A-Z\(\)]', '', b.get('boothNo', '0'))
        return int(num) if num.isdigit() else 0
    
    sorted_booths = sorted(data['booths'], key=booth_sort_key)
    
    # Match sequentially
    updated = 0
    for i, booth in enumerate(sorted_booths):
        if i < len(best_addresses):
            addr_info = best_addresses[i]
            if addr_info['address'] and len(addr_info['address']) > 10:
                booth_no = booth['boothNo']
                for orig_booth in data['booths']:
                    if orig_booth['boothNo'] == booth_no:
                        current = orig_booth.get('address', '')
                        if len(current) < 20 or not has_building_keyword(current):
                            orig_booth['name'] = addr_info['name']
                            orig_booth['address'] = addr_info['address']
                            updated += 1
                        break
    
    if updated > 0:
        with open(booths_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, len(data['booths'])

def main():
    print("Fixing remaining ACs...")
    
    # All ACs that might need fixing
    problem_acs = [
        'TN-178', 'TN-182', 'TN-179', 'TN-183', 'TN-181', 'TN-180',
        'TN-159', 'TN-132', 'TN-129', 'TN-093', 'TN-135', 'TN-092',
        'TN-120', 'TN-067', 'TN-069', 'TN-095', 'TN-066', 'TN-094', 'TN-166',
        'TN-027', 'TN-031', 'TN-032', 'TN-033', 'TN-034', 'TN-035'
    ]
    
    total_updated = 0
    
    for ac_id in sorted(problem_acs):
        updated, total = fix_ac(ac_id)
        if updated > 0:
            print(f"  {ac_id}: +{updated}")
        total_updated += updated
    
    print(f"\nTotal fixed: {total_updated}")

if __name__ == "__main__":
    main()
