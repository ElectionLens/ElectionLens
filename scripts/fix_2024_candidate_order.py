#!/usr/bin/env python3
"""
Fix candidate order in 2024 PC booth data to match official results.
Uses vote totals to find the correct column mapping.
"""

import json
from pathlib import Path
from collections import defaultdict
from itertools import permutations

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def find_best_mapping(booth_totals, official_totals, threshold=0.15):
    """Find the best column mapping from booth to official order."""
    n = len(official_totals)
    m = len(booth_totals)
    
    if n == 0 or m == 0:
        return None
    
    # Pad to same length
    while len(booth_totals) < n:
        booth_totals.append(0)
    
    # Try greedy matching first
    mapping = [-1] * n
    used = set()
    
    for i, off_val in enumerate(official_totals):
        if off_val == 0:
            continue
        
        best_j = -1
        best_error = float('inf')
        
        for j in range(len(booth_totals)):
            if j in used:
                continue
            
            error = abs(booth_totals[j] - off_val) / off_val if off_val > 0 else 1.0
            if error < best_error:
                best_error = error
                best_j = j
        
        if best_j >= 0 and best_error < threshold:
            mapping[i] = best_j
            used.add(best_j)
    
    # Check if mapping is valid
    if -1 in mapping[:min(3, n)]:  # At least top 3 should be mapped
        return None
    
    # Fill remaining with sequential unused indices
    unused = [j for j in range(len(booth_totals)) if j not in used]
    for i in range(n):
        if mapping[i] == -1 and unused:
            mapping[i] = unused.pop(0)
    
    return mapping


def validate_mapping(booth_totals, official_totals, mapping, threshold=0.05):
    """Validate if mapping produces close-enough totals."""
    if mapping is None:
        return False
    
    for i, off_val in enumerate(official_totals[:3]):
        if off_val == 0:
            continue
        
        if i >= len(mapping) or mapping[i] == -1 or mapping[i] >= len(booth_totals):
            return False
        
        booth_val = booth_totals[mapping[i]]
        error = abs(booth_val - off_val) / off_val
        if error > threshold:
            return False
    
    return True


def fix_pc(pc_id, pc_data, schema):
    """Fix candidate order for all ACs in a PC."""
    pc = pc_data.get(pc_id, {})
    acs = schema.get('parliamentaryConstituencies', {}).get(pc_id, {}).get('assemblyIds', [])
    candidates = pc.get('candidates', [])
    num_cand = len(candidates)
    
    if num_cand == 0:
        return 0, 0
    
    # Calculate current booth totals
    all_ac_data = {}
    pc_booth_totals = [0] * num_cand
    total_booths = 0
    
    for ac_id in acs:
        try:
            ac_file = BOOTHS_DIR / ac_id / '2024.json'
            with open(ac_file) as f:
                data = json.load(f)
            all_ac_data[ac_id] = data
            
            for result in data.get('results', {}).values():
                votes = result.get('votes', [])
                for i, v in enumerate(votes):
                    if i < num_cand:
                        pc_booth_totals[i] += v
                total_booths += 1
        except:
            pass
    
    if total_booths == 0:
        return 0, 0
    
    # Get official totals
    official_totals = [c.get('votes', 0) for c in candidates]
    
    # Find mapping
    mapping = find_best_mapping(pc_booth_totals.copy(), official_totals, threshold=0.20)
    
    if mapping is None:
        print(f"  {pc_id}: Could not find valid mapping")
        return 0, len(all_ac_data)
    
    # Check if reordering needed
    needs_reorder = mapping != list(range(len(mapping)))
    
    if not needs_reorder:
        return 0, 0  # Already correct
    
    # Validate mapping
    if not validate_mapping(pc_booth_totals, official_totals, mapping, threshold=0.10):
        print(f"  {pc_id}: Mapping validation failed")
        return 0, len(all_ac_data)
    
    pc_name = schema.get('parliamentaryConstituencies', {}).get(pc_id, {}).get('name', '')
    print(f"  {pc_id} ({pc_name}): Reordering columns {mapping}")
    
    # Apply reordering to each AC
    fixed = 0
    for ac_id, data in all_ac_data.items():
        ac_candidates = data.get('candidates', [])
        results = data.get('results', {})
        
        # Reorder candidates list
        if len(ac_candidates) >= num_cand:
            new_candidates = []
            for i in range(num_cand):
                if i < len(mapping) and mapping[i] < len(ac_candidates):
                    new_candidates.append(candidates[i].copy())
                else:
                    new_candidates.append({'slNo': i+1, 'name': f'Unknown {i+1}', 'party': 'IND'})
            
            # Add party/symbol from official
            for i, c in enumerate(new_candidates):
                if i < len(candidates):
                    c['party'] = candidates[i].get('party', 'IND')
                    c['name'] = candidates[i].get('name', c['name'])
            
            data['candidates'] = new_candidates
        
        # Reorder votes in each booth
        for booth_id, result in results.items():
            old_votes = result.get('votes', [])
            new_votes = []
            
            for i in range(num_cand):
                if i < len(mapping) and mapping[i] < len(old_votes):
                    new_votes.append(old_votes[mapping[i]])
                else:
                    new_votes.append(0)
            
            result['votes'] = new_votes
            result['total'] = sum(new_votes)
        
        # Save
        ac_file = BOOTHS_DIR / ac_id / '2024.json'
        save_json(ac_file, data)
        fixed += 1
    
    return fixed, 0


def main():
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 60)
    print("Fixing 2024 PC Candidate Order")
    print("=" * 60)
    
    total_fixed = 0
    total_failed = 0
    
    for pc_id in sorted(pc_data.keys()):
        fixed, failed = fix_pc(pc_id, pc_data, schema)
        total_fixed += fixed
        total_failed += failed
    
    print()
    print("=" * 60)
    print(f"Fixed: {total_fixed} ACs")
    print(f"Failed: {total_failed} ACs")


if __name__ == "__main__":
    main()
