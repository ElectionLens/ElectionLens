#!/usr/bin/env python3
"""Fix Gangavalli candidate column order to match PDF structure."""

import json
import pdfplumber
from pathlib import Path

PDF_PATH = Path("/Users/p0s097d/Desktop/AC081.pdf")
DATA_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-081/2024.json")

def reverse_text(text):
    """Reverse text (Tamil text in PDF is reversed)."""
    if not text:
        return ""
    return text[::-1].strip()

def normalize_name(name):
    """Normalize candidate name for matching."""
    if not name:
        return ""
    # Remove dots, extra spaces, convert to uppercase
    name = name.replace(".", "").replace(" ", "").upper()
    return name

def find_pdf_column_order():
    """Find the order of candidates in PDF columns."""
    column_to_candidate = {}
    
    with pdfplumber.open(PDF_PATH) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()
        if not tables:
            return None
        
        table = tables[0]
        
        # Find candidate name row (row 4) and party row (row 5)
        candidate_row = None
        party_row = None
        
        for row_idx in range(min(10, len(table))):
            row = table[row_idx]
            if not row:
                continue
            
            # Row 4 has candidate names
            if row_idx == 4:
                candidate_row = row
            # Row 5 has party names
            if row_idx == 5:
                party_row = row
                break
        
        if not candidate_row or not party_row:
            return None
        
        # Map PDF columns to candidate names and parties
        for col_idx in range(4, min(25, len(candidate_row))):
            name_cell = candidate_row[col_idx]
            party_cell = party_row[col_idx] if col_idx < len(party_row) else None
            
            if name_cell:
                name = normalize_name(reverse_text(str(name_cell)))
                party = ""
                if party_cell:
                    party_text = reverse_text(str(party_cell))
                    # Map party names
                    if "Dravida" in party_text and "Munnetra" in party_text and "All India" not in party_text:
                        party = "DMK"
                    elif "All India" in party_text and "Dravida" in party_text:
                        party = "ADMK"
                    elif "Pattali" in party_text:
                        party = "PMK"
                    elif "Bahujan" in party_text:
                        party = "BSP"
                    elif "Anna Makkal" in party_text:
                        party = "AMM"
                    elif "Naam Tamilar" in party_text or "Naam Tamizhar" in party_text:
                        party = "NTK"
                    elif "Independent" in party_text or "IND" in party_text:
                        party = "IND"
                
                if name:
                    column_to_candidate[col_idx] = {"name": name, "party": party}
    
    return column_to_candidate

def create_column_mapping(pdf_order, candidates):
    """Create mapping from PDF column index to candidate array index."""
    mapping = {}
    
    # Normalize candidate names for matching
    candidate_map = {}
    for idx, cand in enumerate(candidates):
        name = normalize_name(cand.get("name", ""))
        party = cand.get("party", "")
        key = f"{name}_{party}"
        candidate_map[key] = idx
    
    # Match PDF columns to candidates
    for pdf_col, pdf_info in pdf_order.items():
        pdf_name = pdf_info["name"]
        pdf_party = pdf_info["party"]
        
        # Try exact match first
        key = f"{pdf_name}_{pdf_party}"
        if key in candidate_map:
            mapping[pdf_col] = candidate_map[key]
        else:
            # Try name-only match
            for cand_key, cand_idx in candidate_map.items():
                cand_name = cand_key.split("_")[0]
                if pdf_name == cand_name:
                    mapping[pdf_col] = cand_idx
                    break
    
    return mapping

