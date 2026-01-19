#!/usr/bin/env python3
"""
Extract booth list from PDF and generate booths.json
"""

import json
import re
from pathlib import Path


def parse_booth_list(text_file: str) -> list:
    """Parse booth list from extracted PDF text."""
    
    with open(text_file, 'r') as f:
        content = f.read()
    
    booths = []
    
    # Pattern to match booth entries
    # Format: SlNo  BoothNo  Location/Name  Areas  Type
    lines = content.split('\n')
    
    current_booth = None
    
    for i, line in enumerate(lines):
        # Skip header lines
        if 'Polling' in line and 'station' in line.lower():
            continue
        if line.strip().startswith('1') and '2' in line and '3' in line and '4' in line:
            continue
        if 'Page Number' in line:
            continue
            
        # Try to match booth line: SlNo  BoothNo  Location...
        # More flexible pattern
        match = re.match(
            r'^\s*(\d+)\s+(\d+(?:\s*[MA])?\s*(?:\([WM]\))?)\s+(.+)$',
            line.strip()
        )
        
        if match:
            sl_no = int(match.group(1))
            booth_no = match.group(2).strip()
            rest = match.group(3).strip()
            
            # Normalize booth number
            booth_no = re.sub(r'\s+', '', booth_no)
            
            # Determine booth type
            booth_type = "regular"
            if '(W)' in booth_no or 'WOMEN' in rest.upper():
                booth_type = "women"
            elif 'M' in booth_no:
                booth_type = "male"
            
            # Extract location/name and address
            # Usually format: "School Name, Address -Pincode"
            location_parts = rest.split(',', 1)
            name = location_parts[0].strip() if location_parts else rest
            address = location_parts[1].strip() if len(location_parts) > 1 else ""
            
            # Extract area from the address if present
            area_match = re.search(r'([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*-\s*\d{6}', rest)
            area = area_match.group(1) if area_match else ""
            
            # Clean up name
            name = re.sub(r'\s*-\s*\d{6}.*$', '', name)
            name = re.sub(r'\s+', ' ', name).strip()
            
            # Create booth ID
            booth_id = f"TN-001-{booth_no.replace('(W)', 'W').replace('(M)', 'M')}"
            
            current_booth = {
                "id": booth_id,
                "boothNo": booth_no,
                "num": sl_no,
                "type": booth_type,
                "name": name[:100],  # Limit name length
                "address": address[:150] if address else name,
                "area": area if area else "Gummidipoondi"
            }
            booths.append(current_booth)
    
    return booths


def main():
    print("Extracting booth list...")
    
    booths = parse_booth_list("/tmp/booths_2021.txt")
    
    print(f"Extracted {len(booths)} booths")
    
    # Create output
    output = {
        "acId": "TN-001",
        "acName": "Gummidipoondi",
        "state": "Tamil Nadu",
        "totalBooths": len(booths),
        "lastUpdated": "2021-04-06",
        "source": "Tamil Nadu CEO - Booth List",
        "booths": booths
    }
    
    # Write output
    output_path = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-001/booths.json")
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"✅ Written to {output_path}")
    
    # Show sample
    print("\nSample booths:")
    for booth in booths[:5]:
        print(f"  {booth['boothNo']}: {booth['name'][:50]}...")


if __name__ == "__main__":
    main()
