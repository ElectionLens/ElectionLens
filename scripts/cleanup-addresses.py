#!/usr/bin/env python3
"""
Clean up booth addresses that have garbage data mixed in.
Removes polling area patterns and fixes truncated names.
"""

import json
import re
from pathlib import Path

BOOTHS_DIR = Path("public/data/booths/TN")

# Patterns to remove from addresses
GARBAGE_PATTERNS = [
    r'\([RVP]+\)\s*[Aa]nd\s*\([RVP]+\)',  # (R.V) And (P)
    r'\(R\.V\)\s*[Aa]nd\s*\(P\)',
    r'\([RV]+\)',  # (R.V) or (P)
    r'\(P\)',
    r'Ward-?\d+',  # Ward-1, Ward 2
    r'\bwd-?\d+\b',  # wd-1
    r'\d+\.[A-Z][a-z]+\s+\([^)]+\)',  # 1.Name (...)
    r'\(\d+\)-[^,]+',  # (1)-...
    r'^[VP]\)\s*[Aa]nd\s*',  # V) And or P) And at start
    r'^[VP]\)\s*',  # V) or P) at start
    r',\s*[VP]\)\s*[Aa]nd',  # , V) And
]

def clean_address(name, address):
    """Clean garbage from name and address."""
    # Clean both
    for pattern in GARBAGE_PATTERNS:
        name = re.sub(pattern, '', name, flags=re.IGNORECASE)
        address = re.sub(pattern, '', address, flags=re.IGNORECASE)
    
    # Clean up whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    address = re.sub(r'\s+', ' ', address).strip()
    
    # Remove leading/trailing punctuation
    name = name.strip(',.;: ')
    address = address.strip(',.;: ')
    
    # If name is too short or garbage, try to extract from address
    short_names = ['school', 'building', 'office', 'hall', 'high school', 'middle school', 
                   'primary school', 'elementary school']
    if len(name) < 15 or name.lower() in short_names:
        # Try to get better name from address by combining first parts
        parts = address.split(',')
        if len(parts) >= 2:
            # Combine first two parts for better name
            combined = f"{parts[0].strip()}, {parts[1].strip()}"
            if len(combined) > len(name):
                name = combined
        elif parts and len(parts[0]) > len(name):
            name = parts[0].strip()
    
    # Clean trailing commas
    name = name.rstrip(',').strip()
    address = address.rstrip(',').strip()
    
    return name, address

def fix_booth_data(ac_path):
    """Fix booth data for an AC."""
    booths_path = ac_path / "booths.json"
    if not booths_path.exists():
        return 0
    
    with open(booths_path) as f:
        data = json.load(f)
    
    fixed = 0
    for booth in data['booths']:
        orig_name = booth.get('name', '')
        orig_addr = booth.get('address', '')
        
        # Check if needs fixing
        needs_fix = (
            ') And (' in orig_addr or
            ') and (' in orig_addr.lower() or
            ') And' in orig_name or
            orig_name in ['School', 'Building', 'Office', 'High School', 'Middle School'] or
            orig_name.startswith('V)') or
            orig_name.startswith('P)') or
            '(R.V)' in orig_addr or
            '(P)' in orig_addr or
            len(orig_name) < 10
        )
        
        if needs_fix:
            new_name, new_addr = clean_address(orig_name, orig_addr)
            if new_name != orig_name or new_addr != orig_addr:
                booth['name'] = new_name
                booth['address'] = new_addr
                fixed += 1
    
    if fixed > 0:
        with open(booths_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    return fixed

def main():
    print("Cleaning up garbage addresses...")
    
    total_fixed = 0
    acs_fixed = 0
    
    for ac_dir in sorted(BOOTHS_DIR.iterdir()):
        fixed = fix_booth_data(ac_dir)
        if fixed > 0:
            print(f"  {ac_dir.name}: fixed {fixed} booths")
            total_fixed += fixed
            acs_fixed += 1
    
    print(f"\nTotal: Fixed {total_fixed} booths in {acs_fixed} ACs")

if __name__ == "__main__":
    main()
