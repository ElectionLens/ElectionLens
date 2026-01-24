#!/usr/bin/env python3
"""
Comprehensive validation for 2024 booth data.
Validates all rules from booth-data-parsing.mdc:
1. Booth number not in votes array
2. Cross-validate against official totals
3. Validate booth winner distribution
4. Sanity check vote values
5. Postal votes must be non-negative
6. Booth coverage
"""

import json
from pathlib import Path
from collections import Counter, defaultdict

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def get_pc_for_ac(ac_id, schema):
    for pc_id, pc_data in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_data.get('assemblyIds', []):
            return pc_id, pc_data.get('name', '')
    return None, None


def validate_booth_votes(booth_no: str, votes: list[int]) -> tuple[bool, str]:
    """Check if booth number accidentally appears in votes array."""
    try:
        booth_num = int(booth_no.replace('W', '').replace('M', '').replace('A', ''))
    except:
        booth_num = None
    
    if booth_num:
        # Check if booth number appears in first 3 columns (most likely error position)
        if booth_num in votes[:3]:
            return False, f"Booth number {booth_num} found in votes array (position {votes[:3].index(booth_num)})"
        
        # Check for sequential booth numbers in votes (parsing shift error)
        if len(votes) >= 2 and votes[0] == 0 and 1 <= votes[1] <= 600:
            return False, f"Suspicious pattern: votes[0]=0, votes[1]={votes[1]} (possible booth number in wrong position)"
    
    return True, ""


def validate_vote_value(vote: int, booth_id: str) -> tuple[bool, str]:
    """Sanity check vote values."""
    if vote < 0:
        return False, f"Negative vote: {vote}"
    if vote > 2500:  # Increased threshold - some large booths can have >2000 votes
        return False, f"Unusually high vote: {vote} (booth {booth_id})"
    return True, ""


