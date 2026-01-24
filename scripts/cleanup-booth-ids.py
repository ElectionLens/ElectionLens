#!/usr/bin/env python3
"""
Clean up booth data by normalizing booth IDs.
- Removes duplicate entries (keeps the padded version)
- Normalizes all booth IDs to consistent format
"""

import json
import re
from pathlib import Path

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")


def normalize_booth_id(ac_id: str, booth_no: str) -> str:
    """Normalize booth ID to consistent format.
    
    For numeric booth numbers, use 3-digit padding: TN-001-001
    For booths with suffixes (A(W), M), preserve suffix: TN-001-7A(W)
    """
    # Extract numeric part and suffix
    match = re.match(r'^(\d+)(.*)', str(booth_no))
    if match:
        num = int(match.group(1))
        suffix = match.group(2)
        if suffix:
            return f"{ac_id}-{num}{suffix}"
        else:
            return f"{ac_id}-{num:03d}"
    return f"{ac_id}-{booth_no}"


def cleanup_ac(ac_id: str) -> dict:
    """Clean up a single AC's booth data."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'no_file'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    results = data.get('results', {})
    original_count = len(results)
    
    # Group by normalized booth number
    normalized = {}
    for old_key, value in results.items():
        # Extract booth number from key
        parts = old_key.split('-')
        booth_no = parts[-1] if len(parts) >= 3 else old_key
        
        # Get numeric part for comparison
        match = re.match(r'^0*(\d+)(.*)', booth_no)
        if match:
            num = int(match.group(1))
            suffix = match.group(2)
        else:
            num = booth_no
            suffix = ''
        
        new_key = normalize_booth_id(ac_id, f"{num}{suffix}")
        
        # Keep the entry with most data (prefer higher vote totals)
        if new_key not in normalized:
            normalized[new_key] = value
        else:
            # Keep the one with higher total votes
            existing_total = normalized[new_key].get('total', 0)
            new_total = value.get('total', 0)
            if new_total > existing_total:
                normalized[new_key] = value
    
    # Update data
    data['results'] = normalized
    data['totalBooths'] = len(normalized)
    
    # Write back
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'cleaned',
        'original': original_count,
        'cleaned': len(normalized),
        'removed': original_count - len(normalized)
    }


def main():
    total_removed = 0
    acs_cleaned = 0
    
    for ac_dir in sorted(BOOTHS_DIR.iterdir()):
        if not ac_dir.is_dir() or not ac_dir.name.startswith('TN-'):
            continue
        
        ac_id = ac_dir.name
        result = cleanup_ac(ac_id)
        
        if result['status'] == 'cleaned' and result['removed'] > 0:
            print(f"{ac_id}: {result['original']} -> {result['cleaned']} (-{result['removed']})")
            total_removed += result['removed']
            acs_cleaned += 1
    
    print(f"\nTotal: {acs_cleaned} ACs cleaned, {total_removed} duplicate entries removed")


if __name__ == "__main__":
    main()
