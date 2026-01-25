#!/usr/bin/env python3
"""Extract Gangavalli (TN-081) 2024 booth data from PDF and update."""

import json
import re
import sys
from pathlib import Path

# Add scripts directory to path to import unified parser
sys.path.insert(0, str(Path(__file__).parent))

from unified_pdf_parser import (
    load_reference_data,
    detect_pdf_type,
    extract_text_pdf,
    extract_scanned_pdf_multi_strategy,
    validate_extraction,
    save_extraction_result
)

FORM20_DIR = Path.home() / "Desktop"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")

def main():
    ac_id = "TN-081"
    ac_num = 81
    pdf_path = Path("/Users/p0s097d/Desktop/AC081.pdf")
    
    print("=" * 70)
    print(f"Extracting Gangavalli (TN-081) 2024 Booth Data")
    print("=" * 70)
    
    if not pdf_path.exists():
        print(f"❌ PDF not found: {pdf_path}")
        return
    
    print(f"📄 PDF: {pdf_path}")
    
    # Load reference data
    print("\n📊 Loading reference data...")
    pc_data, schema = load_reference_data()
    
    # Get official data for this AC
    official_data = None
    for pc_id, pc_info in pc_data.items():
        acs = pc_info.get('acs', [])
        for ac in acs:
            if ac.get('acId') == ac_id:
                official_data = {
                    'candidates': ac.get('candidates', []),
                    'valid_votes': ac.get('validVotes', 0),
                    'total_votes': ac.get('totalVotes', 0)
                }
                break
        if official_data:
            break
    
    if not official_data:
        print(f"❌ No official data found for {ac_id}")
        return
    
    num_candidates = len(official_data['candidates'])
    print(f"✅ Found {num_candidates} candidates")
    print(f"   Official valid votes: {official_data['valid_votes']:,}")
    
    # Detect PDF type
    print(f"\n🔍 Detecting PDF type...")
    pdf_type = detect_pdf_type(pdf_path)
    print(f"   Type: {pdf_type}")
    
    # Get expected booths from existing data
    existing_file = OUTPUT_BASE / ac_id / "2024.json"
    expected_booths = set()
    if existing_file.exists():
        with open(existing_file) as f:
            existing_data = json.load(f)
            for booth_id in existing_data.get('results', {}).keys():
                match = re.match(r'TN-081-0*(\d+)', booth_id)
                if match:
                    expected_booths.add(int(match.group(1)))
        print(f"   Expected booths: {len(expected_booths)}")
    
    # Extract data
    print(f"\n📥 Extracting booth data...")
    if pdf_type == "text":
        extraction = extract_text_pdf(pdf_path, num_candidates, ac_id, expected_booths)
    else:
        extraction = extract_scanned_pdf_multi_strategy(pdf_path, num_candidates, ac_id, expected_booths)
    
    print(f"   Extracted {len(extraction.booths)} booths")
    print(f"   Errors: {len(extraction.errors)}")
    print(f"   Warnings: {len(extraction.warnings)}")
    
    if extraction.errors:
        print(f"\n⚠️  Errors:")
        for error in extraction.errors[:5]:
            print(f"   - {error}")
    
    # Validate
    print(f"\n✅ Validating extraction...")
    validation = validate_extraction(extraction, official_data, num_candidates, expected_booths, pdf_type)
    
    if validation.is_valid:
        print(f"   ✓ Validation passed!")
        print(f"   Stats: {validation.stats}")
        
        # Save
        print(f"\n💾 Saving results...")
        save_extraction_result(extraction, official_data, ac_id, "Gangavalli (SC)", "2024")
        print(f"   ✓ Data saved to {OUTPUT_BASE / ac_id / '2024.json'}")
    else:
        print(f"   ❌ Validation failed!")
        print(f"   Errors:")
        for error in validation.errors[:10]:
            print(f"      - {error}")
        print(f"\n⚠️  Not saving due to validation errors")
        return
    
    print("\n" + "=" * 70)
    print("✅ Extraction complete!")
    print("=" * 70)

if __name__ == "__main__":
    main()
