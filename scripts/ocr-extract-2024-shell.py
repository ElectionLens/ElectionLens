#!/usr/bin/env python3
"""
OCR-based extraction for 2024 PC booth data using shell commands.
Uses pdftoppm and tesseract CLI directly.

Usage:
    python scripts/ocr-extract-2024-shell.py [ac_number]
    python scripts/ocr-extract-2024-shell.py  # Process all low-coverage ACs
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

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
    """Get PC ID for an AC."""
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


def ocr_pdf_shell(pdf_path: Path, dpi: int = 150) -> str:
    """Extract text from PDF using shell commands."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        
        # Convert PDF to images
        print(f"  🔍 Converting PDF to images (DPI={dpi})...")
        result = subprocess.run(
            ['pdftoppm', '-png', '-r', str(dpi), str(pdf_path), str(tmpdir / 'page')],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"  ❌ pdftoppm failed: {result.stderr}")
            return ""
        
        # Get all page images
        pages = sorted(tmpdir.glob('page-*.png'))
        if not pages:
            pages = sorted(tmpdir.glob('page*.png'))
        
        print(f"  📄 Found {len(pages)} pages")
        
        all_text = []
        for i, page in enumerate(pages):
            print(f"  📝 OCR page {i+1}/{len(pages)}...", end='\r')
            
            # Run tesseract
            result = subprocess.run(
                ['tesseract', str(page), 'stdout', '--psm', '6'],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                all_text.append(result.stdout)
        
        print(f"  📝 OCR completed - {len(pages)} pages processed    ")
        return '\n'.join(all_text)


def parse_ocr_text(text: str, ac_id: str, ac_name: str, candidates: list) -> dict:
    """Parse Form 20 from OCR text."""
    results = {}
    lines = text.split('\n')
    
    num_candidates = len(candidates)
    
    for line in lines:
        # Clean up common OCR artifacts
        line = line.replace('|', ' ').replace('[', '').replace(']', '')
        # Common OCR mistakes
        line = re.sub(r'[oO](?=\d)', '0', line)  # O before digit -> 0
        line = re.sub(r'(?<=\d)[oO]', '0', line)  # O after digit -> 0
        line = re.sub(r'\bl\b', '1', line)  # lone l -> 1
        line = re.sub(r'\s+', ' ', line).strip()
        
        if not line:
            continue
            
        # Skip headers
        lower = line.lower()
        if any(x in lower for x in ['polling', 'station', 'total valid', 'rejected', 'grand total', 'serial', 'sl.no', 'booth', 'candidate', 'name']):
            continue
            
        # Extract numbers
        numbers = re.findall(r'\d+', line)
        
        if len(numbers) < 5:
            continue
            
        try:
            first_num = int(numbers[0])
            
            # Skip large numbers
            if first_num > 600:
                continue
            
            # Determine booth number
            if first_num <= 10 and len(numbers) > 1:
                booth_no = numbers[1]
                vote_numbers = [int(n) for n in numbers[2:]]
            else:
                booth_no = str(first_num)
                vote_numbers = [int(n) for n in numbers[1:]]
            
            booth_int = int(booth_no)
            if booth_int < 1 or booth_int > 600:
                continue
            
            # Extract reasonable vote counts
            candidate_votes = []
            for v in vote_numbers:
                if v < 5000:
                    candidate_votes.append(v)
                if len(candidate_votes) >= num_candidates:
                    break
            
            if len(candidate_votes) < 3:
                continue
            
            while len(candidate_votes) < num_candidates:
                candidate_votes.append(0)
            
            booth_id = f"{ac_id}-{booth_no}"
            total_votes = sum(candidate_votes)
            
            if total_votes < 50 or total_votes > 3000:
                continue
            
            results[booth_id] = {
                "votes": candidate_votes[:num_candidates],
                "total": total_votes,
                "rejected": 0
            }
            
        except (ValueError, IndexError):
            continue
    
    return {
        "acId": ac_id,
        "acName": ac_name,
        "year": 2024,
        "electionType": "parliament",
        "totalBooths": len(results),
        "source": "Tamil Nadu CEO - Form 20 (OCR)",
        "candidates": candidates,
        "results": results
    }


def process_constituency(ac_num: int, pc_data: dict, schema: dict) -> tuple:
    """Process a single constituency using OCR."""
    ac_id = f"TN-{ac_num:03d}"
    
    pc_id = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"  ⚠️ No PC found for {ac_id}")
        return 0, 0
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    
    booth_meta = load_booth_metadata(ac_id)
    ac_name = booth_meta.get('acName', f"Constituency {ac_num}")
    expected_booths = booth_meta.get('totalBooths', 250)
    
    print(f"\n📍 Processing {ac_id}: {ac_name} ({pc_id})")
    
    form20_pdf = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not form20_pdf.exists():
        print(f"  ⚠️ PDF not found: {form20_pdf}")
        return 0, expected_booths
    
    existing_file = OUTPUT_BASE / ac_id / "2024.json"
    existing_booths = 0
    if existing_file.exists():
        with open(existing_file) as f:
            existing = json.load(f)
        existing_booths = len(existing.get('results', {}))
    
    cand_list = []
    for i, c in enumerate(candidates):
        cand_list.append({
            "slNo": i + 1,
            "name": c.get("name", f"Candidate {i+1}"),
            "party": c.get("party", "IND")
        })
    
    print(f"  📄 Running OCR (existing: {existing_booths}/{expected_booths} booths)...")
    try:
        ocr_text = ocr_pdf_shell(form20_pdf, dpi=150)
        
        if not ocr_text:
            print(f"  ❌ OCR returned empty text")
            return existing_booths, expected_booths
        
        results_data = parse_ocr_text(ocr_text, ac_id, ac_name, cand_list)
        new_booths = results_data['totalBooths']
        
        print(f"  📊 OCR extracted: {new_booths} booths")
        
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
        import traceback
        traceback.print_exc()
        return existing_booths, expected_booths


def main():
    print("=" * 60)
    print("Tamil Nadu 2024 PC - OCR Extraction (Shell-based)")
    print("=" * 60)
    
    # Check dependencies
    result = subprocess.run(['which', 'tesseract'], capture_output=True)
    if result.returncode != 0:
        print("❌ tesseract not found")
        sys.exit(1)
    
    result = subprocess.run(['which', 'pdftoppm'], capture_output=True)
    if result.returncode != 0:
        print("❌ pdftoppm not found")
        sys.exit(1)
    
    print("✅ Dependencies OK")
    
    print("\n📂 Loading data...")
    pc_data, schema = load_data()
    
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
    if total_expected > 0:
        print(f"Total booths: {total_extracted:,} / {total_expected:,} ({total_extracted/total_expected*100:.1f}%)")
    print(f"ACs with data: {improved} / {len(acs_to_process)}")


if __name__ == "__main__":
    main()
