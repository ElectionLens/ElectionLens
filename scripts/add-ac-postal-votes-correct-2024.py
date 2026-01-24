#!/usr/bin/env python3
"""
Add AC-level postal votes for 2024 PC elections.
AC-wise votes in PC data are AC TOTAL votes (booth + postal).
So: AC postal = AC-wise total (from PC) - extracted booth votes
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
    print("AC postal = AC-wise total (from PC) - extracted booth votes")
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
        results = data.get('results', {})
        
        if not postal_candidates or not candidates or not results:
            continue
        
        # Get PC info
        pc_id, ac_info = get_pc_for_ac(ac_id, schema)
        if not pc_id or pc_id not in pc_data:
            continue
        
        pc_info = pc_data[pc_id]
        pc_candidates = pc_info.get('candidates', [])
        ac_name = ac_info.get('name', '')
        
        # Calculate extracted booth totals from results
        num_candidates = len(candidates)
        extracted_booth_totals = [0] * num_candidates
        
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i, v in enumerate(votes):
                if i < num_candidates:
                    extracted_booth_totals[i] += v
        
        # Update postal candidates with correct postal votes
        needs_fix = False
        total_postal_added = 0
        
        for i, postal_cand in enumerate(postal_candidates):
            if postal_cand.get('name') == 'NOTA' or postal_cand.get('party') == 'NOTA':
                continue
            
            name = postal_cand.get('name', '')
            party = postal_cand.get('party', '')
            extracted_booth = extracted_booth_totals[i] if i < len(extracted_booth_totals) else 0
            
            # Find matching PC candidate
            pc_cand = None
            for pc_c in pc_candidates:
                if (normalize_name(pc_c.get('name', '')) == normalize_name(name) and
                    pc_c.get('party', '').upper() == party.upper()):
                    pc_cand = pc_c
                    break
            
            if not pc_cand:
                continue
            
            # Get AC-wise TOTAL votes for this AC (includes postal)
            ac_wise_votes = pc_cand.get('acWiseVotes', [])
            ac_total = 0
            
            for ac_entry in ac_wise_votes:
                if isinstance(ac_entry, dict) and ac_entry.get('acName', '').upper() == ac_name.upper():
                    ac_total = ac_entry.get('votes', 0)
                    break
            
            # Calculate AC postal votes
            # AC postal = AC total (from PC) - extracted booth votes
            ac_postal = max(0, ac_total - extracted_booth)
            
            # AC total = AC total from PC (which includes postal)
            ac_total_correct = ac_total
            
            # Update if different
            current_postal = postal_cand.get('postal', 0)
            current_booth = postal_cand.get('booth', 0)
            current_total = postal_cand.get('total', 0)
            
            if (current_postal != ac_postal or 
                current_booth != extracted_booth or
                current_total != ac_total_correct):
                postal_cand['postal'] = ac_postal
                postal_cand['booth'] = extracted_booth
                postal_cand['total'] = ac_total_correct
                needs_fix = True
                total_postal_added += ac_postal
        
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
                postal_pct = (total_postal / total_all * 100) if total_all > 0 else 0
                print(f"✅ {ac_id}: Postal={total_postal:,} ({postal_pct:.1f}%), Booth={total_booth:,}, Total={total_all:,}")
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
