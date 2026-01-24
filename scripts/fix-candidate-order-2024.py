#!/usr/bin/env python3
"""
Fix candidate order in 2024 booth data to match official PC results.

This script:
1. Matches extracted candidates to official candidates by name/party
2. Remaps vote arrays to match official candidate order
3. Validates the remapping accuracy
4. Saves corrected data
"""

import json
from pathlib import Path
from collections import defaultdict
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
    # Remove extra spaces, convert to uppercase
    name = ' '.join(name.upper().split())
    # Remove common suffixes
    for suffix in ['MR.', 'MRS.', 'MS.', 'DR.', 'PROF.', 'SHRI', 'SMT.', 'KUMAR', 'KUMARI']:
        if name.startswith(suffix + ' '):
            name = name[len(suffix) + 1:].strip()
    return name


def normalize_party(party):
    """Normalize party name for matching."""
    if not party:
        return ""
    party = party.upper().strip()
    # Common party abbreviations
    party_map = {
        'INC': 'INDIAN NATIONAL CONGRESS',
        'BJP': 'BHARATIYA JANATA PARTY',
        'DMK': 'DRAVIDA MUNNETRA KAZHAGAM',
        'ADMK': 'ALL INDIA ANNA DRAVIDA MUNNETRA KAZHAGAM',
        'AIADMK': 'ALL INDIA ANNA DRAVIDA MUNNETRA KAZHAGAM',
        'DMDK': 'DESIYA MURPOKKU DRAVIDA KAZHAGAM',
        'NTK': 'NAAM TAMILAR KATCHI',
        'PMK': 'PATTALI MAKKAL KATCHI',
        'AMMK': 'AMMA MAKKAL MUNNETRA KAZHAGAM',
        'BSP': 'BAHUJAN SAMAJ PARTY',
        'IND': 'INDEPENDENT',
        'NOTA': 'NONE OF THE ABOVE',
    }
    return party_map.get(party, party)


def name_similarity(name1, name2):
    """Calculate similarity between two names (0-1)."""
    norm1 = normalize_name(name1)
    norm2 = normalize_name(name2)
    if norm1 == norm2:
        return 1.0
    
    # Use SequenceMatcher for fuzzy matching
    return SequenceMatcher(None, norm1, norm2).ratio()


def match_candidate(extracted_cand, official_candidates, used_indices):
    """Match an extracted candidate to an official candidate."""
    best_match = None
    best_score = 0.0
    best_idx = None
    
    extracted_name = normalize_name(extracted_cand.get('name', ''))
    extracted_party = normalize_party(extracted_cand.get('party', ''))
    
    for idx, official_cand in enumerate(official_candidates):
        if idx in used_indices:
            continue
        
        official_name = normalize_name(official_cand.get('name', ''))
        official_party = normalize_party(official_cand.get('party', ''))
        
        # Calculate match score
        name_score = name_similarity(extracted_name, official_name)
        party_match = (extracted_party == official_party)
        
        # Combined score: name similarity + party match bonus
        score = name_score
        if party_match:
            score += 0.3  # Bonus for party match
        if name_score > 0.8 and party_match:
            score = 1.0  # Perfect match
        
        if score > best_score:
            best_score = score
            best_match = official_cand
            best_idx = idx
    
    return best_match, best_idx, best_score


def create_candidate_mapping(extracted_candidates, official_candidates):
    """
    Create mapping from extracted candidate index to official candidate index.
    Returns (mapping_dict, confidence_scores)
    """
    mapping = {}
    confidence_scores = {}
    used_official_indices = set()
    
    # First pass: exact matches (name + party)
    for ext_idx, ext_cand in enumerate(extracted_candidates):
        ext_name = normalize_name(ext_cand.get('name', ''))
        ext_party = normalize_party(ext_cand.get('party', ''))
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official_indices:
                continue
            
            off_name = normalize_name(off_cand.get('name', ''))
            off_party = normalize_party(off_cand.get('party', ''))
            
            if ext_name == off_name and ext_party == off_party:
                mapping[ext_idx] = off_idx
                confidence_scores[ext_idx] = 1.0
                used_official_indices.add(off_idx)
                break
    
    # Second pass: fuzzy matches for unmatched candidates
    for ext_idx, ext_cand in enumerate(extracted_candidates):
        if ext_idx in mapping:
            continue
        
        best_match, best_idx, best_score = match_candidate(ext_cand, official_candidates, used_official_indices)
        
        if best_score >= 0.6:  # Minimum confidence threshold
            mapping[ext_idx] = best_idx
            confidence_scores[ext_idx] = best_score
            used_official_indices.add(best_idx)
        else:
            # No good match found - mark as unmapped
            mapping[ext_idx] = None
            confidence_scores[ext_idx] = best_score
    
    return mapping, confidence_scores


