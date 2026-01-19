#!/usr/bin/env python3
"""
Fix candidate mapping in booth results.

The Form 20 PDFs have candidates in ballot paper order, but the original script
mapped them using election data order (sorted by votes). This script:
1. Calculates actual vote totals from booth data
2. Matches them to candidates from election data by vote count
3. Corrects the candidate names/parties in booth results
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
ELECTION_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def fix_constituency(ac_id: str, election_data: dict):
    """Fix candidate mapping for a single constituency."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not results_file.exists():
        return False
    
    with open(results_file) as f:
        booth_data = json.load(f)
    
    if booth_data.get("totalBooths", 0) == 0:
        return False
    
    # Get election candidate data
    ac_info = election_data.get(ac_id, {})
    election_candidates = ac_info.get("candidates", [])
    
    if not election_candidates:
        print(f"  ⚠️ No election candidate data for {ac_id}")
        return False
    
    # Calculate actual vote totals from booth data
    num_candidates = len(booth_data.get("candidates", []))
    booth_totals = [0] * num_candidates
    
    for booth_result in booth_data.get("results", {}).values():
        for i, v in enumerate(booth_result.get("votes", [])):
            if i < num_candidates:
                booth_totals[i] += v
    
    # Create mapping: booth_index -> election_candidate
    # Match by finding the closest vote count
    used_election_idxs = set()
    mapping = {}  # booth_column_idx -> election_candidate
    
    # Sort booth columns by vote total (descending) for greedy matching
    booth_cols_sorted = sorted(range(num_candidates), key=lambda i: -booth_totals[i])
    
    for booth_idx in booth_cols_sorted:
        booth_votes = booth_totals[booth_idx]
        
        # Skip NOTA (usually last candidate with specific name)
        if booth_idx == num_candidates - 1 and booth_data.get("candidates", [{}])[-1].get("party") == "NOTA":
            mapping[booth_idx] = {"name": "NOTA", "party": "NOTA", "symbol": ""}
            continue
        
        # Find closest matching election candidate not yet used
        best_match = None
        best_diff = float('inf')
        
        for ec_idx, ec in enumerate(election_candidates):
            if ec_idx in used_election_idxs:
                continue
            if ec.get("party") == "NOTA":
                continue
            
            diff = abs(ec.get("votes", 0) - booth_votes)
            if diff < best_diff:
                best_diff = diff
                best_match = (ec_idx, ec)
        
        if best_match:
            ec_idx, ec = best_match
            used_election_idxs.add(ec_idx)
            mapping[booth_idx] = {
                "name": ec.get("name", ""),
                "party": ec.get("party", "IND"),
                "symbol": ec.get("symbol", "")
            }
            # Report if match seems off (>5% difference)
            if booth_votes > 0 and best_diff / booth_votes > 0.05:
                pass  # print(f"    ⚠️ Column {booth_idx}: {booth_votes} vs {ec.get('votes', 0)} ({ec.get('name')})")
        else:
            # Keep original if no match found
            mapping[booth_idx] = booth_data.get("candidates", [{}])[booth_idx] if booth_idx < len(booth_data.get("candidates", [])) else {"name": f"Unknown {booth_idx}", "party": "IND", "symbol": ""}
    
    # Update candidates list
    new_candidates = []
    for i in range(num_candidates):
        if i in mapping:
            new_candidates.append({
                "slNo": i + 1,
                **mapping[i]
            })
        else:
            new_candidates.append(booth_data.get("candidates", [{}])[i] if i < len(booth_data.get("candidates", [])) else {"slNo": i + 1, "name": f"Candidate {i+1}", "party": "IND", "symbol": ""})
    
    booth_data["candidates"] = new_candidates
    
    # Update summary
    winner_idx = booth_totals.index(max(booth_totals[:-1])) if len(booth_totals) > 1 else 0  # Exclude NOTA
    runner_totals = booth_totals.copy()
    runner_totals[winner_idx] = -1
    runner_idx = runner_totals.index(max(runner_totals[:-1])) if len(runner_totals) > 1 else 0
    
    booth_data["summary"]["winner"] = {
        "name": new_candidates[winner_idx]["name"],
        "party": new_candidates[winner_idx]["party"],
        "votes": booth_totals[winner_idx]
    }
    booth_data["summary"]["runnerUp"] = {
        "name": new_candidates[runner_idx]["name"],
        "party": new_candidates[runner_idx]["party"],
        "votes": booth_totals[runner_idx]
    }
    booth_data["summary"]["margin"] = booth_totals[winner_idx] - booth_totals[runner_idx]
    
    # Save updated data
    with open(results_file, 'w') as f:
        json.dump(booth_data, f, indent=2)
    
    return True


def main():
    # Load election data
    with open(ELECTION_DATA) as f:
        election_data = json.load(f)
    
    print("Fixing candidate mapping for all constituencies...")
    
    fixed = 0
    skipped = 0
    
    for ac_dir in sorted(OUTPUT_BASE.iterdir()):
        if ac_dir.is_dir() and ac_dir.name.startswith("TN-"):
            ac_id = ac_dir.name
            if fix_constituency(ac_id, election_data):
                fixed += 1
            else:
                skipped += 1
    
    print(f"\n✅ Fixed {fixed} constituencies")
    print(f"⏭️ Skipped {skipped} constituencies (no data or already correct)")


if __name__ == "__main__":
    main()
