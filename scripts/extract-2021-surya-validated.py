#!/usr/bin/env python3
"""
Extract 2021 booth data from transposed PDFs with validation.

Handles Tamil Nadu Form 20 PDFs where:
- Columns are booth numbers
- Rows are candidates
- Party names may span multiple lines

Follows booth-data-parsing rules:
1. Detect booth number in votes array
2. Cross-validate against official totals  
3. Validate booth winner distribution
4. Sanity check vote values

Usage:
    python scripts/extract-2021-surya-validated.py 32 33 43 76 100
"""

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

PDF_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
OFFICIAL_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_official():
    with open(OFFICIAL_PATH) as f:
        return json.load(f)


def run_surya(pdf_path: Path, output_dir: Path) -> dict:
    """Run Surya OCR on PDF and return results."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Run surya - it outputs progress to stderr
    result = subprocess.run(
        ['surya_ocr', str(pdf_path), '--output_dir', str(output_dir), '--disable_math'],
        capture_output=True, text=True, timeout=600
    )
    
    # Find results file regardless of return code (surya sometimes returns non-zero with valid results)
    for item in output_dir.iterdir():
        if item.is_dir():
            results_file = item / 'results.json'
            if results_file.exists():
                with open(results_file) as f:
                    return json.load(f)
    
    # No results found
    if result.returncode != 0:
        print(f"    Surya return code: {result.returncode}")
    print(f"    No results file found in {output_dir}")
    return None


def analyze_columns(pages: list, candidates: list) -> dict:
    """
    Analyze column structure by matching column totals to official vote totals.
    Returns mapping: x_bucket -> candidate_index
    """
    # Sum values by x-position bucket
    col_sums = defaultdict(int)
    col_counts = defaultdict(int)
    
    for page in pages:
        for line in page.get('text_lines', []):
            text = line.get('text', '').strip()
            x = line['polygon'][0][0]
            y = line['polygon'][0][1]
            
            # Skip header area
            if y < 200:
                continue
            
            # Only consider numbers
            if not re.match(r'^\d+$', text):
                continue
            
            val = int(text)
            # Skip totals and very small numbers
            if val > 3000 or val < 1:
                continue
            
            bucket = int(x // 40) * 40
            col_sums[bucket] += val
            col_counts[bucket] += 1
    
    # Find columns with significant totals (likely candidate columns)
    significant = [(b, s) for b, s in col_sums.items() if s > 5000]
    significant.sort(key=lambda x: x[0])  # Sort by x position
    
    # Match columns to candidates by total
    mapping = {}
    used_candidates = set()
    
    for bucket, col_total in significant:
        best_match = -1
        best_ratio = 0
        
        for idx, cand in enumerate(candidates):
            if idx in used_candidates:
                continue
            
            off_total = cand.get('votes', 0)
            if off_total > 0:
                ratio = col_total / off_total
                # Allow 60-140% match (some booths may be missing)
                if 0.6 <= ratio <= 1.4:
                    if best_match < 0 or abs(ratio - 1.0) < abs(best_ratio - 1.0):
                        best_match = idx
                        best_ratio = ratio
        
        if best_match >= 0:
            mapping[bucket] = best_match
            used_candidates.add(best_match)
    
    return mapping


def extract_booth_data(pages: list, mapping: dict, num_candidates: int) -> dict:
    """Extract booth data using discovered column mapping."""
    results = {}
    
    for page in pages:
        # Group text by row (y position)
        rows = defaultdict(list)
        
        for line in page.get('text_lines', []):
            text = line.get('text', '').strip()
            if not text:
                continue
            
            x = line['polygon'][0][0]
            y = line['polygon'][0][1]
            
            # Skip header
            if y < 200:
                continue
            
            row_y = int(y // 12) * 12
            rows[row_y].append((x, text))
        
        # Process each row
        for row_y, items in rows.items():
            items.sort(key=lambda x: x[0])
            
            # Find booth number (first number in range 1-600, x < 150)
            booth_no = None
            booth_x = None
            
            for x, text in items:
                if x > 150:
                    break
                match = re.match(r'^(\d+)[A-Z]?$', text)
                if match:
                    num = int(match.group(1))
                    if 1 <= num <= 600:
                        booth_no = text
                        booth_x = x
                        break
            
            if not booth_no:
                continue
            
            # Extract votes using column mapping
            votes = [0] * num_candidates
            
            for x, text in items:
                if not re.match(r'^\d+$', text):
                    continue
                
                val = int(text)
                
                # Skip if this is the booth number itself
                if booth_x and abs(x - booth_x) < 30:
                    continue
                
                # Skip unreasonable values
                if val > 2000:
                    continue
                
                # Find matching column
                bucket = int(x // 40) * 40
                if bucket in mapping:
                    cand_idx = mapping[bucket]
                    if cand_idx < num_candidates:
                        votes[cand_idx] = val
            
            # Only save if we got meaningful votes
            total = sum(votes)
            if total >= 50:
                results[booth_no] = {
                    'votes': votes,
                    'total': total,
                    'rejected': 0
                }
    
    return results


def validate_booth_votes(booth_no: str, votes: list) -> bool:
    """
    RULE: Detect booth number in votes array.
    Check if any vote suspiciously matches booth number.
    """
    try:
        booth_num = int(booth_no.rstrip('ABCDEFGHIJKLM'))
    except ValueError:
        return True
    
    # Check if booth number appears in first 3 vote columns
    if booth_num in votes[:3]:
        return False
    
    # Check for sequential booth numbers pattern (parsing shift error)
    if len(votes) >= 2 and votes[0] == 0 and 1 <= votes[1] <= 600:
        return False
    
    return True


def validate_results(results: dict, candidates: list, ac_id: str) -> tuple[bool, list[str]]:
    """
    Apply all validation rules from booth-data-parsing.mdc
    """
    issues = []
    
    if not results:
        return False, ["No results extracted"]
    
    num_candidates = len(candidates)
    
    # RULE 1: Check for booth numbers in votes
    for booth_key, data in results.items():
        if not validate_booth_votes(booth_key, data.get('votes', [])):
            issues.append(f"Booth {booth_key}: booth number found in votes array!")
    
    # RULE 2: Cross-validate against official totals
    col_sums = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data.get('votes', [])):
            if i < num_candidates:
                col_sums[i] += v
    
    for i, cand in enumerate(candidates[:3]):
        off_votes = cand.get('votes', 0)
        ext_votes = col_sums[i] if i < len(col_sums) else 0
        
        if off_votes > 0:
            ratio = ext_votes / off_votes
            if ratio < 0.70:
                issues.append(f"{cand.get('party')}: {ext_votes:,}/{off_votes:,} ({ratio:.1%}) - too low")
            elif ratio > 1.30:
                issues.append(f"{cand.get('party')}: {ext_votes:,}/{off_votes:,} ({ratio:.1%}) - too high")
    
    # RULE 3: Validate booth winner distribution
    if len(results) >= 10:
        wins = Counter()
        for data in results.values():
            votes = data.get('votes', [])
            if votes:
                # Only consider candidates with significant votes
                valid_indices = [i for i in range(min(len(votes), num_candidates)) 
                                if i < 5 or votes[i] > 10]
                if valid_indices:
                    winner_idx = max(valid_indices, key=lambda i: votes[i])
                    if winner_idx < len(candidates):
                        wins[candidates[winner_idx].get('party')] += 1
        
        top_2_wins = {p for p, _ in wins.most_common(2)}
        top_2_official = {c.get('party') for c in candidates[:2]}
        
        if top_2_wins != top_2_official:
            issues.append(f"Winner mismatch: extracted top 2 {top_2_wins} vs official {top_2_official}")
    
    # RULE 4: Sanity check - look for impossible values
    for booth_key, data in results.items():
        votes = data.get('votes', [])
        for v in votes:
            if v < 0:
                issues.append(f"Booth {booth_key}: negative vote count")
            if v > 2000:
                issues.append(f"Booth {booth_key}: vote count {v} exceeds 2000")
    
    return len(issues) == 0, issues


def process_ac(ac_num: int, official: dict) -> bool:
    """Process single AC with Surya OCR."""
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
    print(f"  Top 2: {candidates[0].get('party')} ({candidates[0].get('votes'):,}), "
          f"{candidates[1].get('party')} ({candidates[1].get('votes'):,})")
    
    # Run Surya OCR
    print(f"  Running Surya OCR...")
    surya_dir = SURYA_TEMP / f"AC{ac_num:03d}"
    surya_results = run_surya(pdf_path, surya_dir)
    
    if not surya_results:
        print(f"  ❌ Surya OCR failed")
        return False
    
    # Get pages
    key = list(surya_results.keys())[0]
    pages = surya_results[key]
    print(f"  OCR pages: {len(pages)}")
    
    # Analyze column structure
    print(f"  Analyzing column structure...")
    mapping = analyze_columns(pages, candidates)
    
    if len(mapping) < 2:
        print(f"  ❌ Could not map enough columns (found {len(mapping)})")
        return False
    
    print(f"  Mapped {len(mapping)} columns to candidates")
    for bucket, idx in sorted(mapping.items())[:5]:
        print(f"    x≈{bucket}: {candidates[idx].get('party')}")
    
    # Extract booth data
    results = extract_booth_data(pages, mapping, len(candidates))
    print(f"  Extracted {len(results)} booths")
    
    if len(results) < 50:
        print(f"  ❌ Too few booths extracted")
        return False
    
    # Validate
    valid, issues = validate_results(results, candidates, ac_id)
    
    if issues:
        print(f"  ⚠️ Validation issues:")
        for issue in issues[:5]:
            print(f"     - {issue}")
        if len(issues) > 5:
            print(f"     ... and {len(issues) - 5} more")
    
    if not valid:
        print(f"  ❌ Validation failed - not saving")
        return False
    
    # Save results
    output_path = OUTPUT_BASE / ac_id / "2021.json"
    
    final_results = {f"{ac_id}-{k}": v for k, v in results.items()}
    
    cands_out = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND'),
        'symbol': c.get('symbol', '')
    } for i, c in enumerate(candidates)]
    
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
        'source': 'Tamil Nadu CEO - Form 20 (Surya OCR - Validated)',
        'candidates': cands_out,
        'results': final_results
    }
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"  ✅ Saved {len(final_results)} booths")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/extract-2021-surya-validated.py <ac_num> [ac_num2...]")
        print("Example: python scripts/extract-2021-surya-validated.py 32 33 43 76 100")
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
            import traceback
            traceback.print_exc()
            failed.append(ac_num)
    
    print(f"\n{'='*60}")
    print(f"Results: {success}/{len(ac_nums)} succeeded")
    if failed:
        print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
