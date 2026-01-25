#!/usr/bin/env python3
"""Add proper booth names to all 2021.json files by matching with booths.json."""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

def process_ac(ac_dir: Path):
    """Process a single AC directory."""
    booths_file = ac_dir / "booths.json"
    results_file = ac_dir / "2021.json"
    
    if not results_file.exists():
        return None
    
    ac_id = ac_dir.name
    print(f"\n{'='*70}")
    print(f"Processing {ac_id}")
    print(f"{'='*70}")
    
    # Load 2021.json
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    print(f"   Found {len(results)} booths in 2021.json")
    
    # Check if booths.json exists
    if not booths_file.exists():
        print(f"   ⚠️  booths.json not found - skipping")
        return {'ac_id': ac_id, 'status': 'no_booths_file', 'total': len(results), 'updated': 0}
    
    # Load booths.json
    with open(booths_file) as f:
        booths_data = json.load(f)
    
    # Create mapping by booth ID
    booth_map = {}
    for booth in booths_data.get('booths', []):
        booth_id = booth.get('id', '')
        if booth_id:
            booth_map[booth_id] = {
                'name': booth.get('name', ''),
                'address': booth.get('address', ''),
                'area': booth.get('area', ''),
            }
    
    print(f"   Found {len(booth_map)} booths in booths.json")
    
    # Update results with booth names
    updated = 0
    missing = []
    
    for booth_id, result in results.items():
        if booth_id in booth_map:
            booth_info = booth_map[booth_id]
            result['name'] = booth_info['name']
            result['address'] = booth_info.get('address', booth_info['name'])
            result['area'] = booth_info.get('area', '')
            updated += 1
        else:
            missing.append(booth_id)
    
    print(f"   ✅ Updated {updated} booths with names")
    if missing:
        print(f"   ⚠️  {len(missing)} booths still missing names")
        if len(missing) <= 10:
            print(f"      Missing: {', '.join(missing[:10])}")
    
    # Save updated results
    results_data['results'] = results
    if 'source' in results_data:
        results_data['source'] = results_data['source'] + ' (with booth names)'
    
    with open(results_file, 'w') as f:
        json.dump(results_data, f, indent=2, ensure_ascii=False)
    
    print(f"   💾 Saved to {results_file}")
    
    return {
        'ac_id': ac_id,
        'status': 'success',
        'total': len(results),
        'updated': updated,
        'missing': len(missing)
    }

def main():
    print("=" * 70)
    print("Adding Booth Names to All 2021.json Files")
    print("=" * 70)
    
    # Process all AC directories
    ac_dirs = [d for d in BASE_DIR.iterdir() if d.is_dir() and d.name.startswith('TN-')]
    ac_dirs.sort()
    
    print(f"\nFound {len(ac_dirs)} AC directories")
    
    results = []
    for ac_dir in ac_dirs:
        result = process_ac(ac_dir)
        if result:
            results.append(result)
    
    # Summary
    print(f"\n{'='*70}")
    print("Summary")
    print(f"{'='*70}")
    
    total_acs = len(results)
    successful = sum(1 for r in results if r['status'] == 'success')
    total_booths = sum(r['total'] for r in results)
    total_updated = sum(r.get('updated', 0) for r in results)
    
    print(f"   Processed: {total_acs} ACs")
    print(f"   Successful: {successful} ACs")
    print(f"   Total booths: {total_booths}")
    print(f"   Updated with names: {total_updated}")
    
    # Show ACs that need attention
    needs_attention = [r for r in results if r.get('missing', 0) > 0 or r['status'] != 'success']
    if needs_attention:
        print(f"\n   ⚠️  ACs needing attention: {len(needs_attention)}")
        for r in needs_attention[:10]:
            print(f"      {r['ac_id']}: {r['status']}, missing={r.get('missing', 0)}")

if __name__ == "__main__":
    main()
