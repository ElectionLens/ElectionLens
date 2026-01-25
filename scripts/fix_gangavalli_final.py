#!/usr/bin/env python3
"""Fix Gangavalli data using official totals to create correct column mapping."""

import json
import pdfplumber
import re
from pathlib import Path

PDF_PATH = Path("/Users/p0s097d/Desktop/AC081.pdf")
OUTPUT_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2024.json")

# Official totals from PDF totals row (in PDF column order, starting from column 4)
# PDF Col 4: 72235 (ADMK)
# PDF Col 5: 77483 (DMK)
# PDF Col 6: 403 (BSP)
# PDF Col 7: 11108 (PMK)
# PDF Col 8: 404 (PRABU C - IND)
# PDF Col 9: 95 (BALAKRISHNAN P - IND)
# PDF Col 10: 77 (VENKATRAMAN J - NADLMMKLK)
# PDF Col 11: 10612 (NTK)
# etc.

OFFICIAL_PDF_TOTALS = {
    4: 72235,   # ADMK
    5: 77483,   # DMK
    6: 403,     # BSP
    7: 11108,   # PMK
    8: 404,     # PRABU C
    9: 95,      # BALAKRISHNAN P
    10: 77,     # VENKATRAMAN J
    11: 10612,  # NTK
    12: 135,    # SUBRAMANIAN R K
    13: 94,     # KAMALAKANNAN M
    14: 419,    # KUMARAGURU N
    15: 110,    # GOVINDARAJ S R
    16: 72,     # SIGAMANI A
    17: 121,    # ARUL INIYAN A
    18: 421,    # MURUGESAN M
    19: 584,    # PALANIYAMMAL S
    20: 356,    # MAYILAMPARAI MARI A
    21: 273,    # NATTANMAI GUNASEKARANA A.S
    22: 50,     # RAJASEKAR K
    23: 58,     # JAYABAL PM
    24: 72,     # RAJAMANICKAM C
}

def create_candidate_mapping(candidates):
    """Create mapping from PDF column to candidate index."""
    # Based on official totals and candidate names
    mapping = {}
    
    # Known mappings
    known_mappings = [
        (4, 1, "ADMK", "KUMARAGURU R"),      # PDF Col 4 -> Candidate Index 1
        (5, 0, "DMK", "MALAIYARASAN D"),     # PDF Col 5 -> Candidate Index 0
        (6, 6, "BSP", "JEEVANRAJ N"),        # PDF Col 6 -> Candidate Index 6
        (7, 3, "PMK", "DEVADASS RAMASAMY"),  # PDF Col 7 -> Candidate Index 3
        (8, 4, "IND", "PRABU C"),            # PDF Col 8 -> Candidate Index 4
        (9, 5, "IND", "BALAKRISHNAN P"),     # PDF Col 9 -> Candidate Index 5
        (10, 13, "NADLMMKLK", "VENKATRAMAN J"), # PDF Col 10 -> Candidate Index 13
        (11, 2, "NTK", "JAGADESAN A"),       # PDF Col 11 -> Candidate Index 2
        (12, 11, "IND", "SUBRAMANIAN R K"),  # PDF Col 12 -> Candidate Index 11
        (13, 14, "IND", "KAMALAKANNAN M"),   # PDF Col 13 -> Candidate Index 14
        (14, 9, "IND", "KUMARAGURU N"),      # PDF Col 14 -> Candidate Index 9
        (15, 16, "IND", "GOVINDARAJ S R"),   # PDF Col 15 -> Candidate Index 16
        (16, 17, "IND", "SIGAMANI A"),       # PDF Col 16 -> Candidate Index 17
        (17, 12, "IND", "ARUL INIYAN A"),    # PDF Col 17 -> Candidate Index 12
        (18, 10, "IND", "MURUGESAN M"),      # PDF Col 18 -> Candidate Index 10
        (19, 15, "DMSK", "PALANIYAMMAL S"),  # PDF Col 19 -> Candidate Index 15
        (20, 7, "IND", "MAYILAMPARAI MARI A"), # PDF Col 20 -> Candidate Index 7
        (21, 8, "AMM", "NATTANMAI GUNASEKARANA A.S"), # PDF Col 21 -> Candidate Index 8
        (22, 18, "IND", "RAJASEKAR K"),      # PDF Col 22 -> Candidate Index 18
        (23, 19, "IND", "JAYABAL PM"),       # PDF Col 23 -> Candidate Index 19
        (24, 20, "IND", "RAJAMANICKAM C"),   # PDF Col 24 -> Candidate Index 20
    ]
    
    for pdf_col, cand_idx, party, name in known_mappings:
        # Verify the candidate matches
        if cand_idx < len(candidates):
            cand = candidates[cand_idx]
            if cand.get("party") == party and name in cand.get("name", ""):
                mapping[pdf_col] = cand_idx
            else:
                print(f"⚠️  Warning: Expected {name} ({party}) at index {cand_idx}, found {cand.get('name')} ({cand.get('party')})")
    
    return mapping

