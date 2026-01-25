#!/usr/bin/env python3
"""Add proper booth names to 2021.json by matching with booths.json."""

import json
from pathlib import Path

BOOTHS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/booths.json")
RESULTS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2021.json")

def main():
    print("=" * 70)
    print("Adding Booth Names to 2021.json")
    print("=" * 70)
    
    # Load booths.json
    print(f"\n📥 Loading booth names from booths.json...")
    with open(BOOTHS_FILE) as f:
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
    
    # Load 2021.json
    print(f"\n📥 Loading 2021.json...")
    with open(RESULTS_FILE) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    print(f"   Found {len(results)} booths in 2021.json")
    
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
    
    print(f"\n✅ Updated {updated} booths with names")
    if missing:
        print(f"   ⚠️  {len(missing)} booths still missing names")
        print(f"   First 10: {missing[:10]}")
    
    # Save updated results
    results_data['results'] = results
    results_data['source'] = results_data.get('source', '') + ' (with booth names)'
    
    with open(RESULTS_FILE, 'w') as f:
        json.dump(results_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved to {RESULTS_FILE}")
    
    # Show sample
    print(f"\n📋 Sample booth names:")
    for i, (bid, result) in enumerate(list(results.items())[:5]):
        name = result.get('name', 'N/A')
        print(f"   {bid}: {name[:60]}...")

if __name__ == "__main__":
    main()
