#!/usr/bin/env python3
"""
Re-extract 2021 booth data from TEXT-BASED PDFs.
These PDFs have embedded text that can be extracted directly.
"""

import json
import re
import subprocess
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

# Text-based PDFs with issues
TEXT_ACS = [22, 63, 64, 65, 66, 68, 72, 74, 76, 88, 112, 113, 137, 141, 184, 196, 224, 94, 100, 128, 130, 145, 173, 204, 208]


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_text(pdf_path):
    """Extract text using pdftotext with layout preservation."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True, timeout=60
    )
    return result.stdout


def parse_booth_line(line, num_candidates):
    """Parse a line that might contain booth data."""
    # Clean line
    line = re.sub(r'[|,]', ' ', line)
    line = re.sub(r'\s+', ' ', line).strip()
    
    # Extract numbers
    numbers = re.findall(r'\b(\d+)\b', line)
    
    # Need at least: booth_no + candidates + total
    min_nums = num_candidates + 2
    if len(numbers) < min_nums:
        return None
    
    # Try to identify booth number (should be 1-500 range)
    for start_idx in range(min(3, len(numbers))):
        try:
            booth_no = int(numbers[start_idx])
            if not (1 <= booth_no <= 500):
                continue
            
            # Get remaining numbers as votes
            remaining = [int(n) for n in numbers[start_idx + 1:]]
            
            # Need enough for candidates + totals
            if len(remaining) < num_candidates:
                continue
            
            # Candidate votes
            candidate_votes = remaining[:num_candidates]
            
            # Total should be roughly sum of votes
            vote_sum = sum(candidate_votes)
            
            # Look for total in remaining numbers
            total = vote_sum
            rejected = 0
            for v in remaining[num_candidates:]:
                if abs(v - vote_sum) <= 10:
                    total = v
                elif v < 100:
                    rejected = v
            
            return {
                'booth_no': str(booth_no),
                'votes': candidate_votes,
                'total': total,
                'rejected': rejected
            }
        except (ValueError, IndexError):
            continue
    
    return None


def process_ac(ac_num, official_data):
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    official = official_data.get(ac_id, {})
    ac_name = official.get('constituencyName', '')
    candidates = official.get('candidates', [])
    num_candidates = len(candidates)
    
    # Add NOTA if not present
    has_nota = any(c.get('party') == 'NOTA' for c in candidates)
    if not has_nota:
        num_candidates += 1
    
    print(f"\n📍 {ac_id} - {ac_name}")
    print(f"   {num_candidates} candidates")
    
    # Extract text
    text = extract_text(pdf_path)
    
    # Parse lines
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Skip obvious headers
        if any(x in line.lower() for x in ['polling', 'station', 'sl.no', 'candidate', 'form 20', 'valid votes']):
            continue
        
        parsed = parse_booth_line(line, num_candidates)
        if parsed:
            booth_id = f"{ac_id}-{parsed['booth_no']}"
            if booth_id not in results:
                results[booth_id] = {
                    'votes': parsed['votes'],
                    'total': parsed['total'],
                    'rejected': parsed['rejected']
                }
    
    print(f"   {len(results)} booths extracted")
    
    # Validate against official
    if results:
        col_sums = [0] * num_candidates
        for r in results.values():
            for i, v in enumerate(r.get('votes', [])):
                if i < len(col_sums):
                    col_sums[i] += v
        
        # Check top 2 candidates
        issues = 0
        for i in range(min(2, len(candidates))):
            oc = candidates[i]
            official_votes = oc.get('votes', 0)
            extracted = col_sums[i] if i < len(col_sums) else 0
            ratio = extracted / official_votes if official_votes > 0 else 0
            status = "✓" if 0.9 <= ratio <= 1.1 else "✗"
            if not (0.9 <= ratio <= 1.1):
                issues += 1
            print(f"   {status} {oc.get('party', '?'):8}: {extracted:>8,} / {official_votes:>8,} ({ratio:.2f}x)")
        
        return results, candidates, issues == 0
    
    return None, candidates, False


def save_results(ac_id, ac_name, results, candidates):
    """Save results to JSON."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cands_out = []
    for i, c in enumerate(candidates):
        cands_out.append({
            'slNo': i + 1,
            'name': c.get('name', f'Candidate {i+1}'),
            'party': c.get('party', 'IND'),
            'symbol': c.get('symbol', '')
        })
    
    if not any(c['party'] == 'NOTA' for c in cands_out):
        cands_out.append({
            'slNo': len(cands_out) + 1,
            'name': 'NOTA',
            'party': 'NOTA',
            'symbol': 'NOTA'
        })
    
    output = {
        'acId': ac_id,
        'acName': ac_name,
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(results),
        'source': 'Tamil Nadu CEO - Form 20 (Re-extracted)',
        'candidates': cands_out,
        'results': results
    }
    
    output_file = output_dir / '2021.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    return output_file


def main():
    import sys
    
    print("=" * 60)
    print("2021 Text PDF Re-extraction")
    print("=" * 60)
    
    official = load_official()
    
    # Get ACs to process
    if len(sys.argv) > 1:
        acs = [int(sys.argv[1])]
    else:
        acs = TEXT_ACS
    
    print(f"\n🚀 Processing {len(acs)} text-based PDFs...")
    
    success = 0
    partial = 0
    failed = []
    
    for ac_num in acs:
        ac_id = f"TN-{ac_num:03d}"
        official_ac = official.get(ac_id, {})
        
        result = process_ac(ac_num, official)
        
        if result[0]:
            results, candidates, valid = result
            output_file = save_results(ac_id, official_ac.get('constituencyName', ''), results, candidates)
            
            if valid:
                success += 1
            else:
                partial += 1
        else:
            failed.append(ac_num)
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ Success: {success}")
    print(f"⚠️ Partial: {partial}")
    print(f"❌ Failed: {len(failed)} - {failed}")


if __name__ == "__main__":
    main()