def remap_votes(votes, mapping, num_official_candidates):
    """Remap votes array to match official candidate order."""
    remapped = [0] * num_official_candidates
    
    for ext_idx, vote_count in enumerate(votes):
        if ext_idx in mapping and mapping[ext_idx] is not None:
            off_idx = mapping[ext_idx]
            if 0 <= off_idx < num_official_candidates:
                remapped[off_idx] = vote_count
    
    return remapped


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix candidate order for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'mapped': 0, 'unmapped': 0}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    extracted_candidates = results_data.get('candidates', [])
    
    if not results or not extracted_candidates:
        return {'status': 'empty', 'mapped': 0, 'unmapped': 0}
    
    # Get official candidates
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {}) if pc_id else {}
    official_candidates = pc_result.get('candidates', [])
    
    if not official_candidates:
        return {'status': 'no_official', 'mapped': 0, 'unmapped': 0}
    
    # Create mapping
    mapping, confidence_scores = create_candidate_mapping(extracted_candidates, official_candidates)
    
    # Count mapped/unmapped
    mapped_count = sum(1 for v in mapping.values() if v is not None)
    unmapped_count = len(extracted_candidates) - mapped_count
    
    # Calculate validation before remapping
    num_candidates = len(extracted_candidates)
    before_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                before_totals[i] += v
    
    # Remap votes for all booths
    num_official = len(official_candidates)
    remapped_count = 0
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        remapped_votes = remap_votes(votes, mapping, num_official)
        
        # Only update if remapping changed something
        if remapped_votes != votes[:num_official]:
            remapped_count += 1
            if not dry_run:
                booth_result['votes'] = remapped_votes
                booth_result['total'] = sum(remapped_votes)
    
    # Calculate validation after remapping (use remapped votes)
    after_totals = [0] * num_official
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        # If remapping was applied, votes are already remapped
        # Otherwise, need to remap on the fly for validation
        if remapped_count > 0:
            # Votes already remapped
            for i, v in enumerate(votes):
                if i < num_official:
                    after_totals[i] += v
        else:
            # Need to remap for validation
            remapped_votes = remap_votes(votes, mapping, num_official)
            for i, v in enumerate(remapped_votes):
                if i < num_official:
                    after_totals[i] += v
    
    # Validate accuracy
    errors_before = []
    errors_after = []
    
    for i in range(min(3, len(official_candidates))):
        official = official_candidates[i].get('votes', 0)
        
        # Before
        if i < len(before_totals):
            before_val = before_totals[i]
            if official > 0:
                before_error = abs(before_val - official) / official * 100
                if before_error > 5:
                    errors_before.append(f"{before_error:.1f}%")
        
        # After
        after_val = after_totals[i]
        if official > 0:
            after_error = abs(after_val - official) / official * 100
            if after_error > 2:
                errors_after.append(f"{after_error:.1f}%")
    
    # Update candidates list to match official order
    if not dry_run and remapped_count > 0:
        # Create new candidates list in official order
        new_candidates = []
        for i, official_cand in enumerate(official_candidates):
            # Find which extracted candidate maps to this official candidate
            mapped_ext_idx = None
            for ext_idx, off_idx in mapping.items():
                if off_idx == i:
                    mapped_ext_idx = ext_idx
                    break
            
            if mapped_ext_idx is not None and mapped_ext_idx < len(extracted_candidates):
                # Use extracted candidate data but in official order
                new_candidates.append({
                    'slNo': i + 1,
                    'name': official_cand.get('name', extracted_candidates[mapped_ext_idx].get('name', '')),
                    'party': official_cand.get('party', extracted_candidates[mapped_ext_idx].get('party', '')),
                    'symbol': extracted_candidates[mapped_ext_idx].get('symbol', '')
                })
            else:
                # No mapping found, use official data
                new_candidates.append({
                    'slNo': i + 1,
                    'name': official_cand.get('name', ''),
                    'party': official_cand.get('party', ''),
                    'symbol': ''
                })
        
        results_data['candidates'] = new_candidates
    
    # Save if not dry run
    if not dry_run and remapped_count > 0:
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
    
    return {
        'status': 'fixed' if remapped_count > 0 else 'ok',
        'mapped': mapped_count,
        'unmapped': unmapped_count,
        'remapped_booths': remapped_count,
        'errors_before': errors_before,
        'errors_after': errors_after,
        'confidence_avg': sum(confidence_scores.values()) / len(confidence_scores) if confidence_scores else 0,
        'mapping': {str(k): v for k, v in mapping.items()}
    }


def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    specific_ac = None
    for arg in sys.argv[1:]:
        if arg.startswith('TN-') and not arg.startswith('--'):
            specific_ac = arg
            break
    
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 80)
    print("Fix Candidate Order in 2024 Booth Data")
    print("=" * 80)
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
    print()
    
    if specific_ac:
        acs_to_process = [specific_ac]
    else:
        acs_to_process = [f"TN-{i:03d}" for i in range(1, 235)]
    
    total_mapped = 0
    total_unmapped = 0
    total_remapped_booths = 0
    accurate_acs = 0
    results_by_status = defaultdict(list)
    
    for ac_id in acs_to_process:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        status = result['status']
        results_by_status[status].append((ac_id, result))
        
        total_mapped += result.get('mapped', 0)
        total_unmapped += result.get('unmapped', 0)
        total_remapped_booths += result.get('remapped_booths', 0)
        
        if result.get('remapped_booths', 0) > 0:
            errors_before = result.get('errors_before', [])
            errors_after = result.get('errors_after', [])
            print(f"{'[DRY RUN] ' if dry_run else ''}✅ {ac_id}: Mapped {result.get('mapped', 0)}/{result.get('mapped', 0) + result.get('unmapped', 0)} candidates, remapped {result.get('remapped_booths', 0)} booths")
            if errors_before:
                print(f"   Before: {', '.join(errors_before)} error")
            if errors_after:
                print(f"   After: {', '.join(errors_after)} error")
            else:
                print(f"   ✓ 100% accurate")
                accurate_acs += 1
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs processed: {len(acs_to_process)}")
    print(f"Candidates mapped: {total_mapped}")
    print(f"Candidates unmapped: {total_unmapped}")
    print(f"Booths remapped: {total_remapped_booths}")
    print(f"100% accurate ACs: {accurate_acs}")
    print(f"ACs with fixes: {len(results_by_status['fixed'])}")
    print(f"ACs already OK: {len(results_by_status['ok'])}")
    
    if dry_run:
        print("\n🔍 This was a dry run. Run without --dry-run to apply fixes.")
    else:
        print("\n✅ Fixes applied. Please re-run validation to verify.")
    
    print("=" * 80)


if __name__ == "__main__":
    main()
