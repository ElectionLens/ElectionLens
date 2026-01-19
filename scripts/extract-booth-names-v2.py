#!/usr/bin/env python3
"""
Extract booth names from Polling Station PDFs - v2
Handles multi-line wrapped text in tabular PDFs
"""

import json
import re
import subprocess
import sys
from pathlib import Path

POLLING_STATIONS_DIR = Path("/Users/p0s097d/Desktop/TN_PollingStations_English")
OUTPUT_BASE = Path("public/data/booths/TN")


def extract_booth_info_from_pdf(pdf_path):
    """Extract booth info using layout mode, handling multi-line entries."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return {}
    
    text = result.stdout
    lines = text.split('\n')
    
    booths = {}
    current_entry = None
    
    # Detect format type by checking headers
    format_type = "standard"  # default: SL No, PS No, Location, Area, Type
    for line in lines[:30]:
        if 'Locality' in line and 'Building' in line:
            format_type = "locality"  # SL No, Locality, Building, Area, Type
            break
    
    for line in lines:
        # Skip header lines
        if any(skip in line.lower() for skip in [
            'list of polling', 'parliamentary', 'sl no', 'ps no', 
            'location and name', 'polling area', 'whether for all',
            'building in which', 'locality'
        ]):
            continue
        
        # Check if line starts with a booth entry (number followed by text)
        # Pattern for locality format: "   1        M.M.School Chinnappanaickenpalayam"
        # Pattern for standard: "  1        1      PUMS, School Name"
        
        if format_type == "locality":
            # Format: Sl No, Locality (school), Building desc, Polling Area, Type
            match = re.match(r'^\s*(\d+)\s+([A-Z][A-Za-z\.\,\s]+?\d{6})\s+(.*)$', line)
            if not match:
                match = re.match(r'^\s*(\d+)\s+([A-Z][A-Za-z\.\,\s]{10,})\s+(.*)$', line)
        else:
            match = re.match(r'^\s*(\d+)\s+(\d+)\s+(.+)$', line)
        
        if match:
            # Save previous entry
            if current_entry:
                booth_no = current_entry['booth_no']
                booths[booth_no] = {
                    'name': current_entry['name'].strip(),
                    'address': current_entry['address'].strip(),
                    'type': current_entry['type']
                }
            
            if format_type == "locality":
                booth_no = match.group(1)  # Sl No is the booth number
                name = match.group(2).strip()
                rest = match.group(3).strip()
            else:
                sl_no = match.group(1)
                booth_no = match.group(2)
                rest = match.group(3).strip()
                # Split into name and address
                parts = rest.split('  ')
                parts = [p.strip() for p in parts if p.strip()]
                name = parts[0] if parts else rest
                rest = ' '.join(parts[1:]) if len(parts) > 1 else ""
            
            # Detect booth type
            booth_type = "regular"
            if "Women Only" in rest or "Women Only" in line:
                booth_type = "women"
                rest = rest.replace("Women Only", "").strip()
            elif "Men Only" in rest or "Men Only" in line:
                booth_type = "men"
                rest = rest.replace("Men Only", "").strip()
            elif "All Voters" in rest:
                rest = rest.replace("All Voters", "").strip()
            
            current_entry = {
                'sl_no': booth_no,
                'booth_no': booth_no,
                'name': name,
                'address': rest,
                'type': booth_type
            }
        
        elif current_entry:
            # Continuation line - append to current entry
            stripped = line.strip()
            if stripped and not any(skip in stripped.lower() for skip in [
                'list of polling', 'parliamentary', 'page', 'sl no'
            ]):
                # Check for type indicator
                if "Women Only" in stripped:
                    current_entry['type'] = "women"
                    stripped = stripped.replace("Women Only", "").strip()
                elif "Men Only" in stripped:
                    current_entry['type'] = "men"
                    stripped = stripped.replace("Men Only", "").strip()
                elif "All Voters" in stripped:
                    stripped = stripped.replace("All Voters", "").strip()
                
                # Check if this looks like address continuation or name continuation
                if current_entry['address']:
                    current_entry['address'] += ' ' + stripped
                elif re.match(r'^[A-Z][a-z]', stripped) or 'Wing' in stripped or 'Building' in stripped:
                    # Looks like name continuation (e.g., "Middle Wing")
                    current_entry['name'] += ' ' + stripped
                else:
                    # Treat as address
                    current_entry['address'] = stripped
    
    # Don't forget the last entry
    if current_entry:
        booth_no = current_entry['booth_no']
        booths[booth_no] = {
            'name': current_entry['name'].strip(),
            'address': current_entry['address'].strip(),
            'type': current_entry['type']
        }
    
    return booths


def extract_booth_info_raw(pdf_path):
    """Alternative extraction using raw mode for difficult PDFs."""
    result = subprocess.run(
        ['pdftotext', '-raw', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return {}
    
    text = result.stdout
    lines = text.split('\n')
    
    booths = {}
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Pattern 0: "PartNo SlNo VoterType PSNo Locality Building" format
        # e.g. "1 1 All Voters 1 Karadikuppam-604201 Panchayat Union Middle School"
        multi_col_match = re.match(
            r'^(\d+)\s+(\d+)\s+(?:All Voters|Men Only|Women Only)\s+(\d+)\s+([A-Za-z][A-Za-z0-9\-]+)\s+(.+)$',
            line, re.IGNORECASE
        )
        if multi_col_match:
            booth_no = multi_col_match.group(3)  # PS No is the booth number
            locality = multi_col_match.group(4)
            building = multi_col_match.group(5)
            
            # Extract school name from building
            school_match = re.search(
                r'((?:Panchayat|Government|Govt\.?)[A-Za-z\s]*(?:school|college|middle|primary|higher|secondary|elementary)[A-Za-z\s,]*)',
                building, re.IGNORECASE
            )
            if school_match:
                name = school_match.group(1).strip()
                name = re.sub(r'\s+', ' ', name)
                name = re.sub(r',\s*$', '', name)
                booths[booth_no] = {
                    'name': f'{name}, {locality}',
                    'address': f'{name}, {locality}',
                    'type': 'regular'
                }
            i += 1
            continue
        
        # Pattern 1: "BoothNo Location, School Name" on same line
        inline_match = re.match(
            r'^(\d{1,3})\s+([A-Za-z][A-Za-z,\s]+(?:school|pums|pues|ghs|ghss|college|office|anganwadi|community)[^,]*)',
            line, re.IGNORECASE
        )
        if inline_match:
            booth_no = inline_match.group(1)
            name = inline_match.group(2).strip()
            name = re.sub(r'\s+', ' ', name)
            # Remove trailing address portions
            name = re.sub(r'\s+\d+\.[A-Z].*$', '', name, flags=re.IGNORECASE)
            booths[booth_no] = {
                'name': name,
                'address': name,
                'type': 'regular'
            }
            i += 1
            continue
        
        # Pattern 1b: "BoothNo Locality [newlines] School Name" - building in next few lines
        if re.match(r'^(\d{1,3})\s+[A-Za-z]', line):
            booth_match = re.match(r'^(\d{1,3})\s+(.+)$', line)
            if booth_match:
                booth_no = booth_match.group(1)
                locality = booth_match.group(2).strip()
                # Look ahead for school name in next 8 lines
                # Combine lines to handle wrapped text
                combined_text = ' '.join(lines[i:min(i + 8, len(lines))])
                
                # Multiple school patterns
                school_patterns = [
                    r'((?:Govt\.?|Government)[A-Za-z\.\s]*(?:school|pums|pues|ghs|ghss|college|high|higher|primary|middle|elementary)[A-Za-z\s,\.]*)',
                    r'(Panchayat\s+[Uu]nion\s+[A-Za-z\s]*(?:school|primary|middle|elementary)[A-Za-z\s,\.]*)',
                    r'((?:PUMS|PUES|GHS|GHSS)[A-Za-z\s,\.]*)',
                ]
                
                for pattern in school_patterns:
                    school_match = re.search(pattern, combined_text, re.IGNORECASE)
                    if school_match:
                        name = school_match.group(1).strip()
                        name = re.sub(r'\s+', ' ', name)
                        name = re.sub(r',\s*$', '', name)
                        # Add locality if school name doesn't include it
                        if locality and len(locality) > 3 and locality.lower() not in name.lower():
                            name = f'{name}, {locality}'
                        if booth_no not in booths:
                            booths[booth_no] = {
                                'name': name,
                                'address': name,
                                'type': 'regular'
                            }
                        break
        
        # Pattern 2: Look for a line that's just a booth number (1-3 digits)
        if re.match(r'^\d{1,3}$', line):
            booth_no = line
            
            # Collect next few lines for school info
            name_parts = []
            j = i + 1
            booth_type = "regular"
            
            while j < min(i + 15, len(lines)):
                part = lines[j].strip()
                if not part:
                    j += 1
                    continue
                
                # Check for voter type
                if part == 'Women Only':
                    booth_type = "women"
                    break
                elif part == 'Men Only':
                    booth_type = "men"
                    break
                elif part == 'All Voters':
                    break
                
                # Stop if we hit next booth number
                if re.match(r'^\d{1,3}$', part) and len(name_parts) > 0:
                    break
                
                # Skip address lines (usually start with 1. or 2.)
                if re.match(r'^\d+\.', part):
                    j += 1
                    continue
                
                # Look for school-related content
                school_keywords = ['school', 'pums', 'pues', 'ghs', 'ghss', 'building', 
                                   'anganwadi', 'community', 'college', 'office']
                if any(s in part.lower() for s in school_keywords):
                    name_parts.append(part)
                elif re.search(r'\d{6}', part):  # Pincode
                    name_parts.append(part)
                elif len(name_parts) > 0 and len(part) < 50 and not re.match(r'^\d+\s*$', part):
                    # Continue collecting if we've started
                    name_parts.append(part)
                
                j += 1
            
            if name_parts:
                # Clean up and combine
                name = ' '.join(name_parts[:3])  # First 3 parts usually contain the school name
                name = re.sub(r'\s+', ' ', name).strip()
                # Remove trailing building descriptions
                name = re.sub(r'\s+(Building|Facing|Room|Wing|North|South|East|West|Portion).*$', '', name, flags=re.IGNORECASE)
                
                booths[booth_no] = {
                    'name': name.strip(),
                    'address': ' '.join(name_parts),
                    'type': booth_type
                }
            
            i = j
        else:
            i += 1
    
    return booths


def update_booths_json(ac_id, booth_info):
    """Update booths.json with extracted names."""
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    
    if not booths_file.exists():
        return 0
    
    with open(booths_file) as f:
        data = json.load(f)
    
    updated = 0
    for booth in data.get('booths', []):
        booth_no = booth.get('boothNo', '')
        # Try exact match
        info = booth_info.get(booth_no)
        
        # Try without suffix
        if not info:
            base_no = re.sub(r'[MW]$|\([WM]\)$', '', booth_no, flags=re.IGNORECASE)
            info = booth_info.get(base_no)
        
        # Try with just the number
        if not info:
            num_only = re.sub(r'\D', '', booth_no)
            info = booth_info.get(num_only)
        
        if info and info.get('name'):
            name = info['name']
            # Clean up the name
            name = re.sub(r'\s+', ' ', name).strip()
            name = re.sub(r',\s*$', '', name)
            
            if name and not name.isdigit() and len(name) > 3:
                booth['name'] = name
                if info.get('address'):
                    booth['address'] = info['address']
                if info.get('type') == 'women':
                    booth['type'] = 'women'
                updated += 1
    
    with open(booths_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return updated


def process_constituency(ac_num):
    """Process a single constituency."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = POLLING_STATIONS_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return None, "PDF not found"
    
    # Try layout mode first
    booth_info = extract_booth_info_from_pdf(pdf_path)
    
    # If low results, try raw mode
    if len(booth_info) < 50:
        raw_info = extract_booth_info_raw(pdf_path)
        if len(raw_info) > len(booth_info):
            booth_info = raw_info
    
    if not booth_info:
        return None, "No booth info extracted"
    
    updated = update_booths_json(ac_id, booth_info)
    
    return updated, f"{len(booth_info)} locations, {updated} updated"


