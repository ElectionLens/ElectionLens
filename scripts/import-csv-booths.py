#!/usr/bin/env python3
"""
Import booth-wise data from CSV files for constituencies with scanned PDFs.

CSV Format (Form 20 style):
  BoothNo,Candidate1,Candidate2,...,CandidateN,TotalValid,Rejected,NOTA

Usage:
  python scripts/import-csv-booths.py AC027.csv
  python scripts/import-csv-booths.py path/to/csv/folder/  # Process all CSVs in folder

The script will:
1. Read the CSV
2. Match candidates to election data
3. Generate 2021.json in the appropriate booth folder
"""

import csv
import json
import os
import re
import sys
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

# The 18 constituencies needing manual CSV conversion
PENDING_ACS = {
    27: "SHOZHINGANALLUR",
    30: "PALLAVARAM",
    31: "TAMBARAM",
    32: "CHENGALPATTU",
    33: "THIRUPORUR",
    34: "CHEYYUR",
    35: "MADURANTHAKAM",
    40: "KATPADI",
    43: "VELLORE",
    44: "ANAIKATTU",
    46: "GUDIYATHAM",
    47: "VANIYAMBADI",
    49: "JOLARPET",
    50: "TIRUPATTUR",
    108: "UDHAGAMANDALAM",
    109: "GUDALUR",
    147: "PERAMBALUR",
    148: "KUNNAM",
}


def load_election_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def parse_ac_number(filename: str) -> int:
    """Extract AC number from filename like AC027.csv or 027.csv"""
    match = re.search(r'(\d+)', filename)
    if match:
        return int(match.group(1))
    return 0


