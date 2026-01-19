#!/usr/bin/env python3
"""
Re-map candidates in existing booth data using vote total matching.

For ACs where candidate order is wrong (PDF ballot order vs official results order),
this script:
1. Loads existing booth data
2. Calculates column totals
3. Matches columns to official candidates by vote total similarity
4. Reorders votes in each booth result
5. Saves updated data
"""

import json
import os
import re
from pathlib import Path
from collections import defaultdict

BOOTH_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/elections/ac/TN/2021.json")


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def match_columns_to_candidates(col_totals: list, official_candidates: list):
    """Match column totals to official candidates by vote similarity."""
    num_cols = len(col_totals)
    num_official = len(official_candidates)
    
    # Scale factor (booth totals may exclude postal)
    col_sum = sum(col_totals)
    official_sum = sum(c['votes'] for c in official_candidates if c['party'] != 'NOTA')
    scale = official_sum / col_sum if col_sum > 0 else 1
    
    # Greedy matching: for each column, find best official match
    mapping = {}  # col_idx -> official_idx
    used_official = set()
    
    # Sort columns by total (largest first for better matching)
    col_sorted = sorted(range(num_cols), key=lambda i: col_totals[i], reverse=True)
    
    for col_idx in col_sorted:
        scaled_col = col_totals[col_idx] * scale
        
        best_match = -1
        best_diff = float('inf')
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official or off_cand['party'] == 'NOTA':
                continue
            
            diff = abs(scaled_col - off_cand['votes'])
            if diff < best_diff:
                best_diff = diff
                best_match = off_idx
        
        if best_match >= 0:
            pct_diff = best_diff / official_candidates[best_match]['votes'] * 100 if official_candidates[best_match]['votes'] > 0 else 100
            if pct_diff < 30:  # Allow 30% error for matching
                mapping[col_idx] = best_match
                used_official.add(best_match)
    
    return mapping, scale


def remap_ac(ac_id: str, official_data: dict):
    """Remap candidates for a single AC."""
    booth_path = BOOTH_BASE / ac_id / "2021.json"
    if not booth_path.exists():
        return False, "No booth data"
    
    with open(booth_path) as f:
        booth_data = json.load(f)
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    
    # Calculate column totals from booth data
    results = booth_data.get('results', {})
    if not results:
        return False, "No results"
    
    old_num_cols = len(booth_data.get('candidates', []))
    col_totals = [0] * old_num_cols
    
    for r in results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < old_num_cols:
                col_totals[i] += v
    
    # Match columns to official candidates
    mapping, scale = match_columns_to_candidates(col_totals, official['candidates'])
    
    if len(mapping) < min(5, num_candidates - 1):  # Need at least 5 matches (or all-1 for small candidate sets)
        return False, f"Only {len(mapping)} matches"
    
    # Remap votes in each booth
    new_results = {}
    for booth_id, r in results.items():
        old_votes = r.get('votes', [])
        new_votes = [0] * num_candidates
        
        for col_idx, off_idx in mapping.items():
            if col_idx < len(old_votes):
                new_votes[off_idx] = old_votes[col_idx]
        
        if sum(new_votes) > 0:
            new_results[booth_id] = {
                'votes': new_votes,
                'total': sum(new_votes),
                'rejected': r.get('rejected', 0)
            }
    
    # Validate
    new_col_totals = [0] * num_candidates
    for r in new_results.values():
        for i, v in enumerate(r['votes']):
            if i < num_candidates:
                new_col_totals[i] += v
    
    errors = []
    for i in range(min(3, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = new_col_totals[i]
        if off > 100:
            errors.append(abs(calc - off) / off * 100)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error > 15:
        return False, f"Error {avg_error:.1f}%"
    
    # Save updated booth data
    booth_data['candidates'] = [
        {'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
        for c in official['candidates']
    ]
    booth_data['results'] = new_results
    booth_data['totalBooths'] = len(new_results)
    
    with open(booth_path, 'w') as f:
        json.dump(booth_data, f, indent=2)
    
    return True, f"{avg_error:.1f}% error"


def main():
    official_data = load_official_data()
    
    # Find ACs with high error that might benefit from remapping
    candidates = []
    
    for ac_id in sorted(official_data.keys()):
        booth_path = BOOTH_BASE / ac_id / "2021.json"
        if not booth_path.exists():
            continue
        
        with open(booth_path) as f:
            booth_data = json.load(f)
        
        official = official_data[ac_id]
        num_cand = len(booth_data.get('candidates', []))
        totals = [0] * num_cand
        for r in booth_data.get('results', {}).values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    totals[i] += v
        
        errors = []
        for i in range(min(3, len(official['candidates']))):
            off = official['candidates'][i]['votes']
            calc = totals[i] if i < len(totals) else 0
            if off > 100:
                errors.append(abs(calc - off) / off * 100)
        
        avg = sum(errors) / len(errors) if errors else 100
        
        if avg >= 15:  # Only process ACs with error >= 15%
            candidates.append((ac_id, avg))
    
    print(f"Found {len(candidates)} ACs with error >= 15%\n")
    
    improved = 0
    for ac_id, old_error in sorted(candidates, key=lambda x: x[1], reverse=True):
        name = official_data[ac_id].get('constituencyName', ac_id)
        success, msg = remap_ac(ac_id, official_data)
        
        if success:
            print(f"  ✅ {ac_id} {name}: {old_error:.1f}% -> {msg}")
            improved += 1
        else:
            print(f"  ❌ {ac_id} {name}: {old_error:.1f}% - {msg}")
    
    print(f"\nImproved: {improved}/{len(candidates)}")


if __name__ == "__main__":
    main()
