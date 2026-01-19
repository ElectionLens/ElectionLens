#!/usr/bin/env python3
"""
Convert Gemini-extracted CSV to booth results JSON
"""

import csv
import json
from pathlib import Path

# Candidates based on CSV header
CANDIDATES = [
    {"slNo": 1, "name": "Senthil", "party": "INC", "symbol": "Hand"},
    {"slNo": 2, "name": "Sasikanth", "party": "BSP", "symbol": "Elephant"},
    {"slNo": 3, "name": "Tamizhmadhi", "party": "DMDK", "symbol": "Drum"},
    {"slNo": 4, "name": "Nallathambi", "party": "BJP", "symbol": "Lotus"},
    {"slNo": 5, "name": "Balaganapathy", "party": "AMDMK", "symbol": ""},
    {"slNo": 6, "name": "Priyadarshan", "party": "DMSK", "symbol": ""},
    {"slNo": 7, "name": "Ashok", "party": "NMK", "symbol": ""},
    {"slNo": 8, "name": "Sivasankaran", "party": "NTK", "symbol": "Vel"},
    {"slNo": 9, "name": "Bharathidasan", "party": "IND", "symbol": ""},
    {"slNo": 10, "name": "Malathi", "party": "IND", "symbol": ""},
    {"slNo": 11, "name": "Shakthivel", "party": "IND", "symbol": ""},
    {"slNo": 12, "name": "Balakrishnan", "party": "IND", "symbol": ""},
    {"slNo": 13, "name": "Manimaran", "party": "IND", "symbol": ""},
    {"slNo": 14, "name": "Mani", "party": "IND", "symbol": ""},
    {"slNo": 15, "name": "NOTA", "party": "NOTA", "symbol": "NOTA"},
]

def convert_csv_to_json(csv_path, output_path):
    results = {}
    candidate_totals = [0] * len(CANDIDATES)
    total_votes = 0
    
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            station = row.get('Station No', '').strip()
            if not station or station == 'TOTAL':
                continue
            
            booth_no = int(station)
            
            # Skip empty booths
            valid_votes = int(row.get('Valid Votes', 0) or 0)
            if valid_votes == 0:
                continue
            
            # Extract votes for each candidate
            votes = [
                int(row.get('INC (Senthil)', 0) or 0),
                int(row.get('BSP (Sasikanth)', 0) or 0),
                int(row.get('DMDK (Tamizhmadhi)', 0) or 0),
                int(row.get('BJP (Nallathambi)', 0) or 0),
                int(row.get('AMDMK (Balaganapathy)', 0) or 0),
                int(row.get('DMSK (Priyadarshan)', 0) or 0),
                int(row.get('NMK (Ashok)', 0) or 0),
                int(row.get('NTK (Sivasankaran)', 0) or 0),
                int(row.get('IND (Bharathidasan)', 0) or 0),
                int(row.get('IND (Malathi)', 0) or 0),
                int(row.get('IND (Shakthivel)', 0) or 0),
                int(row.get('IND (Balakrishnan)', 0) or 0),
                int(row.get('IND (Manimaran)', 0) or 0),
                int(row.get('IND (Mani)', 0) or 0),
                int(row.get('NOTA', 0) or 0),
            ]
            
            rejected = int(row.get('Rejected', 0) or 0)
            total = int(row.get('Total', 0) or valid_votes)
            
            booth_id = f"TN-001-{booth_no:03d}"
            results[booth_id] = {
                "votes": votes,
                "total": total,
                "rejected": rejected
            }
            
            # Accumulate totals
            for i, v in enumerate(votes):
                candidate_totals[i] += v
            total_votes += total
    
    # Find winner
    max_votes = max(candidate_totals[:-1])  # Exclude NOTA
    winner_idx = candidate_totals.index(max_votes)
    
    # Find runner-up
    sorted_totals = sorted(enumerate(candidate_totals[:-1]), key=lambda x: x[1], reverse=True)
    runner_up_idx = sorted_totals[1][0]
    runner_up_votes = sorted_totals[1][1]
    
    output = {
        "acId": "TN-001",
        "acName": "Gummidipoondi",
        "year": 2024,
        "electionType": "parliament",
        "pcName": "Thiruvallur",
        "date": "2024-06-04",
        "totalBooths": len(results),
        "source": "Tamil Nadu CEO - Form 20 (Gemini Extracted)",
        "candidates": CANDIDATES,
        "results": results,
        "summary": {
            "totalVoters": 274625,
            "totalVotes": total_votes,
            "turnoutPercent": round(total_votes / 274625 * 100, 2),
            "winner": {
                "name": CANDIDATES[winner_idx]['name'],
                "party": CANDIDATES[winner_idx]['party'],
                "votes": max_votes
            },
            "runnerUp": {
                "name": CANDIDATES[runner_up_idx]['name'],
                "party": CANDIDATES[runner_up_idx]['party'],
                "votes": runner_up_votes
            },
            "margin": max_votes - runner_up_votes,
            "marginPercent": round((max_votes - runner_up_votes) / total_votes * 100, 2)
        }
    }
    
    # Ensure output directory exists
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Converted {len(results)} booths")
    print(f"   Total votes: {total_votes:,}")
    print(f"   Winner: {CANDIDATES[winner_idx]['name']} ({CANDIDATES[winner_idx]['party']}) - {max_votes:,} votes")
    print(f"   Runner-up: {CANDIDATES[runner_up_idx]['name']} ({CANDIDATES[runner_up_idx]['party']}) - {runner_up_votes:,} votes")
    print(f"   Margin: {max_votes - runner_up_votes:,} votes ({round((max_votes - runner_up_votes) / total_votes * 100, 2)}%)")
    print(f"   Output: {output_path}")


if __name__ == "__main__":
    csv_path = Path(__file__).parent / "gummidipoondi-2024-raw.csv"
    output_path = Path(__file__).parent.parent / "public/data/booths/TN/TN-001/2024.json"
    
    convert_csv_to_json(csv_path, output_path)
