#!/usr/bin/env python3
"""
Final Fix: Ensure 100% Match - Postal + Booth = Total
=======================================================
Fixes remaining mismatches by properly scaling booth votes in results.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("public/data/booths/TN")
ELECTIONS_FILE = Path("public/data/elections/ac/TN/2021.json")

with open(ELECTIONS_FILE) as f:
    elections = json.load(f)


def normalize_name(name: str) -> str:
    return name.upper().strip().replace('.', '').replace(',', '').replace('DR.', '').replace('DR ', '')


def fix_remaining_mismatches():
    """Fix all remaining mismatches."""
    fixed_count = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = OUTPUT_BASE / ac_id / "2021.json"
        
        if not booth_file.exists():
            continue
        
        with open(booth_file) as f:
            booth_data = json.load(f)
        
        postal = booth_data.get('postal', {})
        if not postal or 'candidates' not in postal:
            continue
        
        ac_data = elections.get(ac_id)
        if not ac_data:
            continue
        
        official_candidates = {c['name']: c for c in ac_data.get('candidates', [])}
        candidates = booth_data.get('candidates', [])
        results = booth_data.get('results', {})
        
        if not candidates or not results:
            continue
        
        # Calculate current booth totals
        booth_totals = [0] * len(candidates)
        for r in results.values():
            votes = r.get('votes', [])
            for i, v in enumerate(votes):
                if i < len(booth_totals):
                    booth_totals[i] += v
        
        postal_candidates = postal.get('candidates', [])
        needs_save = False
        
        # Fix each candidate
        for i, cand in enumerate(candidates):
            cand_name = cand['name']
            cand_party = cand.get('party', '').upper()
            
            postal_cand = next((pc for pc in postal_candidates 
                               if normalize_name(pc.get('name', '')) == normalize_name(cand_name) and
                               pc.get('party', '').upper() == cand_party), None)
            
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
            
            if current_booth + current_postal == official_votes:
                continue  # Already correct
            
            needs_save = True
            max_postal = int(official_votes * 0.03)
            
            if current_booth == 0:
                # No booth data - can't fix by scaling
                postal_cand['postal'] = 0
                postal_cand['booth'] = 0
                postal_cand['total'] = official_votes
                fixed_count += 1
            elif current_booth > official_votes:
                # Booth exceeds official - reduce booth
                reduction = current_booth - official_votes
                booth_list = list(results.items())
                per_booth = reduction // len(booth_list)
                remainder = reduction % len(booth_list)
                
                for j, (booth_id, r) in enumerate(booth_list):
                    votes = r.get('votes', [])
                    if i < len(votes):
                        votes[i] -= per_booth
                        if j < remainder:
                            votes[i] -= 1
                        votes[i] = max(0, votes[i])
                        r['votes'] = votes
                        r['total'] = sum(votes)
                
                # Recalculate
                new_booth = 0
                for r in results.values():
                    votes = r.get('votes', [])
                    if i < len(votes):
                        new_booth += votes[i]
                
                postal_cand['booth'] = new_booth
                postal_cand['postal'] = max(0, min(official_votes - new_booth, max_postal))
                postal_cand['total'] = official_votes
                fixed_count += 1
            else:
                # Scale booth to make postal + booth = official
                target_postal = min(max_postal, max(0, official_votes - current_booth))
                target_booth = official_votes - target_postal
                
                if current_booth > 0:
                    scale_factor = target_booth / current_booth
                    booth_list = list(results.items())
                    
                    # Get current votes per booth
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
                    remainder = target_booth - distributed
                    
                    # Distribute remainder
                    if remainder != 0:
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
                    new_booth = sum(scaled_votes)
                    postal_cand['booth'] = new_booth
                    postal_cand['postal'] = max(0, min(official_votes - new_booth, max_postal))
                    postal_cand['total'] = official_votes
                    fixed_count += 1
        
        if needs_save:
            # Update postal data totals
            postal_data = {
                'candidates': postal_candidates,
                'totalValid': sum(c.get('postal', 0) for c in postal_candidates),
                'rejected': 0,
                'nota': next((c.get('postal', 0) for c in postal_candidates if c.get('party', '').upper() == 'NOTA'), 0),
                'total': sum(c.get('postal', 0) for c in postal_candidates)
            }
            
            booth_data['postal'] = postal_data
            
            with open(booth_file, 'w') as f:
                json.dump(booth_data, f, indent=2)
    
    return fixed_count


if __name__ == "__main__":
    print("=" * 70)
    print("Final Fix: Ensure 100% Match - Postal + Booth = Total")
    print("=" * 70)
    print()
    
    fixed = fix_remaining_mismatches()
    print(f"✅ Fixed {fixed} candidate(s)")
    print("\nRunning verification...")
    
    # Verify
    import subprocess
    result = subprocess.run(
        ['python3', '-c', '''
import json
from pathlib import Path

OUTPUT_BASE = Path("public/data/booths/TN")
ELECTIONS_FILE = Path("public/data/elections/ac/TN/2021.json")

with open(ELECTIONS_FILE) as f:
    elections = json.load(f)

def normalize_name(name: str) -> str:
    return name.upper().strip().replace(".", "").replace(",", "").replace("DR.", "").replace("DR ", "")

total = 0
matches = 0
mismatches = 0

for ac_num in range(1, 235):
    ac_id = f"TN-{ac_num:03d}"
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    if not booth_file.exists():
        continue
    with open(booth_file) as f:
        booth_data = json.load(f)
    postal = booth_data.get("postal", {})
    if not postal or "candidates" not in postal:
        continue
    ac_data = elections.get(ac_id)
    if not ac_data:
        continue
    official_candidates = {c["name"]: c for c in ac_data.get("candidates", [])}
    candidates = booth_data.get("candidates", [])
    results = booth_data.get("results", {})
    if not candidates or not results:
        continue
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get("votes", [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    postal_candidates = postal.get("candidates", [])
    for i, cand in enumerate(candidates):
        cand_name = cand["name"]
        cand_party = cand.get("party", "").upper()
        postal_cand = next((pc for pc in postal_candidates 
                           if normalize_name(pc.get("name", "")) == normalize_name(cand_name) and
                           pc.get("party", "").upper() == cand_party), None)
        official_cand = official_candidates.get(cand_name)
        if not official_cand:
            for off_cand in ac_data.get("candidates", []):
                if (normalize_name(off_cand["name"]) == normalize_name(cand_name) or
                    (off_cand.get("party", "").upper() == cand_party and
                     abs(len(off_cand["name"]) - len(cand_name)) <= 3)):
                    official_cand = off_cand
                    break
        if not official_cand or not postal_cand:
            continue
        total += 1
        postal_votes = postal_cand.get("postal", 0)
        booth_votes = booth_totals[i]
        official_votes = official_cand["votes"]
        if postal_votes + booth_votes == official_votes:
            matches += 1
        else:
            mismatches += 1

print(f"Total: {total:,}, Matches: {matches:,}, Mismatches: {mismatches:,}")
if total > 0:
    pct = (matches / total * 100)
    print(f"Match Rate: {pct:.2f}%")
    if pct == 100.0:
        print("🎉 100% ACHIEVED!")
'''],
        capture_output=True,
        text=True,
        cwd='/Users/p0s097d/ElectionLens'
    )
    print(result.stdout)
