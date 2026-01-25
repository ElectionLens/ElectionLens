#!/usr/bin/env python3
"""Extract Gangavalli 2024 using official totals to map columns correctly."""

import json
import pdfplumber
import re
from pathlib import Path

PDF_PATH = Path("/Users/p0s097d/Desktop/AC081.pdf")
OUTPUT_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2024.json")

# Official totals from PDF totals row:
# 72235 77483 403 11108 404 95 77 10612 135 94 419 110 72 121 421 584 356 273 50 58 72
# These are in PDF column order (starting from column 4)
OFFICIAL_TOTALS_PDF_ORDER = [
    72235,  # PDF Col 4 - ADMK (KUMARAGURU R)
    77483,  # PDF Col 5 - DMK (MALAIYARASAN D)
    403,    # PDF Col 6 - BSP (JEEVANRAJ N)
    11108,  # PDF Col 7 - PMK (DEVADASS RAMASAMY)
    404,    # PDF Col 8 - IND (PRABU C)
    95,     # PDF Col 9 - IND (BALAKRISHNAN P)
    77,     # PDF Col 10 - NADLMMKLK (VENKATRAMAN J)
    10612,  # PDF Col 11 - NTK (JAGADESAN A)
    135,    # PDF Col 12 - IND (SUBRAMANIAN R K)
    94,     # PDF Col 13 - IND (KAMALAKANNAN M)
    419,    # PDF Col 14 - IND (KUMARAGURU N)
    110,    # PDF Col 15 - IND (GOVINDARAJ S R)
    72,     # PDF Col 16 - IND (SIGAMANI A)
    121,    # PDF Col 17 - IND (ARUL INIYAN A)
    421,    # PDF Col 18 - IND (MURUGESAN M)
    584,    # PDF Col 19 - IND (PALANIYAMMAL S - DMSK)
    356,    # PDF Col 20 - IND (MAYILAMPARAI MARI A)
    273,    # PDF Col 21 - IND (NATTANMAI GUNASEKARANA A.S - AMM)
    50,     # PDF Col 22 - IND (RAJASEKAR K)
    58,     # PDF Col 23 - IND (JAYABAL PM)
    72,     # PDF Col 24 - IND (RAJAMANICKAM C)
]

# Candidates array order (from existing JSON):
# Index 0: DMK (MALAIYARASAN D) - should have 77483 votes
# Index 1: ADMK (KUMARAGURU R) - should have 72235 votes
# Index 2: NTK (JAGADESAN A) - should have 10612 votes
# Index 3: PMK (DEVADASS RAMASAMY) - should have 11108 votes
# etc.

# Mapping: PDF column -> Candidate index
# PDF Col 4 (ADMK) -> Candidate Index 1
# PDF Col 5 (DMK) -> Candidate Index 0
# PDF Col 6 (BSP) -> Candidate Index 6
# PDF Col 7 (PMK) -> Candidate Index 3
# PDF Col 11 (NTK) -> Candidate Index 2
# etc.

def create_column_mapping():
    """Create mapping from PDF column to candidate index based on official totals."""
    # This will be determined by matching totals
    # For now, we know:
    # PDF Col 4 (72235) = ADMK = Candidate Index 1
    # PDF Col 5 (77483) = DMK = Candidate Index 0
    # PDF Col 6 (403) = BSP = Candidate Index 6
    # PDF Col 7 (11108) = PMK = Candidate Index 3
    # PDF Col 11 (10612) = NTK = Candidate Index 2
    
    mapping = {
        4: 1,   # ADMK
        5: 0,   # DMK
        6: 6,   # BSP
        7: 3,   # PMK
        8: 4,   # PRABU C (IND)
        9: 5,   # BALAKRISHNAN P (IND)
        10: 13, # VENKATRAMAN J (NADLMMKLK)
        11: 2,  # NTK
        12: 11, # SUBRAMANIAN R K (IND)
        13: 14, # KAMALAKANNAN M (IND)
        14: 9,  # KUMARAGURU N (IND)
        15: 16, # GOVINDARAJ S R (IND)
        16: 17, # SIGAMANI A (IND)
        17: 12, # ARUL INIYAN A (IND)
        18: 10, # MURUGESAN M (IND)
        19: 15, # PALANIYAMMAL S (DMSK)
        20: 7,  # MAYILAMPARAI MARI A (IND)
        21: 8,  # NATTANMAI GUNASEKARANA A.S (AMM)
        22: 18, # RAJASEKAR K (IND)
        23: 19, # JAYABAL PM (IND)
        24: 20, # RAJAMANICKAM C (IND)
    }
    return mapping

def extract_booth_data_with_mapping():
    """Extract booth data and map PDF columns to candidate indices."""
    results = {}
    column_mapping = create_column_mapping()
    
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
                
                # Process data rows
                for row_idx in range(5, len(table)):
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
                    
                    # Extract votes and map to candidate indices
                    votes = [0] * 21
                    for pdf_col, cand_idx in column_mapping.items():
                        if pdf_col < len(row):
                            cell = row[pdf_col]
                            if cell:
                                numbers = re.findall(r'\b(\d+)\b', str(cell))
                                vote = int(numbers[0]) if numbers else 0
                                if 0 <= cand_idx < len(votes):
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
    print("Extracting Gangavalli 2024 with Column Mapping")
    print("=" * 70)
    
    if not PDF_PATH.exists():
        print(f"❌ PDF not found: {PDF_PATH}")
        return
    
    # Load existing data
    existing_data = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            existing_data = json.load(f)
        print(f"📊 Loaded existing data: {len(existing_data.get('results', {}))} booths")
    
    candidates = existing_data.get('candidates', [])
    print(f"   Candidates: {len(candidates)}")
    
    # Extract with mapping
    print(f"\n📥 Extracting from PDF with column mapping...")
    extracted_results = extract_booth_data_with_mapping()
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
    
    # Merge
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
    existing_data['source'] = 'Tamil Nadu CEO - Form 20 (extracted with official totals column mapping)'
    
    # Save
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Summary:")
    print(f"   Winner: {winner_cand['name']} ({winner_cand['party']}) - {winner_votes:,} votes")
    print(f"   Runner-up: {runner_up_cand['name']} ({runner_up_cand['party']}) - {runner_up_votes:,} votes")
    print(f"   Total votes: {total_votes:,}")
    print(f"\n💾 Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
