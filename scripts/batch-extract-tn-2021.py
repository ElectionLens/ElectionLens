#!/usr/bin/env python3
"""
Batch extract booth-wise data for all Tamil Nadu Assembly Constituencies (2021).

Sources:
- TNLA_2021_PDFs: Form 20 results (booth-wise votes)
- TN_PollingStations_English: Polling station details

Output:
- public/data/booths/TN/TN-XXX/booths.json (polling station metadata)
- public/data/booths/TN/TN-XXX/2021.json (booth-wise vote results)
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

# Configuration
FORM20_DIR = Path(os.path.expanduser("~/Desktop/TNLA_2021_PDFs"))
POLLING_STATIONS_DIR = Path(os.path.expanduser("~/Desktop/TN_PollingStations_English"))
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

# Load constituency data from existing election results
def load_constituency_data():
    """Load constituency names and candidate info from existing election data."""
    with open(ELECTION_DATA, 'r') as f:
        return json.load(f)


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text from PDF using pdftotext."""
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"  ⚠️ Error extracting {pdf_path.name}: {e}")
        return ""
    except FileNotFoundError:
        print("  ❌ pdftotext not found. Install with: brew install poppler")
        sys.exit(1)


def parse_polling_station_pdf(text: str, ac_id: str, ac_name: str) -> dict:
    """Parse polling station details from PDF text."""
    booths = []
    lines = text.split('\n')
    
    # Track current booth being parsed
    current_booth = None
    booth_pattern = re.compile(
        r'^\s*(\d+)\s+(\d+)\s+(.+)$'  # SlNo BoothNo RestOfLine
    )
    
    for line in lines:
        # Skip headers and page numbers
        if not line.strip():
            continue
        if 'Polling' in line and 'Station' in line:
            continue
        if 'Page' in line and 'of' in line:
            continue
        if re.match(r'^\s*1\s+2\s+3\s+4', line):  # Column headers
            continue
        if 'Total' in line and 'Electors' in line:
            continue
            
        # Try to match booth entry
        match = booth_pattern.match(line)
        if match:
            sl_no = int(match.group(1))
            booth_no = match.group(2).strip()
            rest = match.group(3).strip()
            
            # Determine booth type
            booth_type = "regular"
            if '(W)' in rest or 'WOMEN' in rest.upper():
                booth_type = "women"
                
            # Extract location and address
            # Common format: "School Name, Building Details, Location -Pincode"
            parts = rest.split(',')
            name = parts[0].strip() if parts else rest
            address = rest
            
            # Extract area from address (usually before pincode)
            area_match = re.search(r'([A-Za-z][A-Za-z\s]+?)[\s\-]+\d{6}', rest)
            if area_match:
                area = area_match.group(1).strip()
            else:
                # Try to get last word before any numbers
                area_parts = re.findall(r'[A-Za-z]+(?:\s+[A-Za-z]+)?', rest)
                area = area_parts[-1] if area_parts else ac_name
            
            # Clean up name
            name = name[:100]
            
            booth = {
                "id": f"{ac_id}-{booth_no}",
                "boothNo": booth_no,
                "num": sl_no,
                "type": booth_type,
                "name": name,
                "address": address[:200] if address else name,
                "area": area[:50] if area else ac_name
            }
            booths.append(booth)
    
    return {
        "acId": ac_id,
        "acName": ac_name,
        "state": "Tamil Nadu",
        "totalBooths": len(booths),
        "lastUpdated": "2021-04-06",
        "source": "Tamil Nadu CEO - Booth List",
        "booths": booths
    }


