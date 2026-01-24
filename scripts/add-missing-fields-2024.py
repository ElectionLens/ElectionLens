#!/usr/bin/env python3
"""
Add missing required fields to all 2024.json files.
Required fields: acId, acName, electionType, date, summary
"""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"

def get_ac_name_from_booths(ac_id):
    """Get AC name from booths.json file."""
    booths_file = BOOTHS_DIR / ac_id / "booths.json"
    if booths_file.exists():
        try:
            with open(booths_file, 'r') as f:
                data = json.load(f)
                return data.get('acName', '')
        except:
            pass
    return ''

def calculate_summary(postal_candidates, total_votes):
    """Calculate summary from postal candidates."""
    if not postal_candidates or total_votes == 0:
        return None
    
    sorted_candidates = sorted(postal_candidates, key=lambda x: x.get('total', 0), reverse=True)
    winner = sorted_candidates[0] if sorted_candidates else None
    runner_up = sorted_candidates[1] if len(sorted_candidates) > 1 else None
    
    if not winner:
        return None
    
    margin = winner.get('total', 0) - (runner_up.get('total', 0) if runner_up else 0)
    margin_percent = (margin / total_votes * 100) if total_votes > 0 else 0
    
    return {
        'totalVoters': 0,  # Not available in booth data
        'totalVotes': total_votes,
        'turnoutPercent': 0,  # Not available
        'winner': {
            'name': winner.get('name', ''),
            'party': winner.get('party', ''),
            'votes': winner.get('total', 0)
        },
        'runnerUp': {
            'name': runner_up.get('name', '') if runner_up else '',
            'party': runner_up.get('party', '') if runner_up else '',
            'votes': runner_up.get('total', 0) if runner_up else 0
        },
        'margin': margin,
        'marginPercent': margin_percent
    }

def main():
    print("="*80)
    print("ADDING MISSING REQUIRED FIELDS TO ALL 2024.JSON FILES")
    print("="*80)
    print()
    
    total_acs = 234
    acs_fixed = 0
    acs_skipped = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2024.json"
        
        if not booth_file.exists():
            acs_skipped.append(ac_id)
            continue
        
        try:
            with open(booth_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            print(f"❌ {ac_id}: Error reading: {e}")
            acs_skipped.append(ac_id)
            continue
        
        needs_fix = False
        changes = []
        
        # Check and add acId
        if 'acId' not in data:
            data['acId'] = ac_id
            needs_fix = True
            changes.append('acId')
        
        # Check and add acName
        if 'acName' not in data:
            ac_name = get_ac_name_from_booths(ac_id)
            if ac_name:
                data['acName'] = ac_name
                needs_fix = True
                changes.append('acName')
            else:
                # Try to get from postal data or use placeholder
                postal = data.get('postal', {})
                # Use AC number as fallback
                data['acName'] = f"AC-{ac_num:03d}"
                needs_fix = True
                changes.append('acName')
        
        # Check and add electionType
        if 'electionType' not in data:
            data['electionType'] = 'parliament'  # 2024 is PC election
            needs_fix = True
            changes.append('electionType')
        
        # Check and add date
        if 'date' not in data:
            data['date'] = '2024-04-19'  # 2024 Lok Sabha election date
            needs_fix = True
            changes.append('date')
        
        # Check and add summary
        if 'summary' not in data:
            postal = data.get('postal', {})
            postal_candidates = postal.get('candidates', [])
            total_votes = postal.get('totalValid', 0)
            
            summary = calculate_summary(postal_candidates, total_votes)
            if summary:
                data['summary'] = summary
                needs_fix = True
                changes.append('summary')
        
        if needs_fix:
            try:
                with open(booth_file, 'w') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                acs_fixed += 1
                print(f"✅ {ac_id}: Added {', '.join(changes)}")
            except Exception as e:
                print(f"❌ {ac_id}: Error saving: {e}")
                acs_skipped.append(ac_id)
    
    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total ACs: {total_acs}")
    print(f"ACs fixed: {acs_fixed}")
    print(f"ACs skipped: {len(acs_skipped)}")
    
    if acs_skipped:
        print(f"\nSkipped ACs (first 10): {', '.join(acs_skipped[:10])}")

if __name__ == "__main__":
    main()
