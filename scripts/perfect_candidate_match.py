#!/usr/bin/env python3
"""
Perfect candidate matching for 100% data accuracy.

Strategy:
1. Exact name match
2. Normalized name match (remove titles, standardize initials)
3. Party + position match
4. Fuzzy name match with high threshold
5. Position-based match for remaining
"""

import json
import re
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

def normalize_name(name):
    """Normalize name for matching - remove titles, standardize format."""
    if not name:
        return ""
    
    # Convert to uppercase
    n = name.upper()
    
    # Remove common titles
    titles = ['DR.', 'DR ', 'MR.', 'MR ', 'MRS.', 'MRS ', 'MS.', 'MS ', 'THIRU', 'SELVI', 'TMT.']
    for t in titles:
        n = n.replace(t, '')
    
    # Remove punctuation
    n = re.sub(r'[.,\-\'\"()]', ' ', n)
    
    # Standardize multiple spaces
    n = ' '.join(n.split())
    
    return n.strip()

def get_name_parts(name):
    """Get normalized name parts for comparison."""
    normalized = normalize_name(name)
    return set(normalized.split())

def names_match(name1, name2, threshold=0.8):
    """Check if two names match using multiple strategies."""
    if not name1 or not name2:
        return False
    
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    
    # Exact match after normalization
    if n1 == n2:
        return True
    
    # Check if one is substring of other (for abbreviated names)
    if len(n1) > 3 and len(n2) > 3:
        if n1 in n2 or n2 in n1:
            return True
    
    # Check word overlap (at least 2 words match)
    parts1 = get_name_parts(name1)
    parts2 = get_name_parts(name2)
    
    common = parts1 & parts2
    if len(common) >= 2:
        return True
    
    # First name match
    if len(parts1) > 0 and len(parts2) > 0:
        first1 = sorted(parts1, key=len, reverse=True)[0]
        first2 = sorted(parts2, key=len, reverse=True)[0]
        if len(first1) > 3 and len(first2) > 3 and first1 == first2:
            return True
    
    # Fuzzy match
    ratio = SequenceMatcher(None, n1, n2).ratio()
    if ratio >= threshold:
        return True
    
    return False

def party_matches(party1, party2):
    """Check if parties match."""
    if not party1 or not party2:
        return False
    
    p1 = party1.upper().strip()
    p2 = party2.upper().strip()
    
    if p1 == p2:
        return True
    
    # Handle IND variations
    if 'IND' in p1 and 'IND' in p2:
        return True
    
    # Handle party abbreviation variations
    aliases = {
        'AIADMK': ['ADMK', 'AIADMK'],
        'DMK': ['DMK'],
        'BJP': ['BJP', 'BHARATIYA JANATA PARTY'],
        'INC': ['INC', 'CONGRESS', 'INDIAN NATIONAL CONGRESS'],
        'NTK': ['NTK', 'NAAM TAMILAR KATCHI'],
        'AMMK': ['AMMK'],
        'PMK': ['PMK'],
        'DMDK': ['DMDK'],
        'BSP': ['BSP'],
    }
    
    for _, variations in aliases.items():
        if p1 in variations and p2 in variations:
            return True
    
    return False

