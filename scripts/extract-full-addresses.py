#!/usr/bin/env python3
"""
Extract full booth addresses from Tamil Nadu polling station PDFs.
Updates booth name and address fields with complete information.
Handles multiple PDF formats.
"""

import json
import subprocess
import re
from pathlib import Path

# Paths
PDF_DIR = Path.home() / "Desktop" / "TN_PollingStations_English"
BOOTHS_DIR = Path("public/data/booths/TN")

def extract_pdf_text(pdf_path):
    """Extract text from PDF using pdftotext with layout preservation."""
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=60
        )
        return result.stdout
    except Exception as e:
        return ""

def detect_format(text):
    """Detect which PDF format this is."""
    text_lower = text.lower()
    if 'polling station' in text_lower and ('no.' in text_lower or 'no' in text_lower):
        if 'locality of polling' in text_lower:
            return 'format_d'  # Polling Station No., Locality format
    if 'sl.no of' in text_lower:
        return 'format_c'  # Sl.No of Polling Station format
    if 'ps no' in text_lower and 'locality of the' in text_lower:
        return 'format_b'  # PS No, Locality, Building, Areas format
    if 'sl.no' in text_lower:
        return 'format_a'  # Sl.No, station No, Location format
    return 'format_a'  # Default

def parse_generic(text):
    """Generic parser that works across formats by finding booth numbers and collecting content."""
    booths = {}
    lines = text.split('\n')
    
    # Find lines that start a new booth entry
    # These have a number at or near the start, possibly followed by locality
    booth_pattern = re.compile(r'^\s*(\d{1,3})\s{2,}(.+)', re.IGNORECASE)
    
    booth_entries = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Skip obvious headers
        if any(x in line for x in ['Polling Station', 'Sl.No', 'PS No', 'Building in which', 
                                   'Polling Area', 'Whether', 'voters or', 'Assembly',
                                   'Parliamentary', 'List of Polling', 'Page ', 
                                   'Locality of', 'station No', 'men only', 'women only']):
            i += 1
            continue
        
        # Try to match a booth entry start
        match = booth_pattern.match(line)
        if match:
            booth_no = match.group(1)
            rest = match.group(2)
            
            # Collect all content until next booth entry
            content = [rest]
            j = i + 1
            while j < len(lines):
                next_line = lines[j]
                # Check if next line starts a new booth
                next_match = booth_pattern.match(next_line)
                if next_match:
                    # Verify this is a real new booth (number should be greater)
                    try:
                        if int(next_match.group(1)) > int(booth_no):
                            break
                    except:
                        pass
                
                # Skip headers and page numbers
                if any(x in next_line for x in ['Polling Station', 'Sl.No', 'PS No', 
                                                'Page ', 'Building in which',
                                                'Polling Area', 'Whether', 'voters or',
                                                'Locality of', 'station No']):
                    j += 1
                    continue
                
                stripped = next_line.strip()
                if stripped:
                    content.append(stripped)
                j += 1
            
            booth_entries.append((booth_no, content))
            i = j
        else:
            i += 1
    
    # Process booth entries
    for booth_no, content_list in booth_entries:
        full_text = ' '.join(content_list)
        
        # Extract voter type
        voter_type = ""
        for vt in ['All Voters', 'Women only', 'Men only']:
            if vt in full_text:
                voter_type = vt
                full_text = full_text.replace(vt, ' ')
                break
        
        # Find where areas start (numbered items)
        # Areas typically start with "1.Name" or "1.Name" or "1-1.Name"
        area_patterns = [
            r'(\d+-?\d*\.[A-Za-z])',  # "1.Name" or "1-1.Name"
            r'(\b1\s+[A-Z][a-z]+\s+\()',  # "1 Name ("
        ]
        
        location = full_text
        areas = ""
        
        for pattern in area_patterns:
            area_match = re.search(pattern, full_text)
            if area_match:
                location = full_text[:area_match.start()].strip()
                areas = full_text[area_match.start():].strip()
                break
        
        # Clean up
        location = re.sub(r'\s+', ' ', location).strip()
        location = re.sub(r',\s*,', ',', location)
        location = re.sub(r',\s*$', '', location)
        areas = re.sub(r'\s+', ' ', areas).strip()
        
        booth_key = str(int(booth_no))  # Normalize booth number
        if location and len(location) > 15:
            if booth_key not in booths or len(location) > len(booths[booth_key].get('location', '')):
                booths[booth_key] = {
                    'location': location,
                    'areas': areas,
                    'voter_type': voter_type.strip()
                }
    
    return booths

