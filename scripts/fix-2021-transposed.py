#!/usr/bin/env python3
"""
Extract 2021 booth data from transposed PDF layouts.
These PDFs have booths as columns and candidates as rows.
"""

import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def extract_text(pdf_path):
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], 
                          capture_output=True, text=True, timeout=60)
    return result.stdout


def parse_transposed_pdf(text, official_candidates):
    """Parse transposed PDF where booths are columns and candidates are rows."""
    lines = text.split('\n')
    
    # Find booth header rows (contain "Polling Station" or booth numbers like 1, 1A, 2, etc.)
    booth_columns = {}  # position -> booth_no
    candidate_votes = defaultdict(dict)  # candidate_idx -> {booth_no: votes}
    
    # Track current candidate being parsed
    current_candidate_idx = -1
    current_votes = []
    
    for line in lines:
        # Skip empty lines
        if not line.strip():
            continue
        
        # Check for SL. NO. or candidate index
        sl_match = re.search(r'\b(\d{1,2})\s+(DRAVIDA|ALL INDIA|BAHUJAN|NAAM|MAKKAL|BHARATIYA|INDIAN|COMMUNIST|INDEPENDENT|AMMA|ANNA|DESIYA|VEERATH)', line)
        if sl_match:
            idx = int(sl_match.group(1)) - 1  # 0-based
            current_candidate_idx = idx
            # Extract numbers from this line
            nums = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
            # Remove the SL.NO from the numbers
            if nums and nums[-1] == idx + 1:
                nums = nums[:-1]
            current_votes = nums
            continue
        
        # Check for booth number row
        if 'Polling Station' in line or 'polling station' in line.lower():
            # Parse booth numbers
            parts = re.findall(r'\b(\d+[A-Z]?)\b', line)
            booth_columns = {i: p for i, p in enumerate(parts)}
            continue
        
        # If we have a current candidate, look for vote numbers
        if current_candidate_idx >= 0:
            nums = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
            if nums and len(nums) >= 3:
                # This might be a vote row
                # Check if first number could be SL.NO
                if nums[-1] <= len(official_candidates) + 5:
                    # Looks like a new candidate row
                    current_candidate_idx = nums[-1] - 1
                    current_votes = nums[:-1]
                else:
                    current_votes.extend(nums)
    
    return booth_columns, candidate_votes


def parse_by_pages(pdf_path, official_candidates):
    """Parse each page separately, identifying booth columns."""
    result = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], 
                          capture_output=True, text=True, timeout=60)
    text = result.stdout
    
    # Split by form feed or large gaps
    pages = re.split(r'\f', text)
    
    all_booths = {}  # booth_no -> {candidate_idx: votes}
    
    for page_num, page in enumerate(pages):
        lines = [l for l in page.split('\n') if l.strip()]
        if len(lines) < 10:
            continue
        
        # Find the header with booth numbers
        booth_row = None
        for i, line in enumerate(lines[:20]):
            if 'Polling Station' in line or re.search(r'\b\d+[A-Z]?\s+\d+[A-Z]?\s+\d+', line):
                # Extract booth numbers from this line and next few
                combined = ' '.join(lines[max(0,i-1):i+3])
                booth_nums = re.findall(r'\b(\d{1,3}[A-Z]?)\b', combined)
                # Filter to likely booth numbers (1-500)
                booth_nums = [b for b in booth_nums if b.isdigit() and 1 <= int(b) <= 500 or 
                             (b[:-1].isdigit() and 1 <= int(b[:-1]) <= 500)]
                if len(booth_nums) >= 3:
                    booth_row = booth_nums[:20]  # Max 20 booths per page
                    break
        
        if not booth_row:
            # Try to find booth numbers from column headers
            for i, line in enumerate(lines[:10]):
                nums = re.findall(r'\b(\d{1,3})\b', line)
                if len(nums) >= 5 and all(1 <= int(n) <= 500 for n in nums[:5]):
                    booth_row = nums[:20]
                    break
        
        if not booth_row:
            continue
        
        print(f"  Page {page_num+1}: Booths {booth_row[:5]}...{booth_row[-3:] if len(booth_row) > 5 else ''}")
        
        # Parse candidate votes
        for line in lines:
            # Look for lines with vote numbers
            nums = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
            if len(nums) < 3:
                continue
            
            # Try to identify candidate by party name in line
            party_match = None
            for i, c in enumerate(official_candidates):
                party = c.get('party', '')
                if len(party) > 2 and party.upper() in line.upper():
                    party_match = i
                    break
            
            if party_match is not None:
                # Assign votes to booths
                vote_nums = [n for n in nums if n < 5000]  # Filter out large numbers
                for j, booth in enumerate(booth_row):
                    if j < len(vote_nums):
                        if booth not in all_booths:
                            all_booths[booth] = [0] * len(official_candidates)
                        all_booths[booth][party_match] = vote_nums[j]
    
    return all_booths


