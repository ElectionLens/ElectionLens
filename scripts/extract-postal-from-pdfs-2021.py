#!/usr/bin/env python3
"""
Extract postal ballot votes from Form 20 PDFs for 2021 elections.

The issue: Postal votes were likely included in booth totals during extraction.
This script extracts postal votes separately from PDFs and updates the data.

Strategy:
1. Extract postal votes from PDF postal ballot sections
2. Subtract postal votes from booth totals
3. Update postal data structure
"""

import json
import re
import subprocess
from pathlib import Path

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def normalize_name(name):
    """Normalize candidate name for matching."""
    if not name:
        return ""
    return ' '.join(name.upper().split())

def extract_postal_from_pdf(pdf_path, ac_id, official_candidates):
    """Extract postal votes from PDF postal ballot section."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    text = result.stdout
    lines = text.split('\n')
    
    postal_data = {
        'candidates': [],
        'totalValid': 0,
        'rejected': 0,
        'nota': 0,
        'total': 0
    }
    
    # Find postal ballot section
    in_postal_section = False
    postal_section_start = -1
    
    for i, line in enumerate(lines):
        if 'Postal Ballot' in line or ('postal' in line.lower() and 'ballot' in line.lower()):
            in_postal_section = True
            postal_section_start = i
            continue
        
        if in_postal_section:
            # Look for candidate lines with postal votes
            # Format varies: "Total Postal Party Candidate" or "Total PostalVotes"
            # Common pattern: numbers followed by party code
            
            # Try to match candidate names and extract postal votes
            for official_cand in official_candidates:
                cand_name_parts = official_cand['name'].upper().split()
                if len(cand_name_parts) == 0:
                    continue
                
                # Check if candidate name appears in this line
                first_name = cand_name_parts[0]
                if first_name in line.upper() and len(first_name) > 2:
                    # Extract numbers from this line
                    numbers = re.findall(r'\b(\d{1,6})\b', line)
                    
                    if len(numbers) >= 2:
                        # Usually: Total PostalVotes or Total Postal
                        # Try different interpretations
                        total_votes = int(numbers[0])
                        postal_votes = int(numbers[1])
                        
                        # Verify: postal should be < total and typically < 5000
                        if postal_votes < total_votes and postal_votes < 5000:
                            # Check if party matches
                            party_upper = official_cand['party'].upper()
                            if party_upper in line.upper():
                                postal_data['candidates'].append({
                                    'name': official_cand['name'],
                                    'party': official_cand['party'],
                                    'postal': postal_votes,
                                    'booth': 0,  # Will be calculated
                                    'total': total_votes
                                })
            
            # Stop if we hit end of postal section
            if 'Total Valid Votes' in line or i > postal_section_start + 50:
                break
    
    # Also try summary table approach
    # Look for summary table at end with format: Total Postal
    summary_match = re.search(
        r'Total\s+Valid\s+Votes\s+(\d+)\s+(\d+)',
        text,
        re.IGNORECASE
    )
    
    if summary_match:
        total_valid = int(summary_match.group(1))
        postal_valid = int(summary_match.group(2))
        postal_data['totalValid'] = postal_valid
    
    return postal_data if postal_data['candidates'] or postal_data['totalValid'] > 0 else None

def update_postal_data(ac_id):
    """Update postal data by extracting from PDF and adjusting booth totals."""
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found"
    
    # Find PDF file
    ac_num = int(ac_id.split('-')[1])
    pdf_file = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_file.exists():
        return None, "PDF not found"
    
    booth_data = load_json(booth_file)
    elections_data = load_json(ELECTION_DATA)
    
    official = elections_data.get(ac_id, {})
    if not official:
        return None, "Official data not found"
    
    official_candidates = official.get('candidates', [])
    
    # Extract postal from PDF
    postal_from_pdf = extract_postal_from_pdf(pdf_file, ac_id, official_candidates)
    
    if not postal_from_pdf:
        return None, "Could not extract postal from PDF"
    
    # Calculate current booth totals
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Match postal candidates to booth candidates
    postal_candidates = []
    total_postal = 0
    
    for pdf_postal in postal_from_pdf.get('candidates', []):
        # Find matching candidate
        for i, cand in enumerate(candidates):
            if (normalize_name(cand['name']) == normalize_name(pdf_postal['name']) and
                cand['party'].upper() == pdf_postal['party'].upper()):
                
                postal_votes = pdf_postal['postal']
                booth_votes = booth_totals[i]
                official_cand = next(
                    (c for c in official_candidates 
                     if normalize_name(c['name']) == normalize_name(cand['name']) 
                     and c['party'].upper() == cand['party'].upper()),
                    None
                )
                
                if official_cand:
                    official_votes = official_cand['votes']
                    
                    # Adjust booth votes: remove postal from booth
                    if booth_votes >= postal_votes:
                        # Reduce booth votes
                        # Distribute reduction across booths
                        total_booths = len(results)
                        if total_booths > 0:
                            per_booth_reduction = postal_votes // total_booths
                            remainder = postal_votes % total_booths
                            
                            booth_list = list(results.items())
                            for j, (booth_id, r) in enumerate(booth_list):
                                votes = r.get('votes', [])
                                if i < len(votes):
                                    votes[i] -= per_booth_reduction
                                    if j < remainder:
                                        votes[i] -= 1
                                    votes[i] = max(0, votes[i])
                                    r['votes'] = votes
                                    r['total'] = sum(votes)
                        
                        # Recalculate booth total
                        new_booth_total = 0
                        for r in results.values():
                            votes = r.get('votes', [])
                            if i < len(votes):
                                new_booth_total += votes[i]
                        
                        # HARD RULE: postal votes must be >= 0
                        postal_votes = max(0, postal_votes)
                        
                        postal_candidates.append({
                            'name': cand['name'],
                            'party': cand['party'],
                            'postal': postal_votes,  # Guaranteed >= 0
                            'booth': new_booth_total,
                            'total': official_votes
                        })
                        total_postal += postal_votes
                break
    
    if total_postal == 0:
        return None, "No postal votes extracted"
    
    # HARD RULE: Validate all postal votes are non-negative before saving
    for cand in postal_candidates:
        if cand.get('postal', 0) < 0:
            raise ValueError(f"HARD RULE VIOLATION: {cand['name']} has negative postal votes: {cand['postal']}")
        # Ensure non-negative (safety check)
        cand['postal'] = max(0, cand.get('postal', 0))
    
    # Update postal data
    postal_data = {
        'candidates': postal_candidates,
        'totalValid': sum(c['postal'] for c in postal_candidates),  # Recalculate after validation
        'rejected': 0,
        'nota': next((c['postal'] for c in postal_candidates if c['party'] == 'NOTA'), 0),
        'total': sum(c['postal'] for c in postal_candidates)
    }
    
    booth_data['postal'] = postal_data
    save_json(booth_file, booth_data)
    
    return postal_data, f"Extracted: {total_postal:,} postal votes"

def main():
    print("=" * 70)
    print("Extracting Postal Votes from PDFs for 2021 Elections")
    print("=" * 70)
    
    if not FORM20_DIR.exists():
        print(f"❌ Form 20 PDF directory not found: {FORM20_DIR}")
        return
    
    extracted = 0
    errors = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = update_postal_data(ac_id)
        
        if result:
            print(f"✅ {ac_id}: {msg}")
            extracted += 1
        else:
            if "not found" not in msg.lower():
                if ac_num % 50 == 0:
                    print(f"⚠️  {ac_id}: {msg}")
                errors += 1
    
    print()
    print("=" * 70)
    print(f"✅ Extracted postal votes: {extracted} constituencies")
    print(f"⚠️  Errors/Skipped: {errors} constituencies")

if __name__ == "__main__":
    main()
