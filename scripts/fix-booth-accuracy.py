#!/usr/bin/env python3
"""
Fix booth data accuracy for problematic constituencies.
Re-extracts data from Form 20 PDFs with improved parsing.
"""

import json
import os
import re
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("Installing pdfplumber...")
    os.system("pip install pdfplumber")
    import pdfplumber

# Problematic ACs to fix
POOR_ACCURACY = [
    "TN-006", "TN-065", "TN-070", "TN-073", "TN-115", "TN-120", "TN-123",
    "TN-136", "TN-137", "TN-145", "TN-184", "TN-185", "TN-186", "TN-187",
    "TN-212", "TN-213", "TN-224", "TN-225", "TN-228"
]

MISSING_DATA = [
    "TN-027", "TN-030", "TN-031", "TN-032", "TN-033", "TN-034", "TN-035",
    "TN-040", "TN-043", "TN-044", "TN-046", "TN-047", "TN-049", "TN-108",
    "TN-109", "TN-147", "TN-148"
]

ALL_TO_FIX = POOR_ACCURACY + MISSING_DATA

def reverse_text(text):
    """Reverse mirrored text from PDF."""
    if not text:
        return ""
    return text[::-1].strip()

def ac_id_to_pdf_name(ac_id):
    """Convert TN-006 to AC006.pdf"""
    num = int(ac_id.split('-')[1])
    return f"AC{num:03d}.pdf"

def extract_booth_data(pdf_path, ac_id):
    """Extract booth-wise results from Form 20 PDF."""
    results = {}
    candidates = []
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_booth_rows = []
            candidate_names = []
            party_names = []
            
            for page in pdf.pages:
                tables = page.extract_tables()
                
                for table in tables:
                    if not table or len(table) < 3:
                        continue
                    
                    # Find the header structure
                    for row_idx, row in enumerate(table):
                        if not row:
                            continue
                        
                        # Check if this is candidate names row (row with reversed names)
                        if row_idx == 1 and len(row) > 5:
                            # Extract candidate names
                            for i, cell in enumerate(row[2:22]):  # Candidates in columns 2-21
                                if cell and cell.strip():
                                    name = reverse_text(cell.replace('\n', ' '))
                                    if name and len(candidate_names) < 20:
                                        candidate_names.append(name)
                        
                        # Check if this is party names row
                        if row_idx == 2 and len(row) > 5:
                            for i, cell in enumerate(row[2:22]):
                                if cell and cell.strip():
                                    party = reverse_text(cell.replace('\n', ''))
                                    if party and len(party_names) < 20:
                                        party_names.append(party)
                        
                        # Check if this is a booth data row
                        if row_idx >= 3 and row[1] and str(row[1]).strip().isdigit():
                            try:
                                booth_no = str(row[1]).strip()
                                # Extract votes for each candidate
                                votes = []
                                for i in range(2, min(22, len(row))):
                                    try:
                                        v = int(row[i]) if row[i] and str(row[i]).strip().isdigit() else 0
                                        votes.append(v)
                                    except:
                                        votes.append(0)
                                
                                # Get totals
                                total_valid = int(row[22]) if len(row) > 22 and row[22] and str(row[22]).strip().isdigit() else sum(votes)
                                rejected = int(row[23]) if len(row) > 23 and row[23] and str(row[23]).strip().isdigit() else 0
                                nota = int(row[24]) if len(row) > 24 and row[24] and str(row[24]).strip().isdigit() else 0
                                total = int(row[25]) if len(row) > 25 and row[25] and str(row[25]).strip().isdigit() else total_valid + rejected
                                
                                booth_id = f"{ac_id}-{booth_no}"
                                results[booth_id] = {
                                    "votes": votes[:len(candidate_names)] if candidate_names else votes,
                                    "total": total,
                                    "rejected": rejected
                                }
                            except Exception as e:
                                pass
            
            # Build candidates list
            for i, name in enumerate(candidate_names):
                party = party_names[i] if i < len(party_names) else "IND"
                candidates.append({
                    "name": name,
                    "party": party,
                    "slNo": i + 1
                })
            
            return results, candidates
            
    except Exception as e:
        print(f"  Error: {e}")
        return None, None

def main():
    pdf_dir = Path.home() / "Desktop" / "TNLA_2021_PDFs"
    output_dir = Path("public/data/booths/TN")
    
    # Load existing election data for validation
    with open("public/data/elections/ac/TN/2021.json") as f:
        elections = json.load(f)
    
    print(f"Processing {len(ALL_TO_FIX)} constituencies...")
    
    success = 0
    improved = 0
    failed = []
    
    for ac_id in ALL_TO_FIX:
        pdf_name = ac_id_to_pdf_name(ac_id)
        pdf_path = pdf_dir / pdf_name
        
        if not pdf_path.exists():
            print(f"  {ac_id}: PDF not found ({pdf_name})")
            failed.append((ac_id, "PDF not found"))
            continue
        
        print(f"  {ac_id}: Processing {pdf_name}...", end=" ")
        
        results, candidates = extract_booth_data(pdf_path, ac_id)
        
        if results and len(results) > 0:
            # Validate against official results
            official = elections.get(ac_id, {})
            official_winner_votes = official.get('candidates', [{}])[0].get('votes', 0)
            
            # Calculate booth totals
            candidate_totals = [0] * len(candidates)
            for booth_id, result in results.items():
                for i, v in enumerate(result.get('votes', [])):
                    if i < len(candidate_totals):
                        candidate_totals[i] += v
            
            booth_winner_votes = max(candidate_totals) if candidate_totals else 0
            error_pct = abs(booth_winner_votes - official_winner_votes) / official_winner_votes * 100 if official_winner_votes else 0
            
            # Save updated data
            ac_dir = output_dir / ac_id
            ac_dir.mkdir(parents=True, exist_ok=True)
            
            # Load existing data to preserve metadata
            existing_file = ac_dir / "2021.json"
            if existing_file.exists():
                with open(existing_file) as f:
                    existing = json.load(f)
            else:
                existing = {}
            
            existing['results'] = results
            existing['candidates'] = candidates
            existing['totalBooths'] = len(results)
            
            with open(existing_file, 'w') as f:
                json.dump(existing, f, indent=2)
            
            if error_pct < 10:
                print(f"✓ {len(results)} booths, {error_pct:.1f}% error")
                improved += 1
            else:
                print(f"⚠ {len(results)} booths, {error_pct:.1f}% error (still high)")
            success += 1
        else:
            print("✗ Failed to extract")
            failed.append((ac_id, "Extraction failed"))
    
    print(f"\n✓ Success: {success} ({improved} improved to <10% error)")
    print(f"✗ Failed: {len(failed)}")
    
    if failed:
        print("\nFailed ACs:")
        for ac_id, reason in failed:
            print(f"  {ac_id}: {reason}")

if __name__ == "__main__":
    main()
