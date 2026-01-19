#!/usr/bin/env python3
"""
Smart fix for postal votes - matches candidates by party and position.
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
    """Return similarity ratio between two strings."""
    if not a or not b:
        return 0
    return SequenceMatcher(None, a.upper(), b.upper()).ratio()

def match_candidates(booth_candidates, official_candidates):
    """
    Match booth candidates to official candidates.
    Returns a list of tuples: (booth_idx, official_candidate)
    """
    matches = []
    used_official = set()
    
    # First pass: exact party match at same position
    for bi, bc in enumerate(booth_candidates):
        booth_party = bc.get("party", "").upper()
        for oc in official_candidates:
            oc_pos = oc.get("position", 0) - 1  # Convert to 0-indexed
            if oc_pos == bi and oc.get("party", "").upper() == booth_party:
                if oc_pos not in used_official:
                    matches.append((bi, oc))
                    used_official.add(oc_pos)
                    break
    
    # Second pass: party match anywhere
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
    
    # Third pass: name similarity
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
    
    # Fourth pass: position-based for remaining
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
    """Fix AC data using smart candidate matching."""
    fixed = deepcopy(booth_data)
    
    candidates = fixed.get("candidates", [])
    results = fixed.get("results", {})
    official_candidates = official_data.get("candidates", [])
    
    num_candidates = len(candidates)
    
    # Calculate booth totals for each candidate position
    booth_totals = [0] * num_candidates
    for booth_id, booth_result in results.items():
        votes = booth_result.get("votes", [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                booth_totals[i] += v
    
    # Match candidates
    matches = match_candidates(candidates, official_candidates)
    
    # Build postal data structure
    postal_candidates = []
    
    for bi, bc in enumerate(candidates):
        booth_name = bc.get("name", "")
        booth_party = bc.get("party", "")
        booth_votes = booth_totals[bi] if bi < len(booth_totals) else 0
        
        # Find match for this booth candidate
        matched_oc = None
        for mi, oc in matches:
            if mi == bi:
                matched_oc = oc
                break
        
        if matched_oc:
            official_votes = matched_oc.get("votes", 0)
            postal_votes = max(0, official_votes - booth_votes)
            postal_candidates.append({
                "name": booth_name,
                "party": booth_party,
                "postal": postal_votes,
                "booth": booth_votes,
                "total": official_votes
            })
        else:
            postal_candidates.append({
                "name": booth_name,
                "party": booth_party,
                "postal": 0,
                "booth": booth_votes,
                "total": booth_votes
            })
    
    fixed["postal"] = {"candidates": postal_candidates}
    return fixed

def validate_ac(fixed_data, official_data):
    """Validate accuracy after fix."""
    postal_candidates = fixed_data.get("postal", {}).get("candidates", [])
    postal_total = sum(pc.get("total", 0) for pc in postal_candidates)
    official_total = official_data.get("validVotes", 0)
    
    if official_total > 0:
        error_pct = abs(postal_total - official_total) / official_total * 100
    else:
        error_pct = 0
    
    # Check booth + postal = total
    mismatches = []
    for pc in postal_candidates:
        calc = pc.get("booth", 0) + pc.get("postal", 0)
        total = pc.get("total", 0)
        if calc != total:
            mismatches.append(pc.get("name"))
    
    return error_pct, mismatches

def main():
    print("Loading official election results...")
    election_data = load_json(ELECTION_DATA)
    
    fixed_under_2 = 0
    fixed_100 = 0
    still_bad = []
    
    print(f"\n{'='*80}")
    print("SMART FIX FOR ALL 234 TAMIL NADU ACS")
    print(f"{'='*80}\n")
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        
        if not booth_file.exists():
            print(f"❌ {ac_id}: Booth file missing!")
            continue
        
        try:
            booth_data = load_json(booth_file)
            official = election_data.get(ac_id, {})
            
            if not official:
                print(f"❌ {ac_id}: No official data!")
                continue
            
            fixed_data = fix_ac(ac_id, booth_data, official)
            error_pct, mismatches = validate_ac(fixed_data, official)
            
            if error_pct < 0.01 and not mismatches:
                print(f"✅ {ac_id}: 100% accurate!")
                fixed_100 += 1
                fixed_under_2 += 1
            elif error_pct < 2:
                print(f"📊 {ac_id}: {error_pct:.2f}% error")
                fixed_under_2 += 1
            else:
                print(f"⚠️  {ac_id}: {error_pct:.2f}% error - needs manual fix")
                still_bad.append((ac_id, error_pct))
            
            save_json(booth_file, fixed_data)
            
        except Exception as e:
            print(f"❌ {ac_id}: Error: {e}")
    
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"ACs with 100% accuracy: {fixed_100}")
    print(f"ACs with <2% error: {fixed_under_2}")
    print(f"ACs still needing work: {len(still_bad)}")
    
    if still_bad:
        print(f"\nACs still with high error:")
        for ac_id, err in sorted(still_bad, key=lambda x: x[1], reverse=True)[:20]:
            print(f"  {ac_id}: {err:.1f}%")

if __name__ == "__main__":
    main()
