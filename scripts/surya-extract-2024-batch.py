#!/usr/bin/env python3
"""
Batch Surya OCR extraction for 2024 TN PC booth data.
Extracts booth-wise vote data from Form 20 PDFs using Surya OCR.

Usage:
    python scripts/surya-extract-2024-batch.py                  # Process all ACs with empty votes
    python scripts/surya-extract-2024-batch.py 7                # Process single AC
    python scripts/surya-extract-2024-batch.py 7 15 23          # Process specific ACs
    python scripts/surya-extract-2024-batch.py --run-surya 7    # Run Surya OCR first, then parse
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# Configuration
FORM20_DIR = Path.home() / "Desktop" / "GELS_2024_Form20_PDFs"
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA_PATH = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")
SURYA_OUTPUT_BASE = Path("/tmp/surya_2024")


def load_data():
    """Load PC data and schema."""
    with open(PC_DATA_PATH) as f:
        pc_data = json.load(f)
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    return pc_data, schema


def get_pc_for_ac(ac_id: str, schema: dict) -> tuple:
    """Get PC ID and candidates for an AC."""
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id, pc_info.get('name', '')
    return None, None


def run_surya_ocr(pdf_path: Path, output_dir: Path) -> bool:
    """Run Surya OCR on a PDF."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"    Running Surya OCR on {pdf_path.name}...")
    
    try:
        result = subprocess.run(
            ['surya_ocr', str(pdf_path), '--output_dir', str(output_dir)],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            print(f"    ❌ Surya OCR failed: {result.stderr[:200]}")
            return False
        
        return True
    except FileNotFoundError:
        print("    ❌ Surya not installed. Install with: pip install surya-ocr")
        return False
    except subprocess.TimeoutExpired:
        print("    ❌ Surya OCR timed out")
        return False
    except Exception as e:
        print(f"    ❌ Surya OCR error: {e}")
        return False


def analyze_columns(pages: list) -> dict:
    """Analyze column structure by summing numbers per x-bucket."""
    col_sums = defaultdict(int)
    col_counts = defaultdict(int)
    
    for page in pages:
        text_lines = page.get('text_lines', [])
        
        for line in text_lines:
            text = line.get('text', '').strip()
            polygon = line.get('polygon', [[0, 0]])
            y = polygon[0][1] if polygon else 0
            x = polygon[0][0] if polygon else 0
            
            # Skip header area
            if y < 200 or not re.match(r'^\d+$', text):
                continue
            
            val = int(text)
            # Skip very large numbers (totals) and very small (serial nos)
            if val > 3000 or val < 10:
                continue
            
            bucket = int(x // 40) * 40
            col_sums[bucket] += val
            col_counts[bucket] += 1
    
    return col_sums, col_counts


def find_column_mapping(col_sums: dict, candidates: list, pc_data: dict, ac_id: str) -> dict:
    """Find mapping from PDF column buckets to official candidates."""
    # Get expected vote totals for this AC from PC data
    ac_votes = {}
    for cand in candidates:
        for ac_wise in cand.get('acWiseVotes', []):
            # Match AC name loosely
            ac_name_norm = ac_wise.get('acName', '').upper().replace(' ', '')
            if any(word in ac_name_norm for word in ac_id.upper().split('-')):
                ac_votes[cand.get('party', 'IND')] = ac_wise.get('votes', 0)
    
    # Filter columns with significant vote totals
    significant_cols = [(bucket, total) for bucket, total in col_sums.items() 
                        if 5000 < total < 500000]
    significant_cols.sort(key=lambda x: x[0])  # Sort by x position
    
    mapping = {}  # bucket -> candidate_idx
    used = set()
    
    for bucket, col_total in significant_cols:
        best_match = -1
        best_ratio = 0
        
        for idx, c in enumerate(candidates):
            if idx in used:
                continue
            
            off_total = c.get('votes', 0)
            if off_total > 0:
                ratio = col_total / off_total
                # Allow wider range since we're matching AC-level data
                if 0.5 <= ratio <= 2.0:
                    if best_match < 0 or abs(ratio - 1.0) < abs(best_ratio - 1.0):
                        best_ratio = ratio
                        best_match = idx
        
        if best_match >= 0:
            mapping[bucket] = best_match
            used.add(best_match)
    
    return mapping


def extract_booth_data(pages: list, mapping: dict, num_candidates: int) -> dict:
    """Extract booth data using discovered column mapping."""
    results = {}
    
    for page in pages:
        text_lines = page.get('text_lines', [])
        
        # Group by row (y position)
        rows = defaultdict(list)
        for line in text_lines:
            text = line.get('text', '').strip()
            polygon = line.get('polygon', [[0, 0]])
            y = polygon[0][1] if polygon else 0
            x = polygon[0][0] if polygon else 0
            
            if y < 200 or not text:
                continue
            
            row_y = int(y // 14) * 14
            rows[row_y].append((x, text))
        
        # Process each row
        for row_y, items in rows.items():
            # Find booth number (typically x < 180, format: number or numberA)
            booth = None
            for x, text in items:
                if 60 < x < 180 and re.match(r'^\d+[A-Z]?$', text):
                    booth_val = int(re.match(r'^\d+', text).group())
                    if 1 <= booth_val <= 700:
                        booth = text
                        break
            
            if not booth:
                continue
            
            # Extract votes using mapping
            votes = [0] * num_candidates
            
            for x, text in items:
                if not re.match(r'^\d+$', text):
                    continue
                
                val = int(text)
                if val > 2500 or val < 5:  # Skip totals and very small numbers
                    continue
                
                # Find matching column bucket
                for bucket_offset in [0, -20, 20, -40, 40]:
                    bucket = int((x + bucket_offset) // 40) * 40
                    if bucket in mapping:
                        cand_idx = mapping[bucket]
                        if cand_idx < num_candidates and votes[cand_idx] == 0:
                            votes[cand_idx] = val
                            break
            
            total = sum(votes)
            match = re.match(r'^(\d+)', booth)
            booth_key = f"{int(match.group()):03d}" if match else booth
            
            if total > 50 and booth_key not in results:
                results[booth_key] = {
                    'votes': votes,
                    'total': total,
                    'rejected': 0
                }
    
    return results


def parse_surya_results(surya_path: Path, candidates: list, pc_data: dict, ac_id: str) -> dict:
    """Parse Surya OCR results."""
    if not surya_path.exists():
        return {}
    
    with open(surya_path) as f:
        surya = json.load(f)
    
    # Get the key (AC### format)
    key = list(surya.keys())[0] if surya else None
    if not key:
        return {}
    
    pages = surya[key]
    print(f"    OCR pages: {len(pages)}")
    
    # Analyze columns
    col_sums, col_counts = analyze_columns(pages)
    
    # Find column mapping
    mapping = find_column_mapping(col_sums, candidates, pc_data, ac_id)
    
    if len(mapping) < 2:
        print(f"    ⚠️  Only found {len(mapping)} column mappings")
        # Try alternative parsing
        return extract_booth_data_fallback(pages, len(candidates))
    
    print(f"    Mapped {len(mapping)} columns to candidates")
    
    # Extract booth data
    return extract_booth_data(pages, mapping, len(candidates))


def extract_booth_data_fallback(pages: list, num_candidates: int) -> dict:
    """Fallback extraction when column mapping fails."""
    results = {}
    
    for page in pages:
        text_lines = page.get('text_lines', [])
        
        # Group by row
        rows = defaultdict(list)
        for line in text_lines:
            text = line.get('text', '').strip()
            polygon = line.get('polygon', [[0, 0]])
            y = polygon[0][1] if polygon else 0
            x = polygon[0][0] if polygon else 0
            
            if y < 200:
                continue
            
            row_y = int(y // 14) * 14
            rows[row_y].append((x, text))
        
        # Process each row
        for row_y, items in sorted(rows.items()):
            items.sort(key=lambda x: x[0])  # Sort by x position
            
            # Extract all numbers from row
            numbers = []
            for x, text in items:
                if re.match(r'^\d+$', text):
                    numbers.append((x, int(text)))
            
            if len(numbers) < 4:
                continue
            
            # Try to identify booth number (first number in reasonable range)
            booth = None
            vote_start = 0
            
            for i, (x, val) in enumerate(numbers):
                if 1 <= val <= 700 and x < 200:
                    booth = f"{val:03d}"
                    vote_start = i + 1
                    break
            
            if not booth or booth in results:
                continue
            
            # Extract votes (reasonable vote values)
            votes = []
            for x, val in numbers[vote_start:]:
                if 5 <= val <= 2500:
                    votes.append(val)
                    if len(votes) >= num_candidates:
                        break
            
            if len(votes) >= 3 and sum(votes) >= 50:
                while len(votes) < num_candidates:
                    votes.append(0)
                results[booth] = {
                    'votes': votes[:num_candidates],
                    'total': sum(votes[:num_candidates]),
                    'rejected': 0
                }
    
    return results


def process_ac(ac_num: int, pc_data: dict, schema: dict, run_surya: bool = False) -> dict:
    """Process a single AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    # Get existing data
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    
    if not booths_file.exists():
        return {'status': 'no_metadata'}
    
    with open(booths_file) as f:
        meta = json.load(f)
    
    expected_booths = set()
    for b in meta.get('booths', []):
        booth_no = b.get('boothNo', '')
        match = re.match(r'^0*(\d+)', str(booth_no))
        if match:
            expected_booths.add(int(match.group(1)))
    
    # Load existing results
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
    else:
        data = {
            'acId': ac_id,
            'acName': meta.get('acName', ''),
            'year': 2024,
            'electionType': 'parliament',
            'totalBooths': 0,
            'source': 'Tamil Nadu CEO - Form 20',
            'candidates': [],
            'results': {}
        }
    
    # Check for empty votes
    empty_count = sum(1 for r in data.get('results', {}).values() 
                      if not r.get('votes') or len(r.get('votes', [])) == 0)
    
    if empty_count == 0 and len(data.get('results', {})) >= len(expected_booths) * 0.9:
        return {'status': 'complete', 'booths': len(data.get('results', {}))}
    
    print(f"\n{'='*60}")
    print(f"{ac_id} - {meta.get('acName', '')}")
    print(f"{'='*60}")
    print(f"  Expected: {len(expected_booths)} booths")
    print(f"  Existing: {len(data.get('results', {}))} booths ({empty_count} with empty votes)")
    
    # Get PC candidates
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        print(f"  ⚠️  Could not find PC for {ac_id}")
        return {'status': 'no_pc'}
    
    pc_info = pc_data.get(pc_id, {})
    candidates = pc_info.get('candidates', [])
    
    if not candidates:
        print(f"  ⚠️  No candidates found for PC {pc_id}")
        return {'status': 'no_candidates'}
    
    print(f"  PC: {pc_id} ({pc_name}) - {len(candidates)} candidates")
    
    # Check for PDF
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    if not pdf_path.exists():
        print(f"  ❌ PDF not found: {pdf_path}")
        return {'status': 'no_pdf'}
    
    # Run Surya if requested
    surya_dir = SURYA_OUTPUT_BASE / f"AC{ac_num:03d}"
    surya_results = surya_dir / f"AC{ac_num:03d}" / "results.json"
    
    if run_surya or not surya_results.exists():
        if not run_surya_ocr(pdf_path, surya_dir):
            return {'status': 'surya_failed'}
    
    if not surya_results.exists():
        # Try alternative path
        alt_path = surya_dir / "results.json"
        if alt_path.exists():
            surya_results = alt_path
        else:
            print(f"  ❌ Surya results not found: {surya_results}")
            return {'status': 'no_surya_results'}
    
    # Parse Surya results
    extracted = parse_surya_results(surya_results, candidates, pc_data, ac_id)
    
    if not extracted:
        print(f"  ❌ No booths extracted from Surya results")
        return {'status': 'no_extraction'}
    
    print(f"  Extracted {len(extracted)} booths from Surya")
    
    # Update candidates in output
    data['candidates'] = [{
        'slNo': i + 1,
        'name': c.get('name', ''),
        'party': c.get('party', 'IND')
    } for i, c in enumerate(candidates)]
    
    # Merge results
    new_count = 0
    updated_count = 0
    
    for booth_key, booth_data in extracted.items():
        full_booth_id = f"{ac_id}-{booth_key}"
        
        if full_booth_id not in data['results']:
            data['results'][full_booth_id] = booth_data
            new_count += 1
        elif not data['results'][full_booth_id].get('votes'):
            data['results'][full_booth_id] = booth_data
            updated_count += 1
    
    data['totalBooths'] = len(data['results'])
    data['source'] = 'Tamil Nadu CEO - Form 20 (Surya OCR)'
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"  ✅ Saved: +{new_count} new, {updated_count} updated = {len(data['results'])} total")
    
    # Validate
    validate_extraction(data, candidates)
    
    return {
        'status': 'success',
        'new': new_count,
        'updated': updated_count,
        'total': len(data['results'])
    }


def validate_extraction(data: dict, candidates: list):
    """Validate extracted data."""
    results = data.get('results', {})
    num_candidates = len(candidates)
    
    vote_totals = [0] * num_candidates
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                vote_totals[i] += v
    
    print(f"\n  Validation (top 3):")
    for i in range(min(3, num_candidates)):
        off_votes = candidates[i].get('votes', 0)
        extracted = vote_totals[i]
        ratio = extracted / off_votes if off_votes > 0 else 0
        status = "✓" if 0.7 <= ratio <= 1.3 else "✗"
        party = candidates[i].get('party', 'IND')
        print(f"    {status} {party:8}: {extracted:>8,} / {off_votes:>8,} ({ratio:.2f}x)")


def find_acs_needing_extraction() -> list:
    """Find ACs with empty votes or missing booths."""
    needing = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        results_file = OUTPUT_BASE / ac_id / "2024.json"
        booths_file = OUTPUT_BASE / ac_id / "booths.json"
        
        if not booths_file.exists():
            continue
        
        with open(booths_file) as f:
            meta = json.load(f)
        expected = len(meta.get('booths', []))
        
        if not results_file.exists():
            needing.append((ac_num, expected, 0, expected))
            continue
        
        with open(results_file) as f:
            data = json.load(f)
        
        results = data.get('results', {})
        empty_count = sum(1 for r in results.values() 
                         if not r.get('votes') or len(r.get('votes', [])) == 0)
        
        if empty_count > len(results) * 0.1:  # More than 10% empty
            needing.append((ac_num, expected, len(results), empty_count))
    
    # Sort by empty count descending
    needing.sort(key=lambda x: -x[3])
    
    return needing


def main():
    pc_data, schema = load_data()
    
    run_surya = '--run-surya' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--run-surya']
    
    if args:
        # Process specific ACs
        ac_nums = [int(a) for a in args if a.isdigit()]
        print(f"Processing {len(ac_nums)} specific ACs...")
        
        for ac_num in ac_nums:
            result = process_ac(ac_num, pc_data, schema, run_surya)
            print(f"Result: {result}")
    else:
        # Find and process ACs needing extraction
        needing = find_acs_needing_extraction()
        
        print("=" * 70)
        print("2024 TN Booth Data - Surya Extraction")
        print("=" * 70)
        print(f"\nFound {len(needing)} ACs needing extraction:\n")
        
        for ac_num, expected, total, empty in needing[:20]:
            print(f"  TN-{ac_num:03d}: {total}/{expected} booths, {empty} empty votes")
        
        if len(needing) > 20:
            print(f"  ... and {len(needing) - 20} more")
        
        print(f"\nTo process, run:")
        print(f"  python scripts/surya-extract-2024-batch.py --run-surya {needing[0][0]}")
        print(f"  python scripts/surya-extract-2024-batch.py --run-surya {' '.join(str(n[0]) for n in needing[:5])}")
        
        # Check for existing Surya results
        print(f"\nChecking for existing Surya results...")
        with_results = []
        for ac_num, _, _, _ in needing:
            surya_results = SURYA_OUTPUT_BASE / f"AC{ac_num:03d}" / f"AC{ac_num:03d}" / "results.json"
            if surya_results.exists():
                with_results.append(ac_num)
        
        if with_results:
            print(f"Found existing Surya results for: {with_results}")
            print(f"Run: python scripts/surya-extract-2024-batch.py {' '.join(str(n) for n in with_results)}")


if __name__ == "__main__":
    main()
