#!/usr/bin/env python3
"""
Extract full booth addresses from Tamil Nadu polling station PDFs.
Handles ALL PDF formats to achieve 100% coverage.
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
    'kalyana mandapam', 'community', 'anganwadi', 'panchayat', 'government',
    'govt', 'municipal', 'corporation', 'library', 'hospital', 'dispensary',
    'facing', 'wing', 'portion', 'terraced', 'tiled', 'floor', 'room'
]

def extract_pdf_text(pdf_path, raw=True):
    """Extract text from PDF."""
    try:
        args = ["pdftotext", "-raw" if raw else "-layout", str(pdf_path), "-"]
        result = subprocess.run(args, capture_output=True, text=True, timeout=60)
        return result.stdout
    except:
        return ""

def has_building_keyword(text):
    """Check if text contains building-related keywords."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in BUILDING_KEYWORDS)

def is_polling_area_start(text):
    """Check if text starts a polling area entry."""
    return bool(re.match(r'^(\d+\.[A-Z]|\(\d+\)-|\d+-\d+\.)', text))

def is_voter_type(text):
    """Check if text is voter type."""
    return text.lower().strip() in ['all voters', 'women only', 'men only']

def extract_building_from_mixed(text):
    """Extract building address from text that may contain polling areas."""
    # Find building keywords and extract surrounding text
    text_lower = text.lower()
    
    for kw in BUILDING_KEYWORDS:
        idx = text_lower.find(kw)
        if idx != -1:
            # Find the start of this building phrase
            # Go back to find capital letter or start of line
            start = idx
            while start > 0 and text[start-1] not in '\n.':
                start -= 1
            
            # Find end (up to voter type or end)
            end = len(text)
            for vt in ['All Voters', 'Women only', 'Men only', 'ALL VOTERS']:
                vt_idx = text.find(vt, idx)
                if vt_idx != -1 and vt_idx < end:
                    end = vt_idx
            
            building = text[start:end].strip()
            # Clean up - remove polling area stuff
            building = re.sub(r'\d+\.[A-Z][a-z]+[^,]*,?\s*', '', building)
            building = re.sub(r'\(\d+\)-[^,]*,?\s*', '', building)
            building = re.sub(r'Ward-?\d+[^,]*,?\s*', '', building, flags=re.IGNORECASE)
            building = re.sub(r'\s+', ' ', building).strip()
            building = building.strip(',').strip()
            
            if len(building) > 15 and has_building_keyword(building):
                return building
    
    return None

def parse_universal(text):
    """Universal parser that handles all formats."""
    booths = {}
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Skip empty and header lines
        if not line:
            i += 1
            continue
        
        if any(x.lower() in line.lower() for x in ['sl.no', 'sl no', 'slno', 'polling station',
                                                    'list of polling', 'page number', 'page ',
                                                    'assembly', 'parliamentary', 'location and name',
                                                    'polling areas', 'building in which', 'station no',
                                                    '1 2 3 4 5', 'whether for', 'voters or', 'p.s.',
                                                    'locality of', 'comprised within']):
            i += 1
            continue
        
        booth_no = None
        content_start = ""
        
        # Pattern A: "NUM NUM rest..." where first NUM == second NUM (e.g., "1 1 ...")
        m_a = re.match(r'^(\d{1,3})\s+(\d+)\s+(.+)', line)
        if m_a and m_a.group(1) == m_a.group(2):
            booth_no = m_a.group(1)
            content_start = m_a.group(3)
        
        # Pattern B: "NUM NUM" or "NUM NUM text" standard format
        if not booth_no:
            m_b = re.match(r'^(\d{1,3})\s+(\d+[A-Z]*(?:\([WM]\))?)\s*(.*)$', line)
            if m_b:
                booth_no = m_b.group(2)
                content_start = m_b.group(3).strip()
        
        # Pattern C: "NUM LOCALITY" (e.g., "1 Kovilvenni")
        if not booth_no:
            m_c = re.match(r'^(\d{1,3})\s+([A-Z][a-z]+.*)$', line)
            if m_c:
                booth_no = m_c.group(1)
                content_start = m_c.group(2)
        
        # Pattern D: "VOTER_TYPE NUM NUM" (e.g., "ALL VOTERS 1 1")
        if not booth_no:
            m_d = re.match(r'^(ALL VOTERS|WOMEN ONLY|MEN ONLY)\s+(\d+)\s+(\d+[A-Z]*)', line, re.IGNORECASE)
            if m_d:
                booth_no = m_d.group(3)
        
        # Pattern E: Single number alone
        if not booth_no:
            m_e = re.match(r'^(\d{1,3})$', line)
            if m_e:
                booth_no = m_e.group(1)
        
        if booth_no:
            # Collect all content for this booth entry
            content_lines = [content_start] if content_start else []
            voter_type = ""
            j = i + 1
            
            while j < len(lines):
                next_line = lines[j].strip()
                
                if not next_line:
                    j += 1
                    continue
                
                # Stop at voter type
                if is_voter_type(next_line):
                    voter_type = next_line.title()
                    j += 1
                    break
                
                # Stop at next booth entry
                if re.match(r'^(\d{1,3})\s+(\d+|[A-Z][a-z]+)', next_line):
                    break
                if re.match(r'^(ALL VOTERS|WOMEN ONLY|MEN ONLY)\s+\d+', next_line, re.IGNORECASE):
                    break
                if re.match(r'^\d{1,3}$', next_line):
                    break
                
                # Stop at headers
                if any(x.lower() in next_line.lower() for x in ['sl.no', 'page ', 'building in which',
                                                                 'polling area', 'list of', 'assembly',
                                                                 'p.s.']):
                    j += 1
                    continue
                
                content_lines.append(next_line)
                j += 1
            
            # Combine and extract building address
            if content_lines:
                full_content = ' '.join(content_lines)
                
                # Try to extract building from the content
                building_addr = None
                
                # Check if building comes AFTER polling areas (Format like TN-143)
                if is_polling_area_start(full_content.split()[0] if full_content.split() else ""):
                    building_addr = extract_building_from_mixed(full_content)
                
                # Otherwise, building comes BEFORE polling areas
                if not building_addr:
                    # Find where polling areas start
                    polling_start = None
                    for pattern in [r'\d+\.[A-Z][a-z]+\s+\(', r'\(\d+\)-', r'\d+-\d+\.']:
                        m = re.search(pattern, full_content)
                        if m:
                            if polling_start is None or m.start() < polling_start:
                                polling_start = m.start()
                    
                    if polling_start and polling_start > 15:
                        building_addr = full_content[:polling_start].strip()
                    elif has_building_keyword(full_content):
                        building_addr = extract_building_from_mixed(full_content)
                    else:
                        building_addr = full_content
                
                # Clean up building address
                if building_addr:
                    building_addr = re.sub(r'\s+', ' ', building_addr).strip()
                    building_addr = re.sub(r',\s*,', ',', building_addr)
                    building_addr = building_addr.rstrip(',').strip()
                    
                    # Validate
                    if len(building_addr) > 15:
                        booth_key = re.sub(r'[A-Z\(\)]', '', str(booth_no))
                        if booth_key.isdigit():
                            booth_key = str(int(booth_key))
                        
                        if booth_key not in booths or len(building_addr) > len(booths[booth_key].get('address', '')):
                            booths[booth_key] = {
                                'name': building_addr.split(',')[0].strip(),
                                'address': building_addr,
                                'voter_type': voter_type
                            }
            
            i = j
        else:
            i += 1
    
    return booths

