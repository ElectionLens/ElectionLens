#!/usr/bin/env python3
"""
Extract postal ballot data from Form 20 PDFs and add to booth results.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

FORM20_DIR = Path("/Users/p0s097d/Desktop/TNLA_2021_PDFs")
OUTPUT_BASE = Path("public/data/booths/TN")
ELECTIONS_FILE = Path("public/data/elections/ac/TN/2021.json")

# Load election data for reference
with open(ELECTIONS_FILE) as f:
    elections_data = json.load(f)


def extract_postal_from_pdf(pdf_path):
    """Extract postal ballot votes from Form 20 PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    text = result.stdout
    lines = text.split('\n')
    
    postal_votes = {}
    in_postal_section = False
    
    # Find the postal ballot section (after booth totals)
    for i, line in enumerate(lines):
        # Detect postal section start
        if 'Postal Ballot' in line or 'postal ballot' in line.lower():
            in_postal_section = True
            continue
        
        if in_postal_section:
            # Look for lines with: Total Party CandidateName
            # Or: Total PostalVotes Party CandidateName
            
            # Pattern: "126452   1451    DMK    GOVINDARAJAN T.J"
            # Or: "126452" on one line, "1451 DMK GOVINDARAJAN" on next
            
            # Try to extract postal vote lines
            # Format varies, but typically: TotalVotes PostalVotes Party Candidate
            match = re.search(r'(\d+)\s+(DMK|ADMK|AIADMK|BJP|INC|PMK|DMDK|NTK|MNM|AMMK|BSP|IJK|VCK|CPI|CPM|MDMK|IND|AMAK|AITC)\s+([A-Z][A-Z\.\s@]+)', line)
            if match:
                postal = int(match.group(1))
                party = match.group(2)
                name = match.group(3).strip()
                
                # Clean name
                name = re.sub(r'\s+', ' ', name).strip()
                postal_votes[name] = {
                    'postal': postal,
                    'party': party
                }
                continue
            
            # Alternative pattern: just number and party on same line
            match2 = re.search(r'^\s*(\d+)\s+(DMK|ADMK|AIADMK|BJP|INC|PMK|DMDK|NTK|MNM|AMMK|BSP|IJK|VCK|CPI|CPM|MDMK|IND|AMAK|AITC)\s*$', line)
            if match2:
                postal = int(match2.group(1))
                party = match2.group(2)
                # Look for name in next line
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    if re.match(r'^[A-Z]', next_line) and not re.search(r'\d', next_line):
                        name = next_line.strip()
                        postal_votes[name] = {
                            'postal': postal,
                            'party': party
                        }
            
            # Stop if we hit summary totals
            if 'Total Valid Votes' in line or 'No. of Rejected' in line:
                break
    
    # Also extract NOTA postal votes
    nota_match = re.search(r"Votes for 'NOTA'.*?(\d+)\s+(\d+)", text, re.DOTALL)
    if nota_match:
        postal_votes['NOTA'] = {
            'postal': int(nota_match.group(2)) if nota_match.group(2) else int(nota_match.group(1)),
            'party': 'NOTA'
        }
    
    # Extract total postal votes
    total_match = re.search(r'Total Valid Votes.*?(\d+)\s+(\d+)', text, re.DOTALL)
    if total_match:
        postal_votes['_total_valid'] = int(total_match.group(2))
    
    rejected_match = re.search(r'No. of Rejected.*?(\d+)\s+(\d+)', text, re.DOTALL)
    if rejected_match:
        postal_votes['_rejected'] = int(rejected_match.group(2))
    
    return postal_votes


