#!/usr/bin/env python3
"""
Fix candidate alignment issues in 2021 ACS data by matching candidate names.

Some ACs have vote columns that don't match the candidate order due to:
- Missing first candidate in candidate list
- Vote columns shifted relative to candidates
- Need to realign based on name matching
"""

import json
import re
from pathlib import Path
from difflib import SequenceMatcher

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def normalize_name(name: str) -> str:
    """Normalize candidate name for matching."""
    if not name:
        return ""
    # Remove extra spaces, convert to upper, remove common suffixes
    name = re.sub(r'\s+', ' ', name.strip().upper())
    name = re.sub(r'\s+(MR|MRS|MS|DR|PROF)\.?\s*$', '', name)
    return name


def name_similarity(name1: str, name2: str) -> float:
    """Calculate similarity between two names."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    return SequenceMatcher(None, n1, n2).ratio()


def find_candidate_mapping(data_candidates: list, official_candidates: list) -> dict:
    """Find mapping from data candidate index to official candidate index."""
    mapping = {}  # data_idx -> official_idx
    
    # Try exact matches first
    used_official = set()
    for data_idx, data_cand in enumerate(data_candidates):
        data_name = normalize_name(data_cand.get('name', ''))
        best_match = None
        best_score = 0.0
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official:
                continue
            
            off_name = normalize_name(off_cand.get('name', ''))
            score = name_similarity(data_name, off_name)
            
            if score > best_score and score > 0.7:  # 70% similarity threshold
                best_score = score
                best_match = off_idx
        
        if best_match is not None:
            mapping[data_idx] = best_match
            used_official.add(best_match)
    
    return mapping


def realign_votes_by_candidates(ac_id: str, ac_data: dict) -> dict:
    """Realign vote columns based on candidate name matching."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_candidates = official.get('candidates', [])
    data_candidates = data.get('candidates', [])
    
    if not official_candidates or not data_candidates:
        return {'status': 'error', 'error': 'Missing candidates'}
    
    # Find mapping
    mapping = find_candidate_mapping(data_candidates, official_candidates)
    
    if len(mapping) < len(official_candidates) * 0.5:  # Need at least 50% match
        return {'status': 'error', 'error': 'Too few candidate matches'}
    
    # Check if realignment is needed
    # If first data candidate maps to first official, probably aligned
    if 0 in mapping and mapping[0] == 0:
        # Check if all are aligned
        all_aligned = True
        for i in range(min(len(data_candidates), len(official_candidates))):
            if i not in mapping or mapping[i] != i:
                all_aligned = False
                break
        
        if all_aligned:
            return {'status': 'skipped', 'reason': 'Already aligned'}
    
    # Realign: create new candidate list and vote columns
    num_official = len(official_candidates)
    new_candidates = []
    new_vote_mapping = {}  # old_idx -> new_idx
    
    # Build new candidate list in official order
    for off_idx, off_cand in enumerate(official_candidates):
        # Find which data candidate matches
        data_idx = None
        for d_idx, o_idx in mapping.items():
            if o_idx == off_idx:
                data_idx = d_idx
                break
        
        if data_idx is not None:
            new_candidates.append(data_candidates[data_idx])
            new_vote_mapping[data_idx] = off_idx
        else:
            # No match - use official candidate info
            new_candidates.append({
                'name': off_cand.get('name', ''),
                'party': off_cand.get('party', ''),
                'symbol': ''
            })
    
    # Realign votes for all booths
    booths_fixed = 0
    for booth_id, r in data.get('results', {}).items():
        old_votes = r.get('votes', [])
        if not old_votes:
            continue
        
        # Create new vote array in official order
        new_votes = [0] * num_official
        for old_idx, vote_count in enumerate(old_votes):
            if old_idx in new_vote_mapping:
                new_idx = new_vote_mapping[old_idx]
                if new_idx < num_official:
                    new_votes[new_idx] = vote_count
        
        r['votes'] = new_votes
        r['total'] = sum(new_votes)
        booths_fixed += 1
    
    data['candidates'] = new_candidates
    data['source'] = data.get('source', '') + ' (candidate alignment fixed)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'booths': booths_fixed,
        'candidates_mapped': len(mapping),
        'total_official': num_official
    }


def main():
    print("=" * 80)
    print("FIXING 2021 CANDIDATE ALIGNMENT ISSUES")
    print("=" * 80)
    
    ac_data = load_data()
    
    # ACs with known column offset/candidate alignment issues
    offset_acs = [
        5, 12, 13, 15, 16, 19, 63, 76, 86, 129, 140, 141, 144, 173, 208, 214, 226, 234, 159
    ]
    
    fixed_count = 0
    skipped_count = 0
    error_count = 0
    
    for ac_num in offset_acs:
        ac_id = f"TN-{ac_num:03d}"
        
        result = realign_votes_by_candidates(ac_id, ac_data)
        
        if result['status'] == 'fixed':
            print(f"✓ {ac_id}: Fixed {result['booths']} booths, mapped {result['candidates_mapped']}/{result['total_official']} candidates")
            fixed_count += 1
        elif result['status'] == 'skipped':
            print(f"⊘ {ac_id}: {result.get('reason', 'Skipped')}")
            skipped_count += 1
        else:
            print(f"✗ {ac_id}: {result.get('error', 'Unknown error')}")
            error_count += 1
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Fixed: {fixed_count}")
    print(f"  Skipped: {skipped_count}")
    print(f"  Errors: {error_count}")


if __name__ == "__main__":
    main()
