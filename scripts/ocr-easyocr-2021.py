#!/usr/bin/env python3
"""
Extract 2021 booth data from scanned PDFs using EasyOCR.
"""

import subprocess
import json
import re
import os
import tempfile
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def convert_pdf_to_images(pdf_path, output_dir, dpi=300):
    """Convert PDF pages to images."""
    prefix = output_dir / "page"
    subprocess.run([
        'pdftoppm', '-r', str(dpi), '-png',
        str(pdf_path), str(prefix)
    ], check=True, timeout=120)
    
    # Find all generated images
    images = sorted(output_dir.glob("page-*.png"))
    return images


def run_easyocr(image_path):
    """Run EasyOCR on an image and return text."""
    result = subprocess.run([
        'easyocr', '-l', 'en', '-f', str(image_path),
        '--detail', '0', '--download_enabled', 'False'
    ], capture_output=True, text=True, timeout=120)
    
    return result.stdout


def parse_ocr_output(text, num_candidates):
    """Parse OCR output to extract booth data."""
    # Split into lines/tokens
    tokens = re.findall(r'\b(\d+)\b', text)
    
    results = {}
    
    # Try to identify booth rows
    # Pattern: booth_no, vote1, vote2, vote3, ...
    i = 0
    while i < len(tokens) - num_candidates:
        booth_no = int(tokens[i])
        
        # Check if this looks like a booth number (1-500)
        if 1 <= booth_no <= 500:
            # Try to extract votes for each candidate
            votes = []
            valid = True
            
            for j in range(1, num_candidates + 1):
                if i + j < len(tokens):
                    vote = int(tokens[i + j])
                    # Sanity check: votes should be 0-5000 typically
                    if 0 <= vote <= 10000:
                        votes.append(vote)
                    else:
                        valid = False
                        break
                else:
                    valid = False
                    break
            
            if valid and len(votes) == num_candidates:
                booth_key = str(booth_no)
                if booth_key not in results:
                    results[booth_key] = {
                        'votes': votes,
                        'total': sum(votes),
                        'rejected': 0
                    }
                    i += num_candidates + 1
                    continue
        
        i += 1
    
    return results


def process_ac(ac_num, official_data):
    """Process single AC using OCR."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return None, "PDF not found"
    
    official = official_data.get(ac_id, {})
    ac_name = official.get('constituencyName', '')
    candidates = official.get('candidates', [])
    
    print(f"\n📍 {ac_id} - {ac_name}")
    print(f"   {len(candidates)} candidates")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        
        # Convert PDF to images
        print(f"   Converting PDF to images...")
        images = convert_pdf_to_images(pdf_path, tmpdir)
        print(f"   {len(images)} pages")
        
        all_results = {}
        
        for img_path in images:
            print(f"   OCR on {img_path.name}...", end=" ")
            
            ocr_text = run_easyocr(img_path)
            
            # Parse this page
            page_results = parse_ocr_output(ocr_text, len(candidates))
            print(f"{len(page_results)} booths")
            
            # Merge results
            for k, v in page_results.items():
                if k not in all_results:
                    all_results[k] = v
        
        print(f"   Total: {len(all_results)} booths")
        
        if len(all_results) < 50:
            return None, f"Too few booths ({len(all_results)})"
        
        # Validate
        col_sums = [0] * len(candidates)
        for r in all_results.values():
            for i, v in enumerate(r['votes']):
                if i < len(col_sums):
                    col_sums[i] += v
        
        for i in range(min(2, len(candidates))):
            off_total = candidates[i].get('votes', 0)
            extracted = col_sums[i]
            ratio = extracted / off_total if off_total > 0 else 0
            status = "✓" if 0.90 <= ratio <= 1.10 else "✗"
            print(f"   {status} {candidates[i].get('party'):8}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
        
        # Add AC prefix
        final_results = {f"{ac_id}-{k}": v for k, v in all_results.items()}
        return final_results, "OK"


def save_results(ac_id, ac_name, results, candidates):
    """Save results."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cands_out = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND'),
        'symbol': c.get('symbol', '')
    } for i, c in enumerate(candidates)]
    
    output = {
        'acId': ac_id,
        'acName': ac_name,
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(results),
        'source': 'Tamil Nadu CEO - Form 20 (OCR)',
        'candidates': cands_out,
        'results': results
    }
    
    with open(output_dir / '2021.json', 'w') as f:
        json.dump(output, f, indent=2)


def main():
    import sys
    official = load_official()
    
    # Scanned ACs that need OCR
    OCR_ACS = [27]  # AC027 is the only scanned PDF
    
    if len(sys.argv) > 1:
        OCR_ACS = [int(sys.argv[1])]
    
    print(f"Processing {len(OCR_ACS)} scanned ACs with EasyOCR...")
    
    for ac_num in OCR_ACS:
        ac_id = f"TN-{ac_num:03d}"
        off = official.get(ac_id, {})
        
        results, status = process_ac(ac_num, official)
        
        if results:
            save_results(ac_id, off.get('constituencyName', ''), results, off.get('candidates', []))
            print(f"   ✅ Saved {len(results)} booths")
        else:
            print(f"   ❌ {status}")


if __name__ == "__main__":
    main()
