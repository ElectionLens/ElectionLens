#!/usr/bin/env python3
"""
Fix remaining postal vote errors in 2024 data.
Handles cases where candidates don't match or totals are incorrect.
"""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"

def normalize_name(name):
    """Normalize name for matching."""
    if not name:
        return ""
    return name.upper().strip().replace(' ', '').replace('.', '').replace(',', '').replace('-', '')

def find_best_match(candidates, target_name, target_party):
    """Find best matching candidate index."""
    normalized_target = normalize_name(target_name)
    
    # Exact match first
    for i, cand in enumerate(candidates):
        cand_name = normalize_name(cand.get('name', ''))
        cand_party = cand.get('party', '')
        if cand_name == normalized_target and cand_party == target_party:
            return i
    
    # Try party-only match if name doesn't match
    for i, cand in enumerate(candidates):
        cand_party = cand.get('party', '')
        if cand_party == target_party:
            # Check if names are similar (at least 50% match)
            cand_name = normalize_name(cand.get('name', ''))
            if len(cand_name) > 0 and len(normalized_target) > 0:
                # Simple similarity check
                common_chars = sum(1 for c in normalized_target if c in cand_name)
                similarity = common_chars / max(len(normalized_target), len(cand_name))
                if similarity > 0.5:
                    return i
    
    return None

def main():
    # ACs with remaining errors
    problematic_acs = [
        "TN-001", "TN-003", "TN-004", "TN-005", "TN-006", "TN-009", "TN-010",
        "TN-027", "TN-028", "TN-029", "TN-030", "TN-031", "TN-034", "TN-038",
        "TN-039", "TN-040", "TN-041", "TN-042", "TN-050", "TN-060", "TN-140",
        "TN-141", "TN-151", "TN-152", "TN-153", "TN-154", "TN-155", "TN-156",
        "TN-178", "TN-188", "TN-189", "TN-191", "TN-192", "TN-193", "TN-194",
        "TN-213", "TN-214", "TN-215", "TN-216", "TN-217", "TN-218", "TN-223", "TN-231"
    ]
    
    print("="*80)
    print("FIXING REMAINING POSTAL ERRORS")
    print("="*80)
    print()
    
    total_fixed = 0
    acs_fixed = 0
    
    for ac_id in problematic_acs:
        booth_file = BOOTHS_DIR / ac_id / "2024.json"
        
        if not booth_file.exists():
            continue
        
        try:
            with open(booth_file, 'r') as f:
                booth_data = json.load(f)
        except Exception as e:
            print(f"❌ {ac_id}: Error reading: {e}")
            continue
        
        postal = booth_data.get('postal', {})
        postal_candidates = postal.get('candidates', [])
        candidates = booth_data.get('candidates', [])
        results = booth_data.get('results', {})
        
        if not postal_candidates or not candidates or not results:
            continue
        
        # Calculate actual booth totals
        num_candidates = len(candidates)
        actual_booth_totals = [0] * num_candidates
        
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i, vote_count in enumerate(votes):
                if i < num_candidates:
                    actual_booth_totals[i] += vote_count
        
        # Fix each postal candidate
        fixed_count = 0
        for postal_cand in postal_candidates:
            name = postal_cand.get('name', '')
            party = postal_cand.get('party', '')
            
            if name == 'NOTA' or party == 'NOTA':
                continue
            
            # Find matching candidate
            cand_idx = find_best_match(candidates, name, party)
            
            if cand_idx is None:
                # Can't match - force fix based on total
                total = postal_cand.get('total', 0)
                stored_booth = postal_cand.get('booth', 0)
                stored_postal = postal_cand.get('postal', 0)
                
                # If booth + postal != total, recalculate postal
                if abs(stored_booth + stored_postal - total) > 1:
                    postal_cand['postal'] = max(0, total - stored_booth)
                    fixed_count += 1
                continue
            
            actual_booth = actual_booth_totals[cand_idx]
            stored_booth = postal_cand.get('booth', 0)
            total = postal_cand.get('total', 0)
            
            # Fix booth votes
            if stored_booth != actual_booth:
                postal_cand['booth'] = actual_booth
                fixed_count += 1
            
            # Ensure booth + postal = total
            calculated_total = postal_cand['booth'] + postal_cand.get('postal', 0)
            if abs(calculated_total - total) > 1:
                postal_cand['postal'] = max(0, total - postal_cand['booth'])
                fixed_count += 1
        
        if fixed_count > 0:
            # Save fixed data
            try:
                with open(booth_file, 'w') as f:
                    json.dump(booth_data, f, indent=2, ensure_ascii=False)
                acs_fixed += 1
                total_fixed += fixed_count
                print(f"✅ {ac_id}: Fixed {fixed_count} candidates")
            except Exception as e:
                print(f"❌ {ac_id}: Error saving: {e}")
        
        # Verify final state
        remaining_errors = 0
        for postal_cand in postal_candidates:
            if postal_cand.get('name') == 'NOTA':
                continue
            booth = postal_cand.get('booth', 0)
            postal = postal_cand.get('postal', 0)
            total = postal_cand.get('total', 0)
            if abs(booth + postal - total) > 1:
                remaining_errors += 1
        
        if remaining_errors > 0:
            print(f"⚠️  {ac_id}: Still has {remaining_errors} mismatches")
    
    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"ACs processed: {len(problematic_acs)}")
    print(f"ACs fixed: {acs_fixed}")
    print(f"Total candidates fixed: {total_fixed}")

if __name__ == "__main__":
    main()