def extract_postal_better(pdf_path, ac_id):
    """Better extraction using candidate vote matching."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    text = result.stdout
    
    # Get election candidates for this AC
    election = elections_data.get(ac_id, {})
    election_candidates = election.get('candidates', [])
    
    postal_data = {
        'candidates': [],
        'totalValid': 0,
        'rejected': 0,
        'nota': 0,
        'total': 0
    }
    
    # Find all numbers that could be postal votes
    # Look for the summary section after "Postal Ballot"
    postal_section = re.search(r'Postal Ballot.*?((?:\d+\s+){3,}.*?Total Votes)', text, re.DOTALL | re.IGNORECASE)
    
    if not postal_section:
        # Try alternative approach - look for two-column totals at end
        # Pattern: booth_total postal_total (for each row)
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            # Look for candidate summary lines with two numbers
            for ec in election_candidates:
                name_parts = ec['name'].upper().split()
                if len(name_parts) > 0:
                    # Check if candidate name is in this line
                    if name_parts[0] in line.upper():
                        # Extract numbers from this and nearby lines
                        numbers = re.findall(r'\b(\d{1,6})\b', line)
                        if len(numbers) >= 2:
                            # First number is total, second might be postal
                            total = int(numbers[0])
                            postal = int(numbers[1]) if len(numbers) > 1 else 0
                            
                            # Verify: booth_votes + postal should equal total
                            booth_votes = total - postal
                            
                            postal_data['candidates'].append({
                                'name': ec['name'],
                                'party': ec['party'],
                                'postal': postal,
                                'total': total
                            })
                            break
    
    # Extract summary totals
    total_valid_match = re.search(r'Total Valid Votes\s*\n?\s*(\d+)\s+(\d+)', text)
    if total_valid_match:
        postal_data['totalValid'] = int(total_valid_match.group(2))
    
    rejected_match = re.search(r'No\. of Rejected Votes\s*\n?\s*(\d+)\s+(\d+)', text)
    if rejected_match:
        postal_data['rejected'] = int(rejected_match.group(2))
    
    nota_match = re.search(r"Votes for 'NOTA'.*?\s*\n?\s*(\d+)\s+(\d+)", text)
    if nota_match:
        postal_data['nota'] = int(nota_match.group(2))
    
    total_match = re.search(r'Total Votes\s*\n?\s*(\d+)\s+(\d+)', text)
    if total_match:
        postal_data['total'] = int(total_match.group(2))
    
    return postal_data


def extract_postal_from_summary(pdf_path, ac_id):
    """Extract postal votes from the summary table at end of PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    text = result.stdout
    lines = text.split('\n')
    
    # Get booth data to know candidate order
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    if not booth_file.exists():
        return None
    
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    candidates = booth_data.get('candidates', [])
    
    postal_data = {
        'candidates': [],
        'totalValid': 0,
        'rejected': 0,
        'nota': 0,
        'total': 0
    }
    
    # Find summary section - look for lines with candidate totals and postal votes
    # The format is typically: TotalVotes PostalVotes Party CandidateName
    found_postal = False
    
    for i, line in enumerate(lines):
        # Skip until we find "Postal Ballot" indicator
        if 'Postal' in line and 'Ballot' in line:
            found_postal = True
            continue
        
        if not found_postal:
            continue
        
        # Look for candidate lines
        for cand in candidates:
            if cand['party'] == 'NOTA':
                continue
            
            # Check if candidate name appears in this line or nearby
            name_upper = cand['name'].upper()
            name_parts = name_upper.split()
            
            # Check if first name or last name is in line
            if any(part in line.upper() for part in name_parts if len(part) > 2):
                # Extract numbers from this line
                numbers = re.findall(r'\b(\d+)\b', line)
                
                if len(numbers) >= 1:
                    # Find the postal vote (usually the smaller number near the party)
                    for j, num in enumerate(numbers):
                        num_val = int(num)
                        # Postal votes are typically < 5000 for most candidates
                        if num_val < 5000 and j > 0:
                            postal_data['candidates'].append({
                                'name': cand['name'],
                                'party': cand['party'],
                                'postal': num_val
                            })
                            break
                    else:
                        # If no small number found, take first number as postal
                        if numbers:
                            postal_data['candidates'].append({
                                'name': cand['name'],
                                'party': cand['party'],
                                'postal': int(numbers[0]) if int(numbers[0]) < 5000 else 0
                            })
        
        # Extract totals
        if 'Total Valid Votes' in line:
            numbers = re.findall(r'\b(\d+)\b', line)
            if len(numbers) >= 2:
                postal_data['totalValid'] = int(numbers[1])
        
        if 'Rejected' in line:
            numbers = re.findall(r'\b(\d+)\b', line)
            if len(numbers) >= 2:
                postal_data['rejected'] = int(numbers[1])
        
        if 'NOTA' in line:
            numbers = re.findall(r'\b(\d+)\b', line)
            if len(numbers) >= 2:
                postal_data['nota'] = int(numbers[1])
        
        if 'Total Votes' in line and 'Valid' not in line:
            numbers = re.findall(r'\b(\d+)\b', line)
            if len(numbers) >= 2:
                postal_data['total'] = int(numbers[1])
    
    return postal_data


