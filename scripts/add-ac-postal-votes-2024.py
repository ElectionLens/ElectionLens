#!/usr/bin/env python3
"""
Add AC-level postal votes for 2024 PC elections.
Calculate postal votes for each AC based on PC-level postal votes
distributed proportionally to AC booth votes.
"""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"
PC_DATA = BASE_DIR / "public/data/elections/pc/TN/2024.json"
SCHEMA_FILE = BASE_DIR / "public/data/schema.json"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def get_pc_for_ac(ac_id, schema):
    """Get PC ID for an AC."""
    ac_info = schema.get('assemblyConstituencies', {}).get(ac_id, {})
    pc_id = ac_info.get('pcId', '')
    return pc_id, ac_info

def normalize_name(name):
    """Normalize name for matching."""
    if not name:
        return ""
    return name.upper().strip().replace(' ', '').replace('.', '').replace(',', '').replace('-', '')

def main():
    print("="*80)
    print("ADDING AC-LEVEL POSTAL VOTES FOR 2024 PC ELECTIONS")
    print("Calculating postal votes proportionally from PC-level postal votes")
    print("="*80)
    print()
    
    # Load PC data and schema
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA_FILE)
    
    total_acs = 234
    acs_fixed = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2024.json"
        
        if not booth_file.exists():
            continue
        
        try:
            with open(booth_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            continue
        
        postal = data.get('postal', {})
        postal_candidates = postal.get('candidates', [])
        candidates = data.get('candidates', [])
        
        if not postal_candidates or not candidates:
            continue
        
        # Get PC info
        pc_id, ac_info = get_pc_for_ac(ac_id, schema)
        if not pc_id or pc_id not in pc_data:
            continue
        
        pc_info = pc_data[pc_id]
        pc_candidates = pc_info.get('candidates', [])
        ac_name = ac_info.get('name', '')
        
        # Calculate booth totals from results
        results = data.get('results', {})
        num_candidates = len(candidates)
        booth_totals = [0] * num_candidates
        
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i, v in enumerate(votes):
                if i < num_candidates:
                    booth_totals[i] += v
        
        # Update postal candidates with correct postal votes
        needs_fix = False
        
        for i, postal_cand in enumerate(postal_candidates):
            if postal_cand.get('name') == 'NOTA' or postal_cand.get('party') == 'NOTA':
                continue
            
            name = postal_cand.get('name', '')
            party = postal_cand.get('party', '')
            current_booth = postal_cand.get('booth', 0)
            current_postal = postal_cand.get('postal', 0)
            
            # Find matching PC candidate
            pc_cand = None
            for pc_c in pc_candidates:
                if (normalize_name(pc_c.get('name', '')) == normalize_name(name) and
                    pc_c.get('party', '').upper() == party.upper()):
                    pc_cand = pc_c
                    break
            
            if not pc_cand:
                continue
            
            # Get AC-wise booth votes for this AC
            ac_wise_votes = pc_cand.get('acWiseVotes', [])
            ac_booth_votes = 0
            
            for ac_entry in ac_wise_votes:
                if isinstance(ac_entry, dict) and ac_entry.get('acName', '').upper() == ac_name.upper():
                    ac_booth_votes = ac_entry.get('votes', 0)
                    break
            
            # PC total votes
            pc_total = pc_cand.get('votes', 0)
            
            # Calculate sum of all AC-wise booth votes for this candidate
            total_ac_booth = sum(
                entry.get('votes', 0) 
                for entry in ac_wise_votes 
                if isinstance(entry, dict)
            )
            
            # Calculate PC-level postal votes
            pc_postal = pc_total - total_ac_booth
            
            # Calculate AC-level postal votes proportionally
            if total_ac_booth > 0 and pc_postal > 0:
                ac_postal = int((pc_postal * ac_booth_votes) / total_ac_booth)
            else:
                ac_postal = 0
            
            # AC total = AC booth + AC postal
            ac_total = ac_booth_votes + ac_postal
            
            # Update if different
            if (postal_cand.get('postal', 0) != ac_postal or 
                postal_cand.get('booth', 0) != ac_booth_votes or
                postal_cand.get('total', 0) != ac_total):
                postal_cand['postal'] = ac_postal
                postal_cand['booth'] = ac_booth_votes
                postal_cand['total'] = ac_total
                needs_fix = True
        
        if needs_fix:
            # Update postal totals
            total_postal = sum(c.get('postal', 0) for c in postal_candidates if c.get('name') != 'NOTA')
            total_booth = sum(c.get('booth', 0) for c in postal_candidates if c.get('name') != 'NOTA')
            total_all = sum(c.get('total', 0) for c in postal_candidates)
            
            postal['totalValid'] = total_all
            postal['total'] = total_all
            
            try:
                with open(booth_file, 'w') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                acs_fixed += 1
                print(f"✅ {ac_id}: Added postal votes (postal: {total_postal:,}, booth: {total_booth:,}, total: {total_all:,})")
            except Exception as e:
                print(f"❌ {ac_id}: Error saving: {e}")
    
    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total ACs: {total_acs}")
    print(f"ACs fixed: {acs_fixed}")

if __name__ == "__main__":
    main()
