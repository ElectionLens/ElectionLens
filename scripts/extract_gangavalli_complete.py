#!/usr/bin/env python3
"""Complete extraction of Gangavalli 2024 with correct column mapping."""

import json
import pdfplumber
import re
from pathlib import Path

PDF_PATH = Path("/Users/p0s097d/Desktop/AC081.pdf")
OUTPUT_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2024.json")

# Column mapping: PDF Column -> Candidate Index
# Based on official totals row: 72235 77483 403 11108 404 95 77 10612...
# PDF Col 4 (72235) = ADMK = Candidate Index 1
# PDF Col 5 (77483) = DMK = Candidate Index 0
COLUMN_MAPPING = {
    4: 1,   # ADMK (KUMARAGURU R)
    5: 0,   # DMK (MALAIYARASAN D)
    6: 6,   # BSP (JEEVANRAJ N)
    7: 3,   # PMK (DEVADASS RAMASAMY)
    8: 4,   # IND (PRABU C)
    9: 5,   # IND (BALAKRISHNAN P)
    10: 13, # NADLMMKLK (VENKATRAMAN J)
    11: 2,  # NTK (JAGADESAN A)
    12: 11, # IND (SUBRAMANIAN R K)
    13: 14, # IND (KAMALAKANNAN M)
    14: 9,  # IND (KUMARAGURU N)
    15: 16, # IND (GOVINDARAJ S R)
    16: 17, # IND (SIGAMANI A)
    17: 12, # IND (ARUL INIYAN A)
    18: 10, # IND (MURUGESAN M)
    19: 15, # DMSK (PALANIYAMMAL S)
    20: 7,  # IND (MAYILAMPARAI MARI A)
    21: 8,  # AMM (NATTANMAI GUNASEKARANA A.S)
    22: 18, # IND (RAJASEKAR K)
    23: 19, # IND (JAYABAL PM)
    24: 20, # IND (RAJAMANICKAM C)
}

def extract_all_booths():
    """Extract all booths with correct column mapping."""
    results = {}
    
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
                
                # Process all data rows (skip first 5 header rows)
                for row_idx in range(5, len(table)):
                    row = table[row_idx]
                    if not row or len(row) < 10:
                        continue
                    
                    # Skip totals rows
                    row_text = ' '.join([str(cell) for cell in row[:5] if cell])
                    if 'Total' in row_text or 'total' in row_text.lower() or 'Polled' in row_text:
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
                    votes = [0] * 21
                    for pdf_col, cand_idx in COLUMN_MAPPING.items():
                        if pdf_col < len(row):
                            cell = row[pdf_col]
                            if cell:
                                numbers = re.findall(r'\b(\d+)\b', str(cell))
                                if numbers:
                                    try:
                                        vote = int(numbers[0])
                                        if 0 <= cand_idx < len(votes) and vote <= 2000:
                                            votes[cand_idx] = vote
                                    except ValueError:
                                        pass
                    
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
    print("Complete Gangavalli 2024 Extraction")
    print("=" * 70)
    
    if not PDF_PATH.exists():
        print(f"❌ PDF not found: {PDF_PATH}")
        return
    
    # Load existing data
    with open(OUTPUT_FILE) as f:
        existing_data = json.load(f)
    
    candidates = existing_data.get('candidates', [])
    print(f"📊 Candidates: {len(candidates)}")
    
    # Extract
    print(f"\n📥 Extracting all booths...")
    extracted_results = extract_all_booths()
    print(f"   Extracted {len(extracted_results)} booths")
    
    # Calculate totals
    ac_totals = [0] * len(candidates)
    for booth_data in extracted_results.values():
        votes = booth_data.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(ac_totals):
                ac_totals[i] += v
    
    total_votes = sum(ac_totals)
    
    print(f"\n📊 Extracted totals vs Official:")
    print(f"   DMK (index 0): {ac_totals[0]:,} (official: 77,483)")
    print(f"   ADMK (index 1): {ac_totals[1]:,} (official: 72,235)")
    print(f"   NTK (index 2): {ac_totals[2]:,} (official: 10,612)")
    print(f"   PMK (index 3): {ac_totals[3]:,} (official: 11,108)")
    print(f"   Total: {total_votes:,} (official: ~175,182)")
    
    # Update data
    existing_data['results'] = extracted_results
    
    # Update summary
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
    existing_data['source'] = 'Tamil Nadu CEO - Form 20 (extracted with correct column mapping)'
    
    # Save
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)
    
    # Count ADMK booth wins
    admk_wins = 0
    for booth_data in extracted_results.values():
        votes = booth_data.get('votes', [])
        if len(votes) > 1:
            # Check all votes excluding NOTA (if present)
            votes_to_check = votes[:21] if len(votes) >= 21 else votes
            max_votes = max(votes_to_check) if votes_to_check else 0
            if votes[1] == max_votes:  # ADMK is at index 1
                admk_wins += 1
    
    print(f"\n✅ Summary:")
    print(f"   Winner: {winner_cand['name']} ({winner_cand['party']}) - {winner_votes:,} votes")
    print(f"   Runner-up: {runner_up_cand['name']} ({runner_up_cand['party']}) - {runner_up_votes:,} votes")
    print(f"   Margin: {margin:,} ({margin_percent:.2f}%)")
    print(f"   ADMK booth wins: {admk_wins}")
    print(f"\n💾 Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