def calculate_postal_from_difference(ac_id):
    """Calculate postal votes as difference between official and booth totals.
    
    Only returns postal data if booth coverage is >95% of official votes.
    This ensures we don't show misleading "postal" data when booth extraction failed.
    Postal ballots are typically 1-3% of total votes.
    """
    # Load booth data
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    if not booth_file.exists():
        return None
    
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    # Load official election data
    election = elections_data.get(ac_id, {})
    if not election:
        return None
    
    candidates = booth_data.get('candidates', [])
    if not candidates:
        return None
    
    # Must have actual booth results
    results = booth_data.get('results', {})
    if not results or len(results) == 0:
        return None
    
    election_candidates = {(c['name'], c['party']): c['votes'] for c in election.get('candidates', [])}
    
    # Calculate booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Check coverage - booth votes should be >95% of official for valid postal data
    # Real postal ballots are typically 1-3% of total
    total_booth = sum(booth_totals)
    total_official = sum(c['votes'] for c in election.get('candidates', []))
    
    if total_official == 0:
        return None
    
    coverage = total_booth / total_official
    if coverage < 0.95:
        # Booth data too incomplete, don't calculate postal
        # Postal ballots should be <5% of total
        return None
    
    postal_data = {
        'candidates': [],
        'totalValid': 0,
        'rejected': 0,
        'nota': 0,
        'total': 0
    }
    
    for i, cand in enumerate(candidates):
        key = (cand['name'], cand['party'])
        official_votes = election_candidates.get(key, 0)
        booth_votes = booth_totals[i]
        postal_votes = max(0, official_votes - booth_votes)
        
        postal_data['candidates'].append({
            'name': cand['name'],
            'party': cand['party'],
            'postal': postal_votes,
            'booth': booth_votes,
            'total': official_votes
        })
    
    # Calculate totals
    postal_data['totalValid'] = sum(c['postal'] for c in postal_data['candidates'])
    
    return postal_data


def process_constituency(ac_num):
    """Process a single constituency."""
    ac_id = f"TN-{ac_num:03d}"
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found"
    
    # Load booth data
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    # Calculate postal votes from difference (most reliable)
    postal_data = calculate_postal_from_difference(ac_id)
    
    if not postal_data or not postal_data['candidates']:
        # Remove existing postal data if coverage is too low
        if 'postal' in booth_data:
            del booth_data['postal']
            with open(booth_file, 'w') as f:
                json.dump(booth_data, f, indent=2)
            return None, "Removed bad postal data (coverage <95%)"
        return None, "Booth coverage too low (<95%)"
    
    # Add postal data
    booth_data['postal'] = postal_data
    
    # Save updated booth data
    with open(booth_file, 'w') as f:
        json.dump(booth_data, f, indent=2)
    
    total_postal = sum(c['postal'] for c in postal_data['candidates'])
    
    return postal_data, f"Postal: {total_postal:,} votes"


def main():
    print("=" * 60)
    print("Extracting Postal Ballot Data")
    print("=" * 60)
    
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 234
    
    success = 0
    total_postal = 0
    
    for ac_num in range(start, end + 1):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = process_constituency(ac_num)
        
        if result:
            postal_sum = sum(c['postal'] for c in result['candidates'])
            total_postal += postal_sum
            print(f"✅ {ac_id}: {msg}")
            success += 1
        else:
            if "not found" not in msg:
                print(f"❌ {ac_id}: {msg}")
    
    print()
    print("=" * 60)
    print(f"✅ Processed: {success} constituencies")
    print(f"📮 Total postal votes: {total_postal:,}")


if __name__ == "__main__":
    main()
