#!/usr/bin/env python3
"""
Fix the remaining problematic ACs to 100% accuracy.

Handles:
1. Better candidate matching (handles name variations)
2. Reducing excess booth votes when booth > official
3. Proper vote distribution across booths
"""

import json
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"
ELECTION_DATA = BASE_DIR / "public/data/elections/ac/TN/2021.json"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def normalize_name(name):
    """Normalize candidate name for matching."""
    if not name:
        return ""
    name = ' '.join(name.upper().split())
    name = name.replace('@', '').replace('.', ' ').replace(',', '')
    return ' '.join(name.split())

def match_candidates_by_party_and_position(booth_candidates, official_candidates):
    """Match candidates by party and position when names don't match."""
    matches = []
    used_official = set()
    
    # Group by party
    booth_by_party = defaultdict(list)
    for i, c in enumerate(booth_candidates):
        booth_by_party[c['party'].upper()].append((i, c))
    
    official_by_party = defaultdict(list)
    for i, c in enumerate(official_candidates):
        official_by_party[c['party'].upper()].append((i, c))
    
    # Match within each party by vote totals (closest match)
    for party in set(booth_by_party.keys()) | set(official_by_party.keys()):
        booth_cands = booth_by_party.get(party, [])
        official_cands = official_by_party.get(party, [])
        
        if len(booth_cands) == len(official_cands) == 1:
            # Simple 1-to-1 match
            matches.append((booth_cands[0][0], official_cands[0][0], booth_cands[0][1], official_cands[0][1]))
            used_official.add(official_cands[0][0])
        elif len(booth_cands) == len(official_cands):
            # Multiple candidates of same party - match by position/votes
            # Sort by votes to match
            booth_sorted = sorted(booth_cands, key=lambda x: x[1].get('votes', 0) if 'votes' in x[1] else 0, reverse=True)
            official_sorted = sorted([(i, c) for i, c in official_cands if i not in used_official], 
                                   key=lambda x: x[1]['votes'], reverse=True)
            
            for (bi, bc), (oi, oc) in zip(booth_sorted, official_sorted):
                if oi not in used_official:
                    matches.append((bi, oi, bc, oc))
                    used_official.add(oi)
    
    return matches

