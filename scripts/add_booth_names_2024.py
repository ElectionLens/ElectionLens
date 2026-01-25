#!/usr/bin/env python3
"""Add proper booth names to 2024.json by extracting from PDF and matching with booths.json."""

import json
import pdfplumber
import re
from pathlib import Path

PDF_PATH = Path("/Users/p0s097d/Desktop/AC081.pdf")
BOOTHS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/booths.json")
RESULTS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2024.json")

def reverse_text(text):
    """Reverse text (Tamil text in PDF is reversed)."""
    if not text:
        return ""
    return text[::-1].strip()

def extract_booth_names_from_pdf():
    """Extract booth numbers and names from PDF."""
    booth_data = {}
    
    print(f"📄 Opening PDF: {PDF_PATH}")
    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"   Pages: {len(pdf.pages)}")
        
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            
            for table in tables:
                if not table or len(table) < 4:
                    continue
                
                # Process data rows (start from row 4)
                for row_idx in range(4, len(table)):
                    row = table[row_idx]
                    if not row or len(row) < 10:
                        continue
                    
                    # Skip totals rows
                    row_text = ' '.join([str(cell) for cell in row[:5] if cell])
                    if 'Total' in row_text or 'total' in row_text.lower() or 'Polled' in row_text:
                        continue
                    
                    # Extract booth number
                    booth_no = None
                    for col_idx in range(min(3, len(row))):
                        cell = row[col_idx]
                        if cell:
                            numbers = re.findall(r'\b(\d+)\b', str(cell))
                            for num_str in numbers:
                                num = int(num_str)
                                if 1 <= num <= 600:
                                    booth_no = num
                                    break
                            if booth_no:
                                break
                    
                    if not booth_no:
                        continue
                    
                    # Extract booth name from column 2 or 3 (usually polling station name)
                    booth_name = None
                    if len(row) > 2:
                        name_cell = row[2] if len(row) > 2 else None
                        if not name_cell or not name_cell.strip():
                            name_cell = row[3] if len(row) > 3 else None
                        
                        if name_cell:
                            # Reverse if it looks like Tamil (has Tamil characters or reversed text)
                            name = str(name_cell).strip()
                            if name and len(name) > 3:
                                # Try reversing (Tamil text is often reversed in PDF)
                                reversed_name = reverse_text(name)
                                # Use the longer one (usually the correct one)
                                booth_name = reversed_name if len(reversed_name) > len(name) else name
                                # Clean up
                                booth_name = re.sub(r'\s+', ' ', booth_name).strip()
                    
                    if booth_no and booth_name:
                        booth_id = f"TN-081-{booth_no:03d}"
                        if booth_id not in booth_data:
                            booth_data[booth_id] = booth_name
    
    return booth_data

def create_booth_mapping():
    """Create mapping from booth number to booth info from booths.json."""
    with open(BOOTHS_FILE) as f:
        booths_data = json.load(f)
    
    # Create mapping by booth number (ignoring suffixes)
    booth_map = {}
    for booth in booths_data.get('booths', []):
        booth_id = booth.get('id', '')
        booth_no_str = booth.get('boothNo', '')
        
        # Extract numeric part
        match = re.search(r'(\d+)', booth_no_str)
        if match:
            booth_num = int(match.group(1))
            padded_id = f"TN-081-{booth_num:03d}"
            
            # Store the best name (prefer the one with most info)
            if padded_id not in booth_map:
                booth_map[padded_id] = {
                    'name': booth.get('name', ''),
                    'address': booth.get('address', ''),
                    'area': booth.get('area', ''),
                }
            else:
                # Update if this one has more info
                current = booth_map[padded_id]
                if len(booth.get('name', '')) > len(current['name']):
                    booth_map[padded_id] = {
                        'name': booth.get('name', ''),
                        'address': booth.get('address', ''),
                        'area': booth.get('area', ''),
                    }
    
    return booth_map

def main():
    print("=" * 70)
    print("Adding Booth Names to 2024.json")
    print("=" * 70)
    
    # Load existing 2024.json
    with open(RESULTS_FILE) as f:
        results_data = json.load(f)
    
    # Extract booth names from PDF
    print(f"\n📥 Extracting booth names from PDF...")
    pdf_booth_names = extract_booth_names_from_pdf()
    print(f"   Found {len(pdf_booth_names)} booth names in PDF")
    
    # Get booth mapping from booths.json
    print(f"\n📥 Loading booth names from booths.json...")
    booth_mapping = create_booth_mapping()
    print(f"   Found {len(booth_mapping)} booths in booths.json")
    
    # Update results with booth names
    results = results_data.get('results', {})
    updated = 0
    missing = []
    
    for booth_id, result in results.items():
        # Try to get name from booths.json first
        if booth_id in booth_mapping:
            booth_info = booth_mapping[booth_id]
            result['name'] = booth_info['name']
            result['address'] = booth_info.get('address', booth_info['name'])
            result['area'] = booth_info.get('area', '')
            updated += 1
        # Fallback to PDF extraction
        elif booth_id in pdf_booth_names:
            result['name'] = pdf_booth_names[booth_id]
            result['address'] = pdf_booth_names[booth_id]
            result['area'] = results_data.get('acName', 'GANGAVALLI')
            updated += 1
        else:
            missing.append(booth_id)
    
    print(f"\n✅ Updated {updated} booths with names")
    if missing:
        print(f"   ⚠️  {len(missing)} booths still missing names")
        print(f"   First 10: {missing[:10]}")
    
    # Save updated results
    results_data['results'] = results
    results_data['source'] = results_data.get('source', '') + ' (with booth names)'
    
    with open(RESULTS_FILE, 'w') as f:
        json.dump(results_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved to {RESULTS_FILE}")
    
    # Show sample
    print(f"\n📋 Sample booth names:")
    for i, (bid, result) in enumerate(list(results.items())[:5]):
        name = result.get('name', 'N/A')
        print(f"   {bid}: {name[:60]}...")

if __name__ == "__main__":
    main()
