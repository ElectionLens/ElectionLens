#!/usr/bin/env python3
"""
OCR-based extraction for 2024 PC booth data using 2021 approach.
Uses pdf2image and pytesseract for OCR.

Usage:
    python scripts/ocr-extract-tn-2024.py [ac_number]
    python scripts/ocr-extract-tn-2024.py  # Process all low-coverage ACs
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

try:
    from pdf2image import convert_from_path
    import pytesseract
except ImportError:
    print("Required packages missing. Install with:")
    print("  pip install pdf2image pytesseract pillow")
    sys.exit(1)

# Configuration
FORM20_DIR = Path(os.path.expanduser("~/Desktop/TN_PS_2024_English"))
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")

# Low coverage ACs that need OCR re-extraction
LOW_COVERAGE_ACS = [
    2, 3, 4, 6, 7, 9,  # TN-01, TN-05 PCs
    10, 11, 12, 13, 15, 17, 18, 21,  # TN-02, TN-04 PCs
    28, 29, 30, 31,  # TN-05 PC
    38, 39, 40, 41, 42,  # TN-07 PC (missing)
    54, 56,  # TN-09 PC
    74, 77,  # TN-13 PC
    151, 152, 153, 154, 155, 156,  # TN-26 PC (missing)
    188, 189, 191, 192, 193, 194,  # TN-32 PC (missing)
    213, 214, 215, 216, 217, 218,  # TN-36 PC (missing)
]


def load_data():
    """Load PC data and schema."""
    with open(PC_DATA) as f:
        pc_data = json.load(f)
    with open(SCHEMA) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id, schema):
    """Get PC ID and candidates for an AC."""
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id
    return None


def load_booth_metadata(ac_id):
    """Load booth metadata from booths.json."""
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if booths_file.exists():
        with open(booths_file) as f:
            return json.load(f)
    return {}


def ocr_pdf(pdf_path: Path, dpi: int = 150) -> str:
    """Extract text from PDF using OCR."""
    print(f"  🔍 Converting PDF to images (DPI={dpi})...")
    images = convert_from_path(str(pdf_path), dpi=dpi)
    
    all_text = []
    for i, image in enumerate(images):
        print(f"  📝 OCR page {i+1}/{len(images)}...", end='\r')
        # Try PSM 6 (uniform block of text)
        text = pytesseract.image_to_string(image, config='--psm 6')
        all_text.append(text)
    
    print(f"  📝 OCR completed - {len(images)} pages processed    ")
    return '\n'.join(all_text)


def parse_ocr_form20(text: str, ac_id: str, ac_name: str, candidates: list) -> dict:
    """Parse Form 20 from OCR text."""
    results = {}
    lines = text.split('\n')
    
    num_candidates = len(candidates)
    
    for line in lines:
        # Clean up common OCR artifacts
        line = line.replace('|', ' ').replace('[', '').replace(']', '')
        line = line.replace('O', '0').replace('o', '0')  # Common OCR mistake
        line = line.replace('l', '1').replace('I', '1')  # l/I to 1
        line = re.sub(r'\s+', ' ', line).strip()
        
        if not line:
            continue
            
        # Skip headers and non-data rows
        if any(x in line.lower() for x in ['polling', 'station', 'total valid', 'rejected', 'grand total', 'serial', 'sl.no', 'booth']):
            continue
            
        # Try to extract numbers from the line
        numbers = re.findall(r'\d+', line)
        
        # We need at least: booth_no + candidate_votes + total + rejected + nota
        min_numbers = 5
        if len(numbers) < min_numbers:
            continue
            
        try:
            # First number could be serial or booth number
            first_num = int(numbers[0])
            
            # Skip if first number is too large (probably not a booth)
            if first_num > 600:
                continue
            
            # Determine booth number
            if first_num <= 10 and len(numbers) > 1:
                # First might be serial, second is booth
                booth_no = numbers[1]
                vote_numbers = [int(n) for n in numbers[2:]]
            else:
                booth_no = str(first_num)
                vote_numbers = [int(n) for n in numbers[1:]]
            
            if len(vote_numbers) < 4:
                continue
            
            # Validate booth number
            booth_int = int(booth_no)
            if booth_int < 1 or booth_int > 600:
                continue
            
            # Extract vote columns
            # Format typically: candidate_votes... total_valid, rejected, nota, grand_total
            # We want candidate votes + nota
            
            # Try to identify vote pattern - look for reasonable vote counts
            candidate_votes = []
            for v in vote_numbers:
                if v < 5000:  # Reasonable per-booth vote count
                    candidate_votes.append(v)
                if len(candidate_votes) >= num_candidates:
                    break
            
            if len(candidate_votes) < 3:  # Need at least top 3 candidates
                continue
            
            # Pad to expected candidates
            while len(candidate_votes) < num_candidates:
                candidate_votes.append(0)
            
            booth_id = f"{ac_id}-{booth_no}"
            total_votes = sum(candidate_votes)
            
            # Skip if total seems wrong
            if total_votes < 50 or total_votes > 3000:
                continue
            
            results[booth_id] = {
                "votes": candidate_votes[:num_candidates],
                "total": total_votes,
                "rejected": 0
            }
            
        except (ValueError, IndexError):
            continue
    
    # Build output structure
    output = {
        "acId": ac_id,
        "acName": ac_name,
        "year": 2024,
        "electionType": "parliament",
        "totalBooths": len(results),
        "source": "Tamil Nadu CEO - Form 20 (OCR)",
        "candidates": candidates,
        "results": results
    }
    
    return output


def process_constituency(ac_num: int, pc_data: dict, schema: dict) -> tuple:
    """Process a single constituency using OCR."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Get PC and AC info
    pc_id = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"  ⚠️ No PC found for {ac_id}")
        return 0, 0
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    
    # Get AC name from booths.json
    booth_meta = load_booth_metadata(ac_id)
    ac_name = booth_meta.get('acName', f"Constituency {ac_num}")
    expected_booths = booth_meta.get('totalBooths', 250)
    
    print(f"\n📍 Processing {ac_id}: {ac_name} ({pc_id})")
    
    # Check PDF
    form20_pdf = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not form20_pdf.exists():
        print(f"  ⚠️ PDF not found: {form20_pdf}")
        return 0, expected_booths
    
    # Load existing data to compare
    existing_file = OUTPUT_BASE / ac_id / "2024.json"
    existing_booths = 0
    if existing_file.exists():
        with open(existing_file) as f:
            existing = json.load(f)
        existing_booths = len(existing.get('results', {}))
    
    # Prepare candidates list for output
    cand_list = []
    for i, c in enumerate(candidates):
        cand_list.append({
            "slNo": i + 1,
            "name": c.get("name", f"Candidate {i+1}"),
            "party": c.get("party", "IND")
        })
    
    # OCR extraction
    print(f"  📄 Running OCR (existing: {existing_booths}/{expected_booths} booths)...")
    try:
        ocr_text = ocr_pdf(form20_pdf, dpi=150)
        
        results_data = parse_ocr_form20(ocr_text, ac_id, ac_name, cand_list)
        new_booths = results_data['totalBooths']
        
        print(f"  📊 OCR extracted: {new_booths} booths")
        
        # Only save if we got more booths than before
        if new_booths > existing_booths:
            output_dir = OUTPUT_BASE / ac_id
            output_dir.mkdir(parents=True, exist_ok=True)
            
            results_file = output_dir / "2024.json"
            with open(results_file, 'w') as f:
                json.dump(results_data, f, indent=2)
            
            print(f"  ✅ Improved: {existing_booths} → {new_booths} booths")
            return new_booths, expected_booths
        else:
            print(f"  ⏭️ No improvement ({new_booths} vs existing {existing_booths})")
            return existing_booths, expected_booths
            
    except Exception as e:
        print(f"  ❌ OCR failed: {e}")
        return existing_booths, expected_booths


