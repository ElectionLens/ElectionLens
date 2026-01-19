#!/usr/bin/env python3
"""
Fix remaining ACs with booth number mismatches by using sequential matching.
Maps PDF addresses to JSON booths in order: PDF booth 1 → JSON booth 1 (sorted), etc.
"""

import json
import subprocess
import re
from pathlib import Path

# Paths
PDF_DIR = Path.home() / "Desktop" / "TN_PollingStations_English"
BOOTHS_DIR = Path("public/data/booths/TN")

# ACs that need sequential matching - ALL ACs for comprehensive coverage
PROBLEM_ACS = [
    'TN-159', 'TN-132', 'TN-129', 'TN-093', 'TN-135', 'TN-092',
    'TN-120', 'TN-067', 'TN-069', 'TN-095', 'TN-066', 'TN-094', 'TN-166',
    'TN-178', 'TN-182', 'TN-179', 'TN-183', 'TN-181', 'TN-180', 'TN-017', 'TN-025',
    # Additional ACs with missing addresses
    'TN-131', 'TN-021', 'TN-011', 'TN-020', 'TN-016', 'TN-022', 'TN-019', 'TN-008',
    'TN-027', 'TN-030', 'TN-031', 'TN-032', 'TN-033', 'TN-035'
]

BUILDING_KEYWORDS = [
    'school', 'college', 'building', 'office', 'hall', 'center', 'centre',
    'panchayat', 'government', 'govt', 'municipal', 'facing', 'wing',
    'portion', 'terraced', 'tiled', 'floor', 'room'
]

