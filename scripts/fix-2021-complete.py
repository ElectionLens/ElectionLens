#!/usr/bin/env python3
"""
Complete 2021 re-extraction that properly handles candidate column order.
"""

import json
import re
import subprocess
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

# Party name patterns to identify in PDF headers
PARTY_PATTERNS = {
    'DMK': r'Dravida Munnetra\s*Kazhagam|^DMK$',
    'ADMK': r'All India Anna\s*Dravida|AIADMK|ADMK|A\.I\.A\.D\.M\.K',
    'BJP': r'Bharatiya Janata|BJP',
    'INC': r'Indian National Congress|INC|Congress\s*\(I\)',
    'PMK': r'Pattali Makkal|PMK',
    'NTK': r'Naam Tamilar|NTK',
    'DMDK': r'Desiya Murpokku Dravida|DMDK',
    'CPI': r'Communist Party of India[^(]|^CPI$',
    'CPM': r'Communist Party.*Marxist|CPI\s*\(M\)|CPM',
    'VCK': r'Viduthalai Chiruthaigal|VCK',
    'MNM': r'Makkal Needhi Maiam|MNM',
    'AMMK': r'Amma Makkal|AMMK',
    'BSP': r'Bahujan Samaj|BSP',
}


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_text(pdf_path):
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True, timeout=60
    )
    return result.stdout


def identify_party(text_fragment):
    """Identify party from text fragment."""
    for party, pattern in PARTY_PATTERNS.items():
        if re.search(pattern, text_fragment, re.IGNORECASE):
            return party
    if 'Independent' in text_fragment:
        return 'IND'
    return None


def extract_pdf_column_order(text, num_expected):
    """
    Try to extract the column order of parties from PDF header.
    Returns list of party codes in PDF column order.
    """
    lines = text.split('\n')
    
    # Look for the header section (first 60 lines typically)
    header_text = '\n'.join(lines[:60])
    
    # Find party names
    parties_found = []
    
    for line in lines[:60]:
        for party, pattern in PARTY_PATTERNS.items():
            if re.search(pattern, line, re.IGNORECASE):
                if party not in parties_found:
                    parties_found.append(party)
    
    return parties_found


def parse_booth_rows(text):
    """Extract all booth data rows."""
    results = []
    
    for line in text.split('\n'):
        # Skip header-like lines
        if any(x in line.lower() for x in ['polling', 'station', 'sl.no', 'candidate', 'total']):
            if 'valid' in line.lower():
                continue
        
        # Extract all numbers
        numbers = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
        
        if len(numbers) < 8:
            continue
        
        # First number should be serial (1-600)
        # Second should be booth number (1-500)
        if numbers[0] > 600:
            continue
        
        # Find booth number (should be 1-500)
        booth_no = None
        vote_start = None
        
        for i, n in enumerate(numbers[1:min(4, len(numbers))], 1):
            if 1 <= n <= 500:
                booth_no = n
                vote_start = i + 1
                break
        
        if booth_no is None:
            continue
        
        # Rest are votes + totals
        votes = numbers[vote_start:]
        
        results.append({
            'booth_no': booth_no,
            'votes': votes
        })
    
    return results


def map_to_official(booth_rows, official_candidates):
    """
    Map extracted booth data to official candidate order.
    Uses vote totals to match columns.
    """
    if not booth_rows:
        return {}
    
    num_candidates = len(official_candidates)
    
    # Assume votes are in first num_candidates positions (excluding totals at end)
    # Last few columns are: Total, Rejected, NOTA, GrandTotal
    
    # Sum each column across all booths
    max_cols = max(len(b['votes']) for b in booth_rows)
    col_sums = [0] * max_cols
    
    for b in booth_rows:
        for i, v in enumerate(b['votes']):
            col_sums[i] += v
    
    # Official totals
    official_totals = [c.get('votes', 0) for c in official_candidates]
    
    # Find best column for each official candidate
    mapping = {}  # pdf_col -> official_idx
    used_cols = set()
    
    for off_idx, off_total in enumerate(official_totals):
        best_col = -1
        best_score = float('inf')
        
        for col_idx, col_sum in enumerate(col_sums[:num_candidates + 5]):
            if col_idx in used_cols:
                continue
            
            if off_total > 0:
                ratio = col_sum / off_total
                # Score: distance from 1.0
                score = abs(ratio - 1.0)
                
                # Must be within 0.9-1.1 to be considered
                if 0.85 <= ratio <= 1.15 and score < best_score:
                    best_score = score
                    best_col = col_idx
        
        if best_col >= 0:
            mapping[best_col] = off_idx
            used_cols.add(best_col)
    
    # Check quality of mapping
    top2_mapped = 0 in mapping.values() and 1 in mapping.values()
    
    if not top2_mapped:
        # Try alternate approach: assume columns are in order
        # Use first num_candidates columns, map directly
        mapping = {i: i for i in range(min(num_candidates, max_cols - 4))}
    
    # Build results
    results = {}
    for b in booth_rows:
        booth_no = str(b['booth_no'])
        if booth_no in results:
            continue
        
        old_votes = b['votes']
        new_votes = [0] * num_candidates
        
        for pdf_col, off_idx in mapping.items():
            if pdf_col < len(old_votes) and off_idx < num_candidates:
                new_votes[off_idx] = old_votes[pdf_col]
        
        # Find total (should be sum or close to it)
        vote_sum = sum(new_votes)
        total = vote_sum
        
        # Look for total in remaining columns
        for v in old_votes[num_candidates:]:
            if abs(v - vote_sum) <= 20:
                total = v
                break
        
        results[booth_no] = {
            'votes': new_votes,
            'total': total,
            'rejected': 0
        }
    
    return results, mapping


