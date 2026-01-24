#!/usr/bin/env python3
"""
Generate NDA alliance analysis blog data for 2026
Considers all NDA parties from 2021: ADMK, BJP, PMK (joined 2026), AMMK (joined 2026)
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
    # NDA alliance parties in Tamil Nadu
    # 2021: ADMK, BJP
    # 2026: ADMK, BJP, PMK (joined), AMMK (joined)
    NDA_PARTIES = ['ADMK', 'BJP', 'PMK', 'AMMK']
    
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
        
        # Find all NDA party candidates
        nda_votes = {}
        for party in NDA_PARTIES:
            candidate = next((c for c in ac_data['candidates'] if c.get('party') == party), None)
            nda_votes[party] = candidate['votes'] if candidate else 0
        
        # Calculate combined NDA votes
        combined_nda_votes = sum(nda_votes.values())
        
        # Get AC ID and name
        ac_id = get_ac_id_from_name(ac_name, schema)
        if not ac_id:
            # Try to extract from ac_name if it's in format like "TN-001"
            if ac_name.startswith('TN-'):
                ac_id = ac_name
            else:
                continue
        
        # Get proper AC name from election data or schema
        ac_display_name = ac_data.get('constituencyName') or ac_data.get('constituencyNameOriginal') or ac_name
        if schema and ac_id in schema.get('assemblyConstituencies', {}):
            ac_display_name = schema['assemblyConstituencies'][ac_id].get('name', ac_display_name)
        
        # Check if this would flip (NDA combined > current winner)
        # Only consider if current winner is not already an NDA party
        if winner_party not in NDA_PARTIES and combined_nda_votes > winner_votes:
            # Find DMK votes if applicable
            dmk_candidate = next((c for c in ac_data['candidates'] if c.get('party') == 'DMK'), None)
            dmk_votes = dmk_candidate['votes'] if dmk_candidate else 0
            
            margin = combined_nda_votes - winner_votes
            flips.append({
                'ac_id': ac_id,
                'ac_name': ac_display_name,
                'current_winner': winner_party,
                'current_winner_name': winner.get('name', ''),
                'current_winner_votes': winner_votes,
                'admk_votes': nda_votes['ADMK'],
                'bjp_votes': nda_votes['BJP'],
                'pmk_votes': nda_votes['PMK'],
                'ammk_votes': nda_votes['AMMK'],
                'combined_votes': combined_nda_votes,
                'margin': margin,
                'dmk_votes': dmk_votes
            })
        
        # Check if an NDA party won (margin increase)
        elif winner_party in NDA_PARTIES:
            # Margin increase = votes from other NDA parties (additional votes the winner would get)
            margin_increase = combined_nda_votes - nda_votes[winner_party]
            
            margin_increases.append({
                'ac_id': ac_id,
                'ac_name': ac_display_name,
                'current_winner': winner_party,
                'current_winner_votes': winner_votes,
                'admk_votes': nda_votes['ADMK'],
                'bjp_votes': nda_votes['BJP'],
                'pmk_votes': nda_votes['PMK'],
                'ammk_votes': nda_votes['AMMK'],
                'combined_votes': combined_nda_votes,
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
    print(f"   NDA seats with margin increases: {len(margin_increases)}")
    print(f"   Output: {output_file}")
    
    # Show breakdown by party
    admk_wins = sum(1 for m in margin_increases if m['current_winner'] == 'ADMK')
    bjp_wins = sum(1 for m in margin_increases if m['current_winner'] == 'BJP')
    pmk_wins = sum(1 for m in margin_increases if m['current_winner'] == 'PMK')
    ammk_wins = sum(1 for m in margin_increases if m['current_winner'] == 'AMMK')
    
    print(f"\n   NDA seats won by party:")
    print(f"     ADMK: {admk_wins}")
    print(f"     BJP: {bjp_wins}")
    print(f"     PMK: {pmk_wins}")
    print(f"     AMMK: {ammk_wins}")
    
    # Show margin increase stats
    with_increase = sum(1 for m in margin_increases if m['margin_increase'] > 0)
    without_increase = sum(1 for m in margin_increases if m['margin_increase'] == 0)
    print(f"\n   Seats with margin increase > 0: {with_increase}")
    print(f"   Seats with margin increase = 0: {without_increase}")

if __name__ == '__main__':
    main()
