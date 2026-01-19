#!/usr/bin/env python3
"""
Re-extract booth addresses from PDFs with improved parsing.
Focuses on ACs with incomplete addresses.
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
    'primary', 'middle', 'high', 'anganwadi', 'welfare', 'church', 'mosque',
    'temple', 'library', 'community', 'kalyana', 'mandapam', 'dispensary'
]

# Patterns to skip (polling area data)
SKIP_PATTERNS = [
    r'^\(\d+\)-',  # (1)-...
    r'^\d+\.[A-Z][a-z]+\s+\(',  # 1.Name (
    r'^\d+-\d+\.',  # 1-1.
    r'\(R\.?V\)',  # (R.V) or (RV)
    r'\([VP]\)',  # (P) or (V)
    r'Ward-?\s*\d',  # Ward-1, Ward 2
    r'wd-?\d',  # wd-1
    r'OVERSEAS ELECTORS',
]

def extract_pdf_text(pdf_path):
    """Extract text from PDF using raw mode."""
    try:
        result = subprocess.run(['pdftotext', '-raw', str(pdf_path), '-'],
                               capture_output=True, text=True, timeout=60)
        return result.stdout
    except:
        return ""

def is_skip_line(line):
    """Check if line should be skipped (polling area data, headers)."""
    line_lower = line.lower()
    
    # Skip headers
    if any(x in line_lower for x in ['sl.no', 'sl no', 'slno', 'polling station',
                                      'list of polling', 'page ', 'assembly',
                                      'parliamentary', 'location and name',
                                      'polling area', 'building in which',
                                      '1 2 3 4 5', 'whether for', 'voters or',
                                      'comprised within', 'p.s.', 'psno']):
        return True
    
    # Skip polling area patterns
    for pattern in SKIP_PATTERNS:
        if re.search(pattern, line, re.IGNORECASE):
            return True
    
    return False

def is_voter_type(line):
    """Check if line is a voter type."""
    return line.lower().strip() in ['all voters', 'women only', 'men only']

def has_building_keyword(text):
    """Check if text has building keyword."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in BUILDING_KEYWORDS)

def clean_building_text(text):
    """Clean building text of garbage."""
    # Remove polling area patterns
    for pattern in SKIP_PATTERNS:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    
    # Clean whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r',\s*,', ',', text)
    text = text.strip(',.;: ')
    
    return text

def extract_building_from_line(line):
    """Extract building info from a mixed line."""
    # Try to find where building info ends and polling area starts
    # Look for patterns like "1.Name" or "(1)-" or number followed by period and capital
    
    # Pattern: number.CapitalLetter (polling area start)
    patterns = [
        r'\d+\.[A-Z][a-z]+\s*\(',  # 1.Pannaikinar (R.V)
        r'\d+\.[A-Z][a-z]+',  # 1.Name
        r'\(\d+\)-',  # (1)-
        r'\d+-\d+\.',  # 1-1.
        r'\s+\d+\.\s*[A-Z]',  # space, number, period, capital
    ]
    
    for pattern in patterns:
        match = re.search(pattern, line)
        if match and match.start() > 15:
            building = line[:match.start()].strip()
            building = clean_building_text(building)
            if len(building) > 15:
                return building
    
    # Also try to find "(R.V)" pattern which indicates polling area
    rv_match = re.search(r'\([RV]+\.?[RV]*\)', line, re.IGNORECASE)
    if rv_match and rv_match.start() > 20:
        # Go back to find the polling area start (number.Name pattern before (R.V))
        before_rv = line[:rv_match.start()]
        num_match = re.search(r'\d+\.[A-Z][a-z]+\s*$', before_rv)
        if num_match:
            building = line[:num_match.start()].strip()
            building = clean_building_text(building)
            if len(building) > 15:
                return building
    
    return clean_building_text(line)

