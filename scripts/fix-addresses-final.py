#!/usr/bin/env python3
"""
Final comprehensive fix for booth addresses.
1. Expands abbreviated names (P.U.E.School -> Panchayat Union Elementary School)
2. Cleans garbage patterns
3. Adds missing keywords recognition
"""

import json
import re
from pathlib import Path

BOOTHS_DIR = Path("public/data/booths/TN")

# Abbreviation expansions
ABBREVIATIONS = {
    'P.U.E.School': 'Panchayat Union Elementary School',
    'P.U.M.School': 'Panchayat Union Middle School',
    'P.U.P.School': 'Panchayat Union Primary School',
    'P.U.E School': 'Panchayat Union Elementary School',
    'P.U.M School': 'Panchayat Union Middle School',
    'P.U.P School': 'Panchayat Union Primary School',
    'PUE School': 'Panchayat Union Elementary School',
    'PUM School': 'Panchayat Union Middle School',
    'PUP School': 'Panchayat Union Primary School',
    'PUMS,': 'Panchayat Union Middle School,',
    'PUES,': 'Panchayat Union Elementary School,',
    'PUPS,': 'Panchayat Union Primary School,',
    'PUMS ': 'Panchayat Union Middle School ',
    'PUES ': 'Panchayat Union Elementary School ',
    'PUPS ': 'Panchayat Union Primary School ',
    'V.A.O.Office': 'Village Administrative Officer Office',
    'V.A.O Office': 'Village Administrative Officer Office',
    'VAO Office': 'Village Administrative Officer Office',
    'Govt.Hr.Sec.School': 'Government Higher Secondary School',
    'Govt.High.School': 'Government High School',
    'Govt.H.S.School': 'Government High School',
    'Govt.M.School': 'Government Middle School',
    'Govt.E.School': 'Government Elementary School',
    'GHS,': 'Government High School,',
    'GHSS,': 'Government Higher Secondary School,',
    'GMS,': 'Government Middle School,',
    'A.D.W.School': 'Adi Dravidar Welfare School',
    'A.D.W School': 'Adi Dravidar Welfare School',
    'ADW School': 'Adi Dravidar Welfare School',
    'ADWS,': 'Adi Dravidar Welfare School,',
    'St.J.M.School': 'St. Joseph\'s Middle School',
    'St.M.School': 'St. Mary\'s School',
    'ICDS Centre': 'Integrated Child Development Services Centre',
    'R.C.School': 'Roman Catholic School',
    'R.C School': 'Roman Catholic School',
    'RC School': 'Roman Catholic School',
}

# Garbage patterns to remove
GARBAGE_PATTERNS = [
    r'^All Voters\s*',  # All Voters at start
    r'^Women only\s*',  # Women only at start
    r'^Men only\s*',  # Men only at start
    r'\([RVP]+\.?\)\s*[Aa]nd\s*\([RVP]+\.?\)',  # (R.V) And (P)
    r'\([RV]+\.?[RV]*\)',  # (R.V) or (RV)
    r'\([PVT]+\.?\)',  # (P) or (T.P)
    r'Ward\s*-?\s*\d+',  # Ward-1, Ward 2
    r'\bwd-?\d+\b',  # wd-1
    r'\d+\)\s*[A-Z][a-z]+',  # 1) Name
    r'\d+\.\s*[A-Z][a-z]+\s+\([^)]+\)\s*[A-Za-z\s,]+(?=\d+\.|$)',  # polling area entries
    r'^\d+\)\s*',  # 1) at start
    r'^\d+\.\s*[A-Z][a-z]+',  # 1.Name at start
    r'\(\d+\)-[^,]+',  # (1)-...
    r'OVERSEAS ELECTORS',
    r'All Voters',
    r'Women only',
    r'Men only',
    r'Polling Station No Location and Name of Station Located Whether for all Voters or Men only or Women only Sl\. No',
]

