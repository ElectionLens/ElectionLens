#!/usr/bin/env python3
"""
Fix All Postal Ballot Percentages - 2021 Data
==============================================
Scans all 234 ACs for unrealistic postal ballot percentages (>3%).
Postal votes should be 1-3% of total votes.

Fixes by recalculating postal as max(0, official - booth) capped at 3% per candidate.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("public/data/booths/TN")
ELECTIONS_FILE = Path("public/data/elections/ac/TN/2021.json")

# Load official election data
with open(ELECTIONS_FILE) as f:
    elections = json.load(f)


def normalize_name(name: str) -> str:
    """Normalize candidate name for matching."""
    return name.upper().strip().replace('.', '').replace(',', '').replace('DR.', '').replace('DR ', '')


def fix_postal_percentage(ac_id: str) -> tuple[bool, str, float]:
    """Fix postal ballot percentage for an AC. Returns (success, message, postal_percent)."""
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not booth_file.exists():
        return False, "File not found", 0.0
    
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    # Check if postal data exists
    postal = booth_data.get('postal', {})
    if not postal or 'candidates' not in postal:
        return False, "No postal data", 0.0
    
    # Get official election data
    ac_data = elections.get(ac_id)
    if not ac_data:
        return False, "No official election data", 0.0
    
    official_candidates = {c['name']: c for c in ac_data.get('candidates', [])}
    total_official = ac_data.get('validVotes', 0)
    
    if total_official == 0:
        return False, "No official votes", 0.0
    
    # Calculate actual booth totals
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    
    if not candidates or not results:
        return False, "No booth data", 0.0
    
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    total_booth = sum(booth_totals)
    
    # Calculate current postal percentage
    current_postal_total = postal.get('totalValid', 0)
    current_postal_percent = (current_postal_total / total_official * 100) if total_official > 0 else 0
    
    # Only fix if postal percentage is > 3% (unrealistic)
    if current_postal_percent <= 3.0:
        return False, f"No fix needed ({current_postal_percent:.2f}%)", current_postal_percent
    
    # Recalculate postal: max(0, official - booth) capped at 3% per candidate
    postal_candidates = []
    max_postal_percent = 0.03
    fixed_count = 0
    
    for i, cand in enumerate(candidates):
        official_cand = official_candidates.get(cand['name'])
        if not official_cand:
            # Try to find by party
            for off_cand in ac_data.get('candidates', []):
                if off_cand.get('party', '').upper() == cand.get('party', '').upper():
                    official_cand = off_cand
                    break
        
        if official_cand:
            official_votes = official_cand['votes']
            booth_votes = booth_totals[i]
            
            # Calculate postal: max(0, official - booth) capped at 3%
            exact_postal = official_votes - booth_votes
            max_postal_for_candidate = int(official_votes * max_postal_percent)
            postal_votes = max(0, min(exact_postal, max_postal_for_candidate))
            
            # Check if this candidate's postal was changed
            old_postal = next((c.get('postal', 0) for c in postal.get('candidates', []) 
                              if c.get('name') == cand['name'] and c.get('party', '').upper() == cand.get('party', '').upper()), 0)
            if old_postal != postal_votes:
                fixed_count += 1
            
            postal_candidates.append({
                'name': cand['name'],
                'party': cand['party'],
                'postal': postal_votes,
                'booth': booth_votes,
                'total': official_votes
            })
        else:
            # No official candidate match
            postal_candidates.append({
                'name': cand['name'],
                'party': cand['party'],
                'postal': 0,
                'booth': booth_totals[i],
                'total': booth_totals[i]
            })
    
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
    
    # Calculate new postal percentage
    new_postal_total = postal_data['totalValid']
    new_postal_percent = (new_postal_total / total_official * 100) if total_official > 0 else 0
    
    return True, f"Fixed {fixed_count} candidates: {current_postal_percent:.2f}% → {new_postal_percent:.2f}%", new_postal_percent


def main():
    print("=" * 70)
    print("Fix All Postal Ballot Percentages - 2021 Data")
    print("=" * 70)
    print("\nScanning all 234 ACs for unrealistic postal percentages (>3%)...\n")
    
    fixed_count = 0
    checked_count = 0
    high_postal_acs = []
    
    # Process all ACs
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg, postal_percent = fix_postal_percentage(ac_id)
        
        checked_count += 1
        
        if result:
            print(f"✅ {ac_id}: {msg}")
            fixed_count += 1
            high_postal_acs.append((ac_id, postal_percent))
        elif "No fix needed" in msg:
            # Check if it's still high (between 3-5% might be borderline)
            if postal_percent > 3.0:
                high_postal_acs.append((ac_id, postal_percent))
                print(f"⚠️  {ac_id}: {msg} (borderline)")
        elif "No postal data" in msg or "File not found" in msg:
            # Skip silently
            pass
        elif ac_num % 50 == 0:
            # Show progress every 50 ACs
            print(f"📊 Processed {ac_num}/234 ACs...")
    
    print("\n" + "=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"✅ Fixed: {fixed_count} ACs")
    print(f"📊 Checked: {checked_count} ACs")
    
    if high_postal_acs:
        print(f"\n⚠️  ACs with postal > 3% ({len(high_postal_acs)} total):")
        # Sort by postal percentage (descending)
        high_postal_acs.sort(key=lambda x: x[1], reverse=True)
        for ac_id, pct in high_postal_acs[:10]:  # Show top 10
            print(f"   {ac_id}: {pct:.2f}%")
        if len(high_postal_acs) > 10:
            print(f"   ... and {len(high_postal_acs) - 10} more")
    
    print("\n✅ All postal percentages checked and fixed where needed")


if __name__ == "__main__":
    main()
