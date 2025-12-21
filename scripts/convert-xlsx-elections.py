#!/usr/bin/env python3
"""
Convert assembly election XLSX files to JSON format
"""

import pandas as pd
import json
import os
import sys

def convert_xlsx_to_json(xlsx_path, state_slug, year, output_dir):
    """Convert XLSX election data to JSON format"""
    print(f"Reading {xlsx_path}...")
    
    # Read Excel file
    df = pd.read_excel(xlsx_path)
    
    # Print columns to understand structure
    print(f"Columns: {list(df.columns)}")
    print(f"Sample row:\n{df.iloc[0] if len(df) > 0 else 'No data'}")
    
    # Try to identify columns (handle different formats)
    col_mapping = {}
    for col in df.columns:
        col_lower = str(col).lower()
        if 'constituency' in col_lower and 'name' in col_lower:
            col_mapping['constituency'] = col
        elif 'ac' in col_lower and 'name' in col_lower:
            col_mapping['constituency'] = col
        elif col_lower in ['constituency', 'ac name', 'ac_name']:
            col_mapping['constituency'] = col
        elif 'candidate' in col_lower:
            col_mapping['candidate'] = col
        elif 'party' in col_lower:
            col_mapping['party'] = col
        elif 'votes' in col_lower and 'total' not in col_lower and 'valid' not in col_lower:
            col_mapping['votes'] = col
        elif col_lower in ['votes', 'evm votes', 'total votes']:
            col_mapping['votes'] = col
        elif 'electors' in col_lower:
            col_mapping['electors'] = col
        elif 'valid' in col_lower and 'votes' in col_lower:
            col_mapping['valid_votes'] = col
    
    print(f"Column mapping: {col_mapping}")
    
    # Check if we have minimum required columns
    if 'constituency' not in col_mapping:
        # Try first column as constituency
        col_mapping['constituency'] = df.columns[0]
    if 'candidate' not in col_mapping:
        # Find a likely candidate column
        for col in df.columns:
            if 'name' in str(col).lower() and 'constituency' not in str(col).lower():
                col_mapping['candidate'] = col
                break
    if 'votes' not in col_mapping:
        # Find a likely votes column
        for col in df.columns:
            if df[col].dtype in ['int64', 'float64']:
                col_mapping['votes'] = col
                break
    
    print(f"Final column mapping: {col_mapping}")
    
    # Group by constituency
    results = {}
    
    for _, row in df.iterrows():
        const_name = str(row.get(col_mapping.get('constituency', df.columns[0]), '')).strip()
        if not const_name or const_name == 'nan':
            continue
            
        const_key = const_name.upper()
        
        if const_key not in results:
            results[const_key] = {
                'constituencyName': const_key,
                'constituencyNameOriginal': const_name,
                'year': year,
                'electors': int(row.get(col_mapping.get('electors'), 0) or 0),
                'validVotes': 0,
                'turnout': 0,
                'candidates': []
            }
        
        # Add candidate
        candidate_name = str(row.get(col_mapping.get('candidate', ''), '')).strip()
        party = str(row.get(col_mapping.get('party', ''), 'IND')).strip()
        votes = int(row.get(col_mapping.get('votes', 0), 0) or 0)
        
        if candidate_name and candidate_name != 'nan':
            results[const_key]['candidates'].append({
                'name': candidate_name,
                'party': party if party and party != 'nan' else 'IND',
                'votes': votes,
                'voteShare': 0,
                'position': 0
            })
            results[const_key]['validVotes'] += votes
    
    # Calculate positions and vote shares
    for const_key, const_data in results.items():
        candidates = const_data['candidates']
        candidates.sort(key=lambda x: x['votes'], reverse=True)
        
        total_votes = const_data['validVotes']
        for i, c in enumerate(candidates):
            c['position'] = i + 1
            c['voteShare'] = round((c['votes'] / total_votes * 100), 2) if total_votes > 0 else 0
        
        # Add margin for winner
        if len(candidates) >= 2:
            candidates[0]['margin'] = candidates[0]['votes'] - candidates[1]['votes']
        
        const_data['totalCandidates'] = len(candidates)
        
        # Calculate turnout
        if const_data['electors'] > 0:
            const_data['turnout'] = round((total_votes / const_data['electors'] * 100), 2)
    
    # Write output
    output_path = os.path.join(output_dir, f'{year}.json')
    os.makedirs(output_dir, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"Written {output_path} with {len(results)} constituencies")
    
    # Update index.json
    index_path = os.path.join(output_dir, 'index.json')
    index_data = {'years': []}
    
    # Find all year files
    for file in os.listdir(output_dir):
        if file.endswith('.json') and file != 'index.json':
            try:
                y = int(file.replace('.json', ''))
                if y not in index_data['years']:
                    index_data['years'].append(y)
            except ValueError:
                pass
    
    index_data['years'].sort()
    index_data['availableYears'] = index_data['years']
    index_data['lastUpdated'] = '2025-12-21'
    
    with open(index_path, 'w') as f:
        json.dump(index_data, f, indent=2)
    
    print(f"Updated {index_path}")
    return len(results)

if __name__ == '__main__':
    base_output = './public/data/elections/ac'
    
    files = [
        ('/Users/p0s097d/Desktop/Madhya Pradesh_2023.xlsx', 'madhya-pradesh', 2023),
        ('/Users/p0s097d/Desktop/Rajasthan_2023.xlsx', 'rajasthan', 2023),
        ('/Users/p0s097d/Desktop/Odisha_2024.xlsx', 'odisha', 2024),
    ]
    
    for xlsx_path, state_slug, year in files:
        if os.path.exists(xlsx_path):
            output_dir = os.path.join(base_output, state_slug)
            convert_xlsx_to_json(xlsx_path, state_slug, year, output_dir)
            print()
        else:
            print(f"File not found: {xlsx_path}")