def parse_pdf_comprehensive(text):
    """Comprehensive PDF parser handling all formats."""
    booths = {}
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if not line or is_skip_line(line):
            i += 1
            continue
        
        booth_no = None
        building_start = ""
        
        # Pattern 1: "NUM NUM" or "NUM NUM text" (SL_NO BOOTH_NO format)
        m1 = re.match(r'^(\d{1,3})\s+(\d+[A-Z]*(?:\([WM]\))?)\s*(.*)$', line)
        if m1:
            booth_no = m1.group(2)
            rest = m1.group(3).strip()
            # Extract building from rest (may have polling areas mixed in)
            building_start = extract_building_from_line(rest) if rest else ""
        
        # Pattern 2: "NUM LOCALITY" (e.g., "1 Kovilvenni")
        if not booth_no:
            m2 = re.match(r'^(\d{1,3})\s+([A-Z][a-z].*)$', line)
            if m2:
                booth_no = m2.group(1)
                building_start = m2.group(2)
        
        # Pattern 3: "VOTER_TYPE NUM NUM" (e.g., "ALL VOTERS 1 1")
        if not booth_no:
            m3 = re.match(r'^(ALL VOTERS|WOMEN ONLY|MEN ONLY)\s+(\d+)\s+(\d+[A-Z]*)', line, re.IGNORECASE)
            if m3:
                booth_no = m3.group(3)
        
        # Pattern 4: Single booth number
        if not booth_no:
            m4 = re.match(r'^(\d{1,3})$', line)
            if m4:
                booth_no = m4.group(1)
        
        if booth_no:
            # Collect building info from following lines
            building_lines = []
            if building_start and len(building_start) > 5 and not is_skip_line(building_start):
                building_lines.append(extract_building_from_line(building_start))
            
            j = i + 1
            lines_checked = 0
            
            while j < len(lines) and lines_checked < 10:
                next_line = lines[j].strip()
                lines_checked += 1
                
                if not next_line:
                    j += 1
                    continue
                
                # Stop at voter type
                if is_voter_type(next_line):
                    j += 1
                    break
                
                # Stop at next booth entry
                if re.match(r'^(\d{1,3})\s+(\d+|[A-Z][a-z])', next_line):
                    break
                if re.match(r'^(ALL VOTERS|WOMEN ONLY)', next_line, re.IGNORECASE):
                    break
                if re.match(r'^\d{1,3}$', next_line):
                    break
                
                # Skip headers
                if is_skip_line(next_line):
                    j += 1
                    continue
                
                # Check if this is building info (has keyword) or at least not polling area
                extracted = extract_building_from_line(next_line)
                if extracted and len(extracted) > 5:
                    building_lines.append(extracted)
                
                j += 1
            
            # Combine building info
            if building_lines:
                full_addr = ' '.join(building_lines)
                full_addr = clean_building_text(full_addr)
                
                # Must have some recognizable building keyword
                if len(full_addr) > 20 and has_building_keyword(full_addr):
                    booth_key = re.sub(r'[A-Z\(\)]', '', str(booth_no))
                    if booth_key.isdigit():
                        booth_key = str(int(booth_key))
                    
                    # Get name from first part
                    parts = full_addr.split(',')
                    name = parts[0].strip() if parts else full_addr[:50]
                    if len(parts) > 1 and len(name) < 20:
                        name = f"{parts[0].strip()}, {parts[1].strip()}"
                    
                    if booth_key not in booths or len(full_addr) > len(booths[booth_key].get('address', '')):
                        booths[booth_key] = {
                            'name': name,
                            'address': full_addr
                        }
            
            i = j
        else:
            i += 1
    
    return booths

def update_ac_addresses(ac_id):
    """Update addresses for an AC from PDF."""
    ac_num = ac_id.split('-')[1]
    pdf_path = PDF_DIR / f"AC{ac_num}.pdf"
    booths_path = BOOTHS_DIR / ac_id / "booths.json"
    
    if not pdf_path.exists() or not booths_path.exists():
        return 0, 0
    
    # Extract from PDF
    text = extract_pdf_text(pdf_path)
    if not text:
        return 0, 0
    
    pdf_booths = parse_pdf_comprehensive(text)
    
    # Load existing data
    with open(booths_path) as f:
        data = json.load(f)
    
    # Update booths with better addresses
    updated = 0
    for booth in data['booths']:
        booth_no = booth.get('boothNo', '')
        booth_key = re.sub(r'[A-Z\(\)]', '', booth_no)
        if booth_key.isdigit():
            booth_key = str(int(booth_key))
        
        current_name = booth.get('name', '')
        current_addr = booth.get('address', '')
        
        # Check if current is incomplete
        is_incomplete = (
            len(current_name) < 15 or
            current_name.lower() in ['school', 'building', 'office', 'high school'] or
            not has_building_keyword(current_addr) or
            'Polling Station' in current_name
        )
        
        if is_incomplete and booth_key in pdf_booths:
            pdf_info = pdf_booths[booth_key]
            if len(pdf_info['address']) > len(current_addr):
                booth['name'] = pdf_info['name']
                booth['address'] = pdf_info['address']
                updated += 1
    
    if updated > 0:
        with open(booths_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, len(data['booths'])

def main():
    print("Re-extracting booth addresses from PDFs...")
    print()
    
    # ACs with >10% incomplete addresses
    problem_acs = [
        'TN-126', 'TN-095', 'TN-035', 'TN-096', 'TN-025', 'TN-030', 'TN-033',
        'TN-101', 'TN-231', 'TN-135', 'TN-062', 'TN-093', 'TN-064', 'TN-182',
        'TN-232', 'TN-017', 'TN-180', 'TN-021', 'TN-063', 'TN-027', 'TN-145',
        'TN-143', 'TN-146', 'TN-148', 'TN-138', 'TN-144', 'TN-087', 'TN-084',
        'TN-081', 'TN-083', 'TN-104', 'TN-107', 'TN-129', 'TN-132', 'TN-178',
        'TN-179', 'TN-181'
    ]
    
    total_updated = 0
    
    for ac_id in sorted(problem_acs):
        updated, total = update_ac_addresses(ac_id)
        if updated > 0:
            print(f"  {ac_id}: improved {updated}/{total}")
        total_updated += updated
    
    print(f"\nTotal improved: {total_updated}")

if __name__ == "__main__":
    main()
