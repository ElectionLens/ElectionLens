#!/usr/bin/env python3
"""Extract Gangavalli 2024 with correct column order using official totals."""

import json
import pdfplumber
import re
from pathlib import Path

PDF_PATH = Path("/Users/p0s097d/Desktop/AC081.pdf")
OUTPUT_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2024.json")

# Official totals from the PDF (from the totals row you provided)
# Row: 226571 72235 77483 403 11108 404 95 77 10612 135 94 419 110 72 121 421 584 356 273 50 58 72 175182 0 1311 176493 5
# First number (226571) is total electors, rest are candidate votes
OFFICIAL_TOTALS = [
    72235,  # Index 0 - ADMK (KUMARAGURU R)
    77483,  # Index 1 - DMK (MALAIYARASAN D)
    403,    # Index 2 - BSP (JEEVANRAJ N)
    11108,  # Index 3 - PMK (DEVADASS RAMASAMY)
    404,    # Index 4 - IND (PRABU C)
    95,     # Index 5 - IND (BALAKRISHNAN P)
    77,     # Index 6 - NADLMMKLK (VENKATRAMAN J)
    10612,  # Index 7 - NTK (JAGADESAN A)
    135,    # Index 8 - IND (SUBRAMANIAN R K)
    94,     # Index 9 - IND (KAMALAKANNAN M)
    419,    # Index 10 - IND (KUMARAGURU N)
    110,    # Index 11 - IND (GOVINDARAJ S R)
    72,     # Index 12 - IND (SIGAMANI A)
    121,    # Index 13 - IND (ARUL INIYAN A)
    421,    # Index 14 - IND (MURUGESAN M)
    584,    # Index 15 - IND (PALANIYAMMAL S - DMSK)
    356,    # Index 16 - IND (MAYILAMPARAI MARI A)
    273,    # Index 17 - IND (NATTANMAI GUNASEKARANA A.S - AMM)
    50,     # Index 18 - IND (RAJASEKAR K)
    58,     # Index 19 - IND (JAYABAL PM)
    72,     # Index 20 - IND (RAJAMANICKAM C)
]

def reverse_text(text):
    """Reverse text (Tamil text in PDF is reversed)."""
    if not text:
        return ""
    return text[::-1].strip()

def extract_booth_data():
    """Extract booth data with correct column mapping."""
    results = {}
    
    print(f"📄 Opening PDF: {PDF_PATH}")
    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"   Pages: {len(pdf.pages)}")
        
        # Extract from all pages
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            
            for table in tables:
                if not table or len(table) < 5:
                    continue
                
                # Process data rows (skip header rows, usually first 5-6 rows)
                for row_idx in range(5, len(table)):
                    row = table[row_idx]
                    if not row or len(row) < 10:
                        continue
                    
                    # Extract booth number (usually in first 2 columns)
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
                    
                    # Extract votes starting from column 4 (PDF columns 4-24 = candidate votes)
                    votes = []
                    for col_idx in range(4, min(25, len(row))):
                        cell = row[col_idx]
                        if cell:
                            numbers = re.findall(r'\b(\d+)\b', str(cell))
                            vote = int(numbers[0]) if numbers else 0
                            votes.append(vote)
                        else:
                            votes.append(0)
                    
                    # Ensure we have 21 votes
                    while len(votes) < 21:
                        votes.append(0)
                    votes = votes[:21]
                    
                    total = sum(votes)
                    if 20 <= total <= 3000:  # Reasonable booth size
                        booth_id = f"TN-081-{booth_no:03d}"
                        if booth_id not in results:  # Avoid duplicates
                            results[booth_id] = {
                                "votes": votes,
                                "total": total,
                                "rejected": 0
                            }
    
    return results

