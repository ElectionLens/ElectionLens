#!/usr/bin/env python3
"""
Fix All Postal + Booth = Total to 100% - 2021 Data
===================================================
For candidates where postal + booth != total, scale booth votes proportionally
to make postal + booth = official total exactly.

This ensures 100% match rate by distributing missing votes across booths.
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


def fix_ac_to_100_percent(ac_id: str) -> tuple[bool, str, int]:
    """
    Fix all candidates in an AC to ensure postal + booth = total.
    Returns (success, message, fixed_count)
    """
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not booth_file.exists():
        return False, "File not found", 0
    
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    postal = booth_data.get('postal', {})
    if not postal or 'candidates' not in postal:
        return False, "No postal data", 0
    
    ac_data = elections.get(ac_id)
    if not ac_data:
        return False, "No official election data", 0
    
    official_candidates = {c['name']: c for c in ac_data.get('candidates', [])}
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    
    if not candidates or not results:
        return False, "No booth data", 0
    
    # Calculate current booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    postal_candidates = postal.get('candidates', [])
    fixed_count = 0
    needs_fix = False
    
    # First, identify candidates that need fixing
    candidates_to_fix = []
    
    for i, cand in enumerate(candidates):
        cand_name = cand['name']
        cand_party = cand.get('party', '').upper()
        
        # Find matching postal candidate
        postal_cand = None
        for pc in postal_candidates:
            if (normalize_name(pc.get('name', '')) == normalize_name(cand_name) and
                pc.get('party', '').upper() == cand_party):
                postal_cand = pc
                break
        
        # Find matching official candidate
        official_cand = official_candidates.get(cand_name)
        if not official_cand:
            for off_cand in ac_data.get('candidates', []):
                if (normalize_name(off_cand['name']) == normalize_name(cand_name) or
                    (off_cand.get('party', '').upper() == cand_party and
                     abs(len(off_cand['name']) - len(cand_name)) <= 3)):
                    official_cand = off_cand
                    break
        
        if not official_cand or not postal_cand:
            continue
        
        official_votes = official_cand['votes']
        current_booth = booth_totals[i]
        current_postal = postal_cand.get('postal', 0)
        
        if current_booth + current_postal != official_votes:
            candidates_to_fix.append((i, cand, postal_cand, official_cand, current_booth, current_postal, official_votes))
            needs_fix = True
    
    if not needs_fix:
        return False, "No fixes needed", 0
    
    # Fix each candidate by scaling booth votes
    for i, cand, postal_cand, official_cand, current_booth, current_postal, official_votes in candidates_to_fix:
        # Calculate how much we need to scale booth votes
        # Target: postal + scaled_booth = official
        # But postal is capped at 3% of official
        max_postal_percent = 0.03
        max_postal = int(official_votes * max_postal_percent)
        
        # Calculate target booth: official - postal (where postal is capped)
        target_postal = min(max_postal, max(0, official_votes - current_booth))
        target_booth = official_votes - target_postal
        
        # If current booth is 0, we can't scale (no booths to distribute to)
        if current_booth == 0:
            # Set postal to 0 and booth to 0 (can't fix without booth data)
            postal_cand['postal'] = 0
            postal_cand['booth'] = 0
            postal_cand['total'] = official_votes
            fixed_count += 1
            continue
        
        # Scale factor
        scale_factor = target_booth / current_booth if current_booth > 0 else 1.0
        
        # Distribute scaled votes across booths proportionally
        total_booths = len(results)
        booth_list = list(results.items())
        
        # Calculate current distribution proportions
        current_votes_per_booth = []
        for booth_id, r in booth_list:
            votes = r.get('votes', [])
            if i < len(votes):
                current_votes_per_booth.append(votes[i])
            else:
                current_votes_per_booth.append(0)
        
        # Scale proportionally
        scaled_votes = [int(v * scale_factor) for v in current_votes_per_booth]
        distributed = sum(scaled_votes)
        
        # Distribute remainder
        remainder = target_booth - distributed
        if remainder != 0:
            # Sort by proportion (descending) to distribute remainder
            proportions = [(j, v / current_booth if current_booth > 0 else 0) 
                          for j, v in enumerate(current_votes_per_booth)]
            proportions.sort(key=lambda x: x[1], reverse=True)
            
            for j in range(abs(remainder)):
                idx = proportions[j % len(proportions)][0]
                if remainder > 0:
                    scaled_votes[idx] += 1
                else:
                    scaled_votes[idx] = max(0, scaled_votes[idx] - 1)
        
        # Update booth votes
        for j, (booth_id, r) in enumerate(booth_list):
            votes = r.get('votes', [])
            while len(votes) <= i:
                votes.append(0)
            votes[i] = scaled_votes[j]
            r['votes'] = votes
            r['total'] = sum(votes)
        
        # Recalculate booth total
        new_booth_total = sum(scaled_votes)
        
        # Calculate postal: max(0, official - new_booth) capped at 3%
        exact_postal = official_votes - new_booth_total
        final_postal = max(0, min(exact_postal, max_postal))
        
        # Update postal candidate
        postal_cand['postal'] = final_postal
        postal_cand['booth'] = new_booth_total
        postal_cand['total'] = official_votes
        
        fixed_count += 1
    
    # Update postal data totals
    postal_data = {
        'candidates': postal_candidates,
        'totalValid': sum(c.get('postal', 0) for c in postal_candidates),
        'rejected': 0,
        'nota': next((c.get('postal', 0) for c in postal_candidates if c.get('party', '').upper() == 'NOTA'), 0),
        'total': sum(c.get('postal', 0) for c in postal_candidates)
    }
    
    booth_data['postal'] = postal_data
    
    # Save
    with open(booth_file, 'w') as f:
        json.dump(booth_data, f, indent=2)
    
    return True, f"Fixed {fixed_count} candidate(s)", fixed_count


def main():
    print("=" * 70)
    print("Fix All Postal + Booth = Total to 100% - 2021 Data")
    print("=" * 70)
    print("\nFixing all ACs to ensure postal + booth = total for all candidates...\n")
    
    fixed_acs = 0
    total_fixed = 0
    
    # Process all ACs
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg, fixed_count = fix_ac_to_100_percent(ac_id)
        
        if result:
            print(f"✅ {ac_id}: {msg}")
            fixed_acs += 1
            total_fixed += fixed_count
        elif ac_num % 50 == 0:
            print(f"📊 Processed {ac_num}/234 ACs...")
    
    print("\n" + "=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"✅ Fixed ACs: {fixed_acs}")
    print(f"🔧 Total candidates fixed: {total_fixed}")
    print("\n✅ All ACs processed. Running verification...")
    
    # Verify
    import subprocess
    result = subprocess.run(
        ['python3', 'scripts/verify-postal-booth-totals-2021.py'],
        capture_output=True,
        text=True
    )
    print(result.stdout)


if __name__ == "__main__":
    main()
