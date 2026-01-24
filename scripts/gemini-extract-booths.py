#!/usr/bin/env python3
"""
Extract booth-level vote data from Form 20 PDFs using Google Gemini Vision API.
Handles scanned documents that OCR struggles with.
"""

import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import google.generativeai as genai

# Configuration
FORM20_DIR = Path(os.path.expanduser("~/Desktop/GELS_2024_Form20_PDFs"))
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")

# Configure Gemini
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel("gemini-2.0-flash")

EXTRACTION_PROMPT = """You are extracting election vote data from a Form 20 PDF image showing booth-level results.

The table has one row per polling station (booth). Each row contains:
- Polling Station No. (booth number, usually 1-600)
- Vote counts for each candidate (there are multiple candidates, each in their own column)
- Total valid votes
- Sometimes rejected votes

Extract ALL booth data visible in this image. For each booth, provide:
1. The booth number (just the number, e.g., "42" not "PS 42")
2. The vote counts for all candidates in order (left to right as shown in the table)

IMPORTANT:
- Extract EVERY visible row with booth data
- Booth numbers are typically sequential (1, 2, 3... or 42, 43, 44...)
- Vote counts are typically 0-2000 per candidate
- Skip header rows, total rows, and rows without clear booth numbers
- If a number is unclear, make your best guess based on context

Return ONLY valid JSON in this exact format, nothing else:
{
  "booths": [
    {"boothNo": "1", "votes": [234, 156, 89, 12, 5, 3, 0, 0]},
    {"boothNo": "2", "votes": [189, 201, 45, 8, 2, 1, 0, 0]}
  ]
}

If no booth data is visible, return: {"booths": []}
"""


def load_data():
    with open(PC_DATA) as f:
        pc_data = json.load(f)
    with open(SCHEMA) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id, schema):
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id
    return None


def get_base_booth_no(booth_no: str) -> int:
    """Extract numeric base from booth number."""
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def pdf_to_images(pdf_path: Path, dpi: int = 200) -> list:
    """Convert PDF to list of image bytes."""
    images = []
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        subprocess.run(
            ['pdftoppm', '-png', '-r', str(dpi), str(pdf_path), str(tmpdir / 'page')],
            capture_output=True, timeout=120
        )
        pages = sorted(tmpdir.glob('page-*.png')) or sorted(tmpdir.glob('page*.png'))
        for page in pages:
            with open(page, 'rb') as f:
                images.append(f.read())
    return images


def extract_from_image(image_bytes: bytes) -> list:
    """Extract booth data from a single image using Gemini."""
    try:
        response = model.generate_content([
            EXTRACTION_PROMPT,
            {"mime_type": "image/png", "data": base64.b64encode(image_bytes).decode()}
        ])
        
        # Parse JSON from response
        text = response.text.strip()
        # Handle markdown code blocks
        if text.startswith('```'):
            text = re.sub(r'^```json?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)
        
        data = json.loads(text)
        return data.get('booths', [])
    except Exception as e:
        print(f"    Error: {e}")
        return []


def process_ac(ac_num: int, pc_data: dict, schema: dict) -> dict:
    """Process a single AC and return new results."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Load metadata
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if not booths_file.exists():
        return {'status': 'no_metadata'}
    
    with open(booths_file) as f:
        meta = json.load(f)
    
    # Get expected booth numbers (base numbers)
    expected_bases = set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', []))
    
    # Load existing results
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
        existing_bases = set(get_base_booth_no(k.split('-')[-1]) for k in data.get('results', {}).keys())
    else:
        pc_id = get_pc_for_ac(ac_id, schema)
        pc_info = pc_data.get(pc_id, {}) if pc_id else {}
        candidates = pc_info.get('candidates', [])
        
        data = {
            'acId': ac_id,
            'acName': meta.get('acName', ''),
            'year': 2024,
            'electionType': 'parliament',
            'totalBooths': 0,
            'source': 'Tamil Nadu CEO - Form 20 (Gemini Extracted)',
            'candidates': [{'slNo': i+1, 'name': c.get('name', ''), 'party': c.get('party', '')} 
                          for i, c in enumerate(candidates)],
            'results': {}
        }
        existing_bases = set()
    
    # Check if we need to extract
    missing_bases = expected_bases - existing_bases
    if not missing_bases:
        return {'status': 'complete', 'extracted': len(existing_bases)}
    
    # Check PDF exists
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {'status': 'no_pdf', 'missing': len(missing_bases)}
    
    print(f"  Processing {ac_id}: {len(existing_bases)}/{len(expected_bases)} (need {len(missing_bases)})")
    
    # Convert PDF to images
    images = pdf_to_images(pdf_path)
    print(f"    {len(images)} pages to process")
    
    # Get candidate count
    num_candidates = len(data.get('candidates', []))
    
    # Extract from each page
    new_count = 0
    for i, img in enumerate(images):
        booths = extract_from_image(img)
        
        for booth in booths:
            booth_no = str(booth.get('boothNo', ''))
            base = get_base_booth_no(booth_no)
            
            # Skip if not in expected list or already extracted
            if base not in missing_bases:
                continue
            
            votes = booth.get('votes', [])
            
            # Validate votes
            if not votes or not all(isinstance(v, (int, float)) for v in votes):
                continue
            votes = [int(v) for v in votes]
            
            # Pad/trim to candidate count
            while len(votes) < num_candidates:
                votes.append(0)
            votes = votes[:num_candidates]
            
            # Add result
            booth_id = f"{ac_id}-{base:03d}"
            data['results'][booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            missing_bases.discard(base)
            new_count += 1
        
        print(f"    Page {i+1}: +{new_count} booths")
        
        # Rate limiting
        time.sleep(0.5)
    
    # Save results
    data['totalBooths'] = len(data['results'])
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'processed',
        'extracted': len(data['results']),
        'expected': len(expected_bases),
        'new': new_count
    }


def main():
    print("=" * 60)
    print("Gemini Vision Extraction for Missing Booths")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    # Get ACs with gaps
    gaps = []
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        
        booths_file = OUTPUT_BASE / ac_id / "booths.json"
        if not booths_file.exists():
            continue
        
        with open(booths_file) as f:
            meta = json.load(f)
        expected_bases = set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', []))
        
        results_file = OUTPUT_BASE / ac_id / "2024.json"
        if results_file.exists():
            with open(results_file) as f:
                data = json.load(f)
            existing_bases = set(get_base_booth_no(k.split('-')[-1]) for k in data.get('results', {}).keys())
        else:
            existing_bases = set()
        
        missing = len(expected_bases - existing_bases)
        if missing > 0:
            gaps.append((ac_num, missing, len(expected_bases)))
    
    # Sort by missing count
    gaps.sort(key=lambda x: -x[1])
    
    print(f"\nFound {len(gaps)} ACs with gaps")
    print(f"Total missing: {sum(g[1] for g in gaps):,} booth locations\n")
    
    if len(sys.argv) > 1:
        # Process specific AC
        ac_num = int(sys.argv[1])
        result = process_ac(ac_num, pc_data, schema)
        print(f"\nResult: {result}")
    else:
        # Process top gaps
        total_new = 0
        for ac_num, missing, expected in gaps[:10]:  # Process top 10
            result = process_ac(ac_num, pc_data, schema)
            if result.get('new', 0) > 0:
                total_new += result['new']
            print(f"  → {result}")
            print()
        
        print(f"\n{'=' * 60}")
        print(f"Total new booths extracted: {total_new:,}")


if __name__ == "__main__":
    main()
