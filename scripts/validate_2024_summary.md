# 2024 Booth Data Validation Summary

## Critical Issues Found

### 1. Booth Number in Votes Array (CRITICAL)
- **16,992 booths affected** across 204 ACs
- This is a parsing error where booth numbers are leaking into vote counts
- Example: Booth TN-001-002 has booth number "2" appearing in votes array at position 0 or 1
- **Impact**: Vote totals are incorrect, affecting accuracy of all analyses

### 2. Invalid Vote Values
- **2 instances** of invalid vote values (negative or unusually high)
- Needs investigation

### 3. Vote Total Mismatches
- Many ACs showing >5% error when comparing extracted totals vs official PC results
- This is likely a consequence of the booth number parsing errors

### 4. Booth Coverage
- Overall coverage: **99.9%** (68,446/68,505 booths)
- 2 ACs with anomalous coverage (>150%):
  - TN-215: 286/146 booths (195.9%)
  - TN-031: 351/203 booths (172.9%)

## Validation Results

### Status Distribution
- ✅ Excellent (no issues): **0 ACs**
- ✓ Good (warnings only): **0 ACs**
- ⚠️ Warning (minor issues): **30 ACs**
- ❌ Error (major issues): **204 ACs**
- ❓ Missing: **0 ACs**

### Total Issues
- **17,890 total issues**
- **199 warnings**
- **16,992 booth number in votes errors**
- **2 invalid vote value errors**

## Recommended Actions

1. **URGENT**: Fix booth number parsing in extraction scripts
   - The booth number is being included in the votes array
   - Need to identify and skip the booth number column during parsing

2. Investigate the 2 ACs with anomalous booth counts (TN-215, TN-031)

3. Re-validate after fixes to ensure accuracy

## Validation Scripts Used

1. `validate_2024_comprehensive.py` - Checks all rules from booth-data-parsing.mdc
2. `validate_2024_complete.py` - Validates coverage and vote totals
3. `validate_booth_coverage.py` - Checks booth count coverage
