#!/usr/bin/env python3
"""
Extract booth names and addresses from TN_PollingStations_English PDFs
and map them to Form 20 booth numbers.

Polling Station PDF has locations (1, 2, 3...) which can map to multiple booths:
- Location 3 → Booth 3M (Men/Main) and Booth 3A(W) (Women's Auxiliary)

This script extracts booth info and updates the booths.json files.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

POLLING_STATIONS_DIR = Path(os.path.expanduser("~/Desktop/TN_PollingStations_English"))
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text from PDF using pdftotext."""
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError:
        return ""


def parse_polling_stations(text: str) -> dict:
    """Parse polling station locations from PDF text.
    
    PDF Format is complex multi-line table. We look for patterns like:
    - Lines with serial number followed by school name
    - Lines with school/building name and pincode (6 digits)
    
    Returns dict mapping serial number to location info.
    """
    locations = {}
    lines = text.split('\n')
    
    current_serial = None
    
    for i, line in enumerate(lines):
        # Skip empty lines
        if not line.strip():
            continue
            
        # Skip headers and page markers
        if any(h in line for h in ['LIST OF POLLING', 'Assembly Constituency', 
                'Parliamentary', 'Sl No', 'Locality', 'Building', 'Polling Area',
                'Whether for', 'voters or', 'Page ', ' of ']):
            continue
        if re.match(r'^\s*1\s+2\s+3\s+4\s+5?\s*$', line.strip()):
            continue
        
        # Pattern 1: Line with serial number and school name with pincode
        # Example: "   5        P.U.M.School Seerappalli 637406"
        match1 = re.match(r'^\s*(\d{1,3})\s+([A-Za-z][A-Za-z\.\s]+\s*\d{6})', line)
        if match1:
            serial = match1.group(1)
            locality = match1.group(2).strip()
            
            try:
                if int(serial) > 500:
                    continue
            except:
                continue
            
            # Extract name and pincode
            name_match = re.match(r'^(.+?)\s*(\d{6})', locality)
            if name_match:
                name = name_match.group(1).strip()
                pincode = name_match.group(2)
                name = re.sub(r'\s+', ' ', name).strip()
                
                locations[serial] = {
                    "name": name[:80],
                    "pincode": pincode,
                    "area": name.split()[-1] if name.split() else "",
                }
                current_serial = serial
            continue
        
        # Pattern 2: Line with just serial number (name is on separate line)
        # Example: "   1                                                                             "
        match2 = re.match(r'^\s*(\d{1,3})\s*$', line)
        if match2 or re.match(r'^\s*(\d{1,3})\s+[^A-Za-z]', line):
            serial_match = re.match(r'^\s*(\d{1,3})', line)
            if serial_match:
                serial = serial_match.group(1)
                try:
                    if int(serial) <= 500:
                        current_serial = serial
                except:
                    pass
            continue
        
        # Pattern 3: Line with school/building name and pincode (continuation)
        # Example: "            P.U.E.School Chinnakkavery          West Facing New Terraced"
        # followed by "            637406                              Building"
        if current_serial and current_serial not in locations:
            # Look for school name pattern
            school_match = re.search(r'([A-Za-z][A-Za-z\.\s,]+(?:School|Building|Anganwadi|Centre|Hall|Office|Complex)[A-Za-z\.\s,]*)', line, re.IGNORECASE)
            if school_match:
                name = school_match.group(1).strip()
                name = re.sub(r'\s+', ' ', name).strip()
                
                # Look for pincode in this line or next few lines
                pincode = ""
                pincode_match = re.search(r'(\d{6})', line)
                if pincode_match:
                    pincode = pincode_match.group(1)
                else:
                    # Check next few lines for pincode
                    for j in range(i+1, min(i+4, len(lines))):
                        pincode_match = re.search(r'^\s*(\d{6})', lines[j])
                        if pincode_match:
                            pincode = pincode_match.group(1)
                            break
                
                if name:
                    locations[current_serial] = {
                        "name": name[:80],
                        "pincode": pincode,
                        "area": name.split()[-1] if name.split() else "",
                    }
    
    return locations


def update_booth_metadata(ac_id: str, locations: dict) -> bool:
    """Update booths.json with names from polling station data."""
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    
    if not booths_file.exists():
        return False
    
    with open(booths_file) as f:
        booths_data = json.load(f)
    
    updated = 0
    for booth in booths_data.get("booths", []):
        booth_no = booth.get("boothNo", "")
        
        # Extract base number (e.g., "3M" -> "3", "3A(W)" -> "3", "10" -> "10")
        base_match = re.match(r'^(\d+)', booth_no)
        if not base_match:
            continue
        base_num = base_match.group(1)
        
        # Look up in polling station locations
        if base_num in locations:
            loc = locations[base_num]
            
            # Update booth info
            name = loc.get("name", "")
            if name:
                booth["name"] = name
                booth["address"] = name
            
            area = loc.get("area", "")
            if area:
                booth["area"] = area
            
            # Update type based on booth number suffix
            if 'A(W)' in booth_no.upper() or '(W)' in booth_no.upper():
                booth["type"] = "women"
            elif booth_no.upper().endswith('W'):
                booth["type"] = "women"
            elif booth_no.upper().endswith('M'):
                booth["type"] = "regular"  # M = Men/Main
            
            updated += 1
    
    # Save updated data
    with open(booths_file, 'w') as f:
        json.dump(booths_data, f, indent=2)
    
    return updated > 0


def process_ac(ac_num: int) -> tuple:
    """Process a single AC. Returns (success, locations_count, booths_updated)."""
    ac_code = f"AC{ac_num:03d}"
    ac_id = f"TN-{ac_num:03d}"
    
    polling_pdf = POLLING_STATIONS_DIR / f"{ac_code}.pdf"
    
    if not polling_pdf.exists():
        return False, 0, 0
    
    # Extract polling station text
    text = extract_pdf_text(polling_pdf)
    if not text:
        return False, 0, 0
    
    # Parse locations
    locations = parse_polling_stations(text)
    if not locations:
        return False, 0, 0
    
    # Update booth metadata
    if update_booth_metadata(ac_id, locations):
        return True, len(locations), len(locations)
    
    return False, len(locations), 0


def main():
    if len(sys.argv) >= 3:
        start_ac = int(sys.argv[1])
        end_ac = int(sys.argv[2])
    else:
        start_ac = 1
        end_ac = 234
    
    print("=" * 60)
    print("Extracting Booth Names from Polling Station PDFs")
    print("=" * 60)
    
    success = 0
    failed = 0
    total_locations = 0
    
    for ac_num in range(start_ac, end_ac + 1):
        ac_id = f"TN-{ac_num:03d}"
        result, locations, updated = process_ac(ac_num)
        
        if result:
            print(f"✅ {ac_id}: {locations} locations extracted")
            success += 1
            total_locations += locations
        else:
            if locations > 0:
                print(f"⚠️ {ac_id}: {locations} locations found but update failed")
            else:
                print(f"❌ {ac_id}: No polling station PDF or parsing failed")
            failed += 1
    
    print()
    print("=" * 60)
    print(f"✅ Successfully updated: {success} constituencies")
    print(f"❌ Failed/Skipped: {failed} constituencies")
    print(f"📍 Total locations extracted: {total_locations}")


if __name__ == "__main__":
    main()
