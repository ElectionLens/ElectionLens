#!/usr/bin/env node
/**
 * Convert TCPD Lok Sabha AC-segment-wise data to ElectionLens format
 * This creates:
 * 1. PC-level results (aggregated from AC segments)
 * 2. AC-wise breakdown for each PC
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State name normalization
const STATE_SLUG_MAP = {
  'andhra_pradesh': 'andhra-pradesh',
  'arunachal_pradesh': 'arunachal-pradesh',
  'assam': 'assam',
  'bihar': 'bihar',
  'chhattisgarh': 'chhattisgarh',
  'goa': 'goa',
  'gujarat': 'gujarat',
  'haryana': 'haryana',
  'himachal_pradesh': 'himachal-pradesh',
  'jammu_&_kashmir': 'jammu-and-kashmir',
  'jharkhand': 'jharkhand',
  'karnataka': 'karnataka',
  'kerala': 'kerala',
  'madhya_pradesh': 'madhya-pradesh',
  'maharashtra': 'maharashtra',
  'manipur': 'manipur',
  'meghalaya': 'meghalaya',
  'mizoram': 'mizoram',
  'nagaland': 'nagaland',
  'delhi': 'delhi',
  'odisha': 'odisha',
  'puducherry': 'puducherry',
  'punjab': 'punjab',
  'rajasthan': 'rajasthan',
  'sikkim': 'sikkim',
  'tamil_nadu': 'tamil-nadu',
  'telangana': 'telangana',
  'tripura': 'tripura',
  'uttar_pradesh': 'uttar-pradesh',
  'uttarakhand': 'uttarakhand',
  'west_bengal': 'west-bengal',
  'andaman_&_nicobar_islands': 'andaman-nicobar',
  'chandigarh': 'chandigarh',
  'dadra_&_nagar_haveli': 'dadra-nagar-haveli',
  'daman_&_diu': 'daman-diu',
  'lakshadweep': 'lakshadweep',
  'ladakh': 'ladakh',
};

function getStateSlug(stateName) {
  const normalized = stateName.toLowerCase().replace(/\s+/g, '_');
  return STATE_SLUG_MAP[normalized] || normalized.replace(/_/g, '-');
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const header = lines[0].split(',').map(h => h.trim());
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle CSV with possible quoted fields
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row = {};
    header.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { header, rows };
}

async function main() {
  const csvPath = process.argv[2] || '/Users/p0s097d/Desktop/TCPD_GA_All_States_2025-12-21.csv';
  
  console.log(`\nProcessing: ${csvPath}`);
  
  // Read CSV
  const content = fs.readFileSync(csvPath, 'utf8');
  const { header, rows } = parseCSV(content);
  
  console.log('Header:', header.slice(0, 15).join(', '));
  console.log('Total rows:', rows.length);
  
  // Group data by State -> Year -> PC -> AC
  const data = {};
  
  rows.forEach(row => {
    const stateName = row.State_Name;
    const year = parseInt(row.Year);
    const pcName = row.PC_Name;
    const pcNo = parseInt(row.PC_No) || 0;
    const acName = row.Constituency_Name;
    const acNo = parseInt(row.Constituency_No) || 0;
    const acType = row.Constituency_Type || 'GEN';
    const candidate = row.Candidate;
    const party = row.Party;
    const votes = parseInt(row.Votes) || 0;
    const position = parseInt(row.Position) || 0;
    const validVotes = parseInt(row.Valid_Votes) || 0;
    const voteShare = parseFloat(row.Vote_Share_Percentage) || 0;
    const margin = parseInt(row.Margin) || 0;
    const marginPct = parseFloat(row.Margin_Percentage) || 0;
    const depositLost = row.Deposit_Lost?.toLowerCase() === 'yes';
    const sex = row.Sex || '';
    const enop = parseFloat(row.ENOP) || 0;
    
    if (!stateName || !year || !pcName || !candidate) return;
    
    const stateSlug = getStateSlug(stateName);
    
    // Initialize state
    if (!data[stateSlug]) {
      data[stateSlug] = { stateName, stateSlug, years: {} };
    }
    
    // Initialize year
    if (!data[stateSlug].years[year]) {
      data[stateSlug].years[year] = {};
    }
    
    // Initialize PC
    const pcKey = pcName.toUpperCase();
    if (!data[stateSlug].years[year][pcKey]) {
      data[stateSlug].years[year][pcKey] = {
        year,
        constituencyNo: pcNo,
        constituencyName: pcKey,
        constituencyNameOriginal: pcName,
        constituencyType: 'GEN',
        stateName,
        validVotes: 0,
        electors: 0,
        turnout: 0,
        enop: 0,
        totalCandidates: 0,
        candidates: {},
        assemblyConstituencies: [],
        acWiseResults: {},
      };
    }
    
    const pc = data[stateSlug].years[year][pcKey];
    
    // Track AC
    if (!pc.acWiseResults[acName]) {
      pc.acWiseResults[acName] = {
        acName,
        acNo,
        acType,
        validVotes: 0,
        candidates: {},
      };
      pc.assemblyConstituencies.push(acName);
    }
    
    const ac = pc.acWiseResults[acName];
    ac.validVotes = Math.max(ac.validVotes, validVotes);
    
    // Add candidate to AC
    if (!ac.candidates[candidate]) {
      ac.candidates[candidate] = {
        name: candidate,
        party,
        votes: 0,
        position,
        voteShare: 0,
        sex,
        depositLost,
      };
    }
    ac.candidates[candidate].votes += votes;
    ac.candidates[candidate].voteShare = voteShare;
    ac.candidates[candidate].position = position;
    
    // Aggregate to PC level
    if (!pc.candidates[candidate]) {
      pc.candidates[candidate] = {
        name: candidate,
        party,
        votes: 0,
        position: 0,
        voteShare: 0,
        margin: 0,
        marginPct: 0,
        sex,
        age: null,
        depositLost,
        acWiseVotes: [],
      };
    }
    pc.candidates[candidate].votes += votes;
    pc.candidates[candidate].acWiseVotes.push({
      acName,
      votes,
      voteShare,
    });
  });
  
  // Post-process: calculate totals and sort candidates
  const outputDir = path.join(__dirname, '../public/data/elections/pc');
  
  let totalStates = 0;
  let totalPCs = 0;
  
  Object.entries(data).forEach(([stateSlug, stateData]) => {
    const stateDir = path.join(outputDir, stateSlug);
    
    // Create directory
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    
    const availableYears = Object.keys(stateData.years).map(Number).sort();
    
    availableYears.forEach(year => {
      const yearData = stateData.years[year];
      const pcResults = {};
      
      Object.entries(yearData).forEach(([pcKey, pc]) => {
        // Convert candidates object to sorted array
        const candidatesArray = Object.values(pc.candidates);
        candidatesArray.sort((a, b) => b.votes - a.votes);
        
        // Calculate PC-level stats
        pc.validVotes = candidatesArray.reduce((sum, c) => sum + c.votes, 0);
        pc.totalCandidates = candidatesArray.length;
        
        // Set positions and vote shares
        candidatesArray.forEach((c, idx) => {
          c.position = idx + 1;
          c.voteShare = pc.validVotes > 0 ? (c.votes / pc.validVotes) * 100 : 0;
          c.voteShare = Math.round(c.voteShare * 100) / 100;
        });
        
        // Set margin for winner
        if (candidatesArray.length >= 2) {
          const winner = candidatesArray[0];
          const runnerUp = candidatesArray[1];
          winner.margin = winner.votes - runnerUp.votes;
          winner.marginPct = pc.validVotes > 0 ? (winner.margin / pc.validVotes) * 100 : 0;
          winner.marginPct = Math.round(winner.marginPct * 100) / 100;
        }
        
        // Calculate ENOP
        const sumSquares = candidatesArray.reduce((sum, c) => {
          const share = c.voteShare / 100;
          return sum + (share * share);
        }, 0);
        pc.enop = sumSquares > 0 ? Math.round((1 / sumSquares) * 100) / 100 : 0;
        
        // Convert AC results
        Object.entries(pc.acWiseResults).forEach(([acName, ac]) => {
          const acCandidates = Object.values(ac.candidates);
          acCandidates.sort((a, b) => b.votes - a.votes);
          acCandidates.forEach((c, idx) => {
            c.position = idx + 1;
            c.voteShare = ac.validVotes > 0 ? (c.votes / ac.validVotes) * 100 : 0;
            c.voteShare = Math.round(c.voteShare * 100) / 100;
          });
          ac.candidates = acCandidates;
        });
        
        pc.candidates = candidatesArray;
        pcResults[pcKey] = pc;
        totalPCs++;
      });
      
      // Save year data
      const yearPath = path.join(stateDir, `${year}.json`);
      fs.writeFileSync(yearPath, JSON.stringify(pcResults, null, 2));
    });
    
    // Update index
    const indexPath = path.join(stateDir, 'index.json');
    let existingIndex = { availableYears: [] };
    if (fs.existsSync(indexPath)) {
      existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    }
    
    // Merge years
    const allYears = [...new Set([...existingIndex.availableYears, ...availableYears])].sort();
    
    const index = {
      state: stateData.stateName,
      stateSlug,
      availableYears: allYears,
      totalConstituencies: Object.keys(stateData.years[availableYears[availableYears.length - 1]] || {}).length,
      lastUpdated: new Date().toISOString(),
      source: 'TCPD (Trivedi Centre for Political Data)',
    };
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    
    console.log(`✓ ${stateSlug}: ${availableYears.join(', ')}`);
    totalStates++;
  });
  
  console.log(`\n✓ Conversion complete!`);
  console.log(`Total states: ${totalStates}`);
  console.log(`Total PC-year combinations: ${totalPCs}`);
}

main().catch(console.error);


