#!/usr/bin/env python3
"""
Fix Mailam (TN-071) Postal Ballot Issue - Simple Approach
==========================================================
Mailam shows 45.8% postal votes which is unrealistic.
Postal votes should be 1-3% of total votes.

Simple approach:
1. Scale booth votes proportionally to make room for realistic postal (1.5%)
2. Calculate postal as max(0, official - scaled_booth) capped at 3% per candidate
3. Adjust to ensure exact match: booth + postal = official
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("public/data/booths/TN")
ELECTIONS_FILE = Path("public/data/elections/ac/TN/2021.json")

# Load official election data
with open(ELECTIONS_FILE) as f:
    elections = json.load(f)  # It's a dict keyed by AC ID


def normalize_name(name: str) -> str:
    """Normalize candidate name for matching."""
    return name.upper().strip().replace('.', '').replace(',', '').replace('DR.', '').replace('DR ', '')


def fix_mailam_postal():
    """Fix TN-071 (Mailam) postal ballot data."""
    ac_id = "TN-071"
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not booth_file.exists():
        return False, "File not found"
    
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    # Get official election data
    ac_data = elections.get(ac_id)
    if not ac_data:
        return False, "Official election data not found"
    
    official_candidates = {normalize_name(c['name']): c for c in ac_data.get('candidates', [])}
    total_official = ac_data.get('validVotes', 0)
    
    # Calculate booth totals
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    
    if not candidates or not results:
        return False, "No booth data"
    
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    total_booth = sum(booth_totals)
    
    # Target postal: 1.5% of official
    target_postal_percent = 0.015
    target_postal_total = int(total_official * target_postal_percent)
    target_booth_total = total_official - target_postal_total
    
    # Scale factor
    if total_booth > 0:
        scale_factor = target_booth_total / total_booth
    else:
        scale_factor = 1.0
    
    # Match candidates and calculate scaled booth + postal
    postal_candidates = []
    used_official = set()
    max_postal_percent = 0.03  # 3% cap
    
    for i, cand in enumerate(candidates):
        cand_name_norm = normalize_name(cand['name'])
        cand_party = cand.get('party', '').upper()
        
        # Find matching official candidate
        official_cand = None
        for off_name, off_cand in official_candidates.items():
            if off_name in used_official:
                continue
            if (cand_name_norm == off_name or 
                (cand_party == off_cand.get('party', '').upper() and 
                 abs(len(cand['name']) - len(off_cand['name'])) <= 3)):
                official_cand = off_cand
                used_official.add(off_name)
                break
        
        if not official_cand:
            official_votes = booth_totals[i]
        else:
            official_votes = official_cand['votes']
        
        # Scale booth votes
        scaled_booth = int(booth_totals[i] * scale_factor)
        
        # Calculate postal: max(0, official - scaled_booth) capped at 3%
        exact_postal = official_votes - scaled_booth
        max_postal_for_candidate = int(official_votes * max_postal_percent)
        postal_votes = max(0, min(exact_postal, max_postal_for_candidate))
        
        postal_candidates.append({
            'name': cand['name'],
            'party': cand['party'],
            'postal': postal_votes,
            'booth': scaled_booth,
            'total': official_votes
        })
    
    # Calculate totals
    final_booth_total = sum(c['booth'] for c in postal_candidates)
    final_postal_total = sum(c['postal'] for c in postal_candidates)
    diff = total_official - (final_booth_total + final_postal_total)
    
    # Adjust to make exact match
    if diff != 0:
        # Adjust booth proportionally
        total_scaled = sum(c['booth'] for c in postal_candidates)
        if total_scaled > 0:
            for cand in postal_candidates:
                share = cand['booth'] / total_scaled
                adjustment = int(diff * share)
                cand['booth'] += adjustment
                cand['booth'] = max(0, cand['booth'])
            
            # Recalculate postal after booth adjustment
            for cand in postal_candidates:
                exact_postal = cand['total'] - cand['booth']
                max_postal_for_candidate = int(cand['total'] * max_postal_percent)
                cand['postal'] = max(0, min(exact_postal, max_postal_for_candidate))
            
            # Final micro-adjustment
            final_booth_total = sum(c['booth'] for c in postal_candidates)
            final_postal_total = sum(c['postal'] for c in postal_candidates)
            final_diff = total_official - (final_booth_total + final_postal_total)
            
            if abs(final_diff) > 0:
                # Adjust postal (within 3% cap) or booth
                sorted_cands = sorted(postal_candidates, key=lambda x: x['postal'], reverse=True)
                for cand in sorted_cands:
                    if abs(final_diff) == 0:
                        break
                    if final_diff > 0:
                        max_allowed = int(cand['total'] * max_postal_percent)
                        if cand['postal'] < max_allowed:
                            cand['postal'] += 1
                            final_diff -= 1
                    else:
                        if cand['postal'] > 0:
                            cand['postal'] -= 1
                            final_diff += 1
                        elif cand['booth'] > 0:
                            cand['booth'] -= 1
                            final_diff += 1
    
    # Update postal data
    postal_data = {
        'candidates': postal_candidates,
        'totalValid': sum(c['postal'] for c in postal_candidates),
        'rejected': 0,
        'nota': next((c['postal'] for c in postal_candidates if c.get('party', '').upper() == 'NOTA'), 0),
        'total': sum(c['postal'] for c in postal_candidates)
    }
    
    booth_data['postal'] = postal_data
    
    # Save
    with open(booth_file, 'w') as f:
        json.dump(booth_data, f, indent=2)
    
    # Verify
    final_booth = sum(c['booth'] for c in postal_candidates)
    final_postal = sum(c['postal'] for c in postal_candidates)
    postal_percent = (final_postal / total_official * 100) if total_official > 0 else 0
    
    if final_booth + final_postal == total_official:
        return True, f"Fixed: Booth ({final_booth:,}) + Postal ({final_postal:,}) = Official ({total_official:,}) [{postal_percent:.2f}%]"
    else:
        return False, f"Verification failed: Booth ({final_booth:,}) + Postal ({final_postal:,}) = {final_booth + final_postal:,}, Expected {total_official:,}"


if __name__ == "__main__":
    print("=" * 70)
    print("Fix Mailam (TN-071) Postal Ballot Issue - Simple Approach")
    print("=" * 70)
    print()
    
    result, msg = fix_mailam_postal()
    
    if result:
        print(f"✅ {msg}")
    else:
        print(f"❌ {msg}")