def extract_pdf_text(pdf_path):
    """Extract text from PDF."""
    try:
        result = subprocess.run(
            ["pdftotext", "-raw", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=60
        )
        return result.stdout
    except:
        return ""

def has_building_keyword(text):
    """Check if text contains building-related keywords."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in BUILDING_KEYWORDS)

def extract_addresses_sequential(text):
    """Extract addresses in sequential order from PDF."""
    addresses = []
    lines = text.split('\n')
    
    i = 0
    current_seq = 0  # Track sequence number
    
    while i < len(lines):
        line = lines[i].strip()
        
        if not line:
            i += 1
            continue
        
        # Skip headers
        if any(x.lower() in line.lower() for x in ['sl.no', 'sl no', 'polling station',
                                                    'list of polling', 'page ', 'assembly',
                                                    'parliamentary', 'location and name',
                                                    'polling areas', 'building in which',
                                                    '1 2 3 4 5', 'whether for', 'p.s.',
                                                    'comprised within']):
            i += 1
            continue
        
        # Try to find booth entry
        booth_no = None
        content_start = ""
        
        # Various patterns for booth entries
        patterns = [
            r'^(\d{1,3})\s+(\d+)\s+(.+)',  # "NUM NUM text"
            r'^(\d{1,3})\s+(\d+[A-Z]*(?:\([WM]\))?)\s*(.*)$',  # "NUM BOOTHNO text"
            r'^(\d{1,3})\s+([A-Z][a-z]+.*)$',  # "NUM LOCALITY"
            r'^(ALL VOTERS|WOMEN ONLY|MEN ONLY)\s+(\d+)\s+(\d+)',  # "VOTER_TYPE NUM NUM"
        ]
        
        for pattern in patterns:
            m = re.match(pattern, line, re.IGNORECASE)
            if m:
                if 'ALL VOTERS' in pattern or 'WOMEN ONLY' in pattern:
                    booth_no = m.group(3)
                elif len(m.groups()) >= 2:
                    booth_no = m.group(2) if m.group(2).isdigit() else m.group(1)
                    if len(m.groups()) >= 3:
                        content_start = m.group(3) if m.group(3) else ""
                    elif len(m.groups()) == 2:
                        content_start = m.group(2) if not m.group(2).isdigit() else ""
                break
        
        # Pattern for format like "1\nPanchayat Union..." (single number on line)
        if not booth_no and re.match(r'^(\d{1,3})$', line):
            booth_no = line
        
        # Pattern for building-first format (TN-178 style)
        # Line starts with building keyword and ends with "NUM All Voters"
        if not booth_no and has_building_keyword(line):
            # Look ahead for booth number
            j = i
            building_lines = [line]
            while j + 1 < len(lines):
                j += 1
                next_line = lines[j].strip()
                if not next_line:
                    continue
                # Check if this line ends with "NUM All Voters"
                m = re.search(r'(\d{1,3})\s+(All Voters|Women only|Men only)\s*$', next_line, re.IGNORECASE)
                if m:
                    booth_no = m.group(1)
                    # Add content before the booth number
                    building_lines.append(next_line[:m.start()].strip())
                    content_start = ' '.join(building_lines)
                    i = j
                    break
                # Stop if we hit polling areas
                if re.match(r'^(\d+\)|1\))', next_line):
                    break
                building_lines.append(next_line)
        
        if booth_no:
            # Collect building info
            building_lines = [content_start] if content_start else []
            j = i + 1
            voter_type = ""
            
            while j < len(lines):
                next_line = lines[j].strip()
                
                if not next_line:
                    j += 1
                    continue
                
                # Stop conditions
                if next_line.lower() in ['all voters', 'women only', 'men only']:
                    voter_type = next_line.title()
                    j += 1
                    break
                
                # Polling areas
                if re.match(r'^(\d+\.[A-Z]|\(\d+\)-|\d+-\d+\.)', next_line):
                    # Skip polling areas
                    while j < len(lines):
                        skip = lines[j].strip()
                        if skip.lower() in ['all voters', 'women only', 'men only']:
                            voter_type = skip.title()
                            j += 1
                            break
                        if re.match(r'^(\d{1,3})\s+', skip):
                            break
                        j += 1
                    break
                
                # Next booth
                for pattern in patterns:
                    if re.match(pattern, next_line, re.IGNORECASE):
                        break
                else:
                    # Skip headers
                    if any(x.lower() in next_line.lower() for x in ['sl.no', 'page ', 'building', 'polling']):
                        j += 1
                        continue
                    building_lines.append(next_line)
                    j += 1
                    continue
                break
            
            # Process building address
            if building_lines:
                full_addr = ' '.join(building_lines)
                full_addr = re.sub(r'\s+', ' ', full_addr).strip()
                full_addr = re.sub(r',\s*,', ',', full_addr).rstrip(',')
                
                # Remove polling area content if mixed in
                full_addr = re.sub(r'\d+\.[A-Z][a-z]+[^,]*Ward.*$', '', full_addr, flags=re.IGNORECASE)
                full_addr = full_addr.strip().rstrip(',')
                
                if len(full_addr) > 15:
                    current_seq += 1
                    addresses.append({
                        'seq': current_seq,
                        'pdf_booth': booth_no,
                        'address': full_addr,
                        'name': full_addr.split(',')[0].strip(),
                        'voter_type': voter_type
                    })
            
            i = j
        else:
            i += 1
    
    return addresses

def update_booth_sequential(ac_id, pdf_addresses):
    """Update booth data using sequential matching."""
    booths_file = BOOTHS_DIR / ac_id / "booths.json"
    
    if not booths_file.exists():
        return 0, 0
    
    with open(booths_file, 'r') as f:
        data = json.load(f)
    
    # Sort booths by their numeric booth number
    def booth_sort_key(booth):
        num = re.sub(r'[A-Z\(\)]', '', booth.get('boothNo', '0'))
        return int(num) if num.isdigit() else 0
    
    sorted_booths = sorted(data['booths'], key=booth_sort_key)
    
    # Create mapping from sorted position to booth
    booth_by_position = {i+1: booth for i, booth in enumerate(sorted_booths)}
    
    updated = 0
    total = len(data['booths'])
    
    # Match by sequence
    for addr in pdf_addresses:
        seq = addr['seq']
        if seq in booth_by_position:
            booth = booth_by_position[seq]
            # Only update if current address is short or missing
            current_addr = booth.get('address', '')
            if len(current_addr) < 20 or not has_building_keyword(current_addr):
                booth['name'] = addr['name']
                booth['address'] = addr['address']
                booth['area'] = addr['voter_type']
                updated += 1
    
    if updated > 0:
        with open(booths_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, total

def main():
    print("Fixing remaining ACs with sequential matching...")
    print()
    
    total_fixed = 0
    
    for ac_id in PROBLEM_ACS:
        ac_num = ac_id.split('-')[1]
        pdf_path = PDF_DIR / f"AC{ac_num}.pdf"
        
        if not pdf_path.exists():
            print(f"{ac_id}: PDF not found")
            continue
        
        text = extract_pdf_text(pdf_path)
        if not text:
            print(f"{ac_id}: Could not extract text")
            continue
        
        # Extract addresses sequentially
        addresses = extract_addresses_sequential(text)
        print(f"{ac_id}: Extracted {len(addresses)} addresses from PDF")
        
        # Update using sequential matching
        updated, total = update_booth_sequential(ac_id, addresses)
        print(f"{ac_id}: Updated {updated}/{total} booths")
        
        total_fixed += updated
        print()
    
    print(f"Total fixed: {total_fixed} booths")

if __name__ == "__main__":
    main()
