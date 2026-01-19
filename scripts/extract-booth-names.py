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
    
    Handles multiple PDF formats by looking for booth numbers and associating
    them with nearby school/building names.
    
    Returns dict mapping booth number to location info.
    """
    locations = {}
    lines = text.split('\n')
    
    # Pattern for school/building names
    school_pattern = re.compile(
        r'((?:Panchayat|Government|Govt|Municipal|P\.U\.|G\.H\.S|G\.B\.|G\.G\.|'
        r'Corporation|Town|Village|Anganwadi|Community)[A-Za-z\.\s,]+(?:School|Building|Centre|Hall|Office|Vidyalaya|Kalvi Nilayam))',
        re.IGNORECASE
    )
    
    # Pattern for location after school name
    loc_pattern = re.compile(r'(?:School|Building|Centre|Vidyalaya|Hall|Office)[,\s]+([A-Za-z][A-Za-z\s]+?)(?:\s*[-,\d]|$)', re.IGNORECASE)
    
    for i, line in enumerate(lines):
        # Look for booth number patterns:
        # Format 1: "Sl.No  BoothNo  ..."  (two numbers at start)
        # Format 2: "Serial  SchoolName..."  (one number, then school name)
        
        # Try Format 1: Sl.No followed by Booth No
        match1 = re.match(r'^\s*(\d{1,3})\s+(\d{1,3})\s+', line)
        if match1:
            sl_no = match1.group(1)
            booth_no = match1.group(2)
            
            try:
                if int(sl_no) > 500:
                    continue
            except:
                continue
            
            # Look for school name in this line or previous 4 lines
            school_name = None
            location = None
            for j in range(i, max(0, i-5), -1):
                school_match = school_pattern.search(lines[j])
                if school_match:
                    school_name = school_match.group(1).strip()
                    school_name = re.sub(r'\s+', ' ', school_name)
                    # Try to get location name
                    loc_match = loc_pattern.search(lines[j])
                    if loc_match:
                        location = loc_match.group(1).strip()
                    break
            
            if school_name:
                full_name = school_name
                if location and len(location) > 3:
                    full_name = f"{school_name}, {location}"
                locations[booth_no] = {
                    "name": full_name[:80],
                    "area": location[:50] if location else extract_area(school_name)
                }
            continue
        
        # Try Format 2: Serial number followed by school name with pincode
        match2 = re.match(r'^\s*(\d{1,3})\s+([A-Za-z].+?)\s*(\d{6})', line)
        if match2:
            serial = match2.group(1)
            text_part = match2.group(2).strip()
            
            try:
                if int(serial) > 500:
                    continue
            except:
                continue
            
            # Extract school name
            school_match = school_pattern.search(text_part)
            if school_match:
                school_name = school_match.group(1).strip()
                school_name = re.sub(r'\s+', ' ', school_name)
                loc_match = loc_pattern.search(text_part)
                location = loc_match.group(1).strip() if loc_match else None
                
                full_name = school_name
                if location and len(location) > 3:
                    full_name = f"{school_name}, {location}"
                
                locations[serial] = {
                    "name": full_name[:80],
                    "area": location[:50] if location else extract_area(school_name)
                }
    
    return locations


def extract_school_name(text: str) -> str:
    """Extract the school/building name from text."""
    # Common patterns for school names
    patterns = [
        r'((?:Panchayat|Government|Govt|Municipal|P\.U\.|G\.H\.S|G\.B\.|G\.G\.)[A-Za-z\.\s,]+(?:School|Building|Centre|Hall|Office|Vidyalaya)[A-Za-z\.\s,]*)',
        r'([A-Za-z][A-Za-z\.\s]+(?:Primary|Middle|Higher|Elementary|High|Hr\.Sec|Secondary)[A-Za-z\.\s]*School[A-Za-z\.\s,]*)',
        r'(Anganwadi[A-Za-z\.\s,]+(?:Building|Centre)?)',
        r'([A-Za-z\s]+(?:Vidyalaya|Matriculation|School|Building|Hall|Centre|Office|Complex)[A-Za-z\.\s,]*)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            # Clean up - remove trailing commas, directions, etc.
            name = re.sub(r'[,\s]+(North|South|East|West|Facing|Building|New|Old|Room|Wing|Part|Portion|Door).*$', '', name, flags=re.IGNORECASE)
            name = re.sub(r'\s+', ' ', name).strip(' ,.')
            if len(name) > 10:
                return name
    
    # Fallback: take first part before common delimiters
    parts = re.split(r'\s*[-,]\s*(?:North|South|East|West|Facing)', text, flags=re.IGNORECASE)
    if parts and len(parts[0]) > 10:
        return re.sub(r'\s+', ' ', parts[0]).strip(' ,.')[:80]
    
    return ""


def extract_area(name: str) -> str:
    """Extract area/locality from name."""
    # Look for place name (usually last word before pincode or at end)
    # Remove common suffixes
    clean = re.sub(r'\s*\d{6}\s*$', '', name)
    clean = re.sub(r'\s*(School|Building|Centre|Hall|Office|Vidyalaya)\s*$', '', clean, flags=re.IGNORECASE)
    words = clean.split()
    if words:
        return words[-1][:50]
    return ""


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
