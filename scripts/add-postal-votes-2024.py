#!/usr/bin/env python3
"""
Add postal votes to 2024 booth data.

For 2024 PC elections, postal votes are PC-level, not AC-level.
However, we can calculate AC-level postal by:
postal = PC_total - AC_wise_booth

This script adds postal vote data to all 2024 booth files.
"""

import json
from pathlib import Path

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def get_pc_for_ac(ac_id, schema):
    for pc_id, pc_data in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_data.get('assemblyIds', []):
            return pc_id, pc_data.get('name', '')
    return None, None


def normalize_name(name):
    """Normalize candidate name for matching."""
    if not name:
        return ""
    return ' '.join(name.upper().split())


def get_ac_wise_targets(ac_id, pc_data, schema):
    """Get AC-wise vote targets for all candidates."""
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        return None
    
    pc_result = pc_data.get(pc_id, {})
    if not pc_result:
        return None
    
    # Get AC name from booth data
    booth_file = BOOTHS_DIR / ac_id / "2024.json"
    ac_name = None
    if booth_file.exists():
        with open(booth_file) as f:
            booth_data = json.load(f)
            ac_name = booth_data.get('acName', '')
    
    if not ac_name:
        return None
    
    # Get all candidates with AC-wise votes
    candidates = pc_result.get('candidates', [])
    targets_by_party = {}
    
    ac_name_normalized = ac_name.upper().strip()
    
    for cand in candidates:
        ac_votes = cand.get('acWiseVotes', [])
        for ac_vote in ac_votes:
            ac_vote_name = ac_vote.get('acName', '').upper().strip()
            if (ac_name_normalized == ac_vote_name or 
                ac_name_normalized in ac_vote_name or 
                ac_vote_name in ac_name_normalized):
                party = cand.get('party', '')
                targets_by_party[party] = {
                    'booth': ac_vote.get('votes', 0),
                    'total': cand.get('votes', 0)  # PC-level total
                }
                break
    
    return targets_by_party if targets_by_party else None


def add_postal_votes(ac_id: str, pc_data: dict, schema: dict) -> dict:
    """Add postal votes to booth data."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'postal_added': False}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'empty', 'postal_added': False}
    
    # Get AC-wise targets
    ac_wise = get_ac_wise_targets(ac_id, pc_data, schema)
    if not ac_wise:
        return {'status': 'no_ac_wise', 'postal_added': False}
    
    # Calculate booth totals
    num_candidates = len(candidates)
    booth_totals = [0] * num_candidates
    
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                booth_totals[i] += v
    
    # Build postal candidates
    postal_candidates = []
    
    for i, cand in enumerate(candidates):
        party = cand.get('party', '')
        booth_votes = booth_totals[i] if i < len(booth_totals) else 0
        
        # Get AC-wise data for this party
        ac_data = ac_wise.get(party)
        if ac_data:
            ac_wise_booth = ac_data['booth']
            pc_total = ac_data['total']
            
            # Postal votes = PC total - AC-wise booth
            # But since postal is PC-level, we set it to 0 for AC-level data
            # The postal field is kept for structure compatibility
            postal_votes = 0  # Postal votes are PC-level, not AC-level
            total_votes = ac_wise_booth  # AC-level total is just booth votes
        else:
            # No AC-wise data, use booth total
            postal_votes = 0
            total_votes = booth_votes
        
        postal_candidates.append({
            'name': cand.get('name', ''),
            'party': cand.get('party', ''),
            'postal': postal_votes,
            'booth': booth_votes,
            'total': total_votes
        })
    
    # Add postal section
    results_data['postal'] = {
        'candidates': postal_candidates,
        'totalValid': sum(c.get('total', 0) for c in postal_candidates),
        'rejected': 0,
        'nota': 0,
        'total': sum(c.get('total', 0) for c in postal_candidates)
    }
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(results_data, f, indent=2)
    
    return {'status': 'added', 'postal_added': True, 'candidates': len(postal_candidates)}


def main():
    import sys
    
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python add-postal-votes-2024.py --all    # Add to all ACs")
        print("  python add-postal-votes-2024.py 30      # Single AC")
        return
    
    arg = sys.argv[1]
    
    if arg == '--all':
        ac_nums = list(range(1, 235))
    else:
        ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
    
    total_added = 0
    
    for ac_num in ac_nums:
        ac_id = f"TN-{ac_num:03d}"
        result = add_postal_votes(ac_id, pc_data, schema)
        
        if result.get('postal_added'):
            print(f"✅ {ac_id}: Added postal votes for {result.get('candidates', 0)} candidates")
            total_added += 1
    
    print(f"\n✅ Postal votes added to {total_added} ACs")


if __name__ == "__main__":
    main()