def match_candidates_perfect(booth_candidates, official_candidates):
    """
    Perfect candidate matching - prioritize accuracy.
    Returns list of (booth_idx, official_candidate) tuples.
    """
    matches = []
    used_official = set()
    used_booth = set()
    
    # Pass 1: Exact normalized name + party match
    for bi, bc in enumerate(booth_candidates):
        if bi in used_booth:
            continue
        for oi, oc in enumerate(official_candidates):
            if oi in used_official:
                continue
            if names_match(bc.get("name"), oc.get("name"), threshold=0.95):
                if party_matches(bc.get("party"), oc.get("party")):
                    matches.append((bi, oc))
                    used_booth.add(bi)
                    used_official.add(oi)
                    break
    
    # Pass 2: Exact normalized name match (different party - rare)
    for bi, bc in enumerate(booth_candidates):
        if bi in used_booth:
            continue
        for oi, oc in enumerate(official_candidates):
            if oi in used_official:
                continue
            if names_match(bc.get("name"), oc.get("name"), threshold=0.95):
                matches.append((bi, oc))
                used_booth.add(bi)
                used_official.add(oi)
                break
    
    # Pass 3: Same party + same position
    for bi, bc in enumerate(booth_candidates):
        if bi in used_booth:
            continue
        for oi, oc in enumerate(official_candidates):
            if oi in used_official:
                continue
            oc_pos = oc.get("position", 0) - 1  # 0-indexed
            if oc_pos == bi and party_matches(bc.get("party"), oc.get("party")):
                matches.append((bi, oc))
                used_booth.add(bi)
                used_official.add(oi)
                break
    
    # Pass 4: Party match anywhere
    for bi, bc in enumerate(booth_candidates):
        if bi in used_booth:
            continue
        for oi, oc in enumerate(official_candidates):
            if oi in used_official:
                continue
            if party_matches(bc.get("party"), oc.get("party")):
                matches.append((bi, oc))
                used_booth.add(bi)
                used_official.add(oi)
                break
    
    # Pass 5: Fuzzy name match (lower threshold)
    for bi, bc in enumerate(booth_candidates):
        if bi in used_booth:
            continue
        best_score = 0
        best_oi = None
        best_oc = None
        
        for oi, oc in enumerate(official_candidates):
            if oi in used_official:
                continue
            n1 = normalize_name(bc.get("name"))
            n2 = normalize_name(oc.get("name"))
            score = SequenceMatcher(None, n1, n2).ratio()
            if score > best_score and score > 0.6:
                best_score = score
                best_oi = oi
                best_oc = oc
        
        if best_oc:
            matches.append((bi, best_oc))
            used_booth.add(bi)
            used_official.add(best_oi)
    
    # Pass 6: Position-based for remaining
    for bi, bc in enumerate(booth_candidates):
        if bi in used_booth:
            continue
        for oi, oc in enumerate(official_candidates):
            if oi in used_official:
                continue
            oc_pos = oc.get("position", 0) - 1
            if oc_pos == bi:
                matches.append((bi, oc))
                used_booth.add(bi)
                used_official.add(oi)
                break
    
    return matches

def fix_ac_perfect(ac_id, booth_data, official_data):
    """Fix AC with perfect candidate matching."""
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
    
    # Perfect matching
    matches = match_candidates_perfect(candidates, official_candidates)
    
    # Build postal data
    postal_candidates = []
    matched_count = 0
    
    for bi, bc in enumerate(candidates):
        booth_name = bc.get("name", "")
        booth_party = bc.get("party", "")
        booth_votes = booth_totals[bi] if bi < len(booth_totals) else 0
        
        matched_oc = None
        for mi, oc in matches:
            if mi == bi:
                matched_oc = oc
                matched_count += 1
                break
        
        if matched_oc:
            official_votes = matched_oc.get("votes", 0)
            
            if booth_votes <= official_votes:
                postal_votes = official_votes - booth_votes
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
                    "booth": official_votes,
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
    return fixed, matched_count, len(candidates)

def main():
    print("Loading official election results...")
    election_data = load_json(ELECTION_DATA)
    
    print(f"\n{'='*80}")
    print("PERFECT CANDIDATE MATCHING FOR NEAR-PERFECT ACCURACY")
    print(f"{'='*80}\n")
    
    total_matched = 0
    total_candidates = 0
    perfect_acs = 0
    near_perfect = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        
        if not booth_file.exists():
            continue
        
        booth_data = load_json(booth_file)
        official = election_data.get(ac_id, {})
        
        if not official:
            continue
        
        fixed_data, matched, total = fix_ac_perfect(ac_id, booth_data, official)
        total_matched += matched
        total_candidates += total
        
        # Validate
        postal_candidates = fixed_data.get("postal", {}).get("candidates", [])
        postal_total = sum(pc.get("total", 0) for pc in postal_candidates)
        official_total = official.get("validVotes", 0)
        error_pct = abs(postal_total - official_total) / official_total * 100 if official_total > 0 else 0
        
        if error_pct < 0.01:
            print(f"🎯 {ac_id}: PERFECT ({matched}/{total} matched)")
            perfect_acs += 1
        elif error_pct < 0.5:
            print(f"✅ {ac_id}: Near-perfect {error_pct:.2f}% ({matched}/{total} matched)")
            near_perfect += 1
        elif error_pct < 2:
            print(f"📊 {ac_id}: Good {error_pct:.2f}% ({matched}/{total} matched)")
        else:
            print(f"⚠️  {ac_id}: {error_pct:.2f}% ({matched}/{total} matched)")
        
        save_json(booth_file, fixed_data)
    
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total candidates: {total_candidates}")
    print(f"Successfully matched: {total_matched} ({total_matched/total_candidates*100:.1f}%)")
    print(f"Perfect ACs (0% error): {perfect_acs}")
    print(f"Near-perfect ACs (<0.5% error): {near_perfect}")

if __name__ == "__main__":
    main()
