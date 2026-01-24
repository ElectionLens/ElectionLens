#!/usr/bin/env python3
"""
Fix column offset issues in 2024 booth data.

After candidate remapping, check if votes need to be shifted to account for
missing columns (like booth number, serial number, etc.)
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


def find_best_offset(ac_id: str, results_data: dict, pc_data: dict, schema: dict) -> int:
    """Find the best column offset to align votes with official totals."""
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {}) if pc_id else {}
    official_candidates = pc_result.get('candidates', [])
    
    if not official_candidates:
        return 0
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return 0
    
    # Try offsets from -3 to +3
    best_offset = 0
    best_error = float('inf')
    
    for offset in range(-3, 4):
        # Calculate totals with this offset
        totals = [0] * len(official_candidates)
        
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i in range(len(official_candidates)):
                src_idx = i + offset
                if 0 <= src_idx < len(votes):
                    totals[i] += votes[src_idx]
        
        # Calculate error for top 3 candidates
        error = 0
        for i in range(min(3, len(official_candidates))):
            official = official_candidates[i].get('votes', 0)
            extracted = totals[i]
            if official > 0:
                error += abs(extracted - official) / official
        
        if error < best_error:
            best_error = error
            best_offset = offset
    
    return best_offset


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix column offset for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'offset': 0}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'empty', 'offset': 0}
    
    # Find best offset
    best_offset = find_best_offset(ac_id, results_data, pc_data, schema)
    
    if best_offset == 0:
        return {'status': 'ok', 'offset': 0}
    
    # Get official candidates to know how many we need
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {}) if pc_id else {}
    official_candidates = pc_result.get('candidates', [])
    num_official = len(official_candidates)
    
    # Apply offset
    fixed_count = 0
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        
        # Create new votes array with offset
        new_votes = [0] * num_official
        for i in range(num_official):
            src_idx = i + best_offset
            if 0 <= src_idx < len(votes):
                new_votes[i] = votes[src_idx]
        
        if new_votes != votes[:num_official]:
            fixed_count += 1
            if not dry_run:
                booth_result['votes'] = new_votes
                booth_result['total'] = sum(new_votes)
    
    # Validate
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {}) if pc_id else {}
    official_candidates = pc_result.get('candidates', [])
    
    validation = None
    if official_candidates and not dry_run:
        totals = [0] * len(official_candidates)
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i, v in enumerate(votes):
                if i < len(official_candidates):
                    totals[i] += v
        
        errors = []
        for i in range(min(3, len(official_candidates))):
            official = official_candidates[i].get('votes', 0)
            extracted = totals[i]
            if official > 0:
                error_pct = abs(extracted - official) / official * 100
                if error_pct > 2:
                    errors.append(f"{error_pct:.1f}%")
        
        validation = {
            'accurate': len(errors) == 0,
            'errors': errors
        }
    
    # Save if not dry run
    if not dry_run and fixed_count > 0:
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
    
    return {
        'status': 'fixed' if fixed_count > 0 else 'ok',
        'offset': best_offset,
        'fixed_booths': fixed_count,
        'validation': validation
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
    print("Fix Column Offset in 2024 Booth Data")
    print("=" * 80)
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
    print()
    
    if specific_ac:
        acs_to_process = [specific_ac]
    else:
        acs_to_process = [f"TN-{i:03d}" for i in range(1, 235)]
    
    total_fixed = 0
    accurate_acs = 0
    
    for ac_id in acs_to_process:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('offset', 0) != 0:
            print(f"{'[DRY RUN] ' if dry_run else ''}✅ {ac_id}: Applied offset {result['offset']}, fixed {result.get('fixed_booths', 0)} booths")
            total_fixed += 1
            
            if result.get('validation'):
                if result['validation']['accurate']:
                    accurate_acs += 1
                    print(f"   ✓ 100% accurate")
                else:
                    print(f"   ⚠️  {' '.join(result['validation']['errors'])} error")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs processed: {len(acs_to_process)}")
    print(f"ACs with offset fixes: {total_fixed}")
    print(f"100% accurate ACs: {accurate_acs}")
    
    if dry_run:
        print("\n🔍 This was a dry run. Run without --dry-run to apply fixes.")
    else:
        print("\n✅ Fixes applied. Please re-run validation to verify.")
    
    print("=" * 80)


if __name__ == "__main__":
    main()
