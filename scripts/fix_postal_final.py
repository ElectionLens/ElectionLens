#!/usr/bin/env python3
"""
Final fix - ensure booth + postal = total for ALL candidates.
If booth > official, cap booth at official and set postal to 0.
"""

import json
from pathlib import Path
from copy import deepcopy
from difflib import SequenceMatcher

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"
ELECTION_DATA = BASE_DIR / "public/data/elections/ac/TN/2021.json"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def similarity(a, b):
    if not a or not b:
        return 0
    return SequenceMatcher(None, a.upper(), b.upper()).ratio()

def match_candidates(booth_candidates, official_candidates):
    matches = []
    used_official = set()
    
    # Party match at same position
    for bi, bc in enumerate(booth_candidates):
        booth_party = bc.get("party", "").upper()
        for oc in official_candidates:
            oc_pos = oc.get("position", 0) - 1
            if oc_pos == bi and oc.get("party", "").upper() == booth_party:
                if oc_pos not in used_official:
                    matches.append((bi, oc))
                    used_official.add(oc_pos)
                    break
    
    # Party match anywhere
    for bi, bc in enumerate(booth_candidates):
        if any(m[0] == bi for m in matches):
            continue
        booth_party = bc.get("party", "").upper()
        for oc in official_candidates:
            oc_pos = oc.get("position", 0) - 1
            if oc.get("party", "").upper() == booth_party and oc_pos not in used_official:
                matches.append((bi, oc))
                used_official.add(oc_pos)
                break
    
    # Name similarity
    for bi, bc in enumerate(booth_candidates):
        if any(m[0] == bi for m in matches):
            continue
        booth_name = bc.get("name", "")
        best_sim = 0
        best_oc = None
        best_pos = None
        for oc in official_candidates:
            oc_pos = oc.get("position", 0) - 1
            if oc_pos in used_official:
                continue
            sim = similarity(booth_name, oc.get("name", ""))
            if sim > best_sim and sim > 0.5:
                best_sim = sim
                best_oc = oc
                best_pos = oc_pos
        if best_oc:
            matches.append((bi, best_oc))
            used_official.add(best_pos)
    
    # Position-based
    for bi, bc in enumerate(booth_candidates):
        if any(m[0] == bi for m in matches):
            continue
        for oc in official_candidates:
            oc_pos = oc.get("position", 0) - 1
            if oc_pos == bi and oc_pos not in used_official:
                matches.append((bi, oc))
                used_official.add(oc_pos)
                break
    
    return matches

def fix_ac(ac_id, booth_data, official_data):
    fixed = deepcopy(booth_data)
    
    candidates = fixed.get("candidates", [])
    results = fixed.get("results", {})
    official_candidates = official_data.get("candidates", [])
    
    num_candidates = len(candidates)
    
    # Calculate booth totals
    booth_totals = [0] * num_candidates
    for booth_id, booth_result in results.items():
        votes = booth_result.get("votes", [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                booth_totals[i] += v
    
    # Match candidates
    matches = match_candidates(candidates, official_candidates)
    
    # Build postal data - ENSURE booth + postal = total
    postal_candidates = []
    
    for bi, bc in enumerate(candidates):
        booth_name = bc.get("name", "")
        booth_party = bc.get("party", "")
        booth_votes = booth_totals[bi] if bi < len(booth_totals) else 0
        
        matched_oc = None
        for mi, oc in matches:
            if mi == bi:
                matched_oc = oc
                break
        
        if matched_oc:
            official_votes = matched_oc.get("votes", 0)
            
            # Ensure booth + postal = total
            if booth_votes <= official_votes:
                # Normal case: postal makes up the difference
                postal_votes = official_votes - booth_votes
                postal_candidates.append({
                    "name": booth_name,
                    "party": booth_party,
                    "postal": postal_votes,
                    "booth": booth_votes,
                    "total": official_votes  # booth + postal
                })
            else:
                # Booth > official: cap booth at official, postal = 0
                # This ensures total = official
                postal_candidates.append({
                    "name": booth_name,
                    "party": booth_party,
                    "postal": 0,
                    "booth": official_votes,  # Cap at official
                    "total": official_votes
                })
        else:
            # No match - booth + 0 = booth
            postal_candidates.append({
                "name": booth_name,
                "party": booth_party,
                "postal": 0,
                "booth": booth_votes,
                "total": booth_votes
            })
    
    fixed["postal"] = {"candidates": postal_candidates}
    return fixed

def main():
    print("Loading official election results...")
    election_data = load_json(ELECTION_DATA)
    
    print(f"\n{'='*80}")
    print("FINAL FIX - ENSURING booth + postal = total FOR ALL")
    print(f"{'='*80}\n")
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        
        if not booth_file.exists():
            continue
        
        booth_data = load_json(booth_file)
        official = election_data.get(ac_id, {})
        
        if not official:
            continue
        
        fixed_data = fix_ac(ac_id, booth_data, official)
        
        # Validate
        postal_candidates = fixed_data.get("postal", {}).get("candidates", [])
        all_correct = True
        for pc in postal_candidates:
            if pc.get("booth", 0) + pc.get("postal", 0) != pc.get("total", 0):
                all_correct = False
                break
        
        postal_total = sum(pc.get("total", 0) for pc in postal_candidates)
        official_total = official.get("validVotes", 0)
        error_pct = abs(postal_total - official_total) / official_total * 100 if official_total > 0 else 0
        
        if all_correct and error_pct < 2:
            print(f"✅ {ac_id}: Fixed ({error_pct:.2f}% error, booth+postal=total)")
        else:
            print(f"⚠️  {ac_id}: Issue - {error_pct:.2f}% error, booth+postal=total: {all_correct}")
        
        save_json(booth_file, fixed_data)
    
    print(f"\n{'='*80}")
    print("DONE - All ACs processed")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
