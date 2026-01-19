#!/usr/bin/env python3
"""
Extract booth data from transposed format PDFs - handles multi-line booth IDs.

Key discovery: After page 12, booth IDs split across 2 lines:
  Line 1: "99    2                  Polling Station No."
  Line 2: "106   105A   105   104   103   102   101   100   99A"
"""

import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict

FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"
ELECTION_DATA = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/elections/ac/TN/2021.json")
OUTPUT_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/vcn/public/data/booths/TN")


def load_official_data():
    with open(ELECTION_DATA) as f:
        return json.load(f)


def normalize_name(name: str) -> str:
    name = name.upper()
    name = re.sub(r'[^A-Z\s]', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()


def parse_transposed_pdf(pdf_path: Path, num_candidates: int):
    """Parse transposed format PDF with multi-line booth IDs."""
    result = subprocess.run(
        ['pdftotext', '-layout', str(pdf_path), '-'],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return None, None, None
    
    text = result.stdout
    lines = text.split('\n')
    
    candidate_votes = defaultdict(dict)
    candidate_names = {}
    current_booth_ids = []
    all_booth_ids = set()
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Detect "Polling Station No" - booth IDs might be on this or next line
        if 'Polling Station' in line or 'Station No' in line:
            # Try to get booth IDs from current line
            parts = re.findall(r'\b(\d+[A-Z]?)\b', line)
            
            # Filter out small numbers that are likely row indices (1, 2)
            booth_ids = [p for p in parts if not (p.isdigit() and int(p) <= 2)]
            
            # If not enough booth IDs on this line, check next few lines
            if len(booth_ids) < 5:
                for j in range(1, 4):
                    if i + j < len(lines):
                        next_line = lines[i + j].strip()
                        # Skip empty lines and metadata
                        if not next_line or any(x in next_line.upper() for x in 
                            ['DESIYA', 'DRAVIDA', 'PARTY', 'INDEPENDENT', 'SL.', 'FORM']):
                            continue
                        # Check if it has booth-like numbers
                        more_parts = re.findall(r'\b(\d+[A-Z]?)\b', next_line)
                        more_booths = [p for p in more_parts if not (p.isdigit() and int(p) <= 2)]
                        if len(more_booths) >= 5:
                            booth_ids = more_booths
                            break
            
            if len(booth_ids) >= 5:
                current_booth_ids = booth_ids
                all_booth_ids.update(booth_ids)
            i += 1
            continue
        
        # Skip header/footer rows
        skip_patterns = ['SL. NO', 'FORM 20', 'GENERAL ELECTION', 'ASSEMBLY CONSTITUENCY',
                        'No. of Electors', 'Total of valid', 'rejected', 'NOTA', 
                        'tendered', 'Total', 'Page ', 'No. of valid votes']
        if any(x.lower() in line.lower() for x in skip_patterns):
            i += 1
            continue
        
        # Skip empty lines and party-only lines
        if not line or line.upper() in ['DESIYA MURPOKKU', 'DRAVIDA KAZHAGAM', 
                                         'DRAVIDA MUNNETRA', 'KAZHAGAM.', 
                                         'ANNA MGR DRAVIDA', 'MAKKAL KALGAM']:
            i += 1
            continue
        
        # Parse candidate data row
        nums = re.findall(r'\b(\d+)\b', line)
        
        if len(nums) >= len(current_booth_ids) + 1 and len(current_booth_ids) >= 5:
            possible_idx = int(nums[len(current_booth_ids)])
            
            if 3 <= possible_idx <= 20:
                votes = [int(nums[j]) for j in range(len(current_booth_ids))]
                
                for j, booth_id in enumerate(current_booth_ids):
                    candidate_votes[possible_idx][booth_id] = votes[j]
                
                if possible_idx not in candidate_names:
                    text_part = line
                    for n in nums[:len(current_booth_ids)+1]:
                        text_part = text_part.replace(n, '', 1)
                    text_part = re.sub(r'\s+', ' ', text_part).strip()
                    candidate_names[possible_idx] = text_part
        
        i += 1
    
    sorted_booths = sorted(all_booth_ids, 
        key=lambda x: (int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0, x))
    
    return candidate_votes, candidate_names, sorted_booths


def match_candidates(candidate_names: dict, official_candidates: list):
    """Match PDF candidates to official by name."""
    mapping = {}
    used_official = set()
    
    for pdf_idx in sorted(candidate_names.keys()):
        pdf_name = normalize_name(candidate_names[pdf_idx])
        if not pdf_name:
            continue
        
        best_match = -1
        best_score = 0
        
        for off_idx, off_cand in enumerate(official_candidates):
            if off_idx in used_official:
                continue
            
            off_name = normalize_name(off_cand['name'])
            
            pdf_words = set(pdf_name.split())
            off_words = set(off_name.split())
            
            if len(pdf_words) == 0 or len(off_words) == 0:
                continue
            
            common = len(pdf_words & off_words)
            score = common / max(len(pdf_words), len(off_words))
            
            # Boost if party matches
            if off_cand['party'].upper() in candidate_names[pdf_idx].upper():
                score += 0.3
            
            if score > best_score:
                best_score = score
                best_match = off_idx
        
        if best_score >= 0.3 and best_match >= 0:
            mapping[pdf_idx] = best_match
            used_official.add(best_match)
    
    return mapping


def build_results(candidate_votes: dict, mapping: dict, booth_ids: list, 
                  num_candidates: int, ac_id: str):
    """Build results dict."""
    results = {}
    
    for booth_id in booth_ids:
        votes = [0] * num_candidates
        
        for pdf_idx, off_idx in mapping.items():
            if booth_id in candidate_votes.get(pdf_idx, {}):
                votes[off_idx] = candidate_votes[pdf_idx][booth_id]
        
        if sum(votes) > 0:
            full_booth_id = f"{ac_id}-{booth_id}"
            results[full_booth_id] = {
                'votes': votes,
                'total': sum(votes),
                'rejected': 0
            }
    
    return results


def validate_and_save(results: dict, ac_id: str, official_data: dict):
    """Validate and save."""
    if not results:
        return False, 100
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    ac_name = official.get('constituencyName', ac_id)
    
    col_totals = [0] * num_candidates
    for data in results.values():
        for i, v in enumerate(data['votes']):
            if i < num_candidates:
                col_totals[i] += v
    
    errors = []
    print(f"  Validation:")
    for i in range(min(5, num_candidates)):
        off = official['candidates'][i]['votes']
        calc = col_totals[i]
        if off > 100:
            pct = abs(calc - off) / off * 100
            errors.append(pct)
            status = "✓" if pct < 10 else "✗"
            print(f"    {status} {official['candidates'][i]['party']}: Off={off:,} Calc={calc:,} ({pct:.1f}%)")
    
    avg_error = sum(errors) / len(errors) if errors else 100
    
    if avg_error > 20:
        return False, avg_error
    
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    booth_list = []
    for booth_id in sorted(results.keys(), key=lambda x: (
        int(re.search(r'\d+', x.split('-')[-1]).group()) if re.search(r'\d+', x.split('-')[-1]) else 0, x)):
        booth_no = booth_id.split('-')[-1]
        booth_list.append({
            "id": booth_id, "boothNo": booth_no,
            "num": int(re.search(r'\d+', booth_no).group()) if re.search(r'\d+', booth_no) else 0,
            "type": "regular", "name": f"Booth {booth_no}",
            "address": f"{ac_name} - Booth {booth_no}", "area": ac_name
        })
    
    with open(output_dir / "booths.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "state": "Tamil Nadu",
            "totalBooths": len(booth_list), "lastUpdated": "2021-04-06",
            "source": "Tamil Nadu CEO - Form 20 (Transposed)", "booths": booth_list
        }, f, indent=2)
    
    with open(output_dir / "2021.json", 'w') as f:
        json.dump({
            "acId": ac_id, "acName": ac_name, "year": 2021,
            "totalBooths": len(results),
            "candidates": [{'name': c['name'], 'party': c['party'], 'symbol': c.get('symbol', '')}
                          for c in official['candidates']],
            "results": results
        }, f, indent=2)
    
    return True, avg_error


def process_ac(ac_id: str, official_data: dict):
    """Process a single AC."""
    ac_num = int(ac_id.replace('TN-', ''))
    pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
    
    if not pdf_path.exists():
        print(f"  No PDF found")
        return False
    
    official = official_data[ac_id]
    num_candidates = len(official['candidates'])
    
    result = parse_transposed_pdf(pdf_path, num_candidates)
    if result[0] is None:
        print(f"  Failed to parse")
        return False
    
    candidate_votes, candidate_names, booth_ids = result
    
    print(f"  Found {len(booth_ids)} booths, {len(candidate_names)} candidates")
    
    # Debug: show vote totals per candidate
    for pdf_idx in sorted(candidate_votes.keys())[:5]:
        total = sum(candidate_votes[pdf_idx].values())
        booths = len(candidate_votes[pdf_idx])
        print(f"    PDF {pdf_idx}: {booths} booths, {total:,} votes")
    
    mapping = match_candidates(candidate_names, official['candidates'])
    print(f"  Matched {len(mapping)}/{num_candidates} candidates")
    
    results = build_results(candidate_votes, mapping, booth_ids, num_candidates, ac_id)
    
    if not results:
        print(f"  No results built")
        return False
    
    success, error = validate_and_save(results, ac_id, official_data)
    
    if success:
        print(f"  ✅ Saved {len(results)} booths ({error:.1f}% avg error)")
    else:
        print(f"  ❌ Error too high ({error:.1f}%)")
    
    return success


def main():
    official_data = load_official_data()
    
    # Test
    transposed_acs = ['TN-071']
    
    for ac_id in transposed_acs:
        name = official_data.get(ac_id, {}).get('constituencyName', ac_id)
        print(f"\n{'='*50}")
        print(f"{ac_id} {name}")
        print('='*50)
        process_ac(ac_id, official_data)


if __name__ == "__main__":
    main()
