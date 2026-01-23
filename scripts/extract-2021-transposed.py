#!/usr/bin/env python3
"""
Extract 2021 booth data from transposed PDFs with validation.

Handles Tamil Nadu Form 20 PDFs where:
- Columns are booth numbers  
- Rows are candidates
- Party names may span multiple lines

Follows booth-data-parsing rules:
1. Numbers must be sequential to be booths (not random vote counts)
2. Cross-validate against official totals (must be 80-120%)
3. Validate booth winner distribution matches official top 2

Usage:
    python scripts/extract-2021-transposed.py 32 33 43 76 100
"""

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

PARTY_PATTERNS = {
    'DMK': ['DRAVIDA MUNNETRA'],
    'ADMK': ['ALL INDIA ANNA', 'A.I.A.D.M.K'],
    'BJP': ['BHARATIYA JANATA'],
    'PMK': ['PATTALI MAKKAL'],
    'DMDK': ['DESIYA MURPOKKU'],
    'NTK': ['NAAM TAMILAR'],
    'INC': ['INDIAN NATIONAL CONGRESS'],
    'BSP': ['BAHUJAN SAMAJ'],
    'VCK': ['VIDUTHALAI CHIRUTHAI'],
    'IJK': ['INDIYA JANANAYAKA'],
    'MNM': ['MAKKAL NEEDHI'],
    'AMMK': ['AMMA MAKKAL'],
}


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_booth_numbers(line: str) -> list:
    """Extract potential booth numbers from line."""
    tokens = re.findall(r'\b(\d+[A-Z]?)\b', line)
    booths = []
    for t in tokens:
        try:
            base = int(t.rstrip('ABCDEFGHIJKLM'))
            if 1 <= base <= 600:
                booths.append(t)
        except ValueError:
            pass
    return booths


def is_sequential_booths(booths: list) -> bool:
    """Check if booth numbers are roughly sequential (real booth number line)."""
    if len(booths) < 3:
        return False
    
    nums = [int(b.rstrip('ABCDEFGHIJKLM')) for b in booths]
    
    # Check if mostly descending with small gaps
    sequential_count = 0
    for i in range(len(nums) - 1):
        diff = nums[i] - nums[i+1]
        if 0 <= diff <= 2:
            sequential_count += 1
    
    return sequential_count >= len(nums) * 0.5


def is_booth_number_line(line: str) -> bool:
    """Check if line contains booth numbers (not vote counts)."""
    booths = extract_booth_numbers(line)
    if len(booths) < 3:
        return False
    
    labels = ['SL.', 'NO.', 'POLLING', 'STATION', 'TOTAL', 'PARTY', 'INDEPENDENT', 
              'KAZHAGAM', 'REJECTED', 'NOTA', 'TENDERED', 'MUNNETRA', 'MURPOKKU',
              'BHARATIYA', 'CONGRESS', 'MAKKAL', 'TAMILAR', 'SAMAJ']
    if any(l in line.upper() for l in labels):
        return False
    
    return is_sequential_booths(booths)


def match_party(party: str, context: str) -> bool:
    """Match party name in context."""
    patterns = PARTY_PATTERNS.get(party.upper(), [party.upper()])
    return any(p in context.upper() for p in patterns)


