#!/usr/bin/env python3
"""
Extract 2024 TN booth data from text-based Form 20 PDFs.
Uses pdftotext for PDFs with embedded text.

Usage:
    python scripts/extract-2024-text.py 34       # Process AC 34
    python scripts/extract-2024-text.py          # Process all ACs with empty votes
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# Configuration
FORM20_DIR = Path.home() / "Desktop" / "GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    """Load PC data and schema."""
    with open(PC_DATA_PATH) as f:
        pc_data = json.load(f)
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id: str, schema: dict) -> tuple:
    """Get PC ID and info for an AC."""
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id, pc_info.get('name', '')
    return None, None


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text using pdftotext -layout."""
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, timeout=60
        )
        return result.stdout if result.returncode == 0 else ""
    except Exception:
        return ""


def extract_pdf_candidates(text: str) -> list:
    """Extract candidate party order from PDF header."""
    # Look for party names in header area
    lines = text.split('\n')
    
    # Party patterns - both abbreviations and full names
    party_patterns = [
        (r'AIADMK|ALL INDIA ANNA DRAVIDA|ANNA DRAVIDA', 'ADMK'),
        (r'DMDK|DESIYA MURPOKKU', 'DMDK'),
        (r'(?<!AI)DMK|DRAVIDA MUNNETRA(?! KAZHAGAM)', 'DMK'),
        (r'NTK|NAAM TAMILAR', 'NTK'),
        (r'PMK|PATTALI MAKKAL', 'PMK'),
        (r'INC|INDIAN NATIONAL CONGRESS', 'INC'),
        (r'BJP|BHARATIYA JANATA', 'BJP'),
        (r'BSP|BAHUJAN SAMAJ', 'BSP'),
        (r'TMC(?:\(M\))?|TAMIZHAGA MURPOKKU', 'TMC(M)'),
        (r'CPI\(M\)|COMMUNIST.*MARXIST', 'CPI(M)'),
        (r'(?<!M)CPI(?!\()|COMMUNIST PARTY OF INDIA(?!\s*\()', 'CPI'),
        (r'\bIND\b|INDEPENDENT', 'IND'),
    ]
    
    import re as regex
    
    # Collect all party mentions across multiple lines
    all_found = []
    
    for line_idx, line in enumerate(lines[:100]):  # Check first 100 lines for header
        upper_line = line.upper()
        used_positions = set()  # Track which positions are already used
        
        for pattern, party_code in party_patterns:
            for match in regex.finditer(pattern, upper_line):
                pos = match.start()
                end = match.end()
                
                # Check if this position overlaps with already found match
                position_range = set(range(pos, end))
                if not position_range & used_positions:
                    all_found.append((pos, party_code, line_idx))
                    used_positions |= position_range
    
    if not all_found:
        return []
    
    # Group by approximate x position - use smaller bucket for better separation
    column_parties = {}
    for pos, party, line_idx in all_found:
        bucket = (pos // 30) * 30  # Smaller bucket for better column separation
        if bucket not in column_parties:
            column_parties[bucket] = []
        column_parties[bucket].append(party)
    
    # Sort by position and take best party for each column
    parties = []
    for bucket in sorted(column_parties.keys()):
        bucket_parties = column_parties[bucket]
        # Prefer major parties over IND
        major_parties = [p for p in bucket_parties if p != 'IND']
        if major_parties:
            parties.append(major_parties[0])
        elif bucket_parties:
            parties.append(bucket_parties[0])
    
    return parties


def create_party_mapping(pdf_parties: list, pc_candidates: list) -> dict:
    """Create mapping from PDF column index to PC candidate index."""
    mapping = {}
    pc_party_idx = {}
    
    # Map PC candidates by party
    for i, c in enumerate(pc_candidates):
        party = c.get('party', 'IND')
        if party not in pc_party_idx:
            pc_party_idx[party] = []
        pc_party_idx[party].append(i)
    
    # Create mapping
    party_used = {}
    for pdf_idx, party in enumerate(pdf_parties):
        if party in pc_party_idx:
            # Get next unused PC candidate with same party
            used_count = party_used.get(party, 0)
            if used_count < len(pc_party_idx[party]):
                pc_idx = pc_party_idx[party][used_count]
                mapping[pdf_idx] = pc_idx
                party_used[party] = used_count + 1
    
    return mapping


def parse_form20_text(text: str, expected_booths: set, num_candidates: int, pc_candidates: list = None) -> dict:
    """
    Parse Form 20 text format.
    Expected format:
    Sl No. | Station No. | [Candidate votes...] | Total Valid | Rejected | NOTA | Total | Tender
    """
    results = {}
    lines = text.split('\n')
    
    # Try to extract PDF candidate order
    pdf_parties = extract_pdf_candidates(text)
    party_mapping = None
    
    if pdf_parties and pc_candidates:
        party_mapping = create_party_mapping(pdf_parties, pc_candidates)
        if party_mapping:
            print(f"  Found party mapping: {len(party_mapping)} candidates matched")
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Skip header/meta lines
        lower = line.lower()
        if any(x in lower for x in ['polling', 'station', 'serial', 'candidate',
                                      'constituency', 'electors', 'form 20', 'counting',
                                      'no. of valid', 'result sheet', 'general election',
                                      'assembly', 'segment', 'votes', 'rejected', 'nota',
                                      'favour', 'tender', 'total']):
            # But allow if it starts with numbers (actual data row)
            if not re.match(r'^\s*\d+\s+\d+\s+', line):
                continue
        
        # Extract all numbers from the line
        nums = re.findall(r'\b(\d+)\b', line)
        
        if len(nums) < 6:  # Need at least Sl, Station, 3+ votes, total
            continue
        
        try:
            # Standard format: Sl No., Station No., then votes
            sl_no = int(nums[0])
            station_no = int(nums[1])
            
            # Serial number should be reasonable
            if sl_no < 1 or sl_no > 700:
                continue
            
            # Station number should be in expected booths
            if station_no not in expected_booths:
                continue
            
            # Extract vote columns (skip sl and station)
            vote_nums = [int(n) for n in nums[2:]]
            
            # Find the candidate votes (before totals)
            # The pattern is: [cand votes...], total_valid, rejected, nota, total, tender
            # Total valid is usually larger than individual votes
            
            votes = []
            for i, v in enumerate(vote_nums):
                # If we hit a large number (likely total), stop
                if v > 2000 and i > 2:
                    break
                if v <= 2000:
                    votes.append(v)
                if len(votes) >= num_candidates:
                    break
            
            if len(votes) < 3:
                continue
            
            # Apply party mapping if available
            if party_mapping:
                reordered_votes = [0] * num_candidates
                for pdf_idx, vote in enumerate(votes):
                    if pdf_idx in party_mapping:
                        pc_idx = party_mapping[pdf_idx]
                        if pc_idx < num_candidates:
                            reordered_votes[pc_idx] = vote
                votes = reordered_votes
            else:
                # Pad if needed
                while len(votes) < num_candidates:
                    votes.append(0)
                votes = votes[:num_candidates]
            
            # Validate vote total is reasonable
            total = sum(votes)
            if not (50 <= total <= 3000):
                continue
            
            booth_id = f"{station_no:03d}"
            if booth_id not in results:
                results[booth_id] = votes
                
        except (ValueError, IndexError):
            continue
    
    return results


def process_ac(ac_num: int, pc_data: dict, schema: dict) -> dict:
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Load metadata
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if not booths_file.exists():
        return {'status': 'no_metadata'}
    
    with open(booths_file) as f:
        meta = json.load(f)
    
    # Load existing results
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
    else:
        data = {
            'acId': ac_id,
            'acName': meta.get('acName', ''),
            'year': 2024,
            'electionType': 'parliament',
            'totalBooths': 0,
            'source': 'Tamil Nadu CEO - Form 20',
            'candidates': [],
            'results': {}
        }
    
    # Get booth numbers that need extraction (have empty votes)
    expected_booths = set()
    for k, v in data.get('results', {}).items():
        if not v.get('votes') or len(v.get('votes', [])) == 0:
            match = re.match(r'^TN-\d{3}-0*(\d+)', k)
            if match:
                expected_booths.add(int(match.group(1)))
    
    if not expected_booths:
        return {'status': 'complete', 'booths': len(data.get('results', {}))}
    
    empty_count = len(expected_booths)
    
    print(f"\n{'='*60}")
    print(f"{ac_id} - {meta.get('acName', '')}")
    print(f"{'='*60}")
    print(f"  Total: {len(data.get('results', {}))} booths")
    print(f"  Needing extraction: {empty_count} booths with empty votes")
    
    # Get PC candidates
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"  ⚠️  Could not find PC for {ac_id}")
        return {'status': 'no_pc'}
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    
    if not candidates:
        print(f"  ⚠️  No candidates found for PC {pc_id}")
        return {'status': 'no_candidates'}
    
    print(f"  PC: {pc_id} ({pc_name}) - {len(candidates)} candidates")
    
    # Update candidates in output
    data['candidates'] = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND')
    } for i, c in enumerate(candidates)]
    
    # Check for PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        print(f"  ❌ PDF not found: {pdf_path}")
        return {'status': 'no_pdf'}
    
    # Extract text
    text = extract_pdf_text(pdf_path)
    num_count = len(re.findall(r'\d+', text))
    
    if num_count < 500:  # Likely scanned PDF
        print(f"  ⚠️  Scanned PDF ({num_count} numbers) - needs OCR")
        return {'status': 'scanned', 'numbers': num_count}
    
    print(f"  Text PDF ({num_count} numbers)")
    
    # Parse text
    extracted = parse_form20_text(text, expected_booths, len(candidates), candidates)
    
    if not extracted:
        print(f"  ❌ No booths extracted from text")
        return {'status': 'no_extraction'}
    
    print(f"  Extracted {len(extracted)} booths")
    
    # Merge results
    new_count = 0
    updated_count = 0
    
    for booth_key, votes in extracted.items():
        full_booth_id = f"{ac_id}-{booth_key}"
        
        if full_booth_id not in data['results']:
            data['results'][full_booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
            new_count += 1
        elif not data['results'][full_booth_id].get('votes'):
            data['results'][full_booth_id]['votes'] = votes
            data['results'][full_booth_id]['total'] = sum(votes)
            updated_count += 1
    
    data['totalBooths'] = len(data['results'])
    data['source'] = 'Tamil Nadu CEO - Form 20'
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"  ✅ Saved: +{new_count} new, {updated_count} updated = {len(data['results'])} total")
    
    # Validate
    validate_extraction(data, candidates)
    
    return {
        'status': 'success',
        'new': new_count,
        'updated': updated_count,
        'total': len(data['results'])
    }


