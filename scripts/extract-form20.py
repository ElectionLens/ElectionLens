#!/usr/bin/env python3
"""
Extract booth-wise election results from Form 20 PDFs.
Generates JSON files for the booth-wise data feature.
"""

import json
import re
import sys
from pathlib import Path

def parse_form20_text(text_file: str) -> dict:
    """Parse the text extracted from Form 20 PDF."""
    
    with open(text_file, 'r') as f:
        content = f.read()
    
    # Extract metadata from header
    ac_match = re.search(r'(\d+)\s*-\s*([A-Z]+)', content)
    ac_no = ac_match.group(1) if ac_match else "1"
    ac_name = ac_match.group(2) if ac_match else "GUMMIDIPOONDI"
    
    electors_match = re.search(r'Total No\. of Electors.*?:\s*(\d+)', content)
    total_electors = int(electors_match.group(1)) if electors_match else 0
    
    date_match = re.search(r'Date of Counting\s*:\s*(\d{2}-\d{2}-\d{4})', content)
    counting_date = date_match.group(1) if date_match else ""
    
    # Parse booth data rows
    # Pattern: Sl No, Booth No, Votes for each candidate..., Total Valid, Rejected, NOTA, Total
    booth_pattern = re.compile(
        r'^\s*(\d+)\s+'  # Sl No
        r'([0-9]+(?:\s*[AM])?(?:\s*A?\(W\))?)\s+'  # Booth No (with optional M, A(W) suffix)
        r'(\d+(?:\s+\d+)+)\s*$',  # Vote numbers
        re.MULTILINE
    )
    
    results = {}
    lines = content.split('\n')
    
    for line in lines:
        # Try to match booth data line
        # Format: SlNo BoothNo DMK DMDK BSP NTK AMAK IJK PMK IND1 IND2 IND3 IND4 IND5 Total Rejected NOTA TotalVotes
        match = re.match(
            r'^\s*(\d+)\s+'  # Sl No
            r'([0-9]+\s*[MA]?\s*(?:A?\s*\(W\))?)\s+'  # Booth No
            r'(.+)$',  # Rest of the data
            line.strip()
        )
        
        if match:
            sl_no = match.group(1)
            booth_no = match.group(2).strip().replace(' ', '')
            # Normalize booth number
            booth_no = re.sub(r'\s+', '', booth_no)
            booth_no = booth_no.replace('A(W)', '(W)').replace('(W)', ' (W)')
            booth_no = booth_no.strip()
            
            # Parse numbers from the rest
            numbers = re.findall(r'\d+', match.group(3))
            
            if len(numbers) >= 16:  # We expect at least 12 candidates + Total + Rejected + NOTA + TotalVotes
                # Last 4 columns are: Total Valid, Rejected, NOTA, Total Votes
                votes = [int(n) for n in numbers[:-4]]
                total_valid = int(numbers[-4])
                rejected = int(numbers[-3])
                nota = int(numbers[-2])
                total_votes = int(numbers[-1])
                
                # Create booth ID
                booth_id = f"TN-001-{booth_no.replace(' ', '').replace('(W)', 'W')}"
                
                results[booth_id] = {
                    "boothNo": booth_no,
                    "votes": votes + [nota],  # Include NOTA as last candidate
                    "total": total_valid,
                    "rejected": rejected,
                    "nota": nota
                }
    
    return {
        "acNo": ac_no,
        "acName": ac_name,
        "totalElectors": total_electors,
        "countingDate": counting_date,
        "results": results
    }