def validate_ac(ac_id, pc_data, schema):
    """Comprehensive validation for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'issues': ['No 2024.json']}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'error', 'issues': ['Missing results or candidates']}
    
    # Get PC data for validation
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {}) if pc_id else {}
    official_candidates = pc_result.get('candidates', [])
    
    issues = []
    warnings = []
    
    # Calculate booth totals
    num_candidates = len(candidates)
    booth_totals = [0] * num_candidates
    total_votes = 0
    
    booth_number_errors = []
    vote_value_errors = []
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        total = booth_result.get('total', 0)
        
        # Extract booth number from booth_id (e.g., "TN-001-45" -> "45")
        booth_no = booth_id.split('-')[-1]
        
        # Validation 1: Check if booth number is in votes array
        is_valid, error_msg = validate_booth_votes(booth_no, votes)
        if not is_valid:
            booth_number_errors.append(f"{booth_id}: {error_msg}")
            issues.append(f"{booth_id}: {error_msg}")
        
        # Validation 4: Sanity check vote values
        for i, vote in enumerate(votes):
            is_valid, error_msg = validate_vote_value(vote, booth_id)
            if not is_valid:
                vote_value_errors.append(f"{booth_id} candidate {i}: {error_msg}")
                issues.append(f"{booth_id} candidate {i}: {error_msg}")
        
        # Sum votes
        total_votes += sum(votes)
        for i, v in enumerate(votes):
            if i < num_candidates:
                booth_totals[i] += v
    
    if booth_number_errors:
        issues.append(f"Booth number in votes: {len(booth_number_errors)} booths affected")
    
    if vote_value_errors:
        issues.append(f"Invalid vote values: {len(vote_value_errors)} instances")
    
    # Validation 2: Cross-validate against official totals
    if official_candidates:
        vote_errors = []
        for i in range(min(3, len(official_candidates), len(booth_totals))):
            official = official_candidates[i].get('votes', 0)
            extracted = booth_totals[i]
            if official > 0:
                ratio = extracted / official
                if not (0.80 <= ratio <= 1.20):  # Within 20% tolerance
                    error_pct = abs(extracted - official) / official * 100
                    vote_errors.append(
                        f"Candidate {i+1} ({official_candidates[i].get('party', 'Unknown')}): "
                        f"extracted {extracted:,} vs official {official:,} ({error_pct:.1f}% error, ratio {ratio:.2f})"
                    )
                    if error_pct > 5:
                        issues.append(vote_errors[-1])
                    else:
                        warnings.append(vote_errors[-1])
    
    # Validation 3: Validate booth winner distribution
    if candidates and len(results) > 0:
        booth_wins = Counter()
        for booth_id, booth_result in results.items():
            votes = booth_result.get('votes', [])
            if votes:
                # Exclude NOTA from winner calculation
                votes_excluding_nota = votes[:-1] if len(votes) == len(candidates) and candidates[-1].get('party') == 'NOTA' else votes
                if votes_excluding_nota:
                    winner_idx = max(range(len(votes_excluding_nota)), key=lambda i: votes_excluding_nota[i])
                    booth_wins[winner_idx] += 1
        
        if booth_wins:
            top_2_by_wins = set()
            for i, _ in booth_wins.most_common(2):
                if i < len(candidates):
                    top_2_by_wins.add(candidates[i]['party'])
            if official_candidates and top_2_by_wins:
                top_2_official = {c['party'] for c in official_candidates[:2]}
                if top_2_by_wins != top_2_official:
                    warnings.append(
                        f"Winner distribution mismatch: extracted top 2 by booth wins {top_2_by_wins} "
                        f"vs official top 2 {top_2_official}"
                    )
    
    # Validation 5: Check postal votes (if present)
    postal = results_data.get('postal', {})
    if postal and 'candidates' in postal:
        postal_errors = []
        for cand in postal['candidates']:
            postal_votes = cand.get('postal', 0)
            if postal_votes < 0:
                postal_errors.append(
                    f"HARD RULE VIOLATION: {cand.get('name', 'Unknown')} ({cand.get('party', 'Unknown')}) "
                    f"has negative postal votes: {postal_votes}"
                )
                issues.append(postal_errors[-1])
        
        if postal_errors:
            issues.append(f"Negative postal votes: {len(postal_errors)} candidates affected")
    
    # Check booth coverage
    booths_json = BOOTHS_DIR / ac_id / "booths.json"
    expected_booths = None
    if booths_json.exists():
        with open(booths_json) as f:
            booths_meta = json.load(f)
        expected_booths = booths_meta.get('totalBooths', len(booths_meta.get('booths', [])))
        coverage_pct = (len(results) / expected_booths * 100) if expected_booths > 0 else 0
        if coverage_pct < 80:
            warnings.append(f"Low booth coverage: {len(results)}/{expected_booths} ({coverage_pct:.1f}%)")
    
    # Determine status
    if len(issues) == 0 and len(warnings) == 0:
        status = 'excellent'
    elif len(issues) == 0:
        status = 'good'
    elif len(issues) <= 3:
        status = 'warning'
    else:
        status = 'error'
    
    return {
        'status': status,
        'pc_id': pc_id,
        'pc_name': pc_name,
        'booths': len(results),
        'expected_booths': expected_booths,
        'total_votes': total_votes,
        'issues': issues,
        'warnings': warnings,
        'booth_number_errors': len(booth_number_errors),
        'vote_value_errors': len(vote_value_errors),
    }


def main():
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 80)
    print("2024 Booth Data - Comprehensive Validation")
    print("=" * 80)
    print("\nValidating all rules from booth-data-parsing.mdc:")
    print("  1. Booth number not in votes array")
    print("  2. Cross-validate against official totals")
    print("  3. Validate booth winner distribution")
    print("  4. Sanity check vote values")
    print("  5. Postal votes must be non-negative")
    print("  6. Booth coverage")
    print()
    
    status_counts = defaultdict(int)
    total_issues = 0
    total_warnings = 0
    total_booth_number_errors = 0
    total_vote_value_errors = 0
    
    issues_by_status = defaultdict(list)
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result = validate_ac(ac_id, pc_data, schema)
        
        status = result['status']
        status_counts[status] += 1
        
        total_issues += len(result.get('issues', []))
        total_warnings += len(result.get('warnings', []))
        total_booth_number_errors += result.get('booth_number_errors', 0)
        total_vote_value_errors += result.get('vote_value_errors', 0)
        
        if result.get('issues') or result.get('warnings'):
            issues_by_status[status].append((ac_id, result))
    
    # Print summary
    print("=" * 80)
    print("VALIDATION SUMMARY")
    print("=" * 80)
    print(f"\n📊 Status Distribution:")
    print(f"   ✅ Excellent (no issues): {status_counts['excellent']}")
    print(f"   ✓ Good (warnings only): {status_counts['good']}")
    print(f"   ⚠️  Warning (minor issues): {status_counts['warning']}")
    print(f"   ❌ Error (major issues): {status_counts['error']}")
    print(f"   ❓ Missing: {status_counts['missing']}")
    
    print(f"\n📈 Issue Statistics:")
    print(f"   Total issues: {total_issues}")
    print(f"   Total warnings: {total_warnings}")
    print(f"   Booth number in votes errors: {total_booth_number_errors}")
    print(f"   Invalid vote value errors: {total_vote_value_errors}")
    
    # Print detailed issues
    if issues_by_status['error']:
        print(f"\n❌ ACs with Errors ({len(issues_by_status['error'])}):")
        for ac_id, result in issues_by_status['error'][:10]:
            print(f"\n   {ac_id} ({result.get('pc_name', 'Unknown PC')}):")
            for issue in result['issues'][:3]:
                print(f"      - {issue}")
            if len(result['issues']) > 3:
                print(f"      ... and {len(result['issues']) - 3} more issues")
    
    if issues_by_status['warning']:
        print(f"\n⚠️  ACs with Warnings ({len(issues_by_status['warning'])}):")
        for ac_id, result in issues_by_status['warning'][:5]:
            print(f"   {ac_id}: {len(result['issues'])} issues, {len(result['warnings'])} warnings")
    
    # Print specific error types
    if total_booth_number_errors > 0:
        print(f"\n🔴 Booth Number in Votes Array: {total_booth_number_errors} booths affected")
        print("   This is a critical parsing error - booth numbers are leaking into vote counts")
    
    if total_vote_value_errors > 0:
        print(f"\n🔴 Invalid Vote Values: {total_vote_value_errors} instances")
        print("   Check for negative votes or unusually high values")
    
    print("\n" + "=" * 80)
    
    return {
        'status_counts': dict(status_counts),
        'total_issues': total_issues,
        'total_warnings': total_warnings,
        'booth_number_errors': total_booth_number_errors,
        'vote_value_errors': total_vote_value_errors,
    }


if __name__ == "__main__":
    main()
