#!/usr/bin/env python3
"""
Re-extract 2021 booth data for ACs with quality issues.
Uses improved parsing and validates against official results.

Usage:
    python scripts/reextract-2021-booths.py [ac_number]
    python scripts/reextract-2021-booths.py  # Process all flagged ACs
"""

import json
import re
import subprocess
import tempfile
from pathlib import Path
from collections import Counter

# Configuration
PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

# Severe issues - need re-extraction
SEVERE_ACS = [22, 33, 34, 35, 63, 64, 65, 66, 68, 72, 74, 76, 88, 112, 113, 137, 141, 184, 196, 224]

# Moderate issues
MODERATE_ACS = [32, 43, 94, 100, 108, 128, 130, 145, 173, 204, 208]


def load_official_data():
    """Load official election results for validation."""
    with open(ELECTION_DATA) as f:
        return json.load(f)


def extract_text_pdftotext(pdf_path):
    """Extract text using pdftotext -layout."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True, timeout=60
    )
    return result.stdout if result.returncode == 0 else ""


def parse_booth_line(line, num_candidates):
    """Parse a single booth line, trying multiple patterns."""
    # Clean line
    line = re.sub(r'[|,]', ' ', line)
    line = re.sub(r'\s+', ' ', line).strip()
    
    numbers = re.findall(r'\b(\d+)\b', line)
    if len(numbers) < num_candidates + 3:  # booth + candidates + total/rejected/nota
        return None
    
    # Try different booth number positions
    for booth_idx in [0, 1]:
        try:
            booth_no = int(numbers[booth_idx])
            if not (1 <= booth_no <= 600):
                continue
            
            # Get vote columns after booth
            vote_start = booth_idx + 1
            votes = [int(n) for n in numbers[vote_start:]]
            
            if len(votes) < num_candidates:
                continue
            
            # Last few columns are usually: total_valid, rejected, nota, grand_total
            # We want candidate votes (including NOTA as last candidate)
            candidate_votes = votes[:num_candidates]
            
            # Find total (should be sum of candidate votes or close to it)
            vote_sum = sum(candidate_votes)
            
            # Look for a number close to vote_sum in remaining columns
            total = vote_sum
            rejected = 0
            for v in votes[num_candidates:]:
                if abs(v - vote_sum) < 10:
                    total = v
                    break
                if v < 100:  # Likely rejected
                    rejected = v
            
            return {
                'booth_no': booth_no,
                'votes': candidate_votes,
                'total': total,
                'rejected': rejected
            }
        except (ValueError, IndexError):
            continue
    
    return None


def extract_ac(ac_num, official_data):
    """Extract booth data for a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        print(f"  ❌ PDF not found: {pdf_path}")
        return None
    
    official = official_data.get(ac_id, {})
    candidates_info = official.get('candidates', [])
    num_candidates = len(candidates_info)
    
    if num_candidates == 0:
        print(f"  ❌ No candidate info for {ac_id}")
        return None
    
    # Add NOTA if not present
    if not any(c.get('party') == 'NOTA' for c in candidates_info):
        num_candidates += 1
    
    print(f"  📄 Extracting text from PDF...")
    text = extract_text_pdftotext(pdf_path)
    
    if not text:
        print(f"  ❌ Failed to extract text")
        return None
    
    # Parse lines
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Skip header lines
        if any(x in line.lower() for x in ['polling', 'station', 'sl.no', 'valid votes', 'candidate']):
            continue
        
        parsed = parse_booth_line(line, num_candidates)
        if parsed:
            booth_id = f"{ac_id}-{parsed['booth_no']}"
            if booth_id not in results:  # Don't overwrite
                results[booth_id] = {
                    'votes': parsed['votes'],
                    'total': parsed['total'],
                    'rejected': parsed['rejected']
                }
    
    # Validate against official totals
    col_sums = [0] * num_candidates
    for r in results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < len(col_sums):
                col_sums[i] += v
    
    # Check deviation for top 2 candidates
    validation_ok = True
    for i, oc in enumerate(candidates_info[:2]):
        official_votes = oc.get('votes', 0)
        extracted_votes = col_sums[i] if i < len(col_sums) else 0
        if official_votes > 0:
            ratio = extracted_votes / official_votes
            if ratio < 0.8 or ratio > 1.2:
                validation_ok = False
                print(f"  ⚠️ Validation warning: {oc.get('party')} - Official {official_votes:,} vs Extracted {extracted_votes:,} ({ratio:.2f}x)")
    
    return {
        'ac_id': ac_id,
        'ac_name': official.get('constituencyName', ''),
        'results': results,
        'candidates': candidates_info,
        'validation_ok': validation_ok,
        'booth_count': len(results)
    }


def save_results(data, ac_id):
    """Save extracted results to JSON."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    candidates = []
    for i, c in enumerate(data['candidates']):
        candidates.append({
            'slNo': i + 1,
            'name': c.get('name', f'Candidate {i+1}'),
            'party': c.get('party', 'IND'),
            'symbol': c.get('symbol', '')
        })
    
    # Add NOTA if not present
    if not any(c['party'] == 'NOTA' for c in candidates):
        candidates.append({
            'slNo': len(candidates) + 1,
            'name': 'NOTA',
            'party': 'NOTA',
            'symbol': 'NOTA'
        })
    
    output = {
        'acId': ac_id,
        'acName': data['ac_name'],
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(data['results']),
        'source': 'Tamil Nadu CEO - Form 20 (Re-extracted)',
        'candidates': candidates,
        'results': data['results']
    }
    
    output_file = output_dir / '2021.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    return output_file


def main():
    import sys
    
    print("=" * 60)
    print("2021 Booth Data Re-extraction")
    print("=" * 60)
    
    official_data = load_official_data()
    
    # Get ACs to process
    if len(sys.argv) > 1:
        acs_to_process = [int(sys.argv[1])]
    else:
        acs_to_process = SEVERE_ACS + MODERATE_ACS
    
    print(f"\n🚀 Processing {len(acs_to_process)} ACs...")
    
    success = 0
    failed = []
    warnings = []
    
    for ac_num in acs_to_process:
        ac_id = f"TN-{ac_num:03d}"
        print(f"\n📍 {ac_id}...")
        
        try:
            data = extract_ac(ac_num, official_data)
            
            if data and data['booth_count'] > 0:
                output_file = save_results(data, ac_id)
                status = "✅" if data['validation_ok'] else "⚠️"
                print(f"  {status} Saved {data['booth_count']} booths → {output_file.name}")
                
                if data['validation_ok']:
                    success += 1
                else:
                    warnings.append(ac_num)
            else:
                print(f"  ❌ No results extracted")
                failed.append(ac_num)
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed.append(ac_num)
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ Success: {success}")
    print(f"⚠️ Warnings: {len(warnings)} - {warnings}")
    print(f"❌ Failed: {len(failed)} - {failed}")


if __name__ == "__main__":
    main()
