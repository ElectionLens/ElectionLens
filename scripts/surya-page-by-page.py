#!/usr/bin/env python3
"""
Run Surya OCR page by page to avoid crashes on large PDFs.
Processes each page separately and combines results.

Usage:
    python scripts/surya-page-by-page.py 21    # Process AC021
"""

import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# Configuration
FORM20_DIR = Path.home() / "Desktop" / "GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")
SURYA_OUTPUT = Path("/tmp/surya_2024_pages")


def load_data():
    with open(PC_DATA_PATH) as f:
        pc_data = json.load(f)
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id: str, schema: dict) -> tuple:
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id, pc_info.get('name', '')
    return None, None


def get_pdf_page_count(pdf_path: Path) -> int:
    """Get number of pages in PDF."""
    result = subprocess.run(
        ['pdfinfo', str(pdf_path)],
        capture_output=True, text=True
    )
    for line in result.stdout.split('\n'):
        if line.startswith('Pages:'):
            return int(line.split(':')[1].strip())
    return 0


def run_surya_on_page(pdf_path: Path, page_num: int, output_dir: Path) -> dict:
    """Run Surya OCR on a single page."""
    page_output = output_dir / f"page_{page_num}"
    page_output.mkdir(parents=True, exist_ok=True)
    
    result = subprocess.run(
        ['surya_ocr', str(pdf_path), '--output_dir', str(page_output),
         '--disable_math', '--page_range', str(page_num)],
        capture_output=True, text=True, timeout=120
    )
    
    if result.returncode != 0:
        return None
    
    # Find results file
    results_file = None
    for item in page_output.iterdir():
        if item.is_dir():
            rf = item / 'results.json'
            if rf.exists():
                results_file = rf
                break
    
    if not results_file:
        return None
    
    with open(results_file) as f:
        return json.load(f)


