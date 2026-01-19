#!/usr/bin/env python3
"""Improved OCR extraction with multiple format handling"""

import json
import re
from pathlib import Path

# ACs with 0 booth data
MISSING_ACS = [27, 30, 31, 32, 33, 34, 43, 49, 108, 109, 147, 148]
OCR_CACHE = Path("/Users/p0s097d/ElectionLens/scripts/ocr_cache")
OUTPUT_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTIONS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

def clean_num(s):
    """Clean OCR number artifacts"""
    s = re.sub(r'[ie\(\)\{\}\[\]¢°~\-]', '', s)
    s = s.replace(')', '0').replace('(', '').replace('|', '1')
    s = s.strip()
    if not s or s == '.':
        return 0
    try:
        return int(float(s))
    except:
        return None

def parse_line_format1(line, num_candidates):
    """Format: row booth votes... total total rejected"""
    parts = line.split()
    if len(parts) < num_candidates + 3:
        return None
    
    try:
        row = int(parts[0])
        if row < 1 or row > 500:
            return None
        
        booth = parts[1]
        if not re.match(r'^\d+[A-Z]?$', booth):
            return None
        
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

def parse_line_format2(line, num_candidates):
    """Format with | separator: row | booth votes..."""
    if '|' not in line:
        return None
    
    # Split by | and clean
    parts = re.split(r'\s*\|\s*', line.strip())
    if len(parts) < 2:
        return None
    
    try:
        row = int(parts[0].strip())
        if row < 1 or row > 500:
            return None
        
        # Rest after first |
        rest = ' '.join(parts[1:])
        tokens = rest.split()
        if len(tokens) < num_candidates + 1:
            return None
        
        # First token is booth
        booth = tokens[0]
        if not re.match(r'^\d+[A-Z]?$', booth):
            # Try using row number as booth
            booth = str(row)
        
        # Parse votes
        votes = []
        start_idx = 1 if re.match(r'^\d+[A-Z]?$', tokens[0]) else 0
        for i in range(start_idx, start_idx + num_candidates):
            if i < len(tokens):
                v = clean_num(tokens[i])
                if v is not None:
                    votes.append(v)
        
        if len(votes) >= num_candidates:
            return {'booth': booth, 'votes': votes[:num_candidates]}
    except:
        pass
    return None

def parse_line_simple(line, num_candidates):
    """Simple format: just look for booth-like ID followed by numbers"""
    # Find booth pattern
    match = re.search(r'(\d+[A-Z]?)\s+([\d\s]+)', line)
    if not match:
        return None
    
    booth = match.group(1)
    num_str = match.group(2)
    
    # Parse numbers
    nums = [clean_num(n) for n in num_str.split()]
    nums = [n for n in nums if n is not None]
    
    if len(nums) >= num_candidates:
        return {'booth': booth, 'votes': nums[:num_candidates]}
    return None

def extract_ac(ac_num, elections):
    ac_id = f"TN-{ac_num:03d}"
    cache_dir = OCR_CACHE / ac_id
    
    if not cache_dir.exists():
        return None
    
    official = elections.get(ac_id, {})
    candidates = official.get('candidates', [])
    num_candidates = len(candidates)
    
    if num_candidates == 0:
        return None
    
    all_booths = []
    
    for txt_file in sorted(cache_dir.glob("page_*.txt")):
        text = txt_file.read_text()
        
        for line in text.split('\n'):
            line = line.strip()
            if not line or len(line) < 10:
                continue
            
            # Try different parsers
            booth = parse_line_format1(line, num_candidates)
            if not booth:
                booth = parse_line_format2(line, num_candidates)
            if not booth:
                booth = parse_line_simple(line, num_candidates)
            
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
    print("=== Improved OCR Extraction ===\n")
    
    with open(ELECTIONS_FILE) as f:
        elections = json.load(f)
    
    for ac_num in MISSING_ACS:
        ac_id = f"TN-{ac_num:03d}"
        print(f"{ac_id}:", end=" ")
        
        booth_data = extract_ac(ac_num, elections)
        
        if booth_data:
            num_booths, error = validate(booth_data, elections.get(ac_id, {}))
            
            if error < 50:  # Accept up to 50% for now
                out_dir = OUTPUT_DIR / ac_id
                out_dir.mkdir(parents=True, exist_ok=True)
                with open(out_dir / "2021.json", 'w') as f:
                    json.dump(booth_data, f, indent=2)
                print(f"✓ {num_booths} booths, {error:.1f}% error")
            else:
                print(f"⚠ {num_booths} booths, {error:.1f}% error (too high)")
        else:
            print("✗ No data")

if __name__ == "__main__":
    main()
