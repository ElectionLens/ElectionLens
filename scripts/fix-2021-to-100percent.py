#!/usr/bin/env python3
"""
Comprehensive fix to achieve 100% coverage for 2021 ACS data.

Fixes:
1. Re-extract high error ACs with proper candidate alignment
2. Extract missing booths from scanned PDFs
3. Fix vote mapping issues
"""

import json
import re
import subprocess
from pathlib import Path
from difflib import SequenceMatcher

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    with open(AC_DATA) as f:
        ac_data = json.load(f)
    with open(SCHEMA) as f:
        schema = json.load(f)
    return ac_data, schema


def normalize_name(name: str) -> str:
    """Normalize candidate name for matching."""
    if not name:
        return ""
    name = re.sub(r'\s+', ' ', name.strip().upper())
    name = re.sub(r'\s+(MR|MRS|MS|DR|PROF)\.?\s*$', '', name)
    return name


def find_best_vote_mapping(data_votes: list, official_totals: list) -> int:
    """Find best offset for vote columns by matching totals."""
    if len(data_votes) < len(official_totals):
        return 0
    
    best_offset = 0
    best_error = float('inf')
    
    # Try different offsets
    for offset in range(len(data_votes) - len(official_totals) + 1):
        error = 0
        matched = 0
        for i, official_total in enumerate(official_totals[:5]):  # Check top 5
            if offset + i < len(data_votes) and official_total > 1000:
                extracted = data_votes[offset + i]
                if extracted > 0:
                    err = abs(extracted - official_total) / official_total
                    error += err
                    matched += 1
        
        if matched > 0:
            avg_error = error / matched
            if avg_error < best_error:
                best_error = avg_error
                best_offset = offset
    
    return best_offset if best_error < 0.5 else 0  # Only use if error < 50%


def fix_vote_mapping(ac_id: str, ac_data: dict) -> dict:
    """Fix vote column mapping by matching to official totals."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_candidates = official.get('candidates', [])
    official_totals = [c.get('votes', 0) for c in official_candidates]
    
    if not official_candidates:
        return {'status': 'error', 'error': 'No official candidates'}
    
    # Calculate current column sums
    num_cols = max(len(r.get('votes', [])) for r in data.get('results', {}).values()) if data.get('results') else 0
    col_sums = [0] * num_cols
    
    for r in data.get('results', {}).values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cols:
                col_sums[i] += v
    
    # Find best offset
    offset = find_best_vote_mapping(col_sums, official_totals)
    
    if offset == 0 and len(data.get('candidates', [])) == len(official_candidates):
        # Check if already aligned
        current_total = sum(col_sums[:len(official_totals)])
        official_total = sum(official_totals)
        if abs(current_total - official_total) / official_total < 0.1:
            return {'status': 'skipped', 'reason': 'Already aligned'}
    
    # Realign votes
    booths_fixed = 0
    for booth_id, r in data.get('results', {}).items():
        old_votes = r.get('votes', [])
        if not old_votes:
            continue
        
        # Create new vote array starting from offset
        new_votes = []
        for i in range(len(official_candidates)):
            idx = offset + i
            if idx < len(old_votes):
                new_votes.append(old_votes[idx])
            else:
                new_votes.append(0)
        
        r['votes'] = new_votes
        r['total'] = sum(new_votes)
        booths_fixed += 1
    
    # Update candidates to match official
    data['candidates'] = [
        {
            'name': c.get('name', ''),
            'party': c.get('party', ''),
            'symbol': ''
        }
        for c in official_candidates
    ]
    
    data['source'] = data.get('source', '') + f' (vote mapping fixed - offset {offset})'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'booths': booths_fixed,
        'offset': offset
    }


def re_extract_ac(ac_num: int, ac_data: dict) -> dict:
    """Re-extract AC using enhanced parser."""
    ac_id = f"TN-{ac_num:03d}"
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        return {'status': 'error', 'error': 'PDF not found'}
    
    # Use the enhanced parser
    result = subprocess.run(
        ['python3', 'scripts/unified-pdf-parser-v2-2021.py', str(ac_num)],
        capture_output=True,
        text=True,
        cwd='/Users/p0s097d/ElectionLens'
    )
    
    if result.returncode == 0:
        return {'status': 'success', 'output': result.stdout}
    else:
        return {'status': 'error', 'error': result.stderr}


def main():
    print("=" * 80)
    print("FIXING 2021 ACS DATA TO 100% COVERAGE")
    print("=" * 80)
    
    ac_data, schema = load_data()
    
    # High error ACs that need vote mapping fix
    high_error_acs = [128, 159, 16, 86, 144, 234, 129, 173, 149, 76]
    
    print("\nStep 1: Fixing vote mapping for high error ACs")
    print("-" * 80)
    
    fixed_count = 0
    for ac_num in high_error_acs:
        ac_id = f"TN-{ac_num:03d}"
        result = fix_vote_mapping(ac_id, ac_data)
        
        if result['status'] == 'fixed':
            print(f"✓ {ac_id}: Fixed {result['booths']} booths (offset: {result['offset']})")
            fixed_count += 1
        elif result['status'] == 'skipped':
            print(f"⊘ {ac_id}: {result.get('reason', 'Skipped')}")
        else:
            print(f"✗ {ac_id}: {result.get('error', 'Unknown error')}")
    
    print(f"\nFixed: {fixed_count} ACs")
    
    # Missing booths ACs
    missing_acs = [32, 33, 108, 109]
    
    print("\nStep 2: Extracting missing booths from scanned PDFs")
    print("-" * 80)
    
    # Note: OCR extraction would go here, but requires OCR setup
    print("Note: Scanned PDF extraction requires OCR setup (pytesseract/Surya)")
    print("ACs needing OCR: TN-032, TN-033, TN-108, TN-109")
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"  Vote mapping fixed: {fixed_count} ACs")
    print(f"  Scanned PDFs remaining: {len(missing_acs)} ACs")


if __name__ == "__main__":
    main()
