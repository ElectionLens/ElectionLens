#!/usr/bin/env python3
"""
Fix NTK booth wins issue in Nagapattinam PC ACs.

The issue: NTK is showing unusually high booth wins, suggesting candidate order mismatch.
This script:
1. Identifies Nagapattinam PC ACs
2. Checks NTK candidate position
3. Remaps candidates to match official order
4. Reorders votes accordingly
"""

import json
import re
from pathlib import Path
from collections import Counter
from difflib import SequenceMatcher

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
    # Remove extra spaces, convert to upper
    return ' '.join(name.upper().split())


def normalize_party(party):
    """Normalize party name."""
    if not party:
        return ""
    return party.upper().strip()


def name_similarity(name1, name2):
    """Calculate similarity between two names."""
    return SequenceMatcher(None, normalize_name(name1), normalize_name(name2)).ratio()


def create_candidate_mapping(extracted_candidates, official_candidates):
    """Create mapping from extracted to official candidate order."""
    mapping = {}
    used_official = set()
    
    # First pass: exact matches
    for i, ext_cand in enumerate(extracted_candidates):
        ext_name = normalize_name(ext_cand.get('name', ''))
        ext_party = normalize_party(ext_cand.get('party', ''))
        
        for j, off_cand in enumerate(official_candidates):
            if j in used_official:
                continue
            
            off_name = normalize_name(off_cand.get('name', ''))
            off_party = normalize_party(off_cand.get('party', ''))
            
            if ext_name == off_name and ext_party == off_party:
                mapping[i] = j
                used_official.add(j)
                break
    
    # Second pass: fuzzy matching for unmatched
    for i, ext_cand in enumerate(extracted_candidates):
        if i in mapping:
            continue
        
        ext_name = normalize_name(ext_cand.get('name', ''))
        ext_party = normalize_party(ext_cand.get('party', ''))
        
        best_match = None
        best_score = 0.0
        
        for j, off_cand in enumerate(official_candidates):
            if j in used_official:
                continue
            
            off_name = normalize_name(off_cand.get('name', ''))
            off_party = normalize_party(off_cand.get('party', ''))
            
            # Party must match
            if ext_party != off_party:
                continue
            
            score = name_similarity(ext_name, off_name)
            if score > best_score and score > 0.7:  # 70% similarity threshold
                best_score = score
                best_match = j
        
        if best_match is not None:
            mapping[i] = best_match
            used_official.add(best_match)
    
    return mapping


