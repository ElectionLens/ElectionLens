#!/usr/bin/env python3
"""
Generate AMMK-ADMK alliance analysis blog data
Includes all ADMK seats (even if AMMK didn't contest)
"""

import json
import os
from pathlib import Path

def normalize_name(name: str) -> str:
    """Normalize candidate name for matching"""
    return name.upper().strip().replace('  ', ' ')

def get_ac_id_from_name(ac_name: str, schema: dict) -> str:
    """Get AC ID from AC name using schema"""
    ac_name_upper = ac_name.upper()
    for ac_id, ac_data in schema.get('assemblyConstituencies', {}).items():
        if ac_data.get('name', '').upper() == ac_name_upper:
            return ac_id
    return ''

def main():
    # Load election data
    election_file = 'public/data/elections/ac/TN/2021.json'
    with open(election_file, 'r') as f:
        election_data = json.load(f)
    
    # Load schema to get AC IDs
    schema_file = 'public/data/schema.json'
    schema = {}
    if os.path.exists(schema_file):
        with open(schema_file, 'r') as f:
            schema = json.load(f)
    
    flips = []
    margin_increases = []
    
    for ac_name, ac_data in election_data.items():
        if not ac_data.get('candidates') or len(ac_data['candidates']) == 0:
            continue
        
        # Get winner
        winner = ac_data['candidates'][0]
        winner_party = winner.get('party', '')
        winner_votes = winner.get('votes', 0)
        
        # Find ADMK and AMMK candidates
        admk_candidate = next((c for c in ac_data['candidates'] if c.get('party') == 'ADMK'), None)
        ammk_candidate = next((c for c in ac_data['candidates'] if c.get('party') == 'AMMK'), None)
        
        admk_votes = admk_candidate['votes'] if admk_candidate else 0
        ammk_votes = ammk_candidate['votes'] if ammk_candidate else 0
        combined_votes = admk_votes + ammk_votes
        
        # Get AC ID
        ac_id = get_ac_id_from_name(ac_name, schema)
        if not ac_id:
            # Try to extract from ac_name if it's in format like "TN-001"
            if ac_name.startswith('TN-'):
                ac_id = ac_name
            else:
                continue
        
        # Check if this would flip (ADMK+AMMK > current winner)
        if winner_party not in ['ADMK'] and combined_votes > winner_votes:
            # Find DMK votes if applicable
            dmk_candidate = next((c for c in ac_data['candidates'] if c.get('party') == 'DMK'), None)
            dmk_votes = dmk_candidate['votes'] if dmk_candidate else 0
            
            margin = combined_votes - winner_votes
            flips.append({
                'ac_id': ac_id,
                'ac_name': ac_name,
                'current_winner': winner_party,
                'current_winner_name': winner.get('name', ''),
                'current_winner_votes': winner_votes,
                'admk_votes': admk_votes,
                'ammk_votes': ammk_votes,
                'combined_votes': combined_votes,
                'margin': margin,
                'dmk_votes': dmk_votes
            })
        
        # Check if ADMK won (margin increase)
        elif winner_party == 'ADMK':
            # Margin increase = AMMK votes (additional votes ADMK would get)
            # Even if AMMK got 0 votes, we should include it (margin_increase = 0)
            margin_increase = ammk_votes
            
            margin_increases.append({
                'ac_id': ac_id,
                'ac_name': ac_name,
                'current_winner': 'ADMK',
                'current_winner_votes': winner_votes,
                'admk_votes': admk_votes,
                'ammk_votes': ammk_votes,
                'combined_votes': combined_votes,
                'margin_increase': margin_increase
            })
    
    # Sort flips by margin (descending)
    flips.sort(key=lambda x: x['margin'], reverse=True)
    
    # Sort margin increases by margin_increase (descending)
    margin_increases.sort(key=lambda x: x['margin_increase'], reverse=True)
    
    # Create output
    output = {
        'flips': flips,
        'margin_increases': margin_increases,
        'total_flips': len(flips),
        'total_margin_increases': len(margin_increases)
    }
    
    # Write output
    output_dir = Path('public/data/blog')
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / 'ammk-admk-alliance-2026.json'
    
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"✅ Generated blog data:")
    print(f"   Flips: {len(flips)}")
    print(f"   ADMK seats with margin increases: {len(margin_increases)}")
    print(f"   Output: {output_file}")
    
    # Show breakdown
    admk_with_ammk = sum(1 for m in margin_increases if m['ammk_votes'] > 0)
    admk_without_ammk = sum(1 for m in margin_increases if m['ammk_votes'] == 0)
    print(f"\n   ADMK seats with AMMK votes > 0: {admk_with_ammk}")
    print(f"   ADMK seats with AMMK votes = 0: {admk_without_ammk}")

if __name__ == '__main__':
    main()
