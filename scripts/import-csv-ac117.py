#!/usr/bin/env python3
"""Import manually extracted CSV data for AC117."""

import json
import csv
import io
import re
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

# Read CSV from stdin or file
csv_file = Path("/Users/p0s097d/ElectionLens/scripts/ac117_data.csv")

def main():
    ac_id = "TN-117"
    
    # Load existing data
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    with open(results_file) as f:
        data = json.load(f)
    
    existing_count = len(data.get('results', {}))
    
    # Parse CSV
    with open(csv_file) as f:
        reader = csv.DictReader(f)
        
        new_results = {}
        for row in reader:
            try:
                booth_no = int(row['Station No'])
            except:
                continue
                
            booth_id = f"{ac_id}-{booth_no:03d}"
            
            # Extract votes for each candidate (C1-C23)
            votes = []
            for i in range(1, 24):
                col_name = f'C{i}'
                try:
                    val = row.get(col_name, '0')
                    # Clean any citation markers
                    val = re.sub(r'\s*\[cite.*?\]', '', str(val))
                    votes.append(int(val))
                except:
                    votes.append(0)
            
            # Get NOTA
            try:
                nota_val = row.get('NOTA', '0')
                nota_val = re.sub(r'\s*\[cite.*?\]', '', str(nota_val))
                nota = int(nota_val)
            except:
                nota = 0
            votes.append(nota)
            
            # Get total
            try:
                total_val = row.get('Total Valid', row.get('Total', '0'))
                total_val = re.sub(r'\s*\[cite.*?\]', '', str(total_val))
                total = int(total_val)
            except:
                total = sum(votes)
            
            new_results[booth_id] = {
                'votes': votes,
                'total': total,
                'rejected': 0
            }
    
    # Merge with existing
    added = 0
    for booth_id, result in new_results.items():
        if booth_id not in data['results']:
            data['results'][booth_id] = result
            added += 1
        else:
            # Update existing
            data['results'][booth_id] = result
    
    data['totalBooths'] = len(data['results'])
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    new_count = len(data['results'])
    print(f"AC117: {existing_count} -> {new_count} booths (+{added} new, {len(new_results)-added} updated)")
    print(f"CSV had {len(new_results)} rows")

if __name__ == "__main__":
    main()