def process_ac(ac_num: int, official: dict) -> bool:
    """Process single AC."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = PDF_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        print(f"  ❌ PDF not found: {pdf_path}")
        return False
    
    ac_official = official.get(ac_id, {})
    candidates = ac_official.get('candidates', [])
    
    if not candidates:
        print(f"  ❌ No official candidate data")
        return False
    
    print(f"\n{'='*60}")
    print(f"{ac_id} - {ac_official.get('constituencyName', '?')}")
    print(f"{'='*60}")
    print(f"  Official top 2: {candidates[0].get('party')} ({candidates[0].get('votes'):,}), "
          f"{candidates[1].get('party')} ({candidates[1].get('votes'):,})")
    
    # Extract text
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True, timeout=60
    )
    lines = result.stdout.split('\n')
    
    results = {}
    current_booths = []
    
    for i, line in enumerate(lines):
        # Check for sequential booth number line
        if is_booth_number_line(line):
            booths = extract_booth_numbers(line)
            if booths and booths[-1].isdigit() and int(booths[-1]) <= 21:
                booths = booths[:-1]
            if booths:
                current_booths = booths
                for b in booths:
                    if b not in results:
                        results[b] = [0] * len(candidates)
                continue
        
        # Check Polling Station line with inline booths
        if "Polling Station" in line:
            parts = line.split("Polling Station")[0]
            booths = extract_booth_numbers(parts)
            if booths and len(booths) > 1:
                if booths[-1].isdigit() and int(booths[-1]) <= 21:
                    booths = booths[:-1]
                current_booths = booths
                for b in booths:
                    if b not in results:
                        results[b] = [0] * len(candidates)
            continue
        
        # Match candidate rows
        if current_booths:
            prev = lines[i-1] if i > 0 else ""
            next_l = lines[i+1] if i + 1 < len(lines) else ""
            context = prev + " " + line + " " + next_l
            
            numbers = re.findall(r'\b(\d+)\b', line)
            votes = [int(n) for n in numbers if int(n) <= 2000]
            
            if len(votes) >= len(current_booths):
                votes = votes[:len(current_booths)]
                
                for cand_idx, cand in enumerate(candidates):
                    party = cand.get('party', '')
                    name = cand.get('name', '').upper()
                    
                    matched = match_party(party, context)
                    if not matched and name:
                        for p in [p.strip() for p in name.split('.') if len(p.strip()) > 3]:
                            if p in context.upper():
                                matched = True
                                break
                    
                    if matched:
                        for j, booth in enumerate(current_booths):
                            results[booth][cand_idx] = votes[j]
                        break
    
    print(f"  Extracted {len(results)} booths")
    
    if len(results) < 50:
        print(f"  ❌ Too few booths")
        return False
    
    # Validate
    col_sums = [sum(v[k] for v in results.values()) for k in range(min(len(candidates), 5))]
    
    valid = True
    for k, cand in enumerate(candidates[:3]):
        off = cand.get('votes', 0)
        ext = col_sums[k] if k < len(col_sums) else 0
        if off > 0:
            ratio = ext / off
            status = "✓" if 0.8 <= ratio <= 1.2 else "✗"
            if ratio < 0.8 or ratio > 1.2:
                valid = False
            print(f"  {status} {cand.get('party'):8}: {ext:>8,} / {off:>8,} ({ratio:.1%})")
    
    # Check winner distribution
    wins = Counter()
    for votes in results.values():
        if votes:
            wi = max(range(min(len(votes), 5)), key=lambda x: votes[x])
            wins[candidates[wi].get('party')] += 1
    
    print(f"  Booth wins: {dict(wins.most_common(3))}")
    
    top2_wins = {p for p, _ in wins.most_common(2)}
    top2_off = {c.get('party') for c in candidates[:2]}
    
    if top2_wins != top2_off:
        print(f"  ✗ Winner mismatch: {top2_wins} vs {top2_off}")
        valid = False
    
    if not valid:
        print(f"  ❌ Validation failed - not saving")
        return False
    
    # Save
    final_results = {f"{ac_id}-{k}": {'votes': v, 'total': sum(v), 'rejected': 0} 
                    for k, v in results.items()}
    
    cands_out = [{'slNo': i+1, 'name': c.get('name',''), 'party': c.get('party','IND'), 'symbol': ''} 
                for i, c in enumerate(candidates)]
    if not any(c['party'] == 'NOTA' for c in cands_out):
        cands_out.append({'slNo': len(cands_out)+1, 'name': 'NOTA', 'party': 'NOTA', 'symbol': 'NOTA'})
    
    output = {
        'acId': ac_id,
        'acName': ac_official.get('constituencyName', ''),
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(final_results),
        'source': 'Tamil Nadu CEO - Form 20 (Validated)',
        'candidates': cands_out,
        'results': final_results
    }
    
    output_path = OUTPUT_BASE / ac_id / "2021.json"
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"  ✅ Saved {len(final_results)} booths")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/extract-2021-transposed.py <ac_num> [ac_num2...]")
        sys.exit(1)
    
    official = load_official()
    ac_nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
    
    success = 0
    failed = []
    
    for ac_num in ac_nums:
        try:
            if process_ac(ac_num, official):
                success += 1
            else:
                failed.append(ac_num)
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed.append(ac_num)
    
    print(f"\n{'='*60}")
    print(f"Results: {success}/{len(ac_nums)} succeeded")
    if failed:
        print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
