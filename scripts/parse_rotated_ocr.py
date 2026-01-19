#!/usr/bin/env python3
"""Parse rotated OCR output to extract booth data"""

import json
import re
from pathlib import Path

MISSING_ACS = [27, 30, 31, 33, 34, 49, 108, 109, 147, 148]
OCR_DIR = Path("/Users/p0s097d/ElectionLens/scripts/ocr_rotated")
OUTPUT_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTIONS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

def clean_num(s):
    s = re.sub(r'[ie\(\)\{\}\[\]¢°~\-O]', '0', s)
    s = re.sub(r'[lI|]', '1', s)
    s = s.strip()
    if not s:
        return 0
    try:
        return int(s)
    except:
        return None

def parse_booth_line(line, num_candidates):
    """Parse a line with booth data"""
    # Format: row | booth | votes... | total | rejected | nota | total | tendered
    parts = line.split()
    if len(parts) < num_candidates + 3:
        return None
    
    try:
        # First part should be row number
        row = int(parts[0])
        if row < 1 or row > 500:
            return None
        
        # Second part is booth ID (might have | prefix)
        booth = parts[1].lstrip('|').strip()
        if booth.startswith('j'):
            booth = booth[1:]
        
        # Clean booth ID - should be number or numberA/W/M
        if not re.match(r'^\d+[A-Z]?(\([WM]\))?$', booth):
            return None
        
        # Parse vote columns
        votes = []
        for i in range(2, 2 + num_candidates):
            if i < len(parts):
                v = clean_num(parts[i])
                if v is not None:
                    votes.append(v)
        
        if len(votes) >= num_candidates:
            return {'booth': booth, 'votes': votes[:num_candidates]}
    except:
        pass
    return None

def extract_ac(ac_num, elections):
    ac_id = f"TN-{ac_num:03d}"
    ocr_dir = OCR_DIR / ac_id
    
    if not ocr_dir.exists():
        return None
    
    official = elections.get(ac_id, {})
    candidates = official.get('candidates', [])
    num_candidates = len(candidates)
    
    if num_candidates == 0:
        return None
    
    all_booths = []
    
    for txt_file in sorted(ocr_dir.glob("page_*_rot270.txt")):
        text = txt_file.read_text()
        
        for line in text.split('\n'):
            line = line.strip()
            if not line or len(line) < 10:
                continue
            
            booth = parse_booth_line(line, num_candidates)
            if booth:
                all_booths.append(booth)
    
    # Deduplicate
    seen = set()
    unique = []
    for b in all_booths:
        if b['booth'] not in seen:
            seen.add(b['booth'])
            unique.append(b)
    
    if not unique:
        return None
    
    results = {b['booth']: {'votes': b['votes'], 'total': sum(b['votes'])} for b in unique}
    
    return {
        'schemaId': ac_id, 'year': 2021,
        'candidates': [{'name': c.get('name', '?'), 'party': c.get('party', 'IND')} for c in candidates],
        'results': results
    }

def validate(booth_data, official):
    if not booth_data or not booth_data.get('results'):
        return 0, 100.0
    
    candidates = official.get('candidates', [])
    if not candidates:
        return 0, 100.0
    
    num_cand = len(candidates)
    totals = [0] * num_cand
    
    for result in booth_data['results'].values():
        for i, v in enumerate(result.get('votes', [])):
            if i < num_cand:
                totals[i] += v
    
    official_winner = candidates[0].get('votes', 0)
    booth_winner = totals[0] if totals else 0
    
    error = abs(booth_winner - official_winner) / official_winner * 100 if official_winner > 0 else 100.0
    return len(booth_data['results']), error

def main():
    print("=== Parsing Rotated OCR Output ===\n")
    
    with open(ELECTIONS_FILE) as f:
        elections = json.load(f)
    
    success = 0
    for ac_num in MISSING_ACS:
        ac_id = f"TN-{ac_num:03d}"
        print(f"{ac_id}:", end=" ")
        
        booth_data = extract_ac(ac_num, elections)
        
        if booth_data:
            num_booths, error = validate(booth_data, elections.get(ac_id, {}))
            
            if num_booths > 50 and error < 60:
                out_dir = OUTPUT_DIR / ac_id
                out_dir.mkdir(parents=True, exist_ok=True)
                with open(out_dir / "2021.json", 'w') as f:
                    json.dump(booth_data, f, indent=2)
                print(f"✓ {num_booths} booths, {error:.1f}% error")
                success += 1
            else:
                print(f"⚠ {num_booths} booths, {error:.1f}% error")
        else:
            print("✗ No data")
    
    print(f"\nSuccess: {success}/10")

if __name__ == "__main__":
    main()
