#!/usr/bin/env python3
"""Extract Gangavalli (TN-081) 2024 booth data from PDF using table extraction."""

import json
import re
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("❌ pdfplumber not installed. Install with: pip install pdfplumber")
    exit(1)

PDF_PATH = Path("/Users/p0s097d/Desktop/AC081.pdf")
OUTPUT_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2024.json")

def reverse_text(text):
    """Reverse text (Tamil text in PDF is reversed)."""
    if not text:
        return ""
    return text[::-1]

def extract_from_tables(pdf_path):
    """Extract booth data from PDF tables."""
    results = {}
    candidates_found = []
    
    print(f"📄 Opening PDF: {pdf_path}")
    with pdfplumber.open(pdf_path) as pdf:
        print(f"   Pages: {len(pdf.pages)}")
        
        # First, find candidate names from header
        header_found = False
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            
            for table in tables:
                if not table or len(table) < 5:
                    continue
                
                # Look for candidate header row (usually row 4-5)
                for row_idx in range(min(10, len(table))):
                    row = table[row_idx]
                    if not row:
                        continue
                    
                    # Check if this row has candidate names (reversed Tamil text)
                    candidate_cols = []
                    for col_idx, cell in enumerate(row[4:], 4):  # Skip first 4 columns
                        if cell and isinstance(cell, str):
                            text = reverse_text(cell.strip())
                            # Check if it looks like a candidate name
                            if text and len(text) > 3 and not text.isdigit():
                                # Check if next row has party names
                                if row_idx + 1 < len(table):
                                    next_row = table[row_idx + 1]
                                    if next_row and col_idx < len(next_row):
                                        party_cell = next_row[col_idx]
                                        if party_cell:
                                            party = reverse_text(str(party_cell).strip())
                                            if party and len(party) <= 10:  # Party names are short
                                                candidate_cols.append((col_idx, text, party))
                    
                    if len(candidate_cols) >= 15:  # Found enough candidates
                        candidates_found = candidate_cols
                        header_found = True
                        print(f"   Found {len(candidates_found)} candidates in header")
                        for i, (col, name, party) in enumerate(candidates_found[:5], 1):
                            print(f"      {i}. {name} ({party})")
                        break
                
                if header_found:
                    break
            
            if header_found:
                break
        
        # Now extract booth data
        print(f"\n📥 Extracting booth data from tables...")
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            
            for table in tables:
                if not table or len(table) < 5:
                    continue
                
                # Skip header rows (first 5-6 rows)
                for row_idx in range(5, len(table)):
                    row = table[row_idx]
                    if not row or len(row) < 10:
                        continue
                    
                    # Extract booth number (usually in first or second column)
                    booth_no = None
                    for col_idx in range(min(3, len(row))):
                        cell = row[col_idx]
                        if cell:
                            # Try to extract number
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
                    
                    # Extract votes from candidate columns
                    votes = []
                    if candidates_found:
                        for col_idx, name, party in candidates_found:
                            if col_idx < len(row):
                                cell = row[col_idx]
                                if cell:
                                    # Extract number from cell
                                    numbers = re.findall(r'\b(\d+)\b', str(cell))
                                    vote = int(numbers[0]) if numbers else 0
                                    votes.append(vote)
                                else:
                                    votes.append(0)
                    else:
                        # Fallback: extract all numbers after booth number
                        numbers = []
                        for cell in row[4:]:  # Skip first 4 columns
                            if cell:
                                nums = re.findall(r'\b(\d+)\b', str(cell))
                                numbers.extend([int(n) for n in nums if int(n) <= 2000])
                        
                        # Take first 21 numbers as votes
                        votes = numbers[:21]
                        while len(votes) < 21:
                            votes.append(0)
                    
                    if len(votes) >= 21:
                        total = sum(votes)
                        if 20 <= total <= 3000:  # Reasonable booth size
                            booth_id = f"TN-081-{booth_no:03d}"
                            if booth_id not in results:  # Avoid duplicates
                                results[booth_id] = {
                                    "votes": votes[:21],
                                    "total": total,
                                    "rejected": 0
                                }
    
    return results

def main():
    print("=" * 70)
    print("Extracting Gangavalli (TN-081) 2024 Booth Data (Table Method)")
    print("=" * 70)
    
    if not PDF_PATH.exists():
        print(f"❌ PDF not found: {PDF_PATH}")
        return
    
    # Load existing data
    existing_data = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            existing_data = json.load(f)
        print(f"📊 Loaded existing data: {len(existing_data.get('results', {}))} booths")
    
    # Extract from PDF
    extracted_results = extract_from_tables(PDF_PATH)
    print(f"\n   Extracted {len(extracted_results)} booths")
    
    # Merge with existing data
    if 'results' not in existing_data:
        existing_data['results'] = {}
    
    updated = 0
    new = 0
    for booth_id, result in extracted_results.items():
        if booth_id in existing_data['results']:
            existing_data['results'][booth_id] = result
            updated += 1
        else:
            existing_data['results'][booth_id] = result
            new += 1
    
    # Preserve other fields
    existing_data['year'] = 2024
    existing_data['totalBooths'] = len(existing_data['results'])
    if 'source' not in existing_data:
        existing_data['source'] = 'Tamil Nadu CEO - Form 20'
    else:
        existing_data['source'] += ' (re-extracted from AC081.pdf via table extraction)'
    
    # Save
    print(f"\n💾 Saving results...")
    print(f"   Updated: {updated} booths")
    print(f"   New: {new} booths")
    print(f"   Total: {len(existing_data['results'])} booths")
    
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)
    
    print(f"   ✓ Saved to {OUTPUT_FILE}")
    print("\n" + "=" * 70)
    print("✅ Extraction complete!")
    print("=" * 70)

if __name__ == "__main__":
    main()
