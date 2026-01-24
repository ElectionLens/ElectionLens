#!/usr/bin/env python3
"""
Extract missing booths for 2024 data.

Identifies ACs with missing booths and extracts them using unified parser.
"""

import json
from pathlib import Path
import subprocess

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
FORM20_DIR = Path.home() / "Desktop" / "GELS_2024_Form20_PDFs"


def load_json(path):
    with open(path) as f:
        return json.load(f)


def find_missing_booths():
    """Find ACs with missing booths."""
    missing_acs = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booths_file = BOOTHS_DIR / ac_id / "booths.json"
        results_file = BOOTHS_DIR / ac_id / "2024.json"
        
        if not booths_file.exists() or not results_file.exists():
            continue
        
        with open(booths_file) as f:
            booths_meta = json.load(f)
        with open(results_file) as f:
            results_data = json.load(f)
        
        expected_booths = booths_meta.get('totalBooths', len(booths_meta.get('booths', [])))
        extracted_booths = len(results_data.get('results', {}))
        missing = expected_booths - extracted_booths
        
        if missing > 0:
            pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
            missing_acs.append({
                'ac_id': ac_id,
                'ac_num': ac_num,
                'missing': missing,
                'expected': expected_booths,
                'extracted': extracted_booths,
                'has_pdf': pdf_path.exists()
            })
    
    return missing_acs


def main():
    missing_acs = find_missing_booths()
    
    print("=" * 80)
    print("Missing Booths Extraction - 2024")
    print("=" * 80)
    print(f"\nTotal ACs with missing booths: {len(missing_acs)}")
    print(f"Total missing booths: {sum(ac['missing'] for ac in missing_acs)}")
    
    # Group by missing count
    high_priority = [ac for ac in missing_acs if ac['missing'] > 50]
    medium_priority = [ac for ac in missing_acs if 10 < ac['missing'] <= 50]
    low_priority = [ac for ac in missing_acs if ac['missing'] <= 10]
    
    print(f"\nHigh priority (>50 missing): {len(high_priority)}")
    print(f"Medium priority (10-50 missing): {len(medium_priority)}")
    print(f"Low priority (≤10 missing): {len(low_priority)}")
    
    if high_priority:
        print(f"\nTop 10 ACs with most missing booths:")
        for ac in sorted(high_priority, key=lambda x: x['missing'], reverse=True)[:10]:
            pdf_status = "✓" if ac['has_pdf'] else "✗"
            print(f"  {pdf_status} {ac['ac_id']}: {ac['missing']} missing ({ac['extracted']}/{ac['expected']})")
    
    # Extract using unified parser
    print(f"\n{'='*80}")
    print("Extracting missing booths...")
    print(f"{'='*80}")
    
    acs_with_pdf = [ac for ac in missing_acs if ac['has_pdf']]
    ac_nums = [ac['ac_num'] for ac in acs_with_pdf]
    
    if ac_nums:
        print(f"\nExtracting {len(ac_nums)} ACs with PDFs...")
        # Use unified parser
        cmd = ['python3', 'scripts/unified-pdf-parser-v2.py'] + [str(ac['ac_num']) for ac in acs_with_pdf[:10]]  # Limit to 10 for now
        print(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print("Errors:", result.stderr)
    else:
        print("No ACs with PDFs found for extraction")


if __name__ == "__main__":
    main()
