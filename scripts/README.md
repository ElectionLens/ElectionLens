# Scripts Directory

This directory contains scripts for data extraction, validation, and processing.

## Essential Scripts

### Validation
- `validate_2024_comprehensive.py` - Comprehensive validation for 2024 data (all parsing rules)
- `validate_2024_complete.py` - Complete validation for 2024 PC booth data
- `validate_booth_coverage.py` - Validate booth data coverage
- `validate_postal_accuracy.py` - Validate postal vote accuracy

### Data Extraction (2024)
- `unified-pdf-parser-v2.py` - Main unified PDF parser for 2024 data
- `unified-pdf-parser.py` - Original unified PDF parser (fallback)

### Data Extraction (2021)
- `unified-pdf-parser-v2-2021.py` - Unified PDF parser for 2021 data

### Data Fixes
- `fix-booth-number-in-votes-2024.py` - Fix booth numbers leaking into votes array

### Schema & Data Generation
- `generate-schema.mjs` - Generate schema.json
- `generate-manifest.mjs` - Generate manifest
- `generate-og-image.mjs` - Generate OG images

### Data Conversion
- `convert-assembly-csv.mjs` - Convert assembly CSV data
- `convert-pc-elections.mjs` - Convert PC election data
- `convert-eci-csv.mjs` - Convert ECI CSV data

### Import
- `import-csv-booths-2024pc.py` - Import CSV booth data for 2024 PC
- `import-csv.py` - General CSV import

## Usage

### Validation
```bash
# Comprehensive validation
python3 scripts/validate_2024_comprehensive.py

# Coverage validation
python3 scripts/validate_booth_coverage.py

# Complete validation
python3 scripts/validate_2024_complete.py
```

### Extraction
```bash
# Extract single AC
python3 scripts/unified-pdf-parser-v2.py 30

# Extract all needing extraction
python3 scripts/unified-pdf-parser-v2.py --all
```

### Fixes
```bash
# Fix booth number issues
python3 scripts/fix-booth-number-in-votes-2024.py

# Fix specific AC
python3 scripts/fix-booth-number-in-votes-2024.py TN-001
```

## Obsolete Scripts

Many scripts in this directory are obsolete one-off fixes or old versions. They are kept for historical reference but should not be used for new work.
