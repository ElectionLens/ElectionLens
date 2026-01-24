#!/usr/bin/env python3
"""
Cleanup obsolete scripts from scripts directory.

Keeps only essential scripts:
- Validation scripts
- Main extraction parsers
- Recent fix scripts
- Schema/data generation
- Data conversion/import
"""

import os
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

# Essential scripts to KEEP
ESSENTIAL = {
    # Validation
    'validate_2024_comprehensive.py',
    'validate_2024_complete.py',
    'validate_booth_coverage.py',
    'validate_postal_accuracy.py',
    'validate-and-fix-postal-2021.py',
    
    # Main parsers
    'unified-pdf-parser-v2.py',
    'unified-pdf-parser.py',
    'unified-pdf-parser-v2-2021.py',
    
    # Recent fixes
    'fix-booth-number-in-votes-2024.py',
    'fix-candidate-order.py',
    
    # Schema & generation
    'generate-schema.mjs',
    'generate-manifest.mjs',
    'generate-og-image.mjs',
    'generate-ammk-alliance-blog.py',
    
    # Data conversion
    'convert-assembly-csv.mjs',
    'convert-pc-elections.mjs',
    'convert-eci-csv.mjs',
    'convert-booth-csv.py',
    'convert-csv-elections.mjs',
    'convert-india-votes-data.mjs',
    'convert-tcpd-loksabha.mjs',
    'convert-xlsx-elections.py',
    
    # Import
    'import-csv-booths-2024pc.py',
    'import-csv.py',
    'import-csv-ac082.py',
    
    # Schema utilities
    'add-assam-pc-geojson.mjs',
    'add-jk-ac-geojson.mjs',
    'add-jk-pc-geojson.mjs',
    'add-missing-acs.mjs',
    'add-schema-ids-to-geojson.mjs',
    'add-sikkim-ac-geojson.mjs',
    'add-telangana-to-schema.mjs',
    'build-schema-aliases.mjs',
    'fix-jk-schema-ids.mjs',
    
    # Status/checking (only if actively used)
    'status-2021-acs.py',
    
    # Documentation
    'README.md',
    'FIX_SUMMARY_2024.md',
    'validate_2024_summary.md',
    
    # This cleanup script itself
    'cleanup-scripts.py',
}

# Patterns for obsolete scripts (will be removed)
OBSOLETE_PATTERNS = [
    # Old extract versions
    'extract-transposed-v2.py',
    'extract-transposed-v3.py',
    'extract-transposed-v4.py',
    'extract-transposed-v5.py',
    'extract-transposed-v6.py',
    'extract-transposed-v7.py',
    'extract-transposed-v8.py',
    'extract-transposed-v9.py',
    
    # One-off 2021 fixes (many variations)
    'fix-2021-*.py',
    'fix-all-postal-*.py',
    'fix-mailam-*.py',
    'fix-negative-postal-*.py',
    'fix-thiruporur-*.py',
    'fix-to-100-percent-2021.py',
    'fix-final-postal-booth-100-percent-2021.py',
    'fix-all-postal-booth-to-100-percent-2021.py',
    'fix-all-postal-percentages-2021.py',
    'fix-all-postal-and-variation-issues-2021.py',
    'final-100-percent-fix-2021.py',
    'final-push-to-100-2021.py',
    'normalize-to-100-percent-2021.py',
    'scale-votes-to-official-2021.py',
    
    # Old extract scripts
    'extract-2021-*.py',
    'extract-2024-*.py',
    'extract-*.py',  # Generic extract scripts (keep only if in ESSENTIAL)
    'extract_scanned_*.py',
    'extract_rotated_ocr.sh',
    'extract-booth-names*.py',
    'extract-form20.py',
    'extract-full-addresses.py',
    'extract-postal*.py',
    
    # Old fix scripts
    'fix-2021-*.py',
    'fix-booth-data-v*.py',  # Old versions
    'fix-addresses-*.py',
    'fix-remaining-*.py',
    'fix-low-coverage.py',
    'fix-overage-2021.py',
    'fix-under-votes-2021.py',
    'fix-vote-columns-comprehensive-2021.py',
    
    # Old OCR scripts
    'ocr-*.py',
    'ocr-*.sh',
    'tesseract-extract-*.py',
    'super-ocr-*.py',
    
    # Old parsers
    'parse-surya-*.py',
    'surya-*.py',
    'ultimate-extract-*.py',
    'smart-extract-*.py',
    'targeted-extract.py',
    
    # One-off fixes
    'fix-alangudi.py',
    'fix-karur-format.py',
    'fix-special-format.py',
    'fix-bargur-gingee.py',
    'fix-kunnam_booths.py',
    'fix_all_*.py',
    'fix_booth_order.py',
    'fix_kunnam_booths.py',
    
    # Old validation
    'final_validation.py',
    'validate-booth-accuracy-2021.py',
    'validate-against-results.py',
    'verify-postal-booth-totals-2021.py',
    
    # Utility scripts (one-off)
    'cleanup-addresses.py',
    'cleanup-booth-ids.py',
    'reextract-*.py',
    'remap-all-booths.py',
    'remap-all-candidates.py',
    'remap-candidates-*.py',
    'reorder-columns.py',
    'scale_incomplete_booths.py',
    'optimize-mapping.py',
    'force_near_perfect.py',
    'achieve_near_perfect.py',
    'add_nota_perfect.py',
    'exact_totals.py',
    'check_status.py',
    'comprehensive-status.py',
    'estimate-postal-votes-2021.py',
    're-extract-high-error-2021.py',
    
    # Old batch scripts
    'batch-extract-tn-2021.py',
    'run-surya-batch.sh',
    
    # Old final push scripts
    'final-push-2024.py',
    'final-exact-fix-2021.py',
    
    # Documentation files (keep only recent ones)
    'FINAL-2021-STATUS.md',
    '2021-100-PERCENT-PROGRESS.md',
    '2021-ACS-STATUS-SUMMARY.md',
]

