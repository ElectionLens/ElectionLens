#!/usr/bin/env python3
"""
Validate postal votes and data accuracy for all 234 Tamil Nadu ACs.
"""

import json
import os
from pathlib import Path

# Paths
BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"
ELECTION_DATA = BASE_DIR / "public/data/elections/ac/TN/2021.json"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def main():
    print("Loading official election results...")
    election_data = load_json(ELECTION_DATA)
    
    total_acs = 234
    acs_with_postal = 0
    acs_without_postal = []
    acs_with_mismatch = []
    acs_100_percent_accurate = 0
    
    print(f"\n{'='*80}")
    print("VALIDATING ALL 234 TAMIL NADU ACS")
    print(f"{'='*80}\n")
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        
        if not booth_file.exists():
            print(f"❌ {ac_id}: Booth file missing!")
            acs_without_postal.append(ac_id)
            continue
        
        try:
            booth_data = load_json(booth_file)
        except Exception as e:
            print(f"❌ {ac_id}: Error reading booth file: {e}")
            acs_without_postal.append(ac_id)
            continue
        
        has_postal = "postal" in booth_data
        
        if has_postal:
            acs_with_postal += 1
            postal_data = booth_data.get("postal", {})
            postal_candidates = postal_data.get("candidates", [])
            
            official = election_data.get(ac_id, {})
            official_total = official.get("validVotes", 0)
            
            mismatches = []
            for pc in postal_candidates:
                name = pc.get("name", "")
                postal = pc.get("postal", 0)
                booth = pc.get("booth", 0)
                total = pc.get("total", 0)
                
                if name == "NOTA":
                    continue
                
                calculated = booth + postal
                if calculated != total:
                    mismatches.append(f"  {name}: booth({booth}) + postal({postal}) = {calculated} != total({total})")
            
            postal_total_sum = sum(pc.get("total", 0) for pc in postal_candidates if pc.get("name") != "NOTA")
            
            if mismatches:
                print(f"⚠️  {ac_id}: Booth+Postal != Total for some candidates")
                for m in mismatches[:3]:
                    print(m)
                acs_with_mismatch.append(ac_id)
            else:
                if postal_total_sum > 0:
                    error_pct = abs(postal_total_sum - official_total) / official_total * 100 if official_total > 0 else 0
                    if error_pct < 0.01:
                        acs_100_percent_accurate += 1
                        print(f"✅ {ac_id}: 100% accurate (postal data verified)")
                    else:
                        print(f"📊 {ac_id}: Has postal, {error_pct:.2f}% deviation")
        else:
            official = election_data.get(ac_id, {})
            official_total = official.get("validVotes", 0)
            
            results = booth_data.get("results", {})
            candidates = booth_data.get("candidates", [])
            num_candidates = len(candidates)
            
            booth_totals = [0] * num_candidates
            for booth_id, booth_result in results.items():
                votes = booth_result.get("votes", [])
                for i, v in enumerate(votes):
                    if i < num_candidates:
                        booth_totals[i] += v
            
            total_booth_votes = sum(booth_totals)
            
            if official_total > 0:
                error_pct = abs(total_booth_votes - official_total) / official_total * 100
                if error_pct < 2:
                    print(f"📝 {ac_id}: No postal (booth: {total_booth_votes}, official: {official_total}, err: {error_pct:.2f}%)")
                else:
                    print(f"⚠️  {ac_id}: No postal, HIGH deviation ({error_pct:.2f}%)")
            
            acs_without_postal.append(ac_id)
    
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total ACs: {total_acs}")
    print(f"ACs with postal data: {acs_with_postal}")
    print(f"ACs without postal data: {len(acs_without_postal)}")
    print(f"ACs 100% accurate: {acs_100_percent_accurate}")
    print(f"ACs with booth+postal mismatch: {len(acs_with_mismatch)}")
    
    if acs_without_postal:
        print(f"\nACs missing postal data ({len(acs_without_postal)}):")
        for i in range(0, len(acs_without_postal), 10):
            print(f"  {', '.join(acs_without_postal[i:i+10])}")

if __name__ == "__main__":
    main()
