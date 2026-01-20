#!/usr/bin/env python3
"""Validate 2024 PC booth data coverage and identify issues."""

import json
from pathlib import Path
from collections import defaultdict

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


def main():
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    # Group ACs by PC
    pc_acs = defaultdict(list)
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if pc_id.startswith('TN'):
            for ac_id in pc_info.get('assemblyIds', []):
                pc_acs[pc_id].append(ac_id)
    
    # Analyze each AC
    issues = {
        'missing': [],
        'low_booths': [],
        'high_error': [],
        'good': []
    }
    
    total_booths = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2024.json"
        
        # Get expected booth count from booths.json
        booths_json = BOOTHS_DIR / ac_id / "booths.json"
        if booths_json.exists():
            with open(booths_json) as f:
                booths_meta = json.load(f)
            expected_booths = booths_meta.get('totalBooths', len(booths_meta.get('booths', []))) or 250
        else:
            expected_booths = 250
        
        pc_id, pc_name = get_pc_for_ac(ac_id, schema)
        
        if not booth_file.exists():
            issues['missing'].append({
                'ac_id': ac_id,
                'pc_id': pc_id,
                'pc_name': pc_name,
                'expected': expected_booths
            })
            continue
        
        with open(booth_file) as f:
            booth_data = json.load(f)
        
        results = booth_data.get('results', {})
        num_booths = len(results)
        total_booths += num_booths
        
        # Calculate coverage
        coverage = (num_booths / expected_booths * 100) if expected_booths > 0 else 0
        
        ac_info = {
            'ac_id': ac_id,
            'pc_id': pc_id,
            'pc_name': pc_name,
            'booths': num_booths,
            'expected': expected_booths,
            'coverage': coverage
        }
        
        if coverage < 20:
            issues['low_booths'].append(ac_info)
        elif coverage > 150:
            issues['high_error'].append(ac_info)
        else:
            issues['good'].append(ac_info)
    
    # Print summary
    print("=" * 70)
    print("2024 PC Booth Data Coverage Report")
    print("=" * 70)
    
    print(f"\n📊 Summary:")
    print(f"   Total ACs with data: {234 - len(issues['missing'])}/234")
    print(f"   Total booths: {total_booths:,}")
    print(f"   Good coverage (20-150%): {len(issues['good'])}")
    print(f"   Low coverage (<20%): {len(issues['low_booths'])}")
    print(f"   Anomalous (>150%): {len(issues['high_error'])}")
    print(f"   Missing: {len(issues['missing'])}")
    
    if issues['missing']:
        print(f"\n❌ Missing ACs ({len(issues['missing'])}):")
        by_pc = defaultdict(list)
        for ac in issues['missing']:
            by_pc[ac['pc_id']].append(ac['ac_id'])
        for pc_id, acs in sorted(by_pc.items()):
            pc_name = schema.get('parliamentaryConstituencies', {}).get(pc_id, {}).get('name', '')
            print(f"   {pc_id} ({pc_name}): {', '.join(sorted(acs))}")
    
    if issues['low_booths']:
        print(f"\n⚠️  Low Coverage ACs ({len(issues['low_booths'])}) - Need re-extraction:")
        for ac in sorted(issues['low_booths'], key=lambda x: x['coverage']):
            print(f"   {ac['ac_id']}: {ac['booths']}/{ac['expected']} booths ({ac['coverage']:.1f}%)")
    
    if issues['high_error']:
        print(f"\n🔴 Anomalous ACs ({len(issues['high_error'])}) - Data quality issues:")
        for ac in sorted(issues['high_error'], key=lambda x: -x['coverage']):
            print(f"   {ac['ac_id']}: {ac['booths']}/{ac['expected']} booths ({ac['coverage']:.1f}%)")
    
    print("\n" + "=" * 70)
    
    # Return problematic ACs for further action
    return {
        'missing': [ac['ac_id'] for ac in issues['missing']],
        'low_booths': [ac['ac_id'] for ac in issues['low_booths']],
        'high_error': [ac['ac_id'] for ac in issues['high_error']]
    }


if __name__ == "__main__":
    main()