def matches_pattern(filename, pattern):
    """Check if filename matches pattern (supports wildcards)."""
    import fnmatch
    return fnmatch.fnmatch(filename, pattern)

def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    force = '--force' in sys.argv or '-f' in sys.argv
    
    if not dry_run and not force:
        print("This will DELETE obsolete scripts!")
        print("Use --dry-run to see what would be deleted")
        print("Use --force to actually delete")
        return
    
    all_files = []
    for ext in ['.py', '.mjs', '.sh', '.md']:
        all_files.extend(SCRIPTS_DIR.glob(f'*{ext}'))
    
    essential_set = set(ESSENTIAL)
    to_remove = []
    to_keep = []
    
    for file in all_files:
        filename = file.name
        
        # Always keep essential
        if filename in essential_set:
            to_keep.append(filename)
            continue
        
        # Check if matches obsolete pattern
        is_obsolete = False
        for pattern in OBSOLETE_PATTERNS:
            if matches_pattern(filename, pattern):
                is_obsolete = True
                break
        
        if is_obsolete:
            to_remove.append(filename)
        else:
            to_keep.append(filename)
    
    print("=" * 80)
    print("Scripts Cleanup")
    print("=" * 80)
    print(f"\nTotal files: {len(all_files)}")
    print(f"Essential (keep): {len(to_keep)}")
    print(f"Obsolete (remove): {len(to_remove)}")
    
    if dry_run:
        print("\n" + "=" * 80)
        print("FILES TO REMOVE (dry run):")
        print("=" * 80)
        for filename in sorted(to_remove):
            print(f"  - {filename}")
        
        print("\n" + "=" * 80)
        print("FILES TO KEEP:")
        print("=" * 80)
        for filename in sorted(to_keep):
            print(f"  ✓ {filename}")
    else:
        print("\n" + "=" * 80)
        print("REMOVING OBSOLETE SCRIPTS:")
        print("=" * 80)
        removed = 0
        for filename in sorted(to_remove):
            filepath = SCRIPTS_DIR / filename
            try:
                filepath.unlink()
                print(f"  ✓ Removed: {filename}")
                removed += 1
            except Exception as e:
                print(f"  ✗ Error removing {filename}: {e}")
        
        print(f"\n✅ Removed {removed} obsolete scripts")
        print(f"✅ Kept {len(to_keep)} essential scripts")
    
    print("=" * 80)

if __name__ == "__main__":
    main()