# Valid building keywords
BUILDING_KEYWORDS = [
    'school', 'college', 'building', 'office', 'hall', 'center', 'centre',
    'panchayat', 'government', 'govt', 'municipal', 'facing', 'wing', 
    'portion', 'terraced', 'tiled', 'floor', 'room', 'aided', 'elementary',
    'primary', 'middle', 'high', 'anganwadi', 'welfare', 'church', 'mosque',
    'temple', 'library', 'community', 'kalyana', 'mandapam', 'dispensary',
    'icds', 'integrated', 'services', 'ration', 'depot', 'store', 'mahal',
    'administrative', 'corporation', 'municipality', 'town'
]

def expand_abbreviations(text):
    """Expand abbreviated names."""
    for abbr, full in ABBREVIATIONS.items():
        if abbr.lower() in text.lower():
            # Case-insensitive replacement
            pattern = re.escape(abbr)
            text = re.sub(pattern, full, text, flags=re.IGNORECASE)
    return text

def clean_text(text):
    """Clean garbage patterns from text."""
    for pattern in GARBAGE_PATTERNS:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    
    # Clean whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r',\s*,', ',', text)
    text = text.strip(',.;: ')
    
    return text

def has_building_keyword(text):
    """Check if text has a building keyword."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in BUILDING_KEYWORDS)

def is_good_address(name, addr):
    """Check if address is good quality."""
    if len(name) < 15:
        return False
    if name.lower() in ['school', 'building', 'office', 'high school']:
        return False
    if 'Polling Station' in name:
        return False
    if not has_building_keyword(addr):
        return False
    return True

def fix_booth(booth):
    """Fix a single booth's address."""
    name = booth.get('name', '')
    addr = booth.get('address', '')
    
    # Expand abbreviations
    name = expand_abbreviations(name)
    addr = expand_abbreviations(addr)
    
    # Clean garbage
    name = clean_text(name)
    addr = clean_text(addr)
    
    # If name is short, try to get better name from address
    if len(name) < 20:
        parts = addr.split(',')
        if len(parts) >= 2:
            combined = f"{parts[0].strip()}, {parts[1].strip()}"
            if len(combined) > len(name):
                name = combined
        elif parts and len(parts[0]) > len(name):
            name = parts[0].strip()
    
    # Clean again
    name = name.strip(',.;: ')
    addr = addr.strip(',.;: ')
    
    return name, addr

def fix_ac(ac_path):
    """Fix all booths in an AC."""
    booths_path = ac_path / "booths.json"
    if not booths_path.exists():
        return 0
    
    with open(booths_path) as f:
        data = json.load(f)
    
    fixed = 0
    for booth in data['booths']:
        orig_name = booth.get('name', '')
        orig_addr = booth.get('address', '')
        
        new_name, new_addr = fix_booth(booth)
        
        if new_name != orig_name or new_addr != orig_addr:
            booth['name'] = new_name
            booth['address'] = new_addr
            fixed += 1
    
    if fixed > 0:
        with open(booths_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    return fixed

def main():
    print("Fixing booth addresses comprehensively...")
    
    total_fixed = 0
    
    for ac_dir in sorted(BOOTHS_DIR.iterdir()):
        fixed = fix_ac(ac_dir)
        if fixed > 0:
            print(f"  {ac_dir.name}: fixed {fixed}")
        total_fixed += fixed
    
    print(f"\nTotal fixed: {total_fixed}")
    
    # Check quality
    print("\n=== Quality Check ===")
    total_good = 0
    total_all = 0
    
    for ac_dir in sorted(BOOTHS_DIR.iterdir()):
        booths_path = ac_dir / "booths.json"
        if not booths_path.exists():
            continue
        
        with open(booths_path) as f:
            data = json.load(f)
        
        for b in data['booths']:
            total_all += 1
            if is_good_address(b.get('name', ''), b.get('address', '')):
                total_good += 1
    
    pct = total_good / total_all * 100 if total_all > 0 else 0
    print(f"Good addresses: {total_good}/{total_all} ({pct:.1f}%)")

if __name__ == "__main__":
    main()