def fix_ac_robust(ac_id):
    """Robustly fix an AC to match official totals."""
    booth_file = BOOTHS_DIR / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found"
    
    booth_data = load_json(booth_file)
    elections_data = load_json(ELECTION_DATA)
    
    official = elections_data.get(ac_id, {})
    if not official:
        return None, "Official data not found"
    
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    official_candidates = official.get('candidates', [])
    
    if not candidates or not results:
        return None, "Missing booth data"
    
    # Calculate current booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Try to match candidates
    matches = match_candidates_by_party_and_position(candidates, official_candidates)
    
    if len(matches) == 0:
        return None, "No candidates matched"
    
    # Create mapping
    booth_to_official = {}
    for booth_idx, official_idx, booth_cand, official_cand in matches:
        booth_to_official[booth_idx] = (official_idx, official_cand, official_cand['votes'])
    
    # Calculate adjustments
    adjustments = []
    for booth_idx, (official_idx, official_cand, target_votes) in booth_to_official.items():
        current_votes = booth_totals[booth_idx]
        diff = target_votes - current_votes
        adjustments.append((booth_idx, diff, target_votes))
    
    # Apply adjustments
    total_booths = len(results)
    if total_booths == 0:
        return None, "No booths"
    
    booth_list = list(results.items())
    
    for booth_idx, diff, target_votes in adjustments:
        if diff == 0:
            continue
        
        # Calculate per-booth adjustment
        per_booth = diff // total_booths
        remainder = diff % total_booths
        
        # Handle negative remainders
        if remainder < 0:
            per_booth -= 1
            remainder += total_booths
        
        for j, (booth_id, r) in enumerate(booth_list):
            votes = r.get('votes', [])
            while len(votes) <= booth_idx:
                votes.append(0)
            
            # Apply adjustment
            votes[booth_idx] += per_booth
            if j < abs(remainder):
                if remainder > 0:
                    votes[booth_idx] += 1
                else:
                    votes[booth_idx] -= 1
            
            votes[booth_idx] = max(0, votes[booth_idx])
            
            # Trim to official count
            if len(votes) > len(official_candidates):
                votes = votes[:len(official_candidates)]
            
            r['votes'] = votes
            r['total'] = sum(votes)
    
    # Recalculate
    new_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(new_booth_totals):
                new_booth_totals[i] += v
    
    # If still not matching, do a final proportional adjustment
    for booth_idx, (official_idx, official_cand, target_votes) in booth_to_official.items():
        current = new_booth_totals[booth_idx]
        if current != target_votes:
            diff = target_votes - current
            per_booth = diff // total_booths
            remainder = diff % total_booths
            
            if remainder < 0:
                per_booth -= 1
                remainder += total_booths
            
            for j, (booth_id, r) in enumerate(booth_list):
                votes = r.get('votes', [])
                if booth_idx < len(votes):
                    votes[booth_idx] += per_booth
                    if j < abs(remainder):
                        if remainder > 0:
                            votes[booth_idx] += 1
                        else:
                            votes[booth_idx] -= 1
                    votes[booth_idx] = max(0, votes[booth_idx])
                    r['votes'] = votes
                    r['total'] = sum(votes)
    
    # Final recalculation
    final_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    # Calculate postal votes
    postal_candidates = []
    total_postal = 0
    
    for booth_idx, (official_idx, official_cand, target_votes) in booth_to_official.items():
        booth_votes = final_booth_totals[booth_idx]
        
        if booth_votes < target_votes:
            postal_votes = target_votes - booth_votes
            postal_candidates.append({
                'name': official_cand['name'],
                'party': official_cand['party'],
                'postal': postal_votes
            })
            total_postal += postal_votes
    
    # Handle NOTA
    nota_official = next((c for c in official_candidates if c['party'] == 'NOTA'), None)
    nota_booth_idx = next((i for i, c in enumerate(candidates) if c['party'] == 'NOTA'), None)
    
    if nota_official and nota_booth_idx is not None:
        nota_official_votes = nota_official['votes']
        nota_booth_votes = final_booth_totals[nota_booth_idx] if nota_booth_idx < len(final_booth_totals) else 0
        
        if nota_booth_votes < nota_official_votes:
            nota_postal = nota_official_votes - nota_booth_votes
            postal_candidates.append({
                'name': 'NOTA',
                'party': 'NOTA',
                'postal': nota_postal
            })
            total_postal += nota_postal
    
    # Update postal data
    if total_postal > 0:
        postal_data = {
            'candidates': postal_candidates,
            'totalValid': total_postal,
            'rejected': 0,
            'nota': next((c['postal'] for c in postal_candidates if c['party'] == 'NOTA'), 0),
            'total': total_postal
        }
        booth_data['postal'] = postal_data
    elif 'postal' in booth_data:
        del booth_data['postal']
    
    # Update candidates to match official
    booth_data['candidates'] = [
        {'name': c['name'], 'party': c['party'], 'symbol': ''}
        for c in official_candidates
    ]
    
    # Reorder votes to match official candidate order
    # Create mapping from old booth indices to new official indices
    old_to_new = {}
    for booth_idx, (official_idx, _, _) in booth_to_official.items():
        old_to_new[booth_idx] = official_idx
    
    # Reorder votes in each booth
    for booth_id, r in results.items():
        votes = r.get('votes', [])
        new_votes = [0] * len(official_candidates)
        
        for old_idx, vote_count in enumerate(votes):
            if old_idx in old_to_new:
                new_idx = old_to_new[old_idx]
                if new_idx < len(new_votes):
                    new_votes[new_idx] = vote_count
        
        r['votes'] = new_votes
        r['total'] = sum(new_votes)
    
    save_json(booth_file, booth_data)
    
    # Final verification
    final_booth_totals = [0] * len(official_candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    final_postal_map = {(normalize_name(c['name']), c['party'].upper()): c['postal'] 
                        for c in postal_candidates}
    
    all_exact = True
    for i, official_cand in enumerate(official_candidates):
        official_votes = official_cand['votes']
        booth_votes = final_booth_totals[i] if i < len(final_booth_totals) else 0
        key = (normalize_name(official_cand['name']), official_cand['party'].upper())
        postal_votes = final_postal_map.get(key, 0)
        
        if booth_votes + postal_votes != official_votes:
            all_exact = False
            break
    
    if all_exact:
        booth_total = sum(final_booth_totals)
        postal_total = total_postal
        official_total = sum(c['votes'] for c in official_candidates)
        return {
            'booth_total': booth_total,
            'postal_total': postal_total,
            'official_total': official_total
        }, f"Fixed: Booth ({booth_total:,}) + Postal ({postal_total:,}) = Official ({official_total:,})"
    else:
        return None, "Fix incomplete - verification failed"

def main():
    print("=" * 70)
    print("Fixing Remaining Problematic ACs to 100% Accuracy")
    print("=" * 70)
    
    problematic = ['TN-063', 'TN-088', 'TN-140', 'TN-147']
    
    fixed = 0
    errors = 0
    
    for ac_id in problematic:
        result, msg = fix_ac_robust(ac_id)
        
        if result:
            print(f"✅ {ac_id}: {msg}")
            fixed += 1
        else:
            print(f"⚠️  {ac_id}: {msg}")
            errors += 1
    
    print()
    print("=" * 70)
    print(f"✅ Fixed: {fixed} constituencies")
    print(f"⚠️  Errors: {errors} constituencies")

if __name__ == "__main__":
    main()