def import_csv(csv_path: Path, election_data: dict):
    """Import a single CSV file."""
    ac_num = parse_ac_number(csv_path.name)
    if ac_num == 0:
        print(f"❌ Could not parse AC number from {csv_path.name}")
        return False
    
    ac_id = f"TN-{ac_num:03d}"
    ac_info = election_data.get(ac_id, {})
    ac_name = ac_info.get("constituencyName", PENDING_ACS.get(ac_num, f"Constituency {ac_num}"))
    candidates_info = ac_info.get("candidates", [])
    
    print(f"\n📍 Importing {ac_id}: {ac_name}")
    print(f"   Source: {csv_path}")
    
    # Read CSV
    results = {}
    candidate_names = []
    
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        
        if not header:
            print(f"   ❌ Empty CSV file")
            return False
        
        # Parse header to get candidate columns
        # Expected: BoothNo, [Candidates...], TotalValid, Rejected, NOTA
        # or: SlNo, BoothNo, [Candidates...], TotalValid, Rejected, NOTA
        
        # Find where candidate columns start
        start_col = 1  # After BoothNo
        if header[0].lower() in ('slno', 'sl no', 'sl.no', 's.no'):
            start_col = 2  # After SlNo and BoothNo
        
        # Find where candidate columns end (before TotalValid, Rejected, NOTA)
        end_col = len(header) - 3  # Exclude last 3 columns
        
        # Get candidate names from header
        for i in range(start_col, end_col):
            name = header[i].strip()
            if name and name.lower() not in ('total', 'valid', 'rejected', 'nota'):
                candidate_names.append(name)
        
        print(f"   Found {len(candidate_names)} candidates in CSV")
        
        # Read booth data
        booth_count = 0
        for row in reader:
            if not row or not row[0].strip():
                continue
            
            try:
                # Get booth number
                booth_no_col = 1 if start_col == 2 else 0
                booth_no = row[booth_no_col].strip()
                
                # Skip summary rows
                if 'total' in booth_no.lower():
                    continue
                
                # Parse votes
                votes = []
                for i in range(start_col, end_col):
                    try:
                        v = int(row[i].replace(',', '').strip()) if row[i].strip() else 0
                    except ValueError:
                        v = 0
                    votes.append(v)
                
                # Parse last 3 columns
                try:
                    total_valid = int(row[-3].replace(',', '').strip()) if row[-3].strip() else sum(votes)
                    rejected = int(row[-2].replace(',', '').strip()) if row[-2].strip() else 0
                    nota = int(row[-1].replace(',', '').strip()) if row[-1].strip() else 0
                except (ValueError, IndexError):
                    total_valid = sum(votes)
                    rejected = 0
                    nota = 0
                
                # Add NOTA to votes if not already included
                if len(votes) == len(candidate_names):
                    votes.append(nota)
                
                booth_id = f"{ac_id}-{booth_no}"
                results[booth_id] = {
                    "votes": votes,
                    "total": total_valid,
                    "rejected": rejected
                }
                booth_count += 1
                
            except Exception as e:
                print(f"   ⚠️ Error parsing row: {row[:3]}... - {e}")
                continue
        
        print(f"   Parsed {booth_count} booths")
    
    if not results:
        print(f"   ❌ No booth data parsed")
        return False
    
    # Build candidates list - try to match with election data
    candidates = []
    for i, name in enumerate(candidate_names):
        # Try to find matching candidate in election data
        matched = None
        for ec in candidates_info:
            if ec.get("name", "").upper() == name.upper():
                matched = ec
                break
            # Partial match
            if name.upper() in ec.get("name", "").upper() or ec.get("name", "").upper() in name.upper():
                matched = ec
                break
        
        if matched:
            candidates.append({
                "slNo": i + 1,
                "name": matched.get("name", name),
                "party": matched.get("party", "IND"),
                "symbol": matched.get("symbol", "")
            })
        else:
            candidates.append({
                "slNo": i + 1,
                "name": name,
                "party": "IND",
                "symbol": ""
            })
    
    # Add NOTA
    candidates.append({
        "slNo": len(candidates) + 1,
        "name": "NOTA",
        "party": "NOTA",
        "symbol": ""
    })
    
    # Calculate totals and summary
    num_candidates = len(candidates)
    candidate_totals = [0] * num_candidates
    total_votes = 0
    
    for booth_result in results.values():
        total_votes += booth_result["total"]
        for i, v in enumerate(booth_result["votes"]):
            if i < num_candidates:
                candidate_totals[i] += v
    
    # Find winner and runner-up (excluding NOTA)
    non_nota_totals = candidate_totals[:-1] if candidate_totals else []
    if non_nota_totals:
        winner_votes = max(non_nota_totals)
        winner_idx = non_nota_totals.index(winner_votes)
        
        runner_totals = non_nota_totals.copy()
        runner_totals[winner_idx] = -1
        runner_votes = max(runner_totals)
        runner_idx = runner_totals.index(runner_votes)
    else:
        winner_idx = runner_idx = 0
        winner_votes = runner_votes = 0
    
    # Build output data
    output_data = {
        "acId": ac_id,
        "acName": ac_name,
        "year": 2021,
        "electionType": "assembly",
        "date": "2021-04-06",
        "totalBooths": len(results),
        "source": "Tamil Nadu CEO - Form 20 (Manual CSV)",
        "candidates": candidates,
        "results": results,
        "summary": {
            "totalVoters": ac_info.get("electors", 0),
            "totalVotes": total_votes,
            "turnoutPercent": round((total_votes / ac_info.get("electors", 1)) * 100, 2) if ac_info.get("electors") else 0,
            "winner": {
                "name": candidates[winner_idx]["name"],
                "party": candidates[winner_idx]["party"],
                "votes": winner_votes
            },
            "runnerUp": {
                "name": candidates[runner_idx]["name"],
                "party": candidates[runner_idx]["party"],
                "votes": runner_votes
            },
            "margin": winner_votes - runner_votes
        }
    }
    
    # Save to output directory
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / "2021.json"
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"   ✅ Saved to {output_file}")
    print(f"   Winner: {candidates[winner_idx]['name']} ({candidates[winner_idx]['party']}) - {winner_votes:,} votes")
    print(f"   Margin: {winner_votes - runner_votes:,} votes")
    
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/import-csv-booths.py <csv_file_or_folder>")
        print()
        print("Pending ACs:")
        for ac_num, name in sorted(PENDING_ACS.items()):
            print(f"  AC{ac_num:03d}: {name}")
        sys.exit(1)
    
    election_data = load_election_data()
    
    path = Path(sys.argv[1])
    
    if path.is_file():
        import_csv(path, election_data)
    elif path.is_dir():
        csv_files = list(path.glob("*.csv"))
        print(f"Found {len(csv_files)} CSV files in {path}")
        
        success = 0
        for csv_file in sorted(csv_files):
            if import_csv(csv_file, election_data):
                success += 1
        
        print(f"\n✅ Imported {success}/{len(csv_files)} CSV files")
    else:
        print(f"❌ Path not found: {path}")
        sys.exit(1)


if __name__ == "__main__":
    main()