def extract_with_correct_mapping():
    """Extract booth data with correct column mapping."""
    results = {}
    
    # Load candidates to create mapping
    with open(OUTPUT_FILE) as f:
        data = json.load(f)
    candidates = data.get('candidates', [])
    
    column_mapping = create_candidate_mapping(candidates)
    
    print(f"📄 Opening PDF: {PDF_PATH}")
    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"   Pages: {len(pdf.pages)}")
        
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            
            for table in tables:
                if not table or len(table) < 5:
                    continue
                
                # Skip totals row (usually last row)
                for row_idx in range(5, len(table) - 1):  # Exclude last row (totals)
                    row = table[row_idx]
                    if not row or len(row) < 10:
                        continue
                    
                    # Extract booth number
                    booth_no = None
                    for col_idx in range(min(3, len(row))):
                        cell = row[col_idx]
                        if cell:
                            numbers = re.findall(r'\b(\d+)\b', str(cell))
                            for num_str in numbers:
                                num = int(num_str)
                                if 1 <= num <= 600:
                                    booth_no = num
                                    break
                            if booth_no:
                                break
                    
                    if not booth_no:
                        continue
                    
                    # Extract votes using column mapping
                    votes = [0] * len(candidates)
                    for pdf_col, cand_idx in column_mapping.items():
                        if pdf_col < len(row):
                            cell = row[pdf_col]
                            if cell:
                                numbers = re.findall(r'\b(\d+)\b', str(cell))
                                vote = int(numbers[0]) if numbers and numbers[0].isdigit() else 0
                                if 0 <= cand_idx < len(votes) and vote <= 2000:  # Reasonable vote count
                                    votes[cand_idx] = vote
                    
                    total = sum(votes)
                    if 20 <= total <= 3000:
                        booth_id = f"TN-081-{booth_no:03d}"
                        if booth_id not in results:
                            results[booth_id] = {
                                "votes": votes,
                                "total": total,
                                "rejected": 0
                            }
    
    return results

def main():
    print("=" * 70)
    print("Extracting Gangavalli 2024 with Correct Column Mapping")
    print("=" * 70)
    
    if not PDF_PATH.exists():
        print(f"❌ PDF not found: {PDF_PATH}")
        return
    
    # Load existing data
    with open(OUTPUT_FILE) as f:
        existing_data = json.load(f)
    
    candidates = existing_data.get('candidates', [])
    print(f"📊 Candidates: {len(candidates)}")
    
    # Extract with correct mapping
    print(f"\n📥 Extracting from PDF...")
    extracted_results = extract_with_correct_mapping()
    print(f"   Extracted {len(extracted_results)} booths")
    
    # Validate totals
    ac_totals = [0] * len(candidates)
    for booth_data in extracted_results.values():
        votes = booth_data.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(ac_totals):
                ac_totals[i] += v
    
    print(f"\n📊 Extracted totals vs Official:")
    print(f"   DMK (index 0): {ac_totals[0]:,} (official: 77,483)")
    print(f"   ADMK (index 1): {ac_totals[1]:,} (official: 72,235)")
    print(f"   NTK (index 2): {ac_totals[2]:,} (official: 10,612)")
    print(f"   PMK (index 3): {ac_totals[3]:,} (official: 11,108)")
    
    # Update data
    existing_data['results'] = extracted_results
    
    # Update summary
    total_votes = sum(ac_totals)
    sorted_candidates = sorted(enumerate(candidates), key=lambda x: ac_totals[x[0]], reverse=True)
    winner_idx, winner_cand = sorted_candidates[0]
    runner_up_idx, runner_up_cand = sorted_candidates[1] if len(sorted_candidates) > 1 else (None, None)
    
    winner_votes = ac_totals[winner_idx]
    runner_up_votes = ac_totals[runner_up_idx] if runner_up_idx is not None else 0
    margin = winner_votes - runner_up_votes
    margin_percent = (margin / total_votes * 100) if total_votes > 0 else 0
    
    existing_data['summary'] = {
        'totalVoters': 0,
        'totalVotes': total_votes,
        'turnoutPercent': 0,
        'winner': {
            'name': winner_cand['name'],
            'party': winner_cand['party'],
            'votes': winner_votes
        },
        'runnerUp': {
            'name': runner_up_cand['name'] if runner_up_cand else '',
            'party': runner_up_cand['party'] if runner_up_cand else '',
            'votes': runner_up_votes
        },
        'margin': margin,
        'marginPercent': margin_percent
    }
    
    # Update postal
    if 'postal' in existing_data and 'candidates' in existing_data['postal']:
        for postal_cand in existing_data['postal']['candidates']:
            for i, cand in enumerate(candidates):
                if cand.get('name') == postal_cand.get('name') and cand.get('party') == postal_cand.get('party'):
                    postal_cand['booth'] = ac_totals[i]
                    break
    
    existing_data['year'] = 2024
    existing_data['totalBooths'] = len(existing_data['results'])
    existing_data['source'] = 'Tamil Nadu CEO - Form 20 (extracted with official totals validation)'
    
    # Save
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Summary:")
    print(f"   Winner: {winner_cand['name']} ({winner_cand['party']}) - {winner_votes:,} votes")
    print(f"   Runner-up: {runner_up_cand['name']} ({runner_up_cand['party']}) - {runner_up_votes:,} votes")
    print(f"   Total votes: {total_votes:,}")
    
    # Count ADMK booth wins
    admk_wins = 0
    for booth_data in extracted_results.values():
        votes = booth_data.get('votes', [])
        if len(votes) > 1:
            max_votes = max(votes[:21]) if len(votes) >= 21 else max(votes)
            if votes[1] == max_votes:  # ADMK is at index 1
                admk_wins += 1
    
    print(f"   ADMK booth wins: {admk_wins}")
    print(f"\n💾 Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
