#!/usr/bin/env python3
"""
Extract 2021 booth data with proper validation.
Handles both normal and transposed PDF layouts.

Usage:
    python scripts/extract-2021-validated.py 32 33 43 76 100
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_text(pdf_path: Path) -> str:
    """Extract text using pdftotext -layout."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True, timeout=60
    )
    return result.stdout if result.returncode == 0 else ""


# Party name mappings - official abbrev to PDF full names
PARTY_MAPPINGS = {
    'DMK': ['DRAVIDA MUNNETRA', 'D.M.K'],
    'ADMK': ['ALL INDIA ANNA', 'A.I.A.D.M.K', 'AIADMK'],
    'BJP': ['BHARATIYA JANATA', 'B.J.P'],
    'INC': ['INDIAN NATIONAL CONGRESS', 'CONGRESS'],
    'PMK': ['PATTALI MAKKAL', 'P.M.K'],
    'DMDK': ['DESIYA MURPOKKU', 'D.M.D.K'],
    'NTK': ['NAAM TAMILAR', 'N.T.K'],
    'MNM': ['MAKKAL NEEDHI', 'M.N.M'],
    'AMMK': ['AMMA MAKKAL', 'A.M.M.K'],
    'VCK': ['VIDUTHALAI CHIRUTHAI', 'V.C.K'],
    'CPI': ['COMMUNIST PARTY OF INDIA', 'C.P.I'],
    'CPM': ['COMMUNIST PARTY OF INDIA (MARXIST)', 'C.P.I.(M)'],
    'AIADMK': ['ALL INDIA ANNA', 'A.I.A.D.M.K'],
    'IJK': ['INDIYA JANANAYAKA', 'I.J.K'],
    'NOTA': ['NOTA'],
}


def get_party_patterns(party: str) -> list:
    """Get search patterns for a party."""
    patterns = PARTY_MAPPINGS.get(party.upper(), [])
    if not patterns:
        # Use party name directly if no mapping
        patterns = [party.upper()]
    return patterns


def detect_layout(text: str) -> str:
    """Detect if PDF uses normal or transposed layout."""
    # Transposed layout has "Polling Station No." row with booth numbers
    if "Polling Station No" in text:
        return "transposed"
    # Normal layout has booth number in first column
    return "normal"


def parse_transposed(text: str, candidates: list) -> dict:
    """Parse transposed layout where columns are booths, rows are candidates."""
    results = {}
    lines = text.split('\n')
    num_candidates = len(candidates)
    
    current_page_booths = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Check for polling station number row
        if "Polling Station" in line:
            # Extract booth numbers - they appear before "Polling Station No."
            # Format: "6 5 4A 4 3 2A 2 1 2 Polling Station No."
            parts = line.split("Polling Station")[0]
            tokens = re.findall(r'\b(\d+[A-Z]?)\b', parts)
            
            # Filter valid booth numbers (exclude row numbers which are typically last)
            booths = []
            for t in tokens[:-1]:  # Exclude last number (row number)
                try:
                    base = int(t.rstrip('ABCDEFGHIJKLM'))
                    if 1 <= base <= 600:
                        booths.append(t)
                except ValueError:
                    pass
            
            if booths:
                current_page_booths = booths
                # Initialize booth entries
                for booth in booths:
                    if booth not in results:
                        results[booth] = [0] * num_candidates
            
            i += 1
            continue
        
        # Skip if no booths defined yet
        if not current_page_booths:
            i += 1
            continue
        
        # Try to match candidate row
        # Candidate rows have: votes... row_number PARTY NAME
        for cand_idx, cand in enumerate(candidates):
            party = cand.get('party', '').upper()
            name = cand.get('name', '').upper()
            
            # Check multiple lines (party name can span lines)
            combined = line
            if i + 1 < len(lines):
                combined = line + " " + lines[i + 1]
            combined_upper = combined.upper()
            
            # Match by party patterns or candidate name
            matched = False
            
            # Try party patterns first
            for pattern in get_party_patterns(party):
                if pattern in combined_upper:
                    matched = True
                    break
            
            # Try candidate name
            if not matched and name and len(name) >= 5:
                # Try last name (usually after the dot)
                name_parts = name.split('.')
                for part in name_parts:
                    if len(part) >= 4 and part.strip() in combined_upper:
                        matched = True
                        break
            
            if matched:
                # Extract numbers from the line
                numbers = re.findall(r'\b(\d+)\b', line)
                
                # Votes are typically the first N numbers (where N = num booths)
                votes = []
                for n in numbers:
                    val = int(n)
                    if val <= 2000:  # Reasonable vote count per booth
                        votes.append(val)
                    if len(votes) >= len(current_page_booths):
                        break
                
                if len(votes) >= len(current_page_booths):
                    # Map votes to booths (booths are in reverse order in PDF)
                    for j, booth in enumerate(current_page_booths):
                        if j < len(votes):
                            results[booth][cand_idx] = votes[j]
                break
        
        i += 1
    
    return results


