#!/usr/bin/env python3
"""
Remap all existing booth data using greedy vote-total matching.

This script:
1. Loads existing booth data
2. Calculates column totals
3. Matches columns to official candidates using greedy vote-total matching
4. Remaps the vote arrays
5. Saves the corrected data
"""

import json
import os
from pathlib import Path

BOOTH_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/hgh/public/data/elections/ac/TN/2021.json")


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def remap_booth_data(ac_id: str, official_candidates: list) -> tuple:
    """Remap booth data for a single AC. Returns (success, old_error, new_error)."""
    
    booth_path = BOOTH_BASE / ac_id / "2021.json"
    if not booth_path.exists():
        return False, 100, 100
    
    with open(booth_path) as f:
        booth = json.load(f)
    
    num_official = len(official_candidates)
    results = booth.get('results', {})
    
    if not results:
        return False, 100, 100
    
    # Calculate column totals from current data
    first_votes = next(iter(results.values()))['votes']
    num_cols = len(first_votes)
    
    col_totals = [0] * num_cols
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cols:
                col_totals[i] += v
    
    # Calculate current error (before remapping)
    old_errors = []
    for i in range(min(3, num_official)):
        off = official_candidates[i]['votes']
        calc = col_totals[i] if i < num_cols else 0
        if off > 100:
            old_errors.append(abs(calc - off) / off * 100)
    old_avg = sum(old_errors) / len(old_errors) if old_errors else 100
    
    # If already good, skip
    if old_avg < 15:
        return True, old_avg, old_avg
    
    # Greedy matching by vote totals
    official_sorted = sorted(enumerate(official_candidates), 
                            key=lambda x: x[1]['votes'], reverse=True)
    col_sorted = sorted(enumerate(col_totals), key=lambda x: x[1], reverse=True)
    
    col_to_off = {}
    used = set()
    
    for col_idx, col_total in col_sorted:
        best_match = None
        best_diff = float('inf')
        
        for off_idx, off_cand in official_sorted:
            if off_idx in used:
                continue
            
            off_total = off_cand['votes']
            diff = abs(col_total - off_total)
            # Allow 25% difference for postal votes
            if diff <= off_total * 0.25 + 500 and diff < best_diff:
                best_diff = diff
                best_match = off_idx
        
        if best_match is not None:
            col_to_off[col_idx] = best_match
            used.add(best_match)
    
    # Remap all booth results
    remapped = {}
    for booth_id, data in results.items():
        new_votes = [0] * num_official
        for col_idx, off_idx in col_to_off.items():
            if col_idx < len(data['votes']):
                new_votes[off_idx] = data['votes'][col_idx]
        
        remapped[booth_id] = {
            'votes': new_votes,
            'total': data['total'],
            'rejected': data.get('rejected', 0)
        }
    
    # Calculate new error
    new_totals = [0] * num_official
    for r in remapped.values():
        for i, v in enumerate(r['votes']):
            if i < num_official:
                new_totals[i] += v
    
    new_errors = []
    for i in range(min(3, num_official)):
        off = official_candidates[i]['votes']
        calc = new_totals[i]
        if off > 100:
            new_errors.append(abs(calc - off) / off * 100)
    new_avg = sum(new_errors) / len(new_errors) if new_errors else 100
    
    # Only save if improvement
    if new_avg < old_avg:
        booth['results'] = remapped
        booth['candidates'] = [
            {'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
            for c in official_candidates
        ]
        with open(booth_path, 'w') as f:
            json.dump(booth, f, indent=2)
        return True, old_avg, new_avg
    
    return False, old_avg, new_avg


def main():
    print("=" * 70)
    print("Remapping All Booth Data")
    print("=" * 70)
    
    official_data = load_official_data()
    print(f"Loaded {len(official_data)} constituencies\n")
    
    improved = 0
    already_good = 0
    failed = 0
    
    for ac_id in sorted(official_data.keys()):
        official = official_data[ac_id]
        ac_name = official.get('constituencyName', ac_id)
        
        success, old_err, new_err = remap_booth_data(ac_id, official['candidates'])
        
        if old_err < 15:
            already_good += 1
        elif success and new_err < old_err:
            print(f"  ✅ {ac_id} {ac_name}: {old_err:.1f}% → {new_err:.1f}%")
            improved += 1
        else:
            failed += 1
    
    print("\n" + "=" * 70)
    print(f"Summary:")
    print(f"  Already good (<15% error): {already_good}")
    print(f"  Improved: {improved}")
    print(f"  Could not improve: {failed}")
    
    # Final count
    good_count = 0
    for ac_id in official_data.keys():
        booth_path = BOOTH_BASE / ac_id / "2021.json"
        if not booth_path.exists():
            continue
        
        with open(booth_path) as f:
            booth = json.load(f)
        
        num_cand = len(booth.get('candidates', []))
        totals = [0] * num_cand
        for r in booth.get('results', {}).values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    totals[i] += v
        
        errors = []
        for i in range(min(3, len(official_data[ac_id]['candidates']))):
            off = official_data[ac_id]['candidates'][i]['votes']
            calc = totals[i] if i < len(totals) else 0
            if off > 100:
                errors.append(abs(calc - off) / off * 100)
        
        avg = sum(errors) / len(errors) if errors else 100
        if avg < 15:
            good_count += 1
    
    print(f"\n  Final: {good_count}/{len(official_data)} ACs with good data (<15% error)")
    print(f"  Accuracy rate: {good_count / len(official_data) * 100:.1f}%")


if __name__ == "__main__":
    main()