def update_booth_data(ac_id, pdf_booths):
    """Update booth data with addresses from PDF."""
    booths_file = BOOTHS_DIR / ac_id / "booths.json"
    
    if not booths_file.exists():
        return 0, 0
    
    with open(booths_file, 'r') as f:
        data = json.load(f)
    
    updated = 0
    total = len(data['booths'])
    
    for booth in data['booths']:
        booth_no_raw = booth.get('boothNo', '')
        booth_no_num = re.sub(r'[A-Z\(\)]', '', booth_no_raw)
        
        keys_to_try = [booth_no_raw, booth_no_num]
        if booth_no_num.isdigit():
            keys_to_try.extend([booth_no_num.lstrip('0'), str(int(booth_no_num))])
        
        for key in keys_to_try:
            if key in pdf_booths:
                pdf_info = pdf_booths[key]
                if pdf_info['address'] and len(pdf_info['address']) > 10:
                    booth['name'] = pdf_info['name']
                    booth['address'] = pdf_info['address']
                    booth['area'] = pdf_info['voter_type'] if pdf_info['voter_type'] else ""
                    updated += 1
                    break
    
    if updated > 0:
        with open(booths_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    return updated, total

def main():
    print("Extracting booth addresses - targeting 100%...")
    print()
    
    pdf_files = sorted(PDF_DIR.glob("AC*.pdf"))
    print(f"Found {len(pdf_files)} PDFs")
    
    total_updated = 0
    total_booths = 0
    low_coverage = []
    
    for pdf_file in pdf_files:
        ac_num = pdf_file.stem.replace("AC", "").zfill(3)
        ac_id = f"TN-{ac_num}"
        
        # Try raw mode
        text = extract_pdf_text(pdf_file, raw=True)
        pdf_booths = parse_universal(text) if text else {}
        
        # If low yield, try layout mode
        if len(pdf_booths) < 50:
            text_layout = extract_pdf_text(pdf_file, raw=False)
            if text_layout:
                alt_booths = parse_universal(text_layout)
                if len(alt_booths) > len(pdf_booths):
                    pdf_booths = alt_booths
        
        updated, total = update_booth_data(ac_id, pdf_booths)
        
        if total > 0:
            pct = (updated / total) * 100
            if pct < 95:
                low_coverage.append((ac_id, pct, updated, total))
        
        total_updated += updated
        total_booths += total
    
    pct = (total_updated / total_booths * 100) if total_booths > 0 else 0
    print(f"\nTotal: {total_updated}/{total_booths} ({pct:.1f}%)")
    
    if low_coverage:
        print(f"\nACs <95% ({len(low_coverage)}):")
        for ac_id, pct, updated, total in sorted(low_coverage, key=lambda x: x[1])[:15]:
            print(f"  {ac_id}: {updated}/{total} ({pct:.1f}%)")

if __name__ == "__main__":
    main()