def parse_normal(text: str, num_candidates: int) -> dict:
    """Parse normal layout where each row is a booth."""
    results = {}
    lines = text.split('\n')
    
    for line in lines:
        # Clean line
        line = re.sub(r'[|,]', ' ', line)
        line = re.sub(r'\s+', ' ', line).strip()
        
        # Skip headers
        if any(x in line.lower() for x in ['polling', 'station', 'sl.no', 'valid votes', 'candidate', 'total']):
            continue
        
        numbers = re.findall(r'\b(\d+)\b', line)
        if len(numbers) < num_candidates + 2:
            continue
        
        # Try to find booth number
        for i in range(min(3, len(numbers))):
            try:
                booth_no = int(numbers[i])
                if not (1 <= booth_no <= 600):
                    continue
                
                # Get votes after booth number
                vote_start = i + 1
                
                # Skip if next number is also a small number (likely sl.no, booth combo)
                if vote_start < len(numbers) and int(numbers[vote_start]) == booth_no:
                    vote_start += 1
                
                votes = [int(n) for n in numbers[vote_start:vote_start + num_candidates]]
                
                if len(votes) >= 3:
                    total = sum(votes)
                    if 50 <= total <= 3000:
                        booth_key = str(booth_no)
                        if booth_key not in results:
                            results[booth_key] = votes
                        break
            except (ValueError, IndexError):
                continue
    
    return results


def validate_results(results: dict, candidates: list, ac_id: str) -> tuple[bool, list[str]]:
    """Validate extracted results against official totals."""
    issues = []
    
    if not results:
        return False, ["No results extracted"]
    
    num_candidates = len(candidates)
    
    # Sum columns
    col_sums = [0] * num_candidates
    for booth_votes in results.values():
        for i, v in enumerate(booth_votes):
            if i < num_candidates:
                col_sums[i] += v
    
    # Validate against official totals
    for i, cand in enumerate(candidates[:3]):  # Check top 3
        off_votes = cand.get('votes', 0)
        ext_votes = col_sums[i] if i < len(col_sums) else 0
        
        if off_votes > 0:
            ratio = ext_votes / off_votes
            if ratio < 0.70:
                issues.append(f"{cand.get('party')}: {ext_votes:,}/{off_votes:,} ({ratio:.1%}) - too low")
            elif ratio > 1.30:
                issues.append(f"{cand.get('party')}: {ext_votes:,}/{off_votes:,} ({ratio:.1%}) - too high")
    
    # Check booth winner distribution
    if len(results) >= 10:
        from collections import Counter
        wins = Counter()
        for booth_votes in results.values():
            if booth_votes:
                winner_idx = max(range(len(booth_votes)), key=lambda i: booth_votes[i])
                if winner_idx < len(candidates):
                    wins[candidates[winner_idx].get('party')] += 1
        
        top_2_wins = {p for p, _ in wins.most_common(2)}
        top_2_official = {c.get('party') for c in candidates[:2]}
        
        if top_2_wins != top_2_official:
            issues.append(f"Winner mismatch: extracted {top_2_wins} vs official {top_2_official}")
    
    # Check for booth number in votes (the bug we're fixing!)
    for booth_key, votes in results.items():
        try:
            booth_num = int(booth_key.rstrip('ABCDEFGHIJKLM'))
            if booth_num in votes[:3]:
                issues.append(f"Booth {booth_key}: booth number {booth_num} found in votes!")
        except ValueError:
            pass
    
    return len(issues) == 0, issues


def process_ac(ac_num: int, official: dict) -> bool:
    """Process a single AC."""
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
    print(f"  Candidates: {len(candidates)}")
    print(f"  Top 2: {candidates[0].get('party')} ({candidates[0].get('votes'):,}), {candidates[1].get('party')} ({candidates[1].get('votes'):,})")
    
    # Extract text
    print(f"  Extracting text from PDF...")
    text = extract_text(pdf_path)
    
    if not text:
        print(f"  ❌ Failed to extract text")
        return False
    
    # Detect layout
    layout = detect_layout(text)
    print(f"  Layout: {layout}")
    
    # Parse based on layout
    if layout == "transposed":
        results = parse_transposed(text, candidates)
    else:
        results = parse_normal(text, len(candidates))
    
    print(f"  Extracted {len(results)} booths")
    
    if not results:
        print(f"  ❌ No booths extracted")
        return False
    
    # Validate
    valid, issues = validate_results(results, candidates, ac_id)
    
    if issues:
        print(f"  ⚠️ Validation issues:")
        for issue in issues:
            print(f"     - {issue}")
    
    if not valid:
        print(f"  ❌ Validation failed - not saving")
        return False
    
    # Save results
    output_path = OUTPUT_BASE / ac_id / "2021.json"
    
    # Format results
    final_results = {}
    for booth_key, votes in results.items():
        full_id = f"{ac_id}-{booth_key}"
        final_results[full_id] = {
            'votes': votes,
            'total': sum(votes),
            'rejected': 0
        }
    
    cands_out = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND'),
        'symbol': c.get('symbol', '')
    } for i, c in enumerate(candidates)]
    
    # Add NOTA if not present
    if not any(c['party'] == 'NOTA' for c in cands_out):
        cands_out.append({
            'slNo': len(cands_out) + 1,
            'name': 'NOTA',
            'party': 'NOTA',
            'symbol': 'NOTA'
        })
    
    output = {
        'acId': ac_id,
        'acName': ac_official.get('constituencyName', ''),
        'year': 2021,
        'electionType': 'assembly',
        'date': '2021-04-06',
        'totalBooths': len(final_results),
        'source': 'Tamil Nadu CEO - Form 20 (Validated extraction)',
        'candidates': cands_out,
        'results': final_results
    }
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"  ✅ Saved {len(final_results)} booths")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/extract-2021-validated.py <ac_num> [ac_num2...]")
        print("Example: python scripts/extract-2021-validated.py 32 33 43 76 100")
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