def validate_and_fix_column_order(results, official_totals):
    """Validate extracted totals and fix column order if needed."""
    # Calculate current totals
    current_totals = [0] * 21
    for booth_data in results.values():
        votes = booth_data.get("votes", [])
        for i, v in enumerate(votes):
            if i < len(current_totals):
                current_totals[i] += v
    
    print(f"\n📊 Extracted totals (first 5):")
    for i in range(5):
        print(f"   Index {i}: {current_totals[i]:,} (official: {OFFICIAL_TOTALS[i]:,})")
    
    # Check if we need to swap DMK and ADMK (indices 0 and 1)
    # Official: Index 0 = ADMK (72235), Index 1 = DMK (77483)
    # But candidates array has: Index 0 = DMK, Index 1 = ADMK
    # So we need to swap indices 0 and 1
    
    if abs(current_totals[0] - OFFICIAL_TOTALS[1]) < abs(current_totals[0] - OFFICIAL_TOTALS[0]):
        print(f"\n🔄 Swapping indices 0 and 1 (DMK and ADMK)...")
        for booth_id, booth_data in results.items():
            votes = booth_data.get("votes", [])
            if len(votes) > 1:
                temp = votes[0]
                votes[0] = votes[1]
                votes[1] = temp
                booth_data["votes"] = votes
        
        # Recalculate
        current_totals = [0] * 21
        for booth_data in results.values():
            votes = booth_data.get("votes", [])
            for i, v in enumerate(votes):
                if i < len(current_totals):
                    current_totals[i] += v
        
        print(f"   After swap:")
        print(f"   Index 0 (DMK): {current_totals[0]:,} (official: {OFFICIAL_TOTALS[1]:,})")
        print(f"   Index 1 (ADMK): {current_totals[1]:,} (official: {OFFICIAL_TOTALS[0]:,})")
    
    return results

def main():
    print("=" * 70)
    print("Extracting Gangavalli 2024 with Correct Column Order")
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
    
    # Extract from PDF
    print(f"\n📥 Extracting from PDF...")
    extracted_results = extract_booth_data()
    print(f"   Extracted {len(extracted_results)} booths")
    
    # Validate and fix column order
    extracted_results = validate_and_fix_column_order(extracted_results, OFFICIAL_TOTALS)
    
    # Merge with existing data
    if 'results' not in existing_data:
        existing_data['results'] = {}
    
    updated = 0
    new = 0
    for booth_id, result in extracted_results.items():
        existing_data['results'][booth_id] = result
        if booth_id in existing_data['results']:
            updated += 1
        else:
            new += 1
    
    # Calculate final totals
    candidates = existing_data.get('candidates', [])
    ac_totals = [0] * len(candidates)
    for booth_data in existing_data['results'].values():
        votes = booth_data.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(ac_totals):
                ac_totals[i] += v
    
    total_votes = sum(ac_totals)
    
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
    
    # Update postal section
    if 'postal' in existing_data and 'candidates' in existing_data['postal']:
        for postal_cand in existing_data['postal']['candidates']:
            for i, cand in enumerate(candidates):
                if cand.get('name') == postal_cand.get('name') and cand.get('party') == postal_cand.get('party'):
                    postal_cand['booth'] = ac_totals[i]
                    break
    
    existing_data['year'] = 2024
    existing_data['totalBooths'] = len(existing_data['results'])
    existing_data['source'] = 'Tamil Nadu CEO - Form 20 (extracted from AC081.pdf with official totals validation)'
    
    # Save
    print(f"\n💾 Saving results...")
    print(f"   Updated: {updated} booths")
    print(f"   New: {new} booths")
    print(f"   Total: {len(existing_data['results'])} booths")
    
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Final totals:")
    print(f"   DMK (index 0): {ac_totals[0]:,} votes")
    print(f"   ADMK (index 1): {ac_totals[1]:,} votes")
    print(f"   Winner: {winner_cand['name']} ({winner_cand['party']}) - {winner_votes:,} votes")
    print(f"   Runner-up: {runner_up_cand['name']} ({runner_up_cand['party']}) - {runner_up_votes:,} votes")
    print(f"\n💾 Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
