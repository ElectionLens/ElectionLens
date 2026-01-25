#!/usr/bin/env python3
"""Extract Gangavalli (TN-081) 2024 booth data from PDF using pdfplumber."""

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
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")

def extract_booth_data_from_pdf(pdf_path):
    """Extract booth data from PDF."""
    results = {}
    
    print(f"📄 Opening PDF: {pdf_path}")
    with pdfplumber.open(pdf_path) as pdf:
        print(f"   Pages: {len(pdf.pages)}")
        
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if not text:
                continue
            
            lines = text.split('\n')
            
            for line in lines:
                # Skip header lines
                if any(kw in line.upper() for kw in ['FORM 20', 'ELECTION', 'CANDIDATE', 'PARTY', 'TOTAL', 'NOTA', 'POSTAL']):
                    continue
                
                # Extract all numbers from line
                numbers = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
                
                if len(numbers) < 4:
                    continue
                
                # Find booth number (first number in range 1-600)
                booth_no = None
                vote_start = 0
                
                for i, num in enumerate(numbers):
                    if 1 <= num <= 600:
                        booth_no = num
                        vote_start = i + 1
                        break
                
                if booth_no is None:
                    continue
                
                # Get votes (filter out totals which are usually > 2000)
                votes = []
                for num in numbers[vote_start:]:
                    if num <= 2000:
                        votes.append(num)
                    elif num > 5000:  # Likely a total, stop
                        break
                
                # We expect 21 candidates based on existing data
                if len(votes) >= 3:
                    # Take first 21 votes
                    votes = votes[:21]
                    while len(votes) < 21:
                        votes.append(0)
                    
                    total = sum(votes)
                    if 20 <= total <= 3000:  # Reasonable booth size
                        booth_id = f"TN-081-{booth_no:03d}"
                        if booth_id not in results:  # Avoid duplicates
                            results[booth_id] = {
                                "votes": votes,
                                "total": total,
                                "rejected": 0
                            }
    
    return results

def main():
    print("=" * 70)
    print("Extracting Gangavalli (TN-081) 2024 Booth Data")
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
    print(f"\n📥 Extracting from PDF...")
    extracted_results = extract_booth_data_from_pdf(PDF_PATH)
    print(f"   Extracted {len(extracted_results)} booths")
    
    # Merge with existing data (update existing, add new)
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
        existing_data['source'] += ' (re-extracted from AC081.pdf)'
    
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