def process_ac(ac_num, official_data):
    """Process single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return None, "PDF not found"
    
    official = official_data.get(ac_id, {})
    ac_name = official.get('constituencyName', '')
    candidates = official.get('candidates', [])
    
    print(f"\n📍 {ac_id} - {ac_name}")
    
    text = extract_text(pdf_path)
    if len(text) < 500:
        return None, "No text"
    
    # Extract PDF column order
    pdf_parties = extract_pdf_column_order(text, len(candidates))
    print(f"   PDF parties detected: {pdf_parties[:5]}")
    
    # Parse booth rows
    booth_rows = parse_booth_rows(text)
    print(f"   Found {len(booth_rows)} booth rows")
    
    if len(booth_rows) < 10:
        return None, f"Too few rows ({len(booth_rows)})"
    
    # Map to official
    results, mapping = map_to_official(booth_rows, candidates)
    print(f"   Mapped {len(mapping)} columns")
    
    # Validate
    col_sums = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums):
                col_sums[i] += v
    
    all_good = True
    for i in range(min(2, len(candidates))):
        oc = candidates[i]
        official_votes = oc.get('votes', 0)
        extracted = col_sums[i]
        ratio = extracted / official_votes if official_votes > 0 else 0
        status = "✓" if 0.95 <= ratio <= 1.05 else "✗"
        if not (0.95 <= ratio <= 1.05):
            all_good = False
        print(f"   {status} {oc.get('party', '?'):8}: {extracted:>8,} / {official_votes:>8,} ({ratio:.2f}x)")
    
    # Add AC prefix to booth IDs
    final_results = {f"{ac_id}-{k}": v for k, v in results.items()}
    
    return final_results, "OK" if all_good else "Partial"


def save_results(ac_id, ac_name, results, candidates):
    """Save results."""
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cands_out = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND'),
        'symbol': c.get('symbol', '')
    } for i, c in enumerate(candidates)]
    
    output = {
        'acId': ac_id,
        'acName': ac_name,
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(results),
        'source': 'Tamil Nadu CEO - Form 20',
        'candidates': cands_out,
        'results': results
    }
    
    with open(output_dir / '2021.json', 'w') as f:
        json.dump(output, f, indent=2)


def main():
    import sys
    
    official = load_official()
    
    # All issue ACs that have text
    TEXT_ACS = [27, 30, 47, 65, 74, 76, 88, 94, 100, 109, 112, 113, 128, 130, 145, 147, 149, 184, 204, 208, 212, 224]
    
    if len(sys.argv) > 1:
        acs = [int(sys.argv[1])]
    else:
        acs = TEXT_ACS
    
    print(f"Processing {len(acs)} ACs...")
    
    success = 0
    partial = 0
    failed = []
    
    for ac_num in acs:
        ac_id = f"TN-{ac_num:03d}"
        off = official.get(ac_id, {})
        
        results, status = process_ac(ac_num, official)
        
        if results:
            save_results(ac_id, off.get('constituencyName', ''), results, off.get('candidates', []))
            if status == "OK":
                success += 1
            else:
                partial += 1
        else:
            failed.append(ac_num)
    
    print(f"\n✅ Success: {success}")
    print(f"⚠️ Partial: {partial}")
    print(f"❌ Failed: {len(failed)}")


if __name__ == "__main__":
    main()
