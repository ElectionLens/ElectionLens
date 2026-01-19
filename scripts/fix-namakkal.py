#!/usr/bin/env python3
"""
Fix Namakkal (TN-094) booth data - candidate mapping is wrong.

The votes array is in PDF column order, but the candidates list is in 
official result order (sorted by total votes). We need to reorder the
votes to match the candidates list.
"""

import json
import subprocess
import re
from pathlib import Path

def extract_pdf_candidates(pdf_path):
    """Extract candidate names in PDF column order."""
    result = subprocess.run(['pdftotext', '-raw', str(pdf_path), '-'],
                           capture_output=True, text=True, timeout=60)
    text = result.stdout
    
    lines = text.split('\n')
    
    # Find candidate names at the start
    candidates = []
    for i, line in enumerate(lines[:100]):
        line = line.strip()
        if not line:
            continue
        # Stop at party names or numbers
        if any(x in line for x in ['Party', 'Independent', '2 3 4', 'FORM 20']):
            break
        # Candidate names are usually ALL CAPS with initials
        if re.match(r'^[A-Z][A-Z\.\s]+$', line) and len(line) > 3:
            candidates.append(line.replace('.', ' ').strip())
    
    return candidates

def normalize_name(name):
    """Normalize candidate name for matching."""
    name = name.upper()
    name = re.sub(r'[^\w\s]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def main():
    pdf_path = Path.home() / "Desktop" / "TNLA_2021_PDFs" / "AC094.pdf"
    json_path = Path("public/data/booths/TN/TN-094/2021.json")
    
    # Get PDF candidate order
    pdf_candidates = extract_pdf_candidates(pdf_path)
    print(f"PDF candidates ({len(pdf_candidates)}):")
    for i, c in enumerate(pdf_candidates[:10]):
        print(f"  {i}: {c}")
    
    # Load JSON data
    with open(json_path) as f:
        data = json.load(f)
    
    json_candidates = data['candidates']
    print(f"\nJSON candidates ({len(json_candidates)}):")
    for i, c in enumerate(json_candidates[:10]):
        print(f"  {i}: {c['name']} ({c['party']})")
    
    # Create mapping from PDF index to JSON index
    pdf_to_json = {}
    for pdf_idx, pdf_name in enumerate(pdf_candidates):
        pdf_norm = normalize_name(pdf_name)
        best_match = -1
        best_score = 0
        
        for json_idx, json_cand in enumerate(json_candidates):
            json_norm = normalize_name(json_cand['name'])
            
            # Check if names match (allowing for partial match)
            if pdf_norm == json_norm:
                best_match = json_idx
                best_score = 100
                break
            
            # Partial match - check if main name part matches
            pdf_parts = pdf_norm.split()
            json_parts = json_norm.split()
            
            # Check last name (usually the main identifier)
            if pdf_parts and json_parts:
                if pdf_parts[0] == json_parts[0]:  # First name match
                    if best_score < 50:
                        best_match = json_idx
                        best_score = 50
        
        if best_match >= 0:
            pdf_to_json[pdf_idx] = best_match
            if pdf_idx < 10:
                print(f"  PDF {pdf_idx} ({pdf_name}) -> JSON {best_match} ({json_candidates[best_match]['name']})")
    
    print(f"\nMapping created: {len(pdf_to_json)} of {len(pdf_candidates)} candidates")
    
    # Reorder votes in each booth
    results = data.get('results', {})
    num_candidates = len(json_candidates)
    
    fixed_count = 0
    for booth_id, booth_data in results.items():
        old_votes = booth_data.get('votes', [])
        new_votes = [0] * num_candidates
        
        for pdf_idx, vote in enumerate(old_votes):
            if pdf_idx in pdf_to_json:
                json_idx = pdf_to_json[pdf_idx]
                if json_idx < num_candidates:
                    new_votes[json_idx] = vote
        
        booth_data['votes'] = new_votes
        fixed_count += 1
    
    print(f"Fixed {fixed_count} booths")
    
    # Verify - count booth winners
    dmk_wins = 0
    admk_wins = 0
    for booth_id, booth_data in results.items():
        votes = booth_data.get('votes', [])
        if len(votes) >= 2:
            if votes[0] > votes[1]:
                dmk_wins += 1
            else:
                admk_wins += 1
    
    print(f"\nAfter fix:")
    print(f"  DMK wins: {dmk_wins}")
    print(f"  ADMK wins: {admk_wins}")
    
    # Save
    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\nSaved to {json_path}")

if __name__ == "__main__":
    main()