def parse_format_a(text):
    """Parse format A: Sl.No, Polling station No, Location..."""
    booths = {}
    lines = text.split('\n')
    
    booth_starts = []
    for i, line in enumerate(lines):
        match = re.match(r'^\s*(\d{1,3})\s+(\d+[A-Z]*(?:\([WM]\))?)\s+(.+)', line)
        if match:
            rest = match.group(3)
            if len(rest) > 5 and not rest.startswith('Location'):
                booth_starts.append((i, match.group(1), match.group(2), match.group(3)))
    
    for idx, (start_line, sl_no, booth_no, first_content) in enumerate(booth_starts):
        if idx + 1 < len(booth_starts):
            end_line = booth_starts[idx + 1][0]
        else:
            end_line = len(lines)
        
        all_content = [first_content]
        for i in range(start_line + 1, end_line):
            line = lines[i].strip()
            if any(x in line for x in ['List of Polling', 'Page Number', 'Sl.No', 'Polling Areas', 'Location and name', 'station No.']):
                continue
            if not line:
                continue
            all_content.append(line)
        
        full_text = ' '.join(all_content)
        
        voter_type = ""
        for vt in ['Women only', 'Men only', 'All Voters']:
            if vt in full_text:
                voter_type = vt
                full_text = full_text.replace(vt, ' ')
                break
        
        area_match = re.search(r'(\b1\.[A-Z][a-zA-Z]|\b99\.OVERSEAS)', full_text)
        
        if area_match:
            location = full_text[:area_match.start()].strip()
            areas = full_text[area_match.start():].strip()
        else:
            location = full_text.strip()
            areas = ""
        
        location = re.sub(r'\s+', ' ', location).strip()
        location = re.sub(r',\s*$', '', location)
        areas = re.sub(r'\s+', ' ', areas).strip()
        
        booth_key = str(booth_no)
        if booth_key not in booths or len(location) > len(booths[booth_key].get('location', '')):
            booths[booth_key] = {
                'location': location,
                'areas': areas,
                'voter_type': voter_type.strip()
            }
    
    return booths

def update_booth_data(ac_id, pdf_booths):
    """Update booth data with full addresses from PDF."""
    booths_file = BOOTHS_DIR / ac_id / "booths.json"
    
    if not booths_file.exists():
        return 0, 0
    
    with open(booths_file, 'r') as f:
        data = json.load(f)
    
    updated = 0
    total = len(data['booths'])
    
    for booth in data['booths']:
        booth_no_raw = booth.get('boothNo', '')
        variants = [
            booth_no_raw,
            booth_no_raw.replace('M', '').replace('A(W)', '').replace('(W)', ''),
            re.sub(r'[A-Z\(\)]', '', booth_no_raw),
        ]
        
        for booth_no in variants:
            # Try both with and without leading zeros
            keys_to_try = [booth_no, booth_no.lstrip('0'), str(int(booth_no)) if booth_no.isdigit() else booth_no]
            
            for key in keys_to_try:
                if key in pdf_booths:
                    pdf_info = pdf_booths[key]
                    
                    if pdf_info['location'] and len(pdf_info['location']) > 15:
                        booth['name'] = pdf_info['location']
                        
                        if pdf_info['areas']:
                            booth['address'] = pdf_info['areas']
                        else:
                            booth['address'] = pdf_info['location']
                        
                        if pdf_info['voter_type']:
                            booth['area'] = pdf_info['voter_type']
                        
                        updated += 1
                        break
            else:
                continue
            break
    
    if updated > 0:
        with open(booths_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, total

def main():
    """Main function to extract and update booth addresses."""
    print("Extracting full booth addresses from polling station PDFs...")
    print()
    
    pdf_files = sorted(PDF_DIR.glob("AC*.pdf"))
    print(f"Found {len(pdf_files)} polling station PDFs")
    print()
    
    total_updated = 0
    total_booths = 0
    low_coverage = []
    
    for pdf_file in pdf_files:
        ac_num = pdf_file.stem.replace("AC", "").zfill(3)
        ac_id = f"TN-{ac_num}"
        
        text = extract_pdf_text(pdf_file)
        if not text:
            continue
        
        # Detect format and parse accordingly
        fmt = detect_format(text)
        
        # Try format-specific parser first, fall back to generic
        if fmt == 'format_a':
            pdf_booths = parse_format_a(text)
        else:
            pdf_booths = parse_generic(text)
        
        # If low yield, try generic parser
        if len(pdf_booths) < 10:
            generic_booths = parse_generic(text)
            if len(generic_booths) > len(pdf_booths):
                pdf_booths = generic_booths
        
        updated, total = update_booth_data(ac_id, pdf_booths)
        
        if total > 0:
            pct = (updated / total) * 100
            if pct < 80:
                low_coverage.append((ac_id, pct, updated, total))
        
        total_updated += updated
        total_booths += total
    
    print(f"Total: {total_updated}/{total_booths} booths updated ({(total_updated/total_booths*100):.1f}%)")
    
    if low_coverage:
        print()
        print(f"ACs with <80% coverage ({len(low_coverage)} total):")
        for ac_id, pct, updated, total in sorted(low_coverage, key=lambda x: x[1])[:20]:
            print(f"  {ac_id}: {updated}/{total} ({pct:.1f}%)")
        if len(low_coverage) > 20:
            print(f"  ... and {len(low_coverage) - 20} more")

if __name__ == "__main__":
    main()
