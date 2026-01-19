#!/usr/bin/env python3
"""
OCR-based extraction for scanned Form 20 PDFs.
Uses pdf2image and pytesseract for OCR.

Prerequisites:
    brew install poppler tesseract
    pip install pdf2image pytesseract pillow

Usage:
    python scripts/ocr-extract-tn-2021.py [ac_number]
    python scripts/ocr-extract-tn-2021.py  # Process all scanned PDFs
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

try:
    from pdf2image import convert_from_path
    import pytesseract
except ImportError:
    print("Required packages missing. Install with:")
    print("  pip install pdf2image pytesseract pillow")
    print("Also ensure tesseract and poppler are installed:")
    print("  brew install poppler tesseract")
    sys.exit(1)

# Configuration
FORM20_DIR = Path(os.path.expanduser("~/Desktop/TNLA_2021_PDFs"))
OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")

# Scanned PDFs that need OCR
SCANNED_ACS = [27, 30, 31, 32, 33, 34, 35, 40, 43, 44, 46, 47, 49, 50, 108, 109, 147, 148]


def load_constituency_data():
    """Load constituency names and candidate info from existing election data."""
    with open(ELECTION_DATA, 'r') as f:
        return json.load(f)


def ocr_pdf(pdf_path: Path) -> str:
    """Extract text from PDF using OCR."""
    print(f"  🔍 Converting PDF to images...")
    images = convert_from_path(str(pdf_path), dpi=150)
    
    all_text = []
    for i, image in enumerate(images):
        print(f"  📝 OCR page {i+1}/{len(images)}...", end='\r')
        text = pytesseract.image_to_string(image, config='--psm 6')
        all_text.append(text)
    
    print(f"  📝 OCR completed - {len(images)} pages processed")
    return '\n'.join(all_text)


def parse_ocr_form20(text: str, ac_id: str, ac_name: str, candidates_info: list) -> dict:
    """Parse Form 20 from OCR text (more tolerant of OCR errors)."""
    results = {}
    lines = text.split('\n')
    
    num_candidates = len([c for c in candidates_info if c.get("party") != "NOTA"])
    
    for line in lines:
        # Clean up common OCR artifacts
        line = line.replace('|', '').replace('[', '').replace(']', '')
        line = re.sub(r'\s+', ' ', line).strip()
        
        if not line:
            continue
            
        # Skip headers
        if any(x in line.lower() for x in ['polling', 'station', 'total', 'valid', 'votes', 'rejected', 'nota']):
            continue
            
        # Try to extract numbers
        numbers = re.findall(r'\d+', line)
        
        if len(numbers) < 6:
            continue
            
        try:
            sl_no = int(numbers[0])
            if sl_no > 500:
                continue
                
            # Second number should be booth number
            booth_no = numbers[1]
            
            # Remaining numbers are vote data
            vote_numbers = [int(n) for n in numbers[2:]]
            
            if len(vote_numbers) < 4:
                continue
                
            # Last 4 columns: TotalValid, Rejected, NOTA, TotalVotes
            total_votes_col = vote_numbers[-1]
            nota = vote_numbers[-2]
            rejected = vote_numbers[-3]
            total_valid = vote_numbers[-4]
            
            # Candidate votes
            candidate_votes = vote_numbers[:-4]
            candidate_votes.append(nota)
            
            booth_id = f"{ac_id}-{booth_no}"
            
            results[booth_id] = {
                "votes": candidate_votes,
                "total": total_valid,
                "rejected": rejected
            }
            
        except (ValueError, IndexError):
            continue
    
    # Calculate summary
    total_votes = sum(r["total"] for r in results.values())
    
    if results:
        first_result = next(iter(results.values()))
        num_vote_cols = len(first_result["votes"])
        candidate_totals = [0] * num_vote_cols
        
        for booth_result in results.values():
            for i, v in enumerate(booth_result["votes"]):
                if i < len(candidate_totals):
                    candidate_totals[i] += v
        
        sorted_idx = sorted(range(len(candidate_totals)), key=lambda x: candidate_totals[x], reverse=True)
        winner_idx = sorted_idx[0]
        runner_idx = sorted_idx[1] if len(sorted_idx) > 1 else 0
        winner_votes = candidate_totals[winner_idx]
        runner_votes = candidate_totals[runner_idx]
    else:
        winner_idx = runner_idx = 0
        winner_votes = runner_votes = 0
    
    candidates = []
    for i, cand in enumerate(candidates_info):
        candidates.append({
            "slNo": i + 1,
            "name": cand.get("name", f"Candidate {i+1}"),
            "party": cand.get("party", "IND"),
            "symbol": cand.get("symbol", "")
        })
    
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
        "source": "Tamil Nadu CEO - Form 20 (OCR)",
        "candidates": candidates,
        "results": results,
        "summary": {
            "totalVoters": 0,
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
    """Process a single constituency using OCR."""
    ac_code = f"AC{ac_num:03d}"
    ac_id = f"TN-{ac_num:03d}"
    
    ac_info = constituency_data.get(ac_id, {})
    ac_name = ac_info.get("constituencyName", f"Constituency {ac_num}")
    candidates_info = ac_info.get("candidates", [])
    
    print(f"\n📍 Processing {ac_id}: {ac_name} (OCR)")
    
    form20_pdf = FORM20_DIR / f"{ac_code}.pdf"
    
    if not form20_pdf.exists():
        print(f"  ⚠️ Form 20 PDF not found: {form20_pdf}")
        return False
    
    output_dir = OUTPUT_BASE / ac_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # OCR extraction
    print(f"  📄 Running OCR on Form 20...")
    try:
        ocr_text = ocr_pdf(form20_pdf)
        
        results_data = parse_ocr_form20(ocr_text, ac_id, ac_name, candidates_info)
        
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
            print(f"  ⚠️ WARNING: No booth results extracted - OCR may have failed")
            return False
            
    except Exception as e:
        print(f"  ❌ OCR failed: {e}")
        return False
    
    return True


def main():
    print("=" * 60)
    print("Tamil Nadu 2021 - OCR Extraction for Scanned PDFs")
    print("=" * 60)
    
    # Check dependencies
    try:
        pytesseract.get_tesseract_version()
    except Exception as e:
        print(f"❌ Tesseract not found: {e}")
        print("Install with: brew install tesseract")
        sys.exit(1)
    
    print("\n📂 Loading constituency data...")
    constituency_data = load_constituency_data()
    
    # Get ACs to process
    if len(sys.argv) > 1:
        acs_to_process = [int(sys.argv[1])]
    else:
        acs_to_process = SCANNED_ACS
    
    print(f"\n🚀 Processing {len(acs_to_process)} scanned PDFs...")
    
    success_count = 0
    failed = []
    
    for ac_num in acs_to_process:
        try:
            if process_constituency(ac_num, constituency_data):
                success_count += 1
            else:
                failed.append(ac_num)
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed.append(ac_num)
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ Successfully processed: {success_count} constituencies")
    print(f"❌ Failed: {len(failed)} constituencies")
    if failed:
        print(f"   Failed ACs: {failed}")


if __name__ == "__main__":
    main()
