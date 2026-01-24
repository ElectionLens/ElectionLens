#!/usr/bin/env python3
"""
Validate and fix postal vote data for all 234 Tamil Nadu ACs in 2024.
Checks that booth + postal = total for all candidates and fixes any mismatches.
"""

import json
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"

def load_json(path):
    """Load JSON file."""
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception as e:
        return None

def normalize_name(name):
    """Normalize name for matching."""
    return name.upper().strip().replace(' ', '').replace('.', '').replace(',', '')

def find_candidate_index(candidates, name, party):
    """Find candidate index by name and party."""
    normalized_target = normalize_name(name)
    for i, cand in enumerate(candidates):
        cand_name = normalize_name(cand.get('name', ''))
        cand_party = cand.get('party', '')
        if cand_name == normalized_target and cand_party == party:
            return i
    return None

def main():
    print("="*80)
    print("VALIDATING AND FIXING POSTAL DATA FOR ALL 2024 CONSTITUENCIES")
    print("="*80)
    print()
    
    total_acs = 234
    acs_processed = 0
    acs_with_postal = 0
    acs_fixed = 0
    acs_with_errors = []
    acs_no_file = []
    total_candidates_fixed = 0
    
    stats = {
        'booth_mismatches': 0,
        'postal_recalculated': 0,
        'integrity_errors': 0,
    }
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2024.json"
        
        if not booth_file.exists():
            acs_no_file.append(ac_id)
            continue
        
        try:
            booth_data = load_json(booth_file)
            if not booth_data:
                acs_no_file.append(ac_id)
                continue
        except Exception as e:
            print(f"❌ {ac_id}: Error reading file: {e}")
            acs_no_file.append(ac_id)
            continue
        
        acs_processed += 1
        
        # Check if postal data exists
        if 'postal' not in booth_data:
            continue
        
        acs_with_postal += 1
        postal = booth_data.get('postal', {})
        postal_candidates = postal.get('candidates', [])
        candidates = booth_data.get('candidates', [])
        results = booth_data.get('results', {})
        
        if not postal_candidates or not candidates or not results:
            continue
        
        # Calculate actual booth totals from results
        num_candidates = len(candidates)
        actual_booth_totals = [0] * num_candidates
        
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i, vote_count in enumerate(votes):
                if i < num_candidates:
                    actual_booth_totals[i] += vote_count
        
        # Check and fix postal data
        needs_fix = False
        fixed_in_ac = 0
        
        for postal_cand in postal_candidates:
            name = postal_cand.get('name', '')
            party = postal_cand.get('party', '')
            
            # Skip NOTA
            if name == 'NOTA' or party == 'NOTA':
                continue
            
            # Find matching candidate index
            cand_idx = find_candidate_index(candidates, name, party)
            
            if cand_idx is None:
                # Try to find by party only if name doesn't match
                continue
            
            actual_booth = actual_booth_totals[cand_idx]
            stored_booth = postal_cand.get('booth', 0)
            stored_postal = postal_cand.get('postal', 0)
            total = postal_cand.get('total', 0)
            
            # Check if booth votes match
            if stored_booth != actual_booth:
                stats['booth_mismatches'] += 1
                needs_fix = True
                # Fix booth votes
                postal_cand['booth'] = actual_booth
                # Recalculate postal votes
                new_postal = max(0, total - actual_booth)
                if new_postal != stored_postal:
                    stats['postal_recalculated'] += 1
                postal_cand['postal'] = new_postal
                fixed_in_ac += 1
            
            # Check integrity: booth + postal = total
            calculated_total = postal_cand['booth'] + postal_cand['postal']
            if abs(calculated_total - total) > 1:  # Allow 1 vote difference
                stats['integrity_errors'] += 1
                needs_fix = True
                # Force fix: recalculate postal to match total
                postal_cand['postal'] = max(0, total - postal_cand['booth'])
                fixed_in_ac += 1
        
        if needs_fix:
            # Save fixed data
            try:
                with open(booth_file, 'w') as f:
                    json.dump(booth_data, f, indent=2, ensure_ascii=False)
                acs_fixed += 1
                total_candidates_fixed += fixed_in_ac
                print(f"✅ {ac_id}: Fixed {fixed_in_ac} candidates")
            except Exception as e:
                print(f"❌ {ac_id}: Error saving file: {e}")
                acs_with_errors.append(ac_id)
        
        # Validate final state
        mismatches = []
        for postal_cand in postal_candidates:
            if postal_cand.get('name') == 'NOTA':
                continue
            booth = postal_cand.get('booth', 0)
            postal = postal_cand.get('postal', 0)
            total = postal_cand.get('total', 0)
            if abs(booth + postal - total) > 1:
                mismatches.append(f"{postal_cand.get('party')} {postal_cand.get('name')}")
        
        if mismatches:
            acs_with_errors.append(ac_id)
            print(f"⚠️  {ac_id}: Still has {len(mismatches)} mismatches after fix")
    
    # Print summary
    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total ACs: {total_acs}")
    print(f"ACs processed: {acs_processed}")
    print(f"ACs with postal data: {acs_with_postal}")
    print(f"ACs fixed: {acs_fixed}")
    print(f"Total candidates fixed: {total_candidates_fixed}")
    print(f"ACs with errors: {len(acs_with_errors)}")
    print(f"ACs missing 2024.json file: {len(acs_no_file)}")
    print()
    print("Statistics:")
    print(f"  Booth vote mismatches found: {stats['booth_mismatches']}")
    print(f"  Postal votes recalculated: {stats['postal_recalculated']}")
    print(f"  Integrity errors fixed: {stats['integrity_errors']}")
    
    if acs_with_errors:
        print()
        print(f"ACs with remaining errors ({len(acs_with_errors)}):")
        for i in range(0, len(acs_with_errors), 10):
            print(f"  {', '.join(acs_with_errors[i:i+10])}")
    
    if acs_no_file:
        print()
        print(f"ACs missing 2024.json file ({len(acs_no_file)}):")
        for i in range(0, len(acs_no_file), 10):
            print(f"  {', '.join(acs_no_file[i:i+10])}")

if __name__ == "__main__":
    main()