def parse_form20_pdf(text: str, ac_id: str, ac_name: str, candidates_info: list) -> dict:
    """Parse Form 20 (booth-wise results) from PDF text.
    
    Format: SlNo  BoothNo  [CandidateVotes...]  TotalValid  Rejected  NOTA  TotalVotes
    """
    results = {}
    lines = text.split('\n')
    
    # Count expected candidates (excluding NOTA - it's a separate column)
    num_candidates = len([c for c in candidates_info if c.get("party") != "NOTA"])
    
    for line in lines:
        # Skip empty lines and headers
        if not line.strip():
            continue
        if 'Polling' in line or 'Station' in line:
            continue
        if 'Total' in line and 'Valid' in line:
            continue
        if 'NOTA' in line and 'Rejected' in line:
            continue
        if re.match(r'^\s*(Sl|No\.)', line):
            continue
            
        # Extract all numbers from the line
        numbers = re.findall(r'\d+', line)
        
        if len(numbers) < 6:  # Need at least SlNo, BoothNo, some votes, totals
            continue
            
        try:
            sl_no = int(numbers[0])
            if sl_no > 500:  # Serial numbers shouldn't be this high
                continue
                
            # Extract booth number (may have suffix like (A), (W), M, etc.)
            # Pattern: after serial number, get booth number with optional suffix
            booth_match = re.match(r'^\s*\d+\s+(\d+(?:\s*\([AW]\))?(?:\s*[MW])?)', line)
            if not booth_match:
                continue
                
            booth_no_raw = booth_match.group(1).strip()
            # Normalize: remove spaces, convert (W) to W, (A) to A
            booth_no = re.sub(r'\s+', '', booth_no_raw)
            booth_no = booth_no.replace('(W)', 'W').replace('(A)', 'A').replace('(M)', 'M')
            
            # Get vote numbers - skip first two (SlNo and BoothNo)
            vote_numbers = [int(n) for n in numbers[2:]]
            
            if len(vote_numbers) < 4:
                continue
            
            # Format varies by PDF:
            # Option A: [candidate votes...] TotalValid Rejected NOTA TotalVotes
            # Option B: [candidate votes...] TotalValid Rejected NOTA TotalVotes TenderedVotes
            # We need to detect the format by checking which makes sense
            
            if len(vote_numbers) >= 5:
                # Try 5 trailing columns first (TotalValid, Rejected, NOTA, TotalVotes, TenderedVotes)
                total_valid_5 = vote_numbers[-5]
                rejected_5 = vote_numbers[-4]
                nota_5 = vote_numbers[-3]
                total_votes_5 = vote_numbers[-2]
                # tendered_5 = vote_numbers[-1]
                candidate_votes_5 = vote_numbers[:-5]
                
                # Try 4 trailing columns (TotalValid, Rejected, NOTA, TotalVotes)
                total_valid_4 = vote_numbers[-4]
                rejected_4 = vote_numbers[-3]
                nota_4 = vote_numbers[-2]
                # total_votes_4 = vote_numbers[-1]
                candidate_votes_4 = vote_numbers[:-4]
                
                # Validate: pick the format where sum of candidate votes + NOTA ≈ TotalValid
                calc_5 = sum(candidate_votes_5) + nota_5
                calc_4 = sum(candidate_votes_4) + nota_4
                
                # Use 5-column format if it validates better
                if abs(calc_5 - total_valid_5) <= abs(calc_4 - total_valid_4):
                    candidate_votes = candidate_votes_5
                    candidate_votes.append(nota_5)
                    total_valid = total_valid_5
                    rejected = rejected_5
                else:
                    candidate_votes = candidate_votes_4
                    candidate_votes.append(nota_4)
                    total_valid = total_valid_4
                    rejected = rejected_4
                
                booth_id = f"{ac_id}-{booth_no}"
                
                results[booth_id] = {
                    "votes": candidate_votes,
                    "total": total_valid,
                    "rejected": rejected
                }
            
        except (ValueError, IndexError) as e:
            continue
    
    # Calculate summary
    total_votes = sum(r["total"] for r in results.values())
    
    # Sum votes per candidate
    if results:
        first_result = next(iter(results.values()))
        num_vote_cols = len(first_result["votes"])
        candidate_totals = [0] * num_vote_cols
        
        for booth_result in results.values():
            for i, v in enumerate(booth_result["votes"]):
                if i < len(candidate_totals):
                    candidate_totals[i] += v
        
        # Find winner and runner-up
        sorted_idx = sorted(range(len(candidate_totals)), key=lambda x: candidate_totals[x], reverse=True)
        winner_idx = sorted_idx[0]
        runner_idx = sorted_idx[1] if len(sorted_idx) > 1 else 0
        
        winner_votes = candidate_totals[winner_idx]
        runner_votes = candidate_totals[runner_idx]
    else:
        winner_idx = runner_idx = 0
        winner_votes = runner_votes = 0
    
    # Build candidates list
    candidates = []
    for i, cand in enumerate(candidates_info):
        candidates.append({
            "slNo": i + 1,
            "name": cand.get("name", f"Candidate {i+1}"),
            "party": cand.get("party", "IND"),
            "symbol": cand.get("symbol", "")
        })
    
    # Ensure NOTA is included
    if not any(c.get("party") == "NOTA" for c in candidates):
        candidates.append({
            "slNo": len(candidates) + 1,
            "name": "NOTA",
            "party": "NOTA",
            "symbol": "NOTA"
        })
    
    return {
        "acId": ac_id,
        "acName": ac_name,
        "year": 2021,
        "electionType": "assembly",
        "date": "2021-04-06",
        "totalBooths": len(results),
        "source": "Tamil Nadu CEO - Form 20",
        "candidates": candidates,
        "results": results,
        "summary": {
            "totalVoters": 0,  # Will be filled from election data
            "totalVotes": total_votes,
            "turnoutPercent": 0,
            "winner": {
                "name": candidates[winner_idx]["name"] if winner_idx < len(candidates) else "",
                "party": candidates[winner_idx]["party"] if winner_idx < len(candidates) else "",
                "votes": winner_votes
            },
            "runnerUp": {
                "name": candidates[runner_idx]["name"] if runner_idx < len(candidates) else "",
                "party": candidates[runner_idx]["party"] if runner_idx < len(candidates) else "",
                "votes": runner_votes
            },
            "margin": winner_votes - runner_votes,
            "marginPercent": round(((winner_votes - runner_votes) / total_votes) * 100, 1) if total_votes > 0 else 0
        }
    }


