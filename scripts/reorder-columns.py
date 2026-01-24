#!/usr/bin/env python3
"""
Reorder candidate columns for specific PCs where order doesn't match official.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")

# Mappings discovered from analysis
# mapping[new_idx] = old_idx (position in extracted data)
REORDER_MAP = {
    'TN-37': [2, 0, 3, 1, 4],  # 57% -> 8%
}

def load_schema():
    with open(SCHEMA) as f:
        return json.load(f)

def reorder_ac(ac_id: str, mapping: list) -> dict:
    """Reorder columns in an AC's booth data."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return {'status': 'not_found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    # Check if already reordered
    source = data.get('source', '')
    if 'reordered' in source:
        return {'status': 'already_done'}
    
    candidates = data.get('candidates', [])
    num_cands = len(candidates)
    
    # Extend mapping to full candidate list
    full_mapping = list(mapping)
    for i in range(len(mapping), num_cands):
        full_mapping.append(i)
    
    # Reorder candidates
    new_candidates = []
    for new_idx, old_idx in enumerate(full_mapping):
        if old_idx < len(candidates):
            new_candidates.append(candidates[old_idx])
    data['candidates'] = new_candidates
    
    # Reorder all booth votes
    for booth_id, r in data.get('results', {}).items():
        votes = r.get('votes', [])
        new_votes = []
        for new_idx, old_idx in enumerate(full_mapping):
            if old_idx < len(votes):
                new_votes.append(votes[old_idx])
        r['votes'] = new_votes
    
    data['source'] = source + ' (columns reordered)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {'status': 'done', 'mapping': mapping}


def main():
    print("=" * 60)
    print("REORDERING CANDIDATE COLUMNS")
    print("=" * 60)
    
    schema = load_schema()
    
    for pc_id, mapping in REORDER_MAP.items():
        print(f"\n{pc_id}:")
        
        # Get ACs in this PC
        pc_info = schema.get('parliamentaryConstituencies', {}).get(pc_id, {})
        ac_ids = pc_info.get('assemblyIds', [])
        
        for ac_id in ac_ids:
            result = reorder_ac(ac_id, mapping)
            print(f"  {ac_id}: {result['status']}")
    
    print("\nDone!")


if __name__ == "__main__":
    main()
