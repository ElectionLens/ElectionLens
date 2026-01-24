#!/usr/bin/env python3
"""
Check booth data extraction status.

Data source hierarchy:
1. Form 20 PDFs = Ground truth for vote results and actual booth count
2. booths.json = Reference only (booth names, addresses, coordinates)

An AC is "complete" when all booths from its Form 20 PDF have been extracted.
The totalBooths field in each AC's booths.json should reflect Form 20 reality.
"""

import json
import re
from pathlib import Path
from collections import defaultdict

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")


def get_base_booth_no(booth_no: str) -> int:
    """Extract numeric base from booth number (strips suffixes and padding)."""
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def check_ac(ac_id: str) -> dict:
    """Check extraction status for a single AC."""
    booths_file = BOOTHS_DIR / ac_id / "booths.json"
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return None
    
    # Get extracted results
    with open(results_file) as f:
        data = json.load(f)
    results = data.get('results', {})
    extracted_bases = set(get_base_booth_no(k.split('-')[-1]) for k in results.keys())
    extracted_count = len(extracted_bases)
    
    # Get expected count from booths.json (if available)
    # Note: This reflects Form 20 reality after manual verification
    expected_count = None
    if booths_file.exists():
        with open(booths_file) as f:
            meta = json.load(f)
        # Use totalBooths as the Form 20 expected count
        expected_count = meta.get('totalBooths')
        
        # If totalBooths not set, count unique base booth numbers from booths list
        if expected_count is None and 'booths' in meta:
            expected_booths = [b['boothNo'] for b in meta.get('booths', [])]
            expected_bases = set(get_base_booth_no(b) for b in expected_booths)
            expected_count = len(expected_bases)
    
    # Calculate max booth number extracted (gives idea of Form 20 range)
    max_booth = max(extracted_bases) if extracted_bases else 0
    
    # Determine status
    if expected_count and extracted_count >= expected_count:
        status = "COMPLETE"
    elif expected_count:
        status = "PARTIAL"
    else:
        status = "UNKNOWN"
    
    return {
        'ac_id': ac_id,
        'extracted': extracted_count,
        'expected': expected_count,
        'max_booth': max_booth,
        'status': status,
        'gap': (expected_count - extracted_count) if expected_count else None
    }


def main():
    complete_acs = []
    partial_acs = []
    unknown_acs = []
    
    total_extracted = 0
    total_expected = 0
    
    for ac_dir in sorted(BOOTHS_DIR.iterdir()):
        if not ac_dir.is_dir() or not ac_dir.name.startswith('TN-'):
            continue
        
        result = check_ac(ac_dir.name)
        if result:
            total_extracted += result['extracted']
            
            if result['status'] == "COMPLETE":
                complete_acs.append(result)
                if result['expected']:
                    total_expected += result['expected']
                else:
                    total_expected += result['extracted']
            elif result['status'] == "PARTIAL":
                partial_acs.append(result)
                total_expected += result['expected']
            else:
                unknown_acs.append(result)
                total_expected += result['extracted']  # Assume extracted = expected for unknown
    
    # Summary
    print("=" * 60)
    print("TN BOOTH EXTRACTION STATUS (Form 20 as Ground Truth)")
    print("=" * 60)
    print()
    print(f"Total ACs: {len(complete_acs) + len(partial_acs) + len(unknown_acs)}")
    print(f"  Complete: {len(complete_acs)}")
    print(f"  Partial:  {len(partial_acs)}")
    print(f"  Unknown:  {len(unknown_acs)} (need Form 20 verification)")
    print()
    print(f"Total booths extracted: {total_extracted:,}")
    print(f"Total booths expected:  {total_expected:,}")
    if total_expected > 0:
        pct = total_extracted / total_expected * 100
        print(f"Coverage: {pct:.1f}%")
    
    # Partial ACs (have gaps)
    if partial_acs:
        print()
        print("=" * 60)
        print(f"ACs WITH GAPS ({len(partial_acs)}) - need more extraction")
        print("=" * 60)
        for ac in sorted(partial_acs, key=lambda x: -(x['gap'] or 0))[:20]:
            gap = ac['gap'] or 0
            print(f"  {ac['ac_id']}: {ac['extracted']}/{ac['expected']} (gap: {gap}, max booth: {ac['max_booth']})")
    
    # Unknown ACs (need verification)
    if unknown_acs and len(unknown_acs) <= 30:
        print()
        print("=" * 60)
        print(f"ACs NEEDING FORM 20 VERIFICATION ({len(unknown_acs)})")
        print("=" * 60)
        for ac in sorted(unknown_acs, key=lambda x: x['ac_id']):
            print(f"  {ac['ac_id']}: {ac['extracted']} booths (max: {ac['max_booth']})")
    
    # Instructions
    print()
    print("=" * 60)
    print("NOTES")
    print("=" * 60)
    print("- 'Complete' = extracted count >= totalBooths in booths.json")
    print("- 'Partial' = extracted count < totalBooths")
    print("- 'Unknown' = no totalBooths set (needs Form 20 verification)")
    print()
    print("To mark an AC as complete after Form 20 verification:")
    print("  Update public/data/booths/TN/{AC}/booths.json")
    print("  Set 'totalBooths' to the actual booth count from Form 20")


if __name__ == "__main__":
    main()
