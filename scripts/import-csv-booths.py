#!/usr/bin/env python3
"""
Import booth data from manually converted CSV files.

CSV Format:
  BoothNo,Candidate1,Candidate2,...,CandidateN,TotalValid,Rejected,NOTA,Total
  1,263,1,0,5,18,333,3,2,11,0,1,2,2,641,0,6,647
  2,325,3,1,11,33,305,1,0,3,0,0,2,3,687,0,7,694
  ...

Usage:
  python3 import-csv-booths.py AC070.csv TN-070
  python3 import-csv-booths.py AC027.csv TN-027

The CSV file should be in ~/Desktop/TN_Booth_CSVs/ folder.
"""

import csv
import json
import os
import re
import sys
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/lsb/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/lsb/public/data/elections/ac/TN/2021.json")
CSV_DIR = Path(os.path.expanduser("~/Desktop/TN_Booth_CSVs"))


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def import_csv(csv_path: Path, ac_id: str, official_data: dict):
    """Import booth data from CSV file."""
    official = official_data.get(ac_id)
    if not official:
        print(f"Error: No official data for {ac_id}")
        return False
    
    ac_name = official.get('constituencyName', ac_id)
    num_candidates = len(official['candidates'])
    
    results = {}
    
    with open(csv_path, 'r') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        
        for row in reader:
            if len(row) < num_candidates + 2:  # BoothNo + votes + at least Total
                continue
            
            booth_no = row[0].strip()
            if not booth_no or not booth_no[0].isdigit():
                continue
            
            # Extract votes
            try:
                votes = [int(row[i+1]) for i in range(num_candidates)]
            except (ValueError, IndexError):
                continue
            
            # Get total - it's after the candidate votes
            try:
                total = int(row[num_candidates + 1])  # TotalValid
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
    
    errors = []
    for i in range(min(3, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = col_totals[i]
        if off > 100:
            pct = abs(calc - off) / off * 100
            errors.append(pct)
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    print(f"Imported {len(results)} booths from {csv_path}")
    print(f"Average error (top 3 candidates): {avg_error:.1f}%")
    
    if avg_error > 30:
        print(f"Warning: High error rate. Please verify CSV data.")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            return False
    
    # Save booth data
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    booth_list = []
    for booth_id in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x.split('-')[-1]).group()) if re.search(r'\d+', x.split('-')[-1]) else 0, x)):
        booth_no = booth_id.split('-')[-1]
        booth_list.append({
            "id": booth_id, "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "women" if '(W)' in booth_no.upper() or booth_no.upper().endswith('W') else "regular",
            "name": f"Booth {booth_no}", "address": f"{ac_name} - Booth {booth_no}", "area": ac_name
        })
    
    with open(output_dir / "booths.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "state": "Tamil Nadu",
            "totalBooths": len(booth_list), "lastUpdated": "2021-04-06",
            "source": "Tamil Nadu CEO - Form 20 (Manual CSV)", "booths": booth_list
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')} 
                          for c in official['candidates']],
            "results": results
        }, f, indent=2)
    
    print(f"✅ Saved booth data to {output_dir}")
    return True


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 import-csv-booths.py <csv_file> <ac_id>")
        print("Example: python3 import-csv-booths.py AC070.csv TN-070")
        print(f"\nPlace CSV files in: {CSV_DIR}")
        return
    
    csv_file = sys.argv[1]
    ac_id = sys.argv[2]
    
    # Check if full path or just filename
    if os.path.exists(csv_file):
        csv_path = Path(csv_file)
    else:
        csv_path = CSV_DIR / csv_file
    
    if not csv_path.exists():
        print(f"Error: CSV file not found: {csv_path}")
        return
    
    official_data = load_official_data()
    import_csv(csv_path, ac_id, official_data)


if __name__ == "__main__":
    main()
