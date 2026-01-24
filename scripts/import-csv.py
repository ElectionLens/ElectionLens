#!/usr/bin/env python3
"""
Universal CSV importer for booth data.

Usage: python3 import-csv.py AC028 < data.csv
   or: python3 import-csv.py AC028 data.csv

CSV format should have at minimum:
- First column: Booth number (or "Station No", "Booth", etc.)
- Last numeric columns: Vote totals

The script will auto-detect column layouts.
"""

import json
import csv
import sys
import re
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")


def parse_booth_no(val):
    """Extract booth number from various formats."""
    val = str(val).strip()
    # Handle formats like "1", "001", "1A", etc.
    match = re.match(r'^0*(\d+)', val)
    if match:
        return int(match.group(1))
    return None


def clean_numeric(val):
    """Clean and convert a value to integer."""
    val = str(val).strip()
    # Remove citation markers like [cite: 57]
    val = re.sub(r'\s*\[cite.*?\]', '', val)
    # Remove commas
    val = val.replace(',', '')
    # Extract number
    match = re.match(r'^(\d+)', val)
    if match:
        return int(match.group(1))
    return 0


def import_csv(ac_code, csv_lines):
    """Import CSV data for an AC."""
    # Normalize AC code
    if ac_code.startswith('AC'):
        ac_num = int(ac_code[2:])
    elif ac_code.startswith('TN-'):
        ac_num = int(ac_code[3:])
    else:
        ac_num = int(ac_code)
    
    ac_id = f"TN-{ac_num:03d}"
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    
    # Load existing data
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
    else:
        data = {'results': {}, 'year': 2024}
    
    existing_count = len(data.get('results', {}))
    
    # Parse CSV
    reader = csv.DictReader(csv_lines)
    headers = reader.fieldnames
    
    # Find booth number column
    booth_col = None
    for h in headers:
        h_lower = h.lower()
        if 'station' in h_lower or 'booth' in h_lower or h_lower in ['no', 'sno', 's.no', '#']:
            booth_col = h
            break
    
    if not booth_col:
        # Assume first column is booth number
        booth_col = headers[0]
    
    # Find total column
    total_col = None
    for h in headers:
        h_lower = h.lower()
        if 'total valid' in h_lower or h_lower == 'total' or 'valid votes' in h_lower:
            total_col = h
            break
    
    # Find NOTA column
    nota_col = None
    for h in headers:
        if 'nota' in h.lower():
            nota_col = h
            break
    
    # Find candidate vote columns (C1, C2, ... or columns between booth and total)
    candidate_cols = []
    for h in headers:
        if re.match(r'^C\d+', h) or re.match(r'^Candidate', h, re.I):
            candidate_cols.append(h)
    
    # If no explicit candidate columns, use columns between booth and total
    if not candidate_cols:
        start_idx = headers.index(booth_col) + 1
        end_idx = headers.index(total_col) if total_col else len(headers)
        # Skip name/electors columns
        for h in headers[start_idx:end_idx]:
            h_lower = h.lower()
            if 'name' in h_lower or 'electors' in h_lower or 'address' in h_lower:
                continue
            candidate_cols.append(h)
    
    new_results = {}
    for row in reader:
        booth_no = parse_booth_no(row.get(booth_col, ''))
        if not booth_no:
            continue
        
        booth_id = f"{ac_id}-{booth_no:03d}"
        
        # Get candidate votes
        votes = []
        for col in candidate_cols:
            votes.append(clean_numeric(row.get(col, 0)))
        
        # Add NOTA if available
        if nota_col:
            votes.append(clean_numeric(row.get(nota_col, 0)))
        
        # Get total
        if total_col:
            total = clean_numeric(row.get(total_col, 0))
        else:
            total = sum(votes)
        
        new_results[booth_id] = {
            'votes': votes,
            'total': total,
            'rejected': 0
        }
    
    # Merge with existing
    added = 0
    updated = 0
    for booth_id, result in new_results.items():
        if booth_id not in data['results']:
            added += 1
        else:
            updated += 1
        data['results'][booth_id] = result
    
    data['totalBooths'] = len(data['results'])
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    new_count = len(data['results'])
    print(f"{ac_id}: {existing_count} -> {new_count} booths (+{added} new, {updated} updated)")
    print(f"CSV had {len(new_results)} rows, {len(candidate_cols)} candidate columns detected")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import-csv.py AC028 [data.csv]")
        print("       cat data.csv | python3 import-csv.py AC028")
        sys.exit(1)
    
    ac_code = sys.argv[1]
    
    if len(sys.argv) > 2:
        # Read from file
        with open(sys.argv[2]) as f:
            csv_lines = f.readlines()
    else:
        # Read from stdin
        csv_lines = sys.stdin.readlines()
    
    import_csv(ac_code, csv_lines)


if __name__ == "__main__":
    main()
