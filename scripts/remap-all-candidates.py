#!/usr/bin/env python3
"""
Re-map candidate columns using vote-total greedy matching.
"""

import json
import re
from pathlib import Path

ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/dcy/public/data/elections/ac/TN/2021.json")
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/dcy/public/data/booths/TN")


def remap_ac(ac_id: str, official_data: dict):
    """Re-map an AC's candidate columns."""
    booth_path = OUTPUT_BASE / ac_id / "2021.json"
    
    if not booth_path.exists():
        return False, "No booth data"
    
    with open(booth_path) as f:
        booth_data = json.load(f)
    
    official = official_data[ac_id]
    num_cand_official = len(official['candidates'])
    num_cand_booth = len(booth_data.get('candidates', []))
    
    # Calculate column totals
    col_totals = [0] * num_cand_booth
    for r in booth_data.get('results', {}).values():
        for i, v in enumerate(r.get('votes', [])):
            if i < num_cand_booth:
                col_totals[i] += v
    
    # Scale factor
    pdf_sum = sum(col_totals)
    official_sum = sum(c['votes'] for c in official['candidates'] if c['party'] != 'NOTA')
    scale = official_sum / pdf_sum if pdf_sum > 0 else 1
    
    if scale > 2.0:
        return False, f"Scale too high: {scale:.2f}"
    
    # Greedy matching
    mapping = {}  # col_idx -> off_idx
    used_official = set()
    col_sorted = sorted(range(num_cand_booth), key=lambda i: col_totals[i], reverse=True)
    
    for col_idx in col_sorted:
        scaled = col_totals[col_idx] * scale
        
        best = -1
        best_diff = float('inf')
        
        for off_idx, c in enumerate(official['candidates']):
            if off_idx in used_official or c['party'] == 'NOTA':
                continue
            diff = abs(scaled - c['votes'])
            if diff < best_diff:
                best_diff = diff
                best = off_idx
        
        if best >= 0:
            pct = best_diff / official['candidates'][best]['votes'] * 100 if official['candidates'][best]['votes'] > 0 else 100
            if pct < 30:
                mapping[col_idx] = best
                used_official.add(best)
    
    if len(mapping) < 5:
        return False, f"Only {len(mapping)} matches"
    
    # Re-build results with new mapping
    new_results = {}
    for bid, r in booth_data['results'].items():
        new_votes = [0] * num_cand_official
        
        for col_idx, off_idx in mapping.items():
            if col_idx < len(r['votes']):
                new_votes[off_idx] = r['votes'][col_idx]
        
        if sum(new_votes) > 0:
            new_results[bid] = {
                'votes': new_votes,
                'total': sum(new_votes),
                'rejected': r.get('rejected', 0)
            }
    
    # Validate new mapping
    new_totals = [0] * num_cand_official
    for r in new_results.values():
        for i, v in enumerate(r['votes']):
            if i < num_cand_official:
                new_totals[i] += v
    
    errors = []
    for i in range(min(3, num_cand_official)):
        off = official['candidates'][i]['votes']
        calc = new_totals[i]
        scaled = calc * scale
        if off > 100:
            errors.append(abs(scaled - off) / off * 100)
    
    avg_err = sum(errors) / len(errors) if errors else 100
    
    if avg_err > 20:
        return False, f"Error still {avg_err:.1f}%"
    
    # Save
    ac_name = official.get('constituencyName', ac_id)
    
    with open(booth_path, 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(new_results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
                          for c in official['candidates']],
            "results": new_results
        }, f, indent=2)
    
    return True, f"OK ({avg_err:.1f}%, {len(new_results)} booths)"


def main():
    with open(ELECTION_DATA) as f:
        official_data = json.load(f)
    
    # ACs with high error but data exists
    acs_to_fix = [
        'TN-074', 'TN-117', 'TN-120', 'TN-136', 'TN-137',
        'TN-187', 'TN-221', 'TN-224', 'TN-225', 'TN-231'
    ]
    
    print("Re-mapping candidate columns...\n")
    
    success_count = 0
    for ac_id in acs_to_fix:
        name = official_data[ac_id].get('constituencyName', ac_id)
        ok, msg = remap_ac(ac_id, official_data)
        status = "✅" if ok else "❌"
        print(f"{status} {ac_id} {name}: {msg}")
        if ok:
            success_count += 1
    
    print(f"\nFixed: {success_count}/{len(acs_to_fix)}")


if __name__ == "__main__":
    main()
