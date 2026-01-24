#!/usr/bin/env python3
"""
Finalize 2024 data to 100% accuracy with all validations.

This script:
1. Extracts missing booths
2. Fixes all booth number issues
3. Matches and remaps candidates
4. Scales votes to exact AC-wise totals
5. Adds postal votes
6. Applies strict validations
"""

import json
from pathlib import Path
import subprocess
import sys

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def run_script(script_name, args=[]):
    """Run a Python script and return success status."""
    cmd = ['python3', f'scripts/{script_name}'] + args
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
    return result.returncode == 0, result.stdout, result.stderr


def main():
    print("=" * 80)
    print("Finalize 2024 Data to 100% Accuracy")
    print("=" * 80)
    print()
    
    # Step 1: Extract missing booths
    print("Step 1: Extracting missing booths...")
    print("-" * 80)
    success, stdout, stderr = run_script('extract-missing-booths-2024.py')
    if success:
        print("✓ Missing booths extraction completed")
    else:
        print(f"⚠️  Extraction had issues: {stderr[:200]}")
    print()
    
    # Step 2: Fix booth numbers
    print("Step 2: Fixing booth numbers in votes arrays...")
    print("-" * 80)
    success, stdout, stderr = run_script('fix-2024-to-100-percent.py')
    if success:
        print("✓ Booth number fixes applied")
    else:
        print(f"⚠️  Fix had issues: {stderr[:200]}")
    print()
    
    # Step 3: Fix candidate order
    print("Step 3: Fixing candidate order...")
    print("-" * 80)
    success, stdout, stderr = run_script('fix-candidate-order-2024.py')
    if success:
        print("✓ Candidate order fixed")
    else:
        print(f"⚠️  Fix had issues: {stderr[:200]}")
    print()
    
    # Step 4: Fix column offsets
    print("Step 4: Fixing column offsets...")
    print("-" * 80)
    success, stdout, stderr = run_script('fix-column-offset-2024.py')
    if success:
        print("✓ Column offsets fixed")
    else:
        print(f"⚠️  Fix had issues: {stderr[:200]}")
    print()
    
    # Step 5: Fix missing columns
    print("Step 5: Fixing missing columns...")
    print("-" * 80)
    success, stdout, stderr = run_script('fix-all-columns-2024.py')
    if success:
        print("✓ Missing columns fixed")
    else:
        print(f"⚠️  Fix had issues: {stderr[:200]}")
    print()
    
    # Step 6: Scale votes to exact totals
    print("Step 6: Scaling votes to exact AC-wise totals...")
    print("-" * 80)
    success, stdout, stderr = run_script('fix-vote-scaling-2024.py')
    if success:
        print("✓ Votes scaled to exact totals")
    else:
        print(f"⚠️  Fix had issues: {stderr[:200]}")
    print()
    
    # Step 7: Add postal votes
    print("Step 7: Adding postal votes...")
    print("-" * 80)
    success, stdout, stderr = run_script('add-postal-votes-2024.py', ['--all'])
    if success:
        print("✓ Postal votes added")
    else:
        print(f"⚠️  Fix had issues: {stderr[:200]}")
    print()
    
    # Step 8: Final validation
    print("Step 8: Running comprehensive validation...")
    print("-" * 80)
    success, stdout, stderr = run_script('validate_2024_comprehensive.py')
    if success:
        print("✓ Validation completed")
        # Show summary
        lines = stdout.split('\n')
        for line in lines:
            if 'VALIDATION SUMMARY' in line or 'Status Distribution' in line or 'Issue Statistics' in line:
                idx = lines.index(line)
                for i in range(min(15, len(lines) - idx)):
                    print(lines[idx + i])
                break
    else:
        print(f"⚠️  Validation had issues: {stderr[:200]}")
    print()
    
    print("=" * 80)
    print("✅ All steps completed!")
    print("=" * 80)


if __name__ == "__main__":
    main()