def process_constituency(ac_num: int, constituency_data: dict) -> bool:
    """Process a single constituency."""
    ac_code = f"AC{ac_num:03d}"
    ac_id = f"TN-{ac_num:03d}"
    
    # Get constituency info
    ac_info = constituency_data.get(ac_id, {})
    ac_name = ac_info.get("constituencyName", f"Constituency {ac_num}")
    candidates_info = ac_info.get("candidates", [])
    
    print(f"\n📍 Processing {ac_id}: {ac_name}")
    
    # Check if PDFs exist
    form20_pdf = FORM20_DIR / f"{ac_code}.pdf"
    polling_pdf = POLLING_STATIONS_DIR / f"{ac_code}.pdf"
    
    if not form20_pdf.exists():
        print(f"  ⚠️ Form 20 PDF not found: {form20_pdf}")
        return False
        
    if not polling_pdf.exists():
        print(f"  ⚠️ Polling stations PDF not found: {polling_pdf}")
        # Continue anyway - we can still extract results
    
    # Create output directory
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Extract and parse polling station data
    if polling_pdf.exists():
        print(f"  📄 Extracting polling stations...")
        polling_text = extract_pdf_text(polling_pdf)
        if polling_text:
            booths_data = parse_polling_station_pdf(polling_text, ac_id, ac_name)
            
            booths_file = output_dir / "booths.json"
            with open(booths_file, 'w') as f:
                json.dump(booths_data, f, indent=2)
            print(f"  ✅ Booths: {booths_data['totalBooths']} extracted → {booths_file.name}")
    
    # Extract and parse Form 20 data
    print(f"  📄 Extracting Form 20 results...")
    form20_text = extract_pdf_text(form20_pdf)
    if form20_text:
        results_data = parse_form20_pdf(form20_text, ac_id, ac_name, candidates_info)
        
        # Enrich with election data
        if ac_info:
            results_data["summary"]["totalVoters"] = ac_info.get("electors", 0)
            if results_data["summary"]["totalVoters"] > 0:
                results_data["summary"]["turnoutPercent"] = round(
                    (results_data["summary"]["totalVotes"] / results_data["summary"]["totalVoters"]) * 100, 2
                )
        
        results_file = output_dir / "2021.json"
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
        print(f"  ✅ Results: {results_data['totalBooths']} booths extracted → {results_file.name}")
        
        if results_data['totalBooths'] == 0:
            print(f"  ⚠️ WARNING: No booth results extracted - PDF format may differ")
            return False
    else:
        print(f"  ❌ Failed to extract Form 20 text")
        return False
    
    return True


def main():
    print("=" * 60)
    print("Tamil Nadu 2021 Assembly Election - Booth Data Extraction")
    print("=" * 60)
    
    # Check dependencies
    try:
        subprocess.run(['pdftotext', '-v'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ pdftotext not found. Install with: brew install poppler")
        sys.exit(1)
    
    # Load constituency data
    print("\n📂 Loading constituency data...")
    constituency_data = load_constituency_data()
    print(f"   Found {len(constituency_data)} constituencies")
    
    # Process each constituency
    success_count = 0
    failed = []
    
    # Get range from command line args
    start_ac = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end_ac = int(sys.argv[2]) if len(sys.argv) > 2 else 234
    
    print(f"\n🚀 Processing ACs {start_ac} to {end_ac}...")
    
    for ac_num in range(start_ac, end_ac + 1):
        try:
            if process_constituency(ac_num, constituency_data):
                success_count += 1
            else:
                failed.append(ac_num)
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed.append(ac_num)
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ Successfully processed: {success_count} constituencies")
    print(f"❌ Failed: {len(failed)} constituencies")
    
    if failed:
        print(f"   Failed ACs: {failed}")
    
    print(f"\n📁 Output directory: {OUTPUT_BASE}")


if __name__ == "__main__":
    main()