def remap_votes(votes, mapping, num_candidates):
    """Remap votes array based on candidate mapping."""
    if not mapping or len(mapping) == 0:
        return votes
    
    # Create reverse mapping: official_index -> extracted_index
    reverse_mapping = {v: k for k, v in mapping.items()}
    
    # Build remapped votes array
    remapped = [0] * num_candidates
    for official_idx in range(num_candidates):
        if official_idx in reverse_mapping:
            extracted_idx = reverse_mapping[official_idx]
            if extracted_idx < len(votes):
                remapped[official_idx] = votes[extracted_idx]
        # If no mapping, keep as 0
    
    return remapped


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix candidate order for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': False}
    
    with open(results_file) as f:
        data = json.load(f)
    
    candidates = data.get('candidates', [])
    results = data.get('results', {})
    
    if not candidates or not results:
        return {'status': 'empty', 'fixed': False}
    
    # Get official candidates
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        return {'status': 'no_pc', 'fixed': False}
    
    pc_result = pc_data.get(pc_id, {})
    official_candidates = pc_result.get('candidates', [])
    
    if not official_candidates:
        return {'status': 'no_official', 'fixed': False}
    
    # Check NTK position and wins
    ntk_extracted_idx = None
    ntk_official_idx = None
    
    for i, cand in enumerate(candidates):
        if normalize_party(cand.get('party', '')) == 'NTK':
            ntk_extracted_idx = i
            break
    
    for i, cand in enumerate(official_candidates):
        if normalize_party(cand.get('party', '')) == 'NTK':
            ntk_official_idx = i
            break
    
    if ntk_extracted_idx is None or ntk_official_idx is None:
        return {'status': 'no_ntk', 'fixed': False}
    
    # Count NTK booth wins
    booth_wins = Counter()
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        if votes:
            winner_idx = max(range(len(votes)), key=lambda i: votes[i])
            booth_wins[winner_idx] += 1
    
    ntk_wins = booth_wins.get(ntk_extracted_idx, 0)
    total_booths = len(results)
    ntk_win_pct = (ntk_wins / total_booths * 100) if total_booths > 0 else 0
    
    # Only fix if NTK has unusually high wins (>20%)
    if ntk_win_pct <= 20:
        return {'status': 'ok', 'fixed': False, 'ntk_wins': ntk_wins, 'ntk_win_pct': ntk_win_pct}
    
    print(f"  {ac_id}: NTK has {ntk_wins}/{total_booths} wins ({ntk_win_pct:.1f}%) - FIXING")
    
    # Create mapping
    mapping = create_candidate_mapping(candidates, official_candidates)
    
    if not mapping or len(mapping) < len(candidates) * 0.5:  # Need at least 50% matches
        return {'status': 'mapping_failed', 'fixed': False, 'matches': len(mapping)}
    
    # Remap candidates
    new_candidates = [None] * len(official_candidates)
    for ext_idx, off_idx in mapping.items():
        if off_idx < len(new_candidates):
            new_candidates[off_idx] = candidates[ext_idx]
    
    # Fill in any missing with official candidates
    for i, off_cand in enumerate(official_candidates):
        if new_candidates[i] is None:
            new_candidates[i] = {
                'name': off_cand.get('name', ''),
                'party': off_cand.get('party', ''),
                'symbol': ''
            }
    
    # Remap votes for all booths
    num_candidates = len(official_candidates)
    booths_remapped = 0
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if votes:
            remapped_votes = remap_votes(votes, mapping, num_candidates)
            booth_result['votes'] = remapped_votes
            booths_remapped += 1
    
    # Update candidates
    data['candidates'] = new_candidates
    
    if not dry_run:
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    # Verify fix
    new_booth_wins = Counter()
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        if votes and len(votes) > ntk_official_idx:
            winner_idx = max(range(len(votes)), key=lambda i: votes[i])
            new_booth_wins[winner_idx] += 1
    
    new_ntk_wins = new_booth_wins.get(ntk_official_idx, 0)
    new_ntk_win_pct = (new_ntk_wins / total_booths * 100) if total_booths > 0 else 0
    
    return {
        'status': 'fixed',
        'fixed': True,
        'ntk_wins_before': ntk_wins,
        'ntk_wins_after': new_ntk_wins,
        'ntk_win_pct_before': ntk_win_pct,
        'ntk_win_pct_after': new_ntk_win_pct,
        'booths_remapped': booths_remapped,
        'candidates_mapped': len(mapping)
    }


def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv
    
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
        print()
    
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    # Find Nagapattinam PC
    nagapattinam_pc = None
    nagapattinam_ac_ids = []
    
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        pc_name = pc_info.get('name', '').upper()
        if 'NAGAPATTINAM' in pc_name:
            nagapattinam_pc = pc_id
            nagapattinam_ac_ids = pc_info.get('assemblyIds', [])
            print(f"Found Nagapattinam PC: {pc_id} - {pc_info.get('name', '')}")
            print(f"ACs: {nagapattinam_ac_ids}")
            break
    
    if not nagapattinam_ac_ids:
        print("❌ Could not find Nagapattinam PC")
        return
    
    print()
    print("=" * 80)
    print("Fixing NTK Booth Wins in Nagapattinam PC")
    print("=" * 80)
    print()
    
    total_fixed = 0
    
    for ac_id in nagapattinam_ac_ids:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('fixed'):
            total_fixed += 1
            print(f"✅ {ac_id}: Fixed")
            print(f"   NTK wins: {result['ntk_wins_before']} → {result['ntk_wins_after']} "
                  f"({result['ntk_win_pct_before']:.1f}% → {result['ntk_win_pct_after']:.1f}%)")
            print(f"   Booths remapped: {result['booths_remapped']}, Candidates mapped: {result['candidates_mapped']}")
        elif result.get('status') == 'ok':
            print(f"✓ {ac_id}: OK (NTK wins: {result['ntk_wins']}, {result['ntk_win_pct']:.1f}%)")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs fixed: {total_fixed}/{len(nagapattinam_ac_ids)}")
    
    if dry_run:
        print()
        print("🔍 This was a dry run. Run without --dry-run to apply fixes.")


if __name__ == "__main__":
    main()
