#!/usr/bin/env python3
"""Flexible parser that handles variable candidate counts"""

import json
import re
from pathlib import Path

MISSING_ACS = [27, 30, 31, 33, 34, 49, 147, 148]
OCR_CACHE = Path("/Users/p0s097d/ElectionLens/scripts/ocr_cache")
OUTPUT_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTIONS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

def clean_num(s):
    s = re.sub(r'[ie\(\)\{\}\[\]¢°~\-Oo]', '0', s)
    s = re.sub(r'[lI|]', '1', s)
    s = re.sub(r'[}h=]', '', s)
    s = s.strip()
    if not s:
        return 0
    try:
        return int(s)
    except:
        return None

def parse_booth_line(line):
    """Parse any booth line - extract booth ID and votes"""
    parts = line.split()
    if len(parts) < 4:
        return None
    
    try:
        # First should be row number
        row = int(parts[0])
        if row < 1 or row > 500:
            return None
        
        # Second is booth ID
        booth = parts[1]
        if not re.match(r'^\d+[A-Z]?$', booth):
            return None
        
        # Parse all following numbers as votes
        votes = []
        for i in range(2, len(parts)):
            v = clean_num(parts[i])
            if v is not None and v < 50000:  # Reasonable vote count
                votes.append(v)
        
        if len(votes) >= 3:  # Need at least a few votes
            return {'booth': booth, 'votes': votes}
    except:
        pass
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
        if 'rot' in txt_file.name or 'hires' in txt_file.name:
            continue
        
        text = txt_file.read_text()
        
        for line in text.split('\n'):
            line = line.strip()
            if not line or len(line) < 8:
                continue
            
            booth = parse_booth_line(line)
            if booth:
                # Truncate or pad votes to match candidate count
                votes = booth['votes']
                if len(votes) > num_candidates + 3:
                    # Take first num_candidates
                    votes = votes[:num_candidates]
                elif len(votes) < num_candidates:
                    # Pad with zeros
                    votes = votes + [0] * (num_candidates - len(votes))
                else:
                    votes = votes[:num_candidates]
                
                booth['votes'] = votes
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
    
    # Check against first candidate (winner)
    official_winner = candidates[0].get('votes', 0)
    booth_winner = totals[0] if totals else 0
    
    error = abs(booth_winner - official_winner) / official_winner * 100 if official_winner > 0 else 100.0
    return len(booth_data['results']), error

def main():
    print("=== Flexible Parser ===\n")
    
    with open(ELECTIONS_FILE) as f:
        elections = json.load(f)
    
    for ac_num in MISSING_ACS:
        ac_id = f"TN-{ac_num:03d}"
        print(f"{ac_id}:", end=" ")
        
        booth_data = extract_ac(ac_num, elections)
        
        if booth_data:
            num_booths, error = validate(booth_data, elections.get(ac_id, {}))
            
            if num_booths >= 50:
                out_dir = OUTPUT_DIR / ac_id
                out_dir.mkdir(parents=True, exist_ok=True)
                with open(out_dir / "2021.json", 'w') as f:
                    json.dump(booth_data, f, indent=2)
                print(f"✓ {num_booths} booths, {error:.1f}% error")
            else:
                print(f"⚠ Only {num_booths} booths")
        else:
            print("✗ No data")

if __name__ == "__main__":
    main()