def main():
    # Parse 2021 Form 20
    print("Extracting 2021 Form 20 data...")
    data_2021 = parse_form20_text("/tmp/form20_2021.txt")
    
    # Candidates for 2021 Assembly Election
    candidates_2021 = [
        {"slNo": 1, "name": "GOVINDARAJAN T.J", "party": "DMK", "symbol": "Rising Sun"},
        {"slNo": 2, "name": "DILLIY K.M", "party": "DMDK", "symbol": "Murasu"},
        {"slNo": 3, "name": "NAGARAJ.S", "party": "BSP", "symbol": "Elephant"},
        {"slNo": 4, "name": "USHA.U", "party": "NTK", "symbol": "Parachute"},
        {"slNo": 5, "name": "GOWTHAM. J", "party": "AMAK", "symbol": "Auto"},
        {"slNo": 6, "name": "IJK CANDIDATE", "party": "IJK", "symbol": "Whistle"},
        {"slNo": 7, "name": "SARAVANAN. V", "party": "PMK", "symbol": "Mango"},
        {"slNo": 8, "name": "PRAKASH.M", "party": "IND", "symbol": "Pot"},
        {"slNo": 9, "name": "SARAVANAN. E", "party": "IND", "symbol": "Cup & Saucer"},
        {"slNo": 10, "name": "DEVANATHAN. R", "party": "IND", "symbol": "Sewing Machine"},
        {"slNo": 11, "name": "PRAKASH. K", "party": "IND", "symbol": "Table Fan"},
        {"slNo": 12, "name": "PRAKASH. M", "party": "IND", "symbol": "Pressure Cooker"},
        {"slNo": 13, "name": "LAKSHMI. R", "party": "IND", "symbol": "Torch"},
        {"slNo": 14, "name": "NOTA", "party": "NOTA", "symbol": "NOTA"},
    ]
    
    # Calculate summary
    total_votes = sum(r["total"] for r in data_2021["results"].values())
    
    # Find winner - sum votes for each candidate across all booths
    candidate_totals = [0] * len(candidates_2021)
    for booth_result in data_2021["results"].values():
        for i, votes in enumerate(booth_result["votes"]):
            if i < len(candidate_totals):
                candidate_totals[i] += votes
    
    # Sort to find winner and runner-up
    sorted_candidates = sorted(enumerate(candidate_totals), key=lambda x: x[1], reverse=True)
    winner_idx, winner_votes = sorted_candidates[0]
    runner_idx, runner_votes = sorted_candidates[1]
    
    output_2021 = {
        "acId": "TN-001",
        "acName": "Gummidipoondi",
        "year": 2021,
        "electionType": "assembly",
        "date": "2021-04-06",
        "totalBooths": len(data_2021["results"]),
        "source": "Tamil Nadu CEO - Form 20",
        "candidates": candidates_2021,
        "results": {k: {"votes": v["votes"], "total": v["total"], "rejected": v["rejected"]} 
                   for k, v in data_2021["results"].items()},
        "summary": {
            "totalVoters": data_2021["totalElectors"],
            "totalVotes": total_votes,
            "turnoutPercent": round((total_votes / data_2021["totalElectors"]) * 100, 2) if data_2021["totalElectors"] > 0 else 0,
            "winner": {
                "name": candidates_2021[winner_idx]["name"],
                "party": candidates_2021[winner_idx]["party"],
                "votes": winner_votes
            },
            "runnerUp": {
                "name": candidates_2021[runner_idx]["name"],
                "party": candidates_2021[runner_idx]["party"],
                "votes": runner_votes
            },
            "margin": winner_votes - runner_votes,
            "marginPercent": round(((winner_votes - runner_votes) / total_votes) * 100, 1) if total_votes > 0 else 0
        }
    }
    
    # Write output
    output_path = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-001/2021.json")
    with open(output_path, 'w') as f:
        json.dump(output_2021, f, indent=2)
    
    print(f"✅ Extracted {len(data_2021['results'])} booths for 2021")
    print(f"   Winner: {candidates_2021[winner_idx]['party']} - {winner_votes:,} votes")
    print(f"   Runner-up: {candidates_2021[runner_idx]['party']} - {runner_votes:,} votes")
    print(f"   Margin: {winner_votes - runner_votes:,} votes")
    print(f"   Output: {output_path}")

if __name__ == "__main__":
    main()