def parse_surya_results(all_results: list, num_candidates: int) -> dict:
    """Parse Surya OCR results to extract booth data."""
    booth_data = {}
    
    for page_result in all_results:
        if not page_result:
            continue
        
        # Get text lines from the result
        for key in page_result:
            pages = page_result[key]
            if not isinstance(pages, list):
                continue
            
            for page in pages:
                text_lines = page.get('text_lines', [])
                
                # Sort by Y position first
                sorted_lines = sorted(text_lines, key=lambda x: x.get('polygon', [[0,0]])[0][1])
                
                # Group text lines by row (y position) - use 12 pixel tolerance
                rows = defaultdict(list)
                for line in sorted_lines:
                    text = line.get('text', '').strip()
                    # Strip HTML tags
                    text = re.sub(r'<[^>]+>', '', text)
                    if not text:
                        continue
                    
                    polygon = line.get('polygon', [[0, 0]])
                    y = polygon[0][1] if polygon else 0
                    x = polygon[0][0] if polygon else 0
                    
                    row_y = int(y // 12) * 12
                    rows[row_y].append((x, text))
                
                # Process each row
                for row_y in sorted(rows.keys()):
                    items = rows[row_y]
                    items.sort(key=lambda x: x[0])  # Sort by x position
                    
                    # Extract all numbers from the row with their x positions
                    all_nums = []
                    for x, text in items:
                        nums = re.findall(r'\b(\d+)\b', text)
                        for n in nums:
                            all_nums.append((x, int(n)))
                    
                    if len(all_nums) < 3:
                        continue
                    
                    # Pattern: Look for booth number (1-600) in leftmost position
                    # followed by vote counts
                    booth_no = None
                    votes = []
                    
                    # Find first numbers at x < 150 (leftmost columns)
                    left_nums = [(x, n) for x, n in all_nums if x < 150 and 1 <= n <= 600]
                    
                    if left_nums:
                        # Take the station number (usually 2nd occurrence or at x ~100-130)
                        for x, n in left_nums:
                            if 100 <= x <= 150:
                                booth_no = n
                                break
                        if not booth_no and left_nums:
                            booth_no = left_nums[-1][1]  # Take last one in left area
                    
                    if not booth_no:
                        continue
                    
                    # Get votes - numbers after booth position, filter reasonable values
                    vote_start_x = 150
                    vote_nums = [(x, n) for x, n in all_nums if x > vote_start_x and n <= 2000]
                    
                    # Exclude total columns (usually at x > 1100)
                    vote_nums = [(x, n) for x, n in vote_nums if x < 1100]
                    
                    if len(vote_nums) >= 3:
                        votes = [n for _, n in vote_nums]
                    
                    if booth_no and len(votes) >= 3:
                        total = sum(votes)
                        if 20 <= total <= 3000:  # Relaxed minimum
                            booth_id = f"{booth_no:03d}"
                            if booth_id not in booth_data:
                                while len(votes) < num_candidates:
                                    votes.append(0)
                                booth_data[booth_id] = votes[:num_candidates]
    
    return booth_data


def process_ac(ac_num: int, pc_data: dict, schema: dict) -> dict:
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Load existing results
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return {'status': 'no_file'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    # Find booths needing extraction
    needs_extraction = set()
    for k, v in data.get('results', {}).items():
        if not v.get('votes') or len(v.get('votes', [])) == 0:
            match = re.match(r'^TN-\d{3}-0*(\d+)', k)
            if match:
                needs_extraction.add(int(match.group(1)))
    
    if not needs_extraction:
        return {'status': 'complete'}
    
    print(f"\n{'='*60}")
    print(f"{ac_id} - Processing with Surya page-by-page")
    print(f"{'='*60}")
    print(f"  Booths needing extraction: {len(needs_extraction)}")
    
    # Get PC candidates
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_info = pc_data.get(pc_id, {}) if pc_id else {}
    candidates = pc_info.get('candidates', [])
    num_candidates = len(candidates)
    
    if num_candidates == 0:
        return {'status': 'no_candidates'}
    
    # Check PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        return {'status': 'no_pdf'}
    
    # Get page count
    page_count = get_pdf_page_count(pdf_path)
    print(f"  PDF pages: {page_count}")
    
    # Process each page
    output_dir = SURYA_OUTPUT / f"AC{ac_num:03d}"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    all_results = []
    for page_num in range(page_count):
        print(f"    Page {page_num + 1}/{page_count}...", end=" ", flush=True)
        try:
            result = run_surya_on_page(pdf_path, page_num, output_dir)
            if result:
                all_results.append(result)
                print("✓")
            else:
                print("✗")
        except Exception as e:
            print(f"error: {e}")
    
    print(f"  Completed {len(all_results)}/{page_count} pages")
    
    # Parse results
    extracted = parse_surya_results(all_results, num_candidates)
    print(f"  Extracted {len(extracted)} booths")
    
    if not extracted:
        return {'status': 'no_extraction'}
    
    # Update data
    updated = 0
    new = 0
    for booth_id, votes in extracted.items():
        full_id = f"{ac_id}-{booth_id}"
        if full_id in data['results']:
            if not data['results'][full_id].get('votes'):
                data['results'][full_id]['votes'] = votes
                data['results'][full_id]['total'] = sum(votes)
                updated += 1
        else:
            data['results'][full_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            new += 1
    
    data['totalBooths'] = len(data['results'])
    data['source'] = 'Tamil Nadu CEO - Form 20 (Surya OCR)'
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"  ✅ Saved: +{new} new, {updated} updated")
    
    return {'status': 'success', 'new': new, 'updated': updated}


def main():
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
        for ac_num in ac_nums:
            result = process_ac(ac_num, pc_data, schema)
            print(f"Result: {result}")
    else:
        print("Usage: python scripts/surya-page-by-page.py <ac_num> [ac_num2...]")


if __name__ == "__main__":
    main()