def main():
    print("=" * 70)
    print("Fixing Gangavalli Column Order")
    print("=" * 70)
    
    # Load data
    with open(DATA_FILE) as f:
        data = json.load(f)
    
    candidates = data.get("candidates", [])
    results = data.get("results", {})
    
    print(f"\n📊 Current data: {len(results)} booths, {len(candidates)} candidates")
    
    # Find PDF column order
    print(f"\n🔍 Analyzing PDF structure...")
    pdf_order = find_pdf_column_order()
    
    if not pdf_order:
        print("❌ Could not extract PDF column order")
        return
    
    print(f"   Found {len(pdf_order)} candidate columns in PDF")
    print(f"\n   PDF Column Order (first 5):")
    for col_idx in sorted(pdf_order.keys())[:5]:
        info = pdf_order[col_idx]
        print(f"      Col {col_idx}: {info['name']} ({info['party']})")
    
    # Create mapping
    print(f"\n🔗 Creating column mapping...")
    column_mapping = create_column_mapping(pdf_order, candidates)
    
    print(f"   Mapped {len(column_mapping)} columns")
    print(f"\n   Mapping (first 5):")
    for pdf_col in sorted(column_mapping.keys())[:5]:
        cand_idx = column_mapping[pdf_col]
        cand = candidates[cand_idx]
        print(f"      PDF Col {pdf_col} -> Candidate Index {cand_idx}: {cand['name']} ({cand['party']})")
    
    # Check if we need to reorder
    # PDF columns start at 4, so PDF Col 4 = candidate index 0, etc.
    needs_reorder = False
    for pdf_col in sorted(column_mapping.keys())[:5]:
        expected_idx = pdf_col - 4  # PDF columns start at 4
        actual_idx = column_mapping[pdf_col]
        if expected_idx != actual_idx:
            needs_reorder = True
            break
    
    if not needs_reorder:
        print(f"\n✅ Column order is correct, no changes needed")
        return
    
    print(f"\n🔄 Reordering votes to match candidate array...")
    
    # Reorder votes for each booth
    reordered_count = 0
    for booth_id, booth_data in results.items():
        votes = booth_data.get("votes", [])
        if len(votes) < len(candidates):
            continue
        
        # Create new votes array in correct order
        new_votes = [0] * len(candidates)
        
        # Map PDF columns (starting at 4) to candidate indices
        for pdf_col, cand_idx in column_mapping.items():
            pdf_vote_idx = pdf_col - 4  # PDF columns start at 4, votes array starts at 0
            if 0 <= pdf_vote_idx < len(votes) and 0 <= cand_idx < len(new_votes):
                new_votes[cand_idx] = votes[pdf_vote_idx]
        
        # Copy remaining votes that weren't mapped
        for i in range(len(candidates)):
            if new_votes[i] == 0 and i < len(votes):
                new_votes[i] = votes[i]
        
        booth_data["votes"] = new_votes
        reordered_count += 1
    
    print(f"   Reordered {reordered_count} booths")
    
    # Recalculate totals
    ac_totals = [0] * len(candidates)
    for booth_data in results.values():
        votes = booth_data.get("votes", [])
        for i, v in enumerate(votes):
            if i < len(ac_totals):
                ac_totals[i] += v
    
    print(f"\n📊 New totals after reordering:")
    for i, (cand, votes) in enumerate(zip(candidates[:5], ac_totals[:5])):
        print(f"   {i}. {cand['name']} ({cand['party']}): {votes:,} votes")
    
    # Update summary
    total_votes = sum(ac_totals)
    sorted_candidates = sorted(enumerate(candidates), key=lambda x: ac_totals[x[0]], reverse=True)
    winner_idx, winner_cand = sorted_candidates[0]
    runner_up_idx, runner_up_cand = sorted_candidates[1] if len(sorted_candidates) > 1 else (None, None)
    
    winner_votes = ac_totals[winner_idx]
    runner_up_votes = ac_totals[runner_up_idx] if runner_up_idx is not None else 0
    margin = winner_votes - runner_up_votes
    margin_percent = (margin / total_votes * 100) if total_votes > 0 else 0
    
    data["summary"] = {
        "totalVoters": 0,
        "totalVotes": total_votes,
        "turnoutPercent": 0,
        "winner": {
            "name": winner_cand["name"],
            "party": winner_cand["party"],
            "votes": winner_votes
        },
        "runnerUp": {
            "name": runner_up_cand["name"] if runner_up_cand else "",
            "party": runner_up_cand["party"] if runner_up_cand else "",
            "votes": runner_up_votes
        },
        "margin": margin,
        "marginPercent": margin_percent
    }
    
    # Update postal section
    if "postal" in data and "candidates" in data["postal"]:
        for postal_cand in data["postal"]["candidates"]:
            for i, cand in enumerate(candidates):
                if cand.get("name") == postal_cand.get("name") and cand.get("party") == postal_cand.get("party"):
                    postal_cand["booth"] = ac_totals[i]
                    break
    
    # Save
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Summary updated:")
    print(f"   Winner: {winner_cand['name']} ({winner_cand['party']}) - {winner_votes:,} votes")
    print(f"   Runner-up: {runner_up_cand['name']} ({runner_up_cand['party']}) - {runner_up_votes:,} votes")
    print(f"   Margin: {margin:,} ({margin_percent:.2f}%)")
    print(f"\n💾 Data saved to {DATA_FILE}")

if __name__ == "__main__":
    main()