def extract_booth_data_simple(text, official_candidates):
    """Simple extraction - find all vote rows and match to candidates by total."""
    lines = text.split('\n')
    
    # Collect all numeric rows
    all_rows = []
    for line in lines:
        nums = [int(n) for n in re.findall(r'\b(\d+)\b', line)]
        if len(nums) >= 5:
            all_rows.append(nums)
    
    if not all_rows:
        return {}
    
    # Group rows by booth (first column after filtering)
    # Assume first significant column is booth number
    booths = {}
    
    for row in all_rows:
        # Find booth number (should be 1-500)
        booth_col = -1
        for i, n in enumerate(row[:3]):
            if 1 <= n <= 500:
                booth_col = i
                break
        
        if booth_col < 0:
            continue
        
        booth_no = str(row[booth_col])
        votes = row[booth_col+1:booth_col+1+len(official_candidates)]
        
        if len(votes) >= 2 and booth_no not in booths:
            # Pad with zeros if needed
            while len(votes) < len(official_candidates):
                votes.append(0)
            booths[booth_no] = votes[:len(official_candidates)]
    
    # Validate by summing columns
    if booths:
        col_sums = [sum(v[i] for v in booths.values() if i < len(v)) 
                   for i in range(len(official_candidates))]
        
        # Check if top candidates match
        for i in range(min(2, len(official_candidates))):
            off_total = official_candidates[i].get('votes', 0)
            ratio = col_sums[i] / off_total if off_total > 0 else 0
            print(f"    {official_candidates[i].get('party'):8}: {col_sums[i]:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
    return booths


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
    
    # Try simple extraction first
    booths = extract_booth_data_simple(text, candidates)
    
    if len(booths) < 50:
        print(f"   Only {len(booths)} booths - trying page-by-page...")
        booths = parse_by_pages(pdf_path, candidates)
    
    print(f"   {len(booths)} booths extracted")
    
    if len(booths) < 20:
        return None, "Too few booths"
    
    # Convert to output format
    results = {}
    for booth_no, votes in booths.items():
        results[f"{ac_id}-{booth_no}"] = {
            'votes': votes,
            'total': sum(votes),
            'rejected': 0
        }
    
    # Validate
    col_sums = [0] * len(candidates)
    for r in results.values():
        for i, v in enumerate(r['votes']):
            if i < len(col_sums):
                col_sums[i] += v
    
    all_good = True
    for i in range(min(2, len(candidates))):
        off_total = candidates[i].get('votes', 0)
        extracted = col_sums[i]
        ratio = extracted / off_total if off_total > 0 else 0
        status = "✓" if 0.95 <= ratio <= 1.05 else "✗"
        if not (0.95 <= ratio <= 1.05):
            all_good = False
        print(f"   {status} {candidates[i].get('party'):8}: {extracted:>8,} / {off_total:>8,} ({ratio:.2f}x)")
    
    return results, "OK" if all_good else "Partial"


def save_results(ac_id, ac_name, results, candidates):
    """Save results to JSON."""
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
    
    # Text-based ACs that need fixing
    FIX_ACS = [74, 100, 112, 130, 149, 184, 224]
    
    if len(sys.argv) > 1:
        FIX_ACS = [int(sys.argv[1])]
    
    print(f"Processing {len(FIX_ACS)} ACs with transposed/complex layouts...")
    
    success = partial = 0
    failed = []
    
    for ac_num in FIX_ACS:
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
            print(f"   ❌ {status}")
            failed.append(ac_num)
    
    print(f"\n✅ {success} | ⚠️ {partial} | ❌ {len(failed)}")


if __name__ == "__main__":
    main()
