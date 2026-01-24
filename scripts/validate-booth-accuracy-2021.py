#!/usr/bin/env python3
"""
Validate booth data accuracy for 2021 elections.

Checks:
1. Booth + Postal = Official for each candidate
2. Total booth votes + total postal = total official votes
3. Identifies any mismatches
"""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"
ELECTION_DATA = BASE_DIR / "public/data/elections/ac/TN/2021.json"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def normalize_name(name):
    """Normalize candidate name for matching."""
    if not name:
        return ""
    return ' '.join(name.upper().split())

def match_candidate(cand_name, cand_party, official_candidates):
    """Match a candidate from booth data to official data."""
    cand_name_norm = normalize_name(cand_name)
    cand_party_upper = cand_party.upper()
    
    # Try exact match first
    for official in official_candidates:
        if normalize_name(official['name']) == cand_name_norm and official['party'].upper() == cand_party_upper:
            return official
    
    # Try fuzzy match
    for official in official_candidates:
        official_name_norm = normalize_name(official['name'])
        official_party_upper = official['party'].upper()
        
        if official_party_upper == cand_party_upper:
            cand_parts = set(cand_name_norm.split())
            official_parts = set(official_name_norm.split())
            
            if len(cand_parts) > 0 and len(official_parts) > 0:
                overlap = len(cand_parts & official_parts)
                total_parts = len(cand_parts | official_parts)
                if overlap > 0 and overlap / total_parts > 0.5:
                    return official
    
    return None

def validate_accuracy(ac_id):
    """Validate booth data accuracy for a single AC."""
    booth_file = BOOTHS_DIR / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found", []
    
    booth_data = load_json(booth_file)
    elections_data = load_json(ELECTION_DATA)
    
    official = elections_data.get(ac_id, {})
    if not official:
        return None, "Official data not found", []
    
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    official_candidates = official.get('candidates', [])
    postal = booth_data.get('postal', {})
    
    if not candidates or not results:
        return None, "Missing booth data", []
    
    # Calculate booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Get postal votes
    postal_map = {}
    for p in postal.get('candidates', []):
        key = (normalize_name(p.get('name', '')), p.get('party', '').upper())
        postal_map[key] = p.get('postal', 0)
    
    # Validate each candidate
    mismatches = []
    total_booth = 0
    total_postal = 0
    total_official = 0
    matched_candidates = 0
    
    for i, cand in enumerate(candidates):
        official_cand = match_candidate(cand['name'], cand['party'], official_candidates)
        
        if not official_cand:
            mismatches.append(f"  ⚠️  {cand['name']} ({cand['party']}): Not found in official data")
            continue
        
        matched_candidates += 1
        official_votes = official_cand['votes']
        booth_votes = booth_totals[i]
        
        key = (normalize_name(cand['name']), cand['party'].upper())
        postal_votes = postal_map.get(key, 0)
        
        total_booth += booth_votes
        total_postal += postal_votes
        total_official += official_votes
        
        # Check if booth + postal = official
        calculated_total = booth_votes + postal_votes
        if calculated_total != official_votes:
            mismatches.append(
                f"  ❌ {cand['name']} ({cand['party']}): "
                f"Booth ({booth_votes:,}) + Postal ({postal_votes:,}) = {calculated_total:,} "
                f"≠ Official ({official_votes:,}) [Diff: {official_votes - calculated_total:,}]"
            )
    
    # Check totals
    total_official_sum = sum(c['votes'] for c in official_candidates)
    total_calculated = total_booth + total_postal
    
    if total_calculated != total_official_sum:
        mismatches.append(
            f"  ❌ TOTAL: Booth ({total_booth:,}) + Postal ({total_postal:,}) = {total_calculated:,} "
            f"≠ Official ({total_official_sum:,}) [Diff: {total_official_sum - total_calculated:,}]"
        )
    
    is_accurate = len(mismatches) == 0
    
    return {
        'accurate': is_accurate,
        'matched': matched_candidates,
        'total_official': total_official_sum,
        'total_booth': total_booth,
        'total_postal': total_postal,
        'mismatches': mismatches
    }, "Accurate" if is_accurate else f"{len(mismatches)} mismatches", mismatches

def main():
    print("=" * 70)
    print("Validating Booth Data Accuracy for 2021 Elections")
    print("=" * 70)
    
    accurate = 0
    inaccurate = 0
    total_booth_votes = 0
    total_postal_votes = 0
    total_official_votes = 0
    all_mismatches = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg, mismatches = validate_accuracy(ac_id)
        
        if result:
            total_booth_votes += result['total_booth']
            total_postal_votes += result['total_postal']
            total_official_votes += result['total_official']
            
            if result['accurate']:
                accurate += 1
            else:
                inaccurate += 1
                print(f"❌ {ac_id}: {msg}")
                all_mismatches.append((ac_id, mismatches))
        else:
            if "not found" not in msg.lower():
                print(f"⚠️  {ac_id}: {msg}")
    
    print()
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"✅ Accurate ACs: {accurate}")
    print(f"❌ Inaccurate ACs: {inaccurate}")
    print(f"📊 Total Official Votes: {total_official_votes:,}")
    print(f"📊 Total Booth Votes: {total_booth_votes:,}")
    print(f"📮 Total Postal Votes: {total_postal_votes:,}")
    print(f"📊 Total Calculated: {total_booth_votes + total_postal_votes:,}")
    
    if total_booth_votes + total_postal_votes == total_official_votes:
        print(f"✅ Overall: 100% ACCURATE (Booth + Postal = Official)")
    else:
        diff = total_official_votes - (total_booth_votes + total_postal_votes)
        print(f"❌ Overall: MISMATCH by {diff:,} votes")
    
    accuracy_pct = (accurate / (accurate + inaccurate) * 100) if (accurate + inaccurate) > 0 else 0
    print(f"📈 AC-level Accuracy: {accuracy_pct:.2f}% ({accurate}/{accurate + inaccurate})")
    
    if all_mismatches:
        print()
        print("=" * 70)
        print("Mismatches Found:")
        print("=" * 70)
        for ac_id, mismatches in all_mismatches[:20]:  # Show first 20
            print(f"\n{ac_id}:")
            for mismatch in mismatches:
                print(mismatch)
        if len(all_mismatches) > 20:
            print(f"\n... and {len(all_mismatches) - 20} more ACs with mismatches")

if __name__ == "__main__":
    main()