def main():
    print("=" * 60)
    print("Extracting Booth Names from Polling Station PDFs (v2)")
    print("=" * 60)
    
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 234
    
    success = 0
    total_updated = 0
    
    for ac_num in range(start, end + 1):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = process_constituency(ac_num)
        
        if result is not None:
            print(f"✅ {ac_id}: {msg}")
            success += 1
            total_updated += result
        else:
            print(f"❌ {ac_id}: {msg}")
    
    print()
    print("=" * 60)
    print(f"✅ Processed: {success} constituencies")
    print(f"📍 Total booth names updated: {total_updated:,}")
    
    # Report coverage
    print()
    print("Coverage summary:")
    
    total_booths = 0
    named_booths = 0
    
    for d in sorted(OUTPUT_BASE.iterdir()):
        if d.is_dir() and d.name.startswith('TN-'):
            booths_file = d / 'booths.json'
            if booths_file.exists():
                with open(booths_file) as f:
                    data = json.load(f)
                for b in data.get('booths', []):
                    total_booths += 1
                    if not b['name'].startswith('Booth '):
                        named_booths += 1
    
    print(f"Total booths: {total_booths:,}")
    print(f"Named booths: {named_booths:,}")
    print(f"Coverage: {named_booths * 100 / total_booths:.1f}%")


if __name__ == "__main__":
    main()