def validate_extraction(data: dict, candidates: list):
    """Validate extracted data against official totals."""
    results = data.get('results', {})
    num_candidates = len(candidates)
    
    vote_totals = [0] * num_candidates
    booths_with_votes = 0
    
    for r in results.values():
        votes = r.get('votes', [])
        if votes and len(votes) > 0:
            booths_with_votes += 1
            for i, v in enumerate(votes):
                if i < num_candidates:
                    vote_totals[i] += v
    
    print(f"\n  Booths with votes: {booths_with_votes}/{len(results)}")
    print(f"  Validation (top 3):")
    for i in range(min(3, num_candidates)):
        off_votes = candidates[i].get('votes', 0)
        extracted = vote_totals[i]
        ratio = extracted / off_votes if off_votes > 0 else 0
        status = "✓" if 0.7 <= ratio <= 1.3 else "✗"
        party = candidates[i].get('party', 'IND')
        print(f"    {status} {party:8}: {extracted:>8,} / {off_votes:>8,} ({ratio:.2f}x)")


def find_acs_needing_extraction() -> list:
    """Find ACs with empty votes."""
    needing = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        results_file = OUTPUT_BASE / ac_id / "2024.json"
        booths_file = OUTPUT_BASE / ac_id / "booths.json"
        
        if not booths_file.exists() or not results_file.exists():
            continue
        
        with open(results_file) as f:
            data = json.load(f)
        
        results = data.get('results', {})
        empty_count = sum(1 for r in results.values() 
                         if not r.get('votes') or len(r.get('votes', [])) == 0)
        
        if empty_count > len(results) * 0.1:  # More than 10% empty
            needing.append((ac_num, len(results), empty_count))
    
    needing.sort(key=lambda x: -x[2])  # Sort by empty count
    return needing


def main():
    pc_data, schema = load_data()
    
    if len(sys.argv) > 1:
        # Process specific AC(s)
        ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
        
        total_new = 0
        total_updated = 0
        
        for ac_num in ac_nums:
            result = process_ac(ac_num, pc_data, schema)
            total_new += result.get('new', 0)
            total_updated += result.get('updated', 0)
        
        print(f"\n{'='*60}")
        print(f"Total: +{total_new} new, {total_updated} updated")
    else:
        # Show status
        needing = find_acs_needing_extraction()
        
        print("=" * 70)
        print("2024 TN Booth Data - Text Extraction")
        print("=" * 70)
        print(f"\nFound {len(needing)} ACs with empty votes:\n")
        
        for ac_num, total, empty in needing[:30]:
            print(f"  TN-{ac_num:03d}: {total} booths, {empty} empty votes")
        
        if len(needing) > 30:
            print(f"  ... and {len(needing) - 30} more")
        
        print(f"\nTo process all, run:")
        print(f"  python scripts/extract-2024-text.py {' '.join(str(n[0]) for n in needing[:10])}")


if __name__ == "__main__":
    main()
