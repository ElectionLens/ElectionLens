#!/usr/bin/env python3
"""
Import booth data from manually converted CSV files for 2024 PC elections.

CSV Format:
  BoothNo,Candidate1,Candidate2,...,CandidateN,TotalValid,Rejected,NOTA,Total
  1,263,1,0,5,18,333,3,2,11,0,1,2,2,641,0,6,647
  2,325,3,1,11,33,305,1,0,3,0,0,2,3,687,0,7,694
  ...

Usage:
  python3 import-csv-booths-2024pc.py AC003.csv TN-003
  python3 import-csv-booths-2024pc.py AC028.csv TN-028

The CSV file should be in ~/Desktop/TN_Booth_CSVs_2024/ folder.
"""

import csv
import json
import os
import re
import sys
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")
CSV_DIR = Path(os.path.expanduser("~/Desktop/TN_Booth_CSVs_2024"))


def load_pc_data():
    with open(PC_DATA) as f:
        return json.load(f)


def load_schema():
    with open(SCHEMA) as f:
        return json.load(f)


def get_pc_for_ac(ac_id, schema):
    """Find the PC that contains this AC."""
    for pc_id, pc_data in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_data.get('assemblyIds', []):
            return pc_id, pc_data.get('name', '')
    return None, None


def import_csv(csv_path: Path, ac_id: str, pc_data: dict, schema: dict):
    """Import booth data from CSV file."""
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"Error: Cannot find PC for {ac_id}")
        return False
    
    pc_result = pc_data.get(pc_id)
    if not pc_result:
        print(f"Error: No PC data for {pc_id}")
        return False
    
    ac_info = schema.get('assemblyConstituencies', {}).get(ac_id, {})
    ac_name = ac_info.get('name', ac_id)
    candidates = pc_result.get('candidates', [])
    num_candidates = len(candidates)
    
    if num_candidates == 0:
        print(f"Error: No candidates found for {pc_id}")
        return False
    
    print(f"AC: {ac_id} ({ac_name})")
    print(f"PC: {pc_id} ({pc_name})")
    print(f"Candidates: {num_candidates}")
    
    results = {}
    
    with open(csv_path, 'r') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        
        for row in reader:
            if len(row) < num_candidates + 1:  # BoothNo + votes
                continue
            
            booth_no = row[0].strip()
            if not booth_no or not booth_no[0].isdigit():
                continue
            
            # Clean booth number
            booth_no = re.sub(r'\s+', '', booth_no)
            
            # Extract votes
            try:
                votes = []
                for i in range(num_candidates):
                    val = row[i+1].strip().replace(',', '')
                    votes.append(int(val) if val else 0)
            except (ValueError, IndexError) as e:
                print(f"Warning: Skipping booth {booth_no}: {e}")
                continue
            
            # Get totals if available
            try:
                total_idx = num_candidates + 1
                total = int(row[total_idx].strip().replace(',', '')) if len(row) > total_idx else sum(votes)
            except (ValueError, IndexError):
                total = sum(votes)
            
            booth_id = f"{ac_id}-{booth_no}"
            results[booth_id] = {
                'votes': votes,
                'total': total,
                'rejected': 0
            }
    
    if not results:
        print(f"Error: No valid booth data found in {csv_path}")
        return False
    
    # Validate against official totals
    col_totals = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    print(f"\nValidation (top 3 candidates):")
    errors = []
    for i in range(min(3, num_candidates)):
        cand = candidates[i]
        off = cand.get('votes', 0)
        calc = col_totals[i]
        if off > 100:
            pct = abs(calc - off) / off * 100
            errors.append(pct)
            status = "✅" if pct < 15 else "⚠️" if pct < 30 else "❌"
            print(f"  {status} {cand.get('name', '?')}: CSV={calc:,} vs Official={off:,} ({pct:.1f}%)")
    
    avg_error = sum(errors) / len(errors) if errors else 100
    print(f"\nAverage error: {avg_error:.1f}%")
    
    if avg_error > 30:
        print(f"\n⚠️ Warning: High error rate. Please verify CSV data.")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            return False
    
    # Save booth data
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_data = {
        "acId": ac_id,
        "acName": ac_name,
        "year": 2024,
        "electionType": "parliament",
        "pcId": pc_id,
        "pcName": pc_name,
        "date": "2024-06-04",
        "totalBooths": len(results),
        "source": "Tamil Nadu CEO - Form 20 (Manual CSV)",
        "candidates": [
            {"slNo": i + 1, "name": c.get('name', ''), "party": c.get('party', 'IND'), "symbol": ""}
            for i, c in enumerate(candidates)
        ],
        "results": results
    }
    
    with open(output_dir / "2024.json", 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n✅ Saved {len(results)} booths to {output_dir / '2024.json'}")
    return True


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 import-csv-booths-2024pc.py <csv_file> <ac_id>")
        print("Example: python3 import-csv-booths-2024pc.py AC003.csv TN-003")
        print(f"\nPlace CSV files in: {CSV_DIR}")
        
        # Show missing ACs
        print("\n28 ACs still missing 2024 PC booth data:")
        missing = ['TN-003', 'TN-004', 'TN-028', 'TN-029', 'TN-030', 
                   'TN-038', 'TN-039', 'TN-040', 'TN-041', 'TN-042',
                   'TN-151', 'TN-152', 'TN-153', 'TN-154', 'TN-155', 'TN-156',
                   'TN-188', 'TN-189', 'TN-191', 'TN-192', 'TN-193', 'TN-194',
                   'TN-213', 'TN-214', 'TN-215', 'TN-216', 'TN-217', 'TN-218']
        for ac in missing:
            print(f"  - {ac}")
        return
    
    csv_file = sys.argv[1]
    ac_id = sys.argv[2]
    
    # Ensure AC ID is properly formatted
    if not ac_id.startswith('TN-'):
        ac_id = f"TN-{int(ac_id):03d}"
    
    # Check if full path or just filename
    if os.path.exists(csv_file):
        csv_path = Path(csv_file)
    else:
        csv_path = CSV_DIR / csv_file
    
    if not csv_path.exists():
        print(f"Error: CSV file not found: {csv_path}")
        print(f"Please place CSV file in: {CSV_DIR}")
        return
    
    pc_data = load_pc_data()
    schema = load_schema()
    import_csv(csv_path, ac_id, pc_data, schema)


if __name__ == "__main__":
    main()
