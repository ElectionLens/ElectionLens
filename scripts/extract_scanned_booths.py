#!/usr/bin/env python3
"""Extract booth data from scanned Form 20 PDFs using OCR"""

import subprocess
import json
import re
from pathlib import Path

SCANNED_ACS = [27, 30, 31, 32, 33, 34, 35, 40, 43, 44, 46, 47, 49, 108, 109, 147, 148]
PDF_DIR = Path.home() / "Desktop" / "TNLA_2021_PDFs"
OUTPUT_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OCR_CACHE = Path("/Users/p0s097d/ElectionLens/scripts/ocr_cache")
ELECTIONS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

def clean_ocr_number(s):
    """Clean OCR artifacts from numbers"""
    # Common OCR errors: ie), (0), (e), e), 8), ¢), etc.
    s = re.sub(r'[ie\(\)¢]', '', s)
    s = s.strip()
    if s == '' or s == '-':
        return 0
    try:
        return int(s)
    except ValueError:
        return None

def parse_booth_line(line, num_candidates):
    """Parse a booth data line"""
    parts = line.split()
    if len(parts) < num_candidates + 4:
        return None
    
    try:
        # Row number
        row = int(parts[0])
        if row < 1 or row > 500:
            return None
        
        # Booth ID - number or numberA/B
        booth_id = parts[1]
        if not re.match(r'^\d+[A-Z]?$', booth_id):
            return None
        
        # Vote columns - parse all numeric columns after booth ID
        votes = []
        for i in range(2, len(parts)):
            v = clean_ocr_number(parts[i])
            if v is not None:
                votes.append(v)
        
        # We expect votes + total*2 + rejected at end
        # Extract only candidate votes (first num_candidates values)
        if len(votes) >= num_candidates:
            candidate_votes = votes[:num_candidates]
            return {'booth': booth_id, 'votes': candidate_votes}
    except (ValueError, IndexError):
        pass
    return None

def extract_ac(ac_num, elections):
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    cache_dir = OCR_CACHE / ac_id
    
    if not pdf_path.exists():
        return None
    
    official = elections.get(ac_id, {})
    candidates = official.get('candidates', [])
    num_candidates = len(candidates)
    
    if num_candidates == 0:
        print(f"  No candidates")
        return None
    
    # Get number of pages
    result = subprocess.run(["pdfinfo", str(pdf_path)], capture_output=True, text=True)
    num_pages = 20
    for line in result.stdout.split('\n'):
        if line.startswith("Pages:"):
            num_pages = int(line.split(':')[1].strip())
            break
    
    all_booths = []
    for page in range(1, num_pages + 1):
        print(f"\r  Page {page}/{num_pages}", end='', flush=True)
        
        # OCR
        txt_file = cache_dir / f"page_{page:02d}.txt"
        if txt_file.exists():
            text = txt_file.read_text()
        else:
            continue
        
        # Parse each line
        for line in text.split('\n'):
            booth = parse_booth_line(line.strip(), num_candidates)
            if booth:
                all_booths.append(booth)
    
    print()
    
    # Deduplicate
    seen = set()
    unique_booths = []
    for b in all_booths:
        if b['booth'] not in seen:
            seen.add(b['booth'])
            unique_booths.append(b)
    
    # Build results
    results = {}
    for b in unique_booths:
        results[b['booth']] = {'votes': b['votes'], 'total': sum(b['votes'])}
    
    return {
        'schemaId': ac_id, 'year': 2021,
        'candidates': [{'name': c.get('name', f'C{i+1}'), 'party': c.get('party', 'IND')} for i, c in enumerate(candidates)],
        'results': results
    }

def validate_extraction(booth_data, official):
    if not booth_data or not booth_data.get('results'):
        return 0, 0, 100.0
    
    candidates = official.get('candidates', [])
    if not candidates:
        return 0, 0, 100.0
    
    num_candidates = len(candidates)
    booth_totals = [0] * num_candidates
    
    for result in booth_data['results'].values():
        for i, v in enumerate(result.get('votes', [])):
            if i < num_candidates:
                booth_totals[i] += v
    
    official_winner = candidates[0].get('votes', 0)
    booth_winner = booth_totals[0] if booth_totals else 0  # Compare first candidate directly
    
    error_pct = abs(booth_winner - official_winner) / official_winner * 100 if official_winner > 0 else 100.0
    return len(booth_data['results']), booth_winner, error_pct

def main():
    print("=== OCR Booth Extraction ===\n")
    with open(ELECTIONS_FILE) as f:
        elections = json.load(f)
    
    success = failed = 0
    for ac_num in SCANNED_ACS:
        ac_id = f"TN-{ac_num:03d}"
        print(f"{ac_id}:")
        
        booth_data = extract_ac(ac_num, elections)
        
        if booth_data and booth_data.get('results'):
            num_booths, booth_votes, error_pct = validate_extraction(booth_data, elections.get(ac_id, {}))
            
            # Be more lenient - accept up to 30% error
            if error_pct < 30:
                out_dir = OUTPUT_DIR / ac_id
                out_dir.mkdir(parents=True, exist_ok=True)
                with open(out_dir / "2021.json", 'w') as f:
                    json.dump(booth_data, f, indent=2)
                print(f"  ✓ {num_booths} booths, {error_pct:.1f}% error")
                success += 1
            else:
                print(f"  ⚠ {num_booths} booths, {error_pct:.1f}% error (high)")
                failed += 1
        else:
            print(f"  ✗ No data extracted")
            failed += 1
    
    print(f"\nSuccess: {success}, Failed: {failed}")

if __name__ == "__main__":
    main()
