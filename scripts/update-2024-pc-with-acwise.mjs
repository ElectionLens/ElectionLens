#!/usr/bin/env node
/**
 * Update 2024 Parliamentary Election data with AC-wise breakdown
 * Source: General_2024.csv from ECI
 */

import fs from 'fs';
import path from 'path';

const CSV_PATH = '/Users/p0s097d/Desktop/General_2024.csv';
const OUTPUT_BASE = './public/data/elections/pc';

// State name to slug mapping
const STATE_SLUG_MAP = {
  'Andaman & Nicobar Islands': 'andaman-and-nicobar-islands',
  'Andhra Pradesh': 'andhra-pradesh',
  'Arunachal Pradesh': 'arunachal-pradesh',
  'Assam': 'assam',
  'Bihar': 'bihar',
  'Chandigarh': 'chandigarh',
  'Chhattisgarh': 'chhattisgarh',
  'Dadra & Nagar Haveli and Daman & Diu': 'dnh-and-dd',
  'Goa': 'goa',
  'Gujarat': 'gujarat',
  'Haryana': 'haryana',
  'Himachal Pradesh': 'himachal-pradesh',
  'Jammu and Kashmir': 'jammu-and-kashmir',
  'Jharkhand': 'jharkhand',
  'Karnataka': 'karnataka',
  'Kerala': 'kerala',
  'Ladakh': 'ladakh',
  'Lakshadweep': 'lakshadweep',
  'Madhya Pradesh': 'madhya-pradesh',
  'Maharashtra': 'maharashtra',
  'Manipur': 'manipur',
  'Meghalaya': 'meghalaya',
  'Mizoram': 'mizoram',
  'NCT OF Delhi': 'nct-of-delhi',
  'Nagaland': 'nagaland',
  'Odisha': 'odisha',
  'Puducherry': 'puducherry',
  'Punjab': 'punjab',
  'Rajasthan': 'rajasthan',
  'Sikkim': 'sikkim',
  'Tamil Nadu': 'tamil-nadu',
  'Telangana': 'telangana',
  'Tripura': 'tripura',
  'Uttar Pradesh': 'uttar-pradesh',
  'Uttarakhand': 'uttarakhand',
  'West Bengal': 'west-bengal',
};

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Main processing
async function main() {
  console.log('Reading CSV file...');
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  // Skip header
  const header = parseCSVLine(lines[0]);
  console.log('Header columns:', header);
  
  // Find column indices
  const colIdx = {
    state: header.findIndex(h => h.includes('State')),
    pcNo: header.findIndex(h => h === 'PC NO'),
    pcName: header.findIndex(h => h === 'PC NAME'),
    pcElectors: header.findIndex(h => h.includes('TOTAL ELECTORS IN PC')),
    acNo: header.findIndex(h => h === 'AC NO'),
    acName: header.findIndex(h => h === 'AC NAME'),
    acElectors: header.findIndex(h => h.includes('TOTAL ELECTORS IN AC')),
    notaVotes: header.findIndex(h => h.includes('NOTA')),
    candidateName: header.findIndex(h => h.includes('CANDIDATE NAME')),
    party: header.findIndex(h => h === 'PARTY'),
    votes: header.findIndex(h => h.includes('VOTES SECURED')),
  };
  
  console.log('Column indices:', colIdx);
  
  // Data structure: state -> pc -> { pcData, candidates: { candidate -> acVotes[] } }
  const stateData = {};
  
  // Process each data row
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 10) continue;
    
    const stateName = row[colIdx.state];
    const pcName = row[colIdx.pcName];
    const pcNo = parseInt(row[colIdx.pcNo]) || 0;
    const pcElectors = parseInt(row[colIdx.pcElectors]) || 0;
    const acName = row[colIdx.acName];
    const acNo = parseInt(row[colIdx.acNo]) || 0;
    const acElectors = parseInt(row[colIdx.acElectors]) || 0;
    const candidateName = row[colIdx.candidateName];
    const party = row[colIdx.party];
    const votes = parseInt(row[colIdx.votes]) || 0;
    const notaVotes = parseInt(row[colIdx.notaVotes]) || 0;
    
    // Skip invalid rows (notes, disclaimers, etc.)
    if (!stateName || !pcName || !candidateName || !STATE_SLUG_MAP[stateName]) {
      continue;
    }
    
    const stateSlug = STATE_SLUG_MAP[stateName];
    
    // Initialize state
    if (!stateData[stateSlug]) {
      stateData[stateSlug] = {
        stateName,
        pcs: {}
      };
    }
    
    // Initialize PC
    const pcKey = pcName.toUpperCase();
    if (!stateData[stateSlug].pcs[pcKey]) {
      stateData[stateSlug].pcs[pcKey] = {
        pcNo,
        pcName,
        pcElectors,
        candidates: {},
        acs: new Set(),
        validVotes: 0,
      };
    }
    
    stateData[stateSlug].pcs[pcKey].acs.add(acName);
    
    // Initialize candidate
    const candidateKey = `${candidateName}|${party}`;
    if (!stateData[stateSlug].pcs[pcKey].candidates[candidateKey]) {
      stateData[stateSlug].pcs[pcKey].candidates[candidateKey] = {
        name: candidateName,
        party,
        totalVotes: 0,
        acWiseVotes: []
      };
    }
    
    // Add AC-wise votes
    stateData[stateSlug].pcs[pcKey].candidates[candidateKey].totalVotes += votes;
    stateData[stateSlug].pcs[pcKey].candidates[candidateKey].acWiseVotes.push({
      acName,
      acNo,
      votes,
      acElectors
    });
    
    stateData[stateSlug].pcs[pcKey].validVotes += votes;
  }
  
  console.log(`\nProcessed ${Object.keys(stateData).length} states`);
  
  // Write output files
  for (const [stateSlug, data] of Object.entries(stateData)) {
    const outputDir = path.join(OUTPUT_BASE, stateSlug);
    
    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Build output structure
    const output = {};
    let totalPCs = 0;
    
    for (const [pcKey, pcData] of Object.entries(data.pcs)) {
      totalPCs++;
      
      // Convert candidates to sorted array
      const candidatesArray = Object.values(pcData.candidates)
        .map(c => {
          // Calculate total votes from AC-wise to ensure accuracy
          const totalVotes = c.acWiseVotes.reduce((sum, ac) => sum + ac.votes, 0);
          
          // Calculate vote share per AC
          const acWiseVotes = c.acWiseVotes.map(ac => {
            const acTotalVotes = Object.values(pcData.candidates)
              .reduce((sum, cand) => {
                const acVote = cand.acWiseVotes.find(av => av.acName === ac.acName);
                return sum + (acVote?.votes || 0);
              }, 0);
            
            return {
              acName: ac.acName,
              votes: ac.votes,
              voteShare: acTotalVotes > 0 ? parseFloat(((ac.votes / acTotalVotes) * 100).toFixed(2)) : 0
            };
          });
          
          return {
            name: c.name,
            party: c.party,
            votes: totalVotes,
            voteShare: 0, // Will calculate after sorting
            position: 0,
            acWiseVotes
          };
        })
        .sort((a, b) => b.votes - a.votes);
      
      // Calculate positions and vote shares
      const totalValidVotes = candidatesArray.reduce((sum, c) => sum + c.votes, 0);
      candidatesArray.forEach((c, idx) => {
        c.position = idx + 1;
        c.voteShare = totalValidVotes > 0 ? parseFloat(((c.votes / totalValidVotes) * 100).toFixed(2)) : 0;
      });
      
      // Calculate margin
      if (candidatesArray.length >= 2) {
        candidatesArray[0].margin = candidatesArray[0].votes - candidatesArray[1].votes;
      }
      
      // Calculate turnout
      const turnout = pcData.pcElectors > 0 
        ? parseFloat(((totalValidVotes / pcData.pcElectors) * 100).toFixed(2))
        : 0;
      
      output[pcKey] = {
        constituencyName: pcKey,
        constituencyNameOriginal: pcData.pcName,
        constituencyNo: pcData.pcNo,
        constituencyType: pcKey.includes('(SC)') ? 'SC' : pcKey.includes('(ST)') ? 'ST' : 'GEN',
        state: data.stateName,
        year: 2024,
        electors: pcData.pcElectors,
        validVotes: totalValidVotes,
        turnout,
        totalCandidates: candidatesArray.length,
        candidates: candidatesArray
      };
    }
    
    // Write 2024.json
    const outputPath = path.join(outputDir, '2024.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Written ${outputPath} with ${totalPCs} PCs`);
    
    // Update index.json - preserve existing years
    const indexPath = path.join(outputDir, 'index.json');
    let existingYears = [];
    
    // Check for existing year files
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
      const match = file.match(/^(\d{4})\.json$/);
      if (match) {
        existingYears.push(parseInt(match[1]));
      }
    }
    existingYears.sort((a, b) => a - b);
    
    // Build index
    const indexData = {
      state: data.stateName,
      stateSlug: stateSlug,
      availableYears: existingYears,
      years: existingYears,
      totalConstituencies: totalPCs,
      lastUpdated: new Date().toISOString().split('T')[0],
      source: 'ECI/TCPD'
    };
    
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
  }
  
  console.log('\nDone! Updated 2024 parliamentary data with AC-wise breakdown.');
}

main().catch(console.error);