def main():
    print("=" * 60)
    print("Tamil Nadu 2024 PC - OCR Extraction (2021 approach)")
    print("=" * 60)
    
    # Check dependencies
    try:
        version = pytesseract.get_tesseract_version()
        print(f"✅ Tesseract version: {version}")
    except Exception as e:
        print(f"❌ Tesseract not found: {e}")
        sys.exit(1)
    
    print("\n📂 Loading data...")
    pc_data, schema = load_data()
    
    # Get ACs to process
    if len(sys.argv) > 1:
        acs_to_process = [int(sys.argv[1])]
    else:
        acs_to_process = LOW_COVERAGE_ACS
    
    print(f"\n🚀 Processing {len(acs_to_process)} ACs...")
    
    total_extracted = 0
    total_expected = 0
    improved = 0
    
    for ac_num in acs_to_process:
        try:
            extracted, expected = process_constituency(ac_num, pc_data, schema)
            total_extracted += extracted
            total_expected += expected
            if extracted > 0:
                improved += 1
        except Exception as e:
            print(f"  ❌ Error: {e}")
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total booths: {total_extracted:,} / {total_expected:,} ({total_extracted/total_expected*100:.1f}%)")
    print(f"ACs with data: {improved} / {len(acs_to_process)}")


if __name__ == "__main__":
    main()
