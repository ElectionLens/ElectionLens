#!/usr/bin/env python3
"""
Extract booth data from transposed format PDFs.

In transposed format:
- Each column represents a booth
- Each row represents a candidate or data field
- Headers are typically: 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 (booth numbers right-to-left)
- Data rows contain votes per booth for each candidate

Example PDF structure:
    10    9     8     7     6     5     4     3     2     1     SL.NO.
    8     7A    7     6     5A    5     4     3     2     1     Polling Station No.
    274   295   268   252   350   237   300   430   486   466   ARJUNAN P (DMK)
    ...
"""

import json
import re
import subprocess
from pathlib import Path

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/elections/ac/TN/2021.json")
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/booths/TN")


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def extract_transposed_format(text_content: str, num_candidates: int, ac_id: str):
    """Extract booth data from transposed format PDF."""
    lines = text_content.split('\n')
    
    # Find the column count by looking for header rows
    col_count = 0
    booth_ids = []
    data_rows = []
    
    for i, line in enumerate(lines):
        # Look for header row with booth numbers (descending: 10 9 8 7 6 5 4 3 2 1)
        nums = re.findall(r'\b(\d+[A-Z]?)\b', line)
        if len(nums) >= 8 and 'SL' in line.upper():
            # This is likely a header row
            # Extract booth numbers (they should be at the start)
            booth_nums = []
            for n in nums:
                if n.upper() not in ['SL', 'NO']:
                    booth_nums.append(n)
            if booth_nums:
                col_count = len(booth_nums)
                # Reverse to get ascending order
                booth_ids = list(reversed(booth_nums))
                continue
        
        # Look for "Polling Station No" row - it has the actual booth IDs
        if 'Polling Station' in line or 'Station No' in line:
            nums = re.findall(r'\b(\d+[A-Z]?)\b', line)
            if nums:
                booth_ids = list(reversed([n for n in nums if n.upper() not in ['POLLING', 'STATION', 'NO']]))
            continue
        
        # Data rows have many numbers
        nums = re.findall(r'\b(\d+)\b', line)
        if len(nums) >= col_count - 1 and col_count > 0:
            # This might be a data row
            data_rows.append(nums[:col_count])
    
    if not booth_ids or not data_rows:
        return None
    
    # Build results - transpose the data
    results = {}
    for booth_idx, booth_no in enumerate(booth_ids):
        votes = []
        for row_idx in range(min(num_candidates, len(data_rows))):
            if booth_idx < len(data_rows[row_idx]):
                votes.append(int(data_rows[row_idx][booth_idx]))
            else:
                votes.append(0)
        
        if sum(votes) > 0:
            booth_id = f"{ac_id}-{booth_no}"
            results[booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
    
    return results


def parse_transposed_pdf(pdf_path: Path, num_candidates: int, ac_id: str):
    """Parse a transposed format PDF."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None
    
    return extract_transposed_format(result.stdout, num_candidates, ac_id)


def process_ac(ac_id: str, official_data: dict):
    """Process a single AC."""
    ac_num = int(ac_id.replace('TN-', ''))
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        print(f"  No PDF found")
        return False
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    ac_name = official.get('constituencyName', ac_id)
    
    results = parse_transposed_pdf(pdf_path, num_candidates, ac_id)
    
    if not results:
        print(f"  Failed to parse transposed format")
        return False
    
    # Validate
    col_totals = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    errors = []
    for i in range(min(3, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = col_totals[i]
        if off > 100:
            pct = abs(calc - off) / off * 100
            errors.append(pct)
            print(f"    Cand {i+1}: Official={off:,} Calc={calc:,} ({pct:.1f}%)")
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error > 50:
        print(f"  Error too high ({avg_error:.1f}%), not saving")
        return False
    
    # Save
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create booth list
    booth_list = []
    for booth_id in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x.split('-')[-1]).group()) if re.search(r'\d+', x.split('-')[-1]) else 0, x)):
        booth_no = booth_id.split('-')[-1]
        booth_list.append({
            "id": booth_id,
            "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "women" if booth_no.upper().endswith('W') or '(W)' in booth_no.upper() else "regular",
            "name": f"Booth {booth_no}",
            "address": f"{ac_name} - Booth {booth_no}",
            "area": ac_name
        })
    
    with open(output_dir / "booths.json", 'w') as f:
        json.dump({
            "acId": ac_id,
            "acName": ac_name,
            "state": "Tamil Nadu",
            "totalBooths": len(booth_list),
            "lastUpdated": "2021-04-06",
            "source": "Tamil Nadu CEO - Form 20 (Transposed)",
            "booths": booth_list
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id,
            "acName": ac_name,
            "year": 2021,
            "totalBooths": len(results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
                          for c in official['candidates']],
            "results": results
        }, f, indent=2)
    
    print(f"  ✅ Saved {len(results)} booths ({avg_error:.1f}% error)")
    return True


def main():
    official_data = load_official_data()
    
    # ACs with transposed format
    transposed_acs = ['TN-071', 'TN-072', 'TN-074', 'TN-075', 'TN-076', 'TN-159']
    
    for ac_id in transposed_acs:
        print(f"\nProcessing {ac_id}...")
        process_ac(ac_id, official_data)


if __name__ == "__main__":
    main()
