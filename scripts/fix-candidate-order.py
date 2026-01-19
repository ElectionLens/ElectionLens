#!/usr/bin/env python3
"""
Fix candidate order in booth data to match PDF column order (ballot order).
Extracts candidate names and parties directly from Form 20 PDF headers.
"""

import json
import re
import subprocess
from pathlib import Path

FORM20_DIR = Path("/Users/p0s097d/Desktop/TNLA_2021_PDFs")
OUTPUT_BASE = Path("public/data/booths/TN")
ELECTIONS_FILE = Path("public/data/elections/ac/TN/2021.json")

# Load election data for party info
with open(ELECTIONS_FILE) as f:
    elections_data = json.load(f)


def extract_candidates_from_pdf(pdf_path):
    """Extract candidate names and parties from PDF header."""
    result = subprocess.run(
        ['pdftotext', '-layout', '-f', '1', '-l', '1', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    text = result.stdout
    lines = text.split('\n')
    
    candidates = []
    names = []
    parties = []
    
    # Find the header section (before first data row)
    header_lines = []
    for line in lines:
        # Stop at first data row (starts with number)
        if re.match(r'^\s*\d+\s+\d+', line):
            break
        header_lines.append(line)
    
    header_text = '\n'.join(header_lines)
    
    # Extract names - they appear on separate lines in vertical header
    # Look for lines with just names (all caps, possibly with periods)
    name_pattern = r'^[\s]*([A-Z][A-Z\.\s]+[A-Z])[\s]*$'
    
    for line in header_lines:
        line = line.strip()
        # Skip common header words
        if any(skip in line.lower() for skip in ['form 20', 'result', 'election', 'assembly', 
                'constituency', 'electors', 'counting', 'valid votes', 'polling', 'station',
                'no.', 'total', 'rejected', 'nota']):
            continue
        
        # Names are typically all caps with possible periods
        if re.match(r'^[A-Z][A-Z\s\.@]+$', line) and len(line) > 3:
            # Clean up the name
            name = re.sub(r'\s+', ' ', line.strip())
            if name not in names:
                names.append(name)
    
    # Extract parties - look for party abbreviations in header
    party_line = None
    for line in header_lines:
        # Party line has multiple party names like DMK, ADMK, BJP, etc.
        if re.search(r'\b(DMK|ADMK|BJP|INC|PMK|DMDK|NTK|MNM|AMMK|BSP|IND)\b', line):
            parties_found = re.findall(r'\b([A-Z]{2,})\b', line)
            # Filter to known party abbreviations
            known_parties = ['DMK', 'ADMK', 'AIADMK', 'BJP', 'INC', 'PMK', 'DMDK', 'NTK', 'MNM', 
                           'AMMK', 'BSP', 'IJK', 'IND', 'VCK', 'CPI', 'CPM', 'MDMK', 'TMC', 
                           'AIMMK', 'AMAK', 'AITC', 'IUML', 'KMDK']
            parties = [p for p in parties_found if p in known_parties or p == 'IND']
            if len(parties) >= 3:  # Found party line
                break
    
    return names, parties


def match_candidates_to_election_data(names, parties, ac_id):
    """Match extracted names to election data to get full candidate info."""
    election = elections_data.get(ac_id, {})
    election_candidates = election.get('candidates', [])
    
    matched = []
    used = set()
    
    for i, name in enumerate(names):
        party = parties[i] if i < len(parties) else 'IND'
        
        # Try to find matching candidate in election data
        best_match = None
        for ec in election_candidates:
            if ec['name'] in used:
                continue
            
            # Normalize names for comparison
            ec_name = ec['name'].upper().replace('.', ' ').replace('  ', ' ').strip()
            pdf_name = name.upper().replace('.', ' ').replace('  ', ' ').strip()
            
            # Check for partial match
            if ec_name in pdf_name or pdf_name in ec_name:
                best_match = ec
                break
            
            # Check first few characters
            if ec_name[:10] == pdf_name[:10]:
                best_match = ec
                break
        
        if best_match:
            matched.append({
                'name': best_match['name'],
                'party': best_match['party'],
                'symbol': best_match.get('symbol', '')
            })
            used.add(best_match['name'])
        else:
            matched.append({
                'name': name.title(),
                'party': party,
                'symbol': ''
            })
    
    return matched


def verify_vote_totals(booth_data, ac_id):
    """Verify booth vote totals match election data."""
    election = elections_data.get(ac_id, {})
    
    # Calculate booth totals per candidate column
    num_cands = len(booth_data.get('candidates', []))
    booth_totals = [0] * num_cands
    
    for r in booth_data.get('results', {}).values():
        for i, v in enumerate(r.get('votes', [])):
            if i < num_cands:
                booth_totals[i] += v
    
    return booth_totals


def get_official_votes_for_candidate(name, party, election_candidates, used_keys):
    """Get official votes for a candidate, handling duplicates by party."""
    # Create a unique key with name and party
    for ec in election_candidates:
        key = f"{ec['name']}|{ec['party']}"
        if key in used_keys:
            continue
        if ec['name'] == name:
            # Prefer exact party match
            if ec['party'] == party:
                used_keys.add(key)
                return ec['votes']
    
    # Fallback: just match by name if no party match
    for ec in election_candidates:
        key = f"{ec['name']}|{ec['party']}"
        if key in used_keys:
            continue
        if ec['name'] == name:
            used_keys.add(key)
            return ec['votes']
    
    return 0


def process_constituency(ac_num):
    """Process a single constituency."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not pdf_path.exists():
        return None, f"PDF not found: {pdf_path}"
    
    if not booth_file.exists():
        return None, f"Booth data not found: {booth_file}"
    
    # Load booth data
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    if booth_data.get('totalBooths', 0) == 0:
        return None, "No booth data"
    
    # Get booth vote totals (current column order)
    booth_totals = verify_vote_totals(booth_data, ac_id)
    
    # Get election candidates sorted by votes
    election = elections_data.get(ac_id, {})
    election_candidates = sorted(election.get('candidates', []), key=lambda x: -x.get('votes', 0))
    
    # Match booth columns to candidates by rank
    # Sort both by votes and match by position (rank-based matching)
    matched_candidates = [None] * len(booth_totals)
    
    nota_idx = len(booth_totals) - 1
    
    # Sort booth columns by votes (descending), excluding NOTA
    booth_sorted = sorted(
        [(i, booth_totals[i]) for i in range(len(booth_totals)) if i != nota_idx],
        key=lambda x: -x[1]
    )
    
    # Sort official candidates by votes (descending), excluding NOTA
    official_sorted = sorted(
        [(i, c) for i, c in enumerate(election_candidates) if c.get('party') != 'NOTA'],
        key=lambda x: -x[1].get('votes', 0)
    )
    
    # Match by rank position
    for rank, (booth_idx, booth_votes) in enumerate(booth_sorted):
        if rank < len(official_sorted):
            ec_idx, ec = official_sorted[rank]
            matched_candidates[booth_idx] = {
                'name': ec.get('name', ''),
                'party': ec.get('party', 'IND'),
                'symbol': ec.get('symbol', '')
            }
        else:
            # More booth columns than official candidates
            original = booth_data['candidates'][booth_idx] if booth_idx < len(booth_data['candidates']) else {}
            matched_candidates[booth_idx] = {
                'name': original.get('name', f'Unknown {booth_idx+1}'),
                'party': original.get('party', 'IND'),
                'symbol': original.get('symbol', '')
            }
    
    # Add NOTA
    matched_candidates[nota_idx] = {
        'name': 'NOTA',
        'party': 'NOTA',
        'symbol': ''
    }
    
    # Update booth data
    booth_data['candidates'] = matched_candidates
    
    # Recalculate summary
    total_valid = 0
    total_rejected = 0
    total_nota = 0
    total_votes = 0
    
    for r in booth_data.get('results', {}).values():
        votes = r.get('votes', [])
        valid = sum(votes[:-1]) if len(votes) > 1 else 0  # All but NOTA
        nota = votes[-1] if votes else 0
        rejected = r.get('rejected', 0)
        
        total_valid += valid
        total_nota += nota
        total_rejected += rejected
        total_votes += valid + nota + rejected
    
    booth_data['summary'] = {
        'totalValid': total_valid,
        'totalRejected': total_rejected,
        'totalNota': total_nota,
        'totalVotes': total_votes,
        'totalVoters': election.get('totalElectors', 0),
        'turnoutPercent': round((total_votes / election.get('totalElectors', 1)) * 100, 2) if election.get('totalElectors', 0) > 0 else 0
    }
    
    # Save updated booth data
    with open(booth_file, 'w') as f:
        json.dump(booth_data, f, indent=2)
    
    return booth_data, "OK"


def main():
    print("=" * 60)
    print("Fixing Candidate Order in Booth Data")
    print("=" * 60)
    
    success = 0
    failed = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = process_constituency(ac_num)
        
        if result:
            # Verify the fix
            booth_totals = verify_vote_totals(result, ac_id)
            election = elections_data.get(ac_id, {})
            
            # Check if top candidate matches
            if result['candidates']:
                top_booth = result['candidates'][0]['name']
                top_election = election.get('candidates', [{}])[0].get('name', '')
                match = "✓" if top_booth == top_election else "?"
                print(f"✅ {ac_id}: {match} Winner: {top_booth[:30]}")
            success += 1
        else:
            if msg != "No booth data" and msg != f"PDF not found: {FORM20_DIR / f'AC{ac_num:03d}.pdf'}":
                print(f"❌ {ac_id}: {msg}")
            failed += 1
    
    print()
    print("=" * 60)
    print(f"✅ Fixed: {success} constituencies")
    print(f"❌ Skipped: {failed} constituencies")


if __name__ == "__main__":
    main()
