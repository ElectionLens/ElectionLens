#!/usr/bin/env node
/**
 * Process TCPD Election Data CSV to JSON
 * Extracts post-delimitation assembly election results for all states
 * Delimitation boundaries came into effect for 2008 elections onwards (DelimID=4)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State name to slug mapping
const STATE_SLUGS = {
  'Andhra_Pradesh': 'andhra-pradesh',
  'Arunachal_Pradesh': 'arunachal-pradesh',
  'Assam': 'assam',
  'Bihar': 'bihar',
  'Chhattisgarh': 'chhattisgarh',
  'Delhi': 'delhi',
  'Goa': 'goa',
  'Gujarat': 'gujarat',
  'Haryana': 'haryana',
  'Himachal_Pradesh': 'himachal-pradesh',
  'Jammu_&_Kashmir': 'jammu-and-kashmir',
  'Jharkhand': 'jharkhand',
  'Karnataka': 'karnataka',
  'Kerala': 'kerala',
  'Madhya_Pradesh': 'madhya-pradesh',
  'Maharashtra': 'maharashtra',
  'Manipur': 'manipur',
  'Meghalaya': 'meghalaya',
  'Mizoram': 'mizoram',
  'Nagaland': 'nagaland',
  'Odisha': 'odisha',
  'Puducherry': 'puducherry',
  'Punjab': 'punjab',
  'Rajasthan': 'rajasthan',
  'Sikkim': 'sikkim',
  'Tamil_Nadu': 'tamil-nadu',
  'Telangana': 'telangana',
  'Tripura': 'tripura',
  'Uttar_Pradesh': 'uttar-pradesh',
  'Uttarakhand': 'uttarakhand',
  'West_Bengal': 'west-bengal'
};

// State codes (ISO 3166-2:IN)
const STATE_CODES = {
  'Andhra_Pradesh': 'AP',
  'Arunachal_Pradesh': 'AR',
  'Assam': 'AS',
  'Bihar': 'BR',
  'Chhattisgarh': 'CG',
  'Delhi': 'DL',
  'Goa': 'GA',
  'Gujarat': 'GJ',
  'Haryana': 'HR',
  'Himachal_Pradesh': 'HP',
  'Jammu_&_Kashmir': 'JK',
  'Jharkhand': 'JH',
  'Karnataka': 'KA',
  'Kerala': 'KL',
  'Madhya_Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'MN',
  'Meghalaya': 'ML',
  'Mizoram': 'MZ',
  'Nagaland': 'NL',
  'Odisha': 'OD',
  'Puducherry': 'PY',
  'Punjab': 'PB',
  'Rajasthan': 'RJ',
  'Sikkim': 'SK',
  'Tamil_Nadu': 'TN',
  'Telangana': 'TG',
  'Tripura': 'TR',
  'Uttar_Pradesh': 'UP',
  'Uttarakhand': 'UK',
  'West_Bengal': 'WB'
};

// Display name mapping
const STATE_DISPLAY_NAMES = {
  'Andhra_Pradesh': 'Andhra Pradesh',
  'Arunachal_Pradesh': 'Arunachal Pradesh',
  'Assam': 'Assam',
  'Bihar': 'Bihar',
  'Chhattisgarh': 'Chhattisgarh',
  'Delhi': 'Delhi',
  'Goa': 'Goa',
  'Gujarat': 'Gujarat',
  'Haryana': 'Haryana',
  'Himachal_Pradesh': 'Himachal Pradesh',
  'Jammu_&_Kashmir': 'Jammu & Kashmir',
  'Jharkhand': 'Jharkhand',
  'Karnataka': 'Karnataka',
  'Kerala': 'Kerala',
  'Madhya_Pradesh': 'Madhya Pradesh',
  'Maharashtra': 'Maharashtra',
  'Manipur': 'Manipur',
  'Meghalaya': 'Meghalaya',
  'Mizoram': 'Mizoram',
  'Nagaland': 'Nagaland',
  'Odisha': 'Odisha',
  'Puducherry': 'Puducherry',
  'Punjab': 'Punjab',
  'Rajasthan': 'Rajasthan',
  'Sikkim': 'Sikkim',
  'Tamil_Nadu': 'Tamil Nadu',
  'Telangana': 'Telangana',
  'Tripura': 'Tripura',
  'Uttar_Pradesh': 'Uttar Pradesh',
  'Uttarakhand': 'Uttarakhand',
  'West_Bengal': 'West Bengal'
};

/**
 * Parse CSV line handling quoted fields
 */
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

/**
 * Normalize constituency name for matching with GeoJSON
 */
function normalizeConstituencyName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '')
    .replace(/-/g, ' ');
}

/**
 * Identify general election years for a state
 * General elections have most constituencies (>50% of max) voting
 */
function identifyGeneralElectionYears(stateData, minConstituencies = 20) {
  const yearCounts = {};
  
  // Count constituencies per year
  for (const [key, election] of Object.entries(stateData)) {
    const year = election.year;
    if (!yearCounts[year]) {
      yearCounts[year] = new Set();
    }
    yearCounts[year].add(election.constituencyNo);
  }
  
  // Convert to counts
  const counts = Object.entries(yearCounts).map(([year, constituencies]) => ({
    year: parseInt(year),
    count: constituencies.size
  }));
  
  // Find max
  const maxCount = Math.max(...counts.map(c => c.count));
  const threshold = Math.max(minConstituencies, maxCount * 0.5);
  
  // Filter for general elections (years with significant constituency count)
  return counts
    .filter(c => c.count >= threshold)
    .map(c => c.year)
    .sort((a, b) => a - b);
}

/**
 * Process the CSV file and extract election results for all states
 */
async function processElectionData(csvPath, outputDir) {
  console.log(`Reading CSV from: ${csvPath}`);
  console.log('This may take a moment for large files...\n');
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(l => l.trim());
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  console.log(`Found ${lines.length - 1} data rows`);
  
  // Create header index map
  const headerIndex = {};
  headers.forEach((h, i) => { headerIndex[h] = i; });
  
  // First pass: collect all data grouped by state
  const allStateData = {};
  let processedRows = 0;
  let skippedRows = 0;
  
  console.log('Processing rows...');
  
  for (let i = 1; i < lines.length; i++) {
    if (i % 50000 === 0) {
      console.log(`  Processed ${i.toLocaleString()} rows...`);
    }
    
    const values = parseCSVLine(lines[i]);
    if (values.length < 10) {
      skippedRows++;
      continue;
    }
    
    const stateName = values[headerIndex['State_Name']] || '';
    const delimId = parseInt(values[headerIndex['DelimID']] || '0', 10);
    
    // Only process post-delimitation data (DelimID = 4)
    if (delimId !== 4) {
      skippedRows++;
      continue;
    }
    
    // Skip states we don't have mappings for
    if (!STATE_SLUGS[stateName]) {
      skippedRows++;
      continue;
    }
    
    const year = parseInt(values[headerIndex['Year']], 10);
    
    // Check if it's a general election (Poll_No = 0 indicates general election)
    const pollNo = parseInt(values[headerIndex['Poll_No']] || '0', 10);
    if (pollNo !== 0) {
      skippedRows++;
      continue;
    }
    
    const constituencyName = values[headerIndex['Constituency_Name']] || '';
    const constituencyNo = parseInt(values[headerIndex['Constituency_No']] || '0', 10);
    const position = parseInt(values[headerIndex['Position']] || '0', 10);
    const candidate = values[headerIndex['Candidate']] || '';
    const party = values[headerIndex['Party']] || '';
    const votes = parseInt(values[headerIndex['Votes']] || '0', 10);
    const voteShare = parseFloat(values[headerIndex['Vote_Share_Percentage']] || '0');
    const validVotes = parseInt(values[headerIndex['Valid_Votes']] || '0', 10);
    const electors = parseInt(values[headerIndex['Electors']] || '0', 10);
    const turnout = parseFloat(values[headerIndex['Turnout_Percentage']] || '0');
    const margin = parseInt(values[headerIndex['Margin']] || '0', 10);
    const marginPct = parseFloat(values[headerIndex['Margin_Percentage']] || '0');
    const sex = values[headerIndex['Sex']] || '';
    const age = parseInt(values[headerIndex['Age']] || '0', 10);
    const constituencyType = values[headerIndex['Constituency_Type']] || 'GEN';
    const districtName = values[headerIndex['District_Name']] || '';
    const depositLost = values[headerIndex['Deposit_Lost']] || '';
    const enop = parseFloat(values[headerIndex['ENOP']] || '0');
    const nCand = parseInt(values[headerIndex['N_Cand']] || '0', 10);
    
    // Skip NOTA and invalid entries
    if (candidate === 'None Of The Above' || candidate === 'NOTA' || !candidate) {
      continue;
    }
    
    // Initialize state if needed
    if (!allStateData[stateName]) {
      allStateData[stateName] = {};
    }
    
    const key = `${year}_${constituencyNo}`;
    
    if (!allStateData[stateName][key]) {
      allStateData[stateName][key] = {
        year,
        constituencyNo,
        constituencyName: normalizeConstituencyName(constituencyName),
        constituencyNameOriginal: constituencyName,
        constituencyType,
        districtName,
        validVotes,
        electors,
        turnout,
        enop,
        totalCandidates: nCand,
        candidates: []
      };
    }
    
    allStateData[stateName][key].candidates.push({
      position,
      name: candidate,
      party,
      votes,
      voteShare,
      margin: position === 1 ? margin : null,
      marginPct: position === 1 ? marginPct : null,
      sex: sex === 'MALE' ? 'M' : sex === 'FEMALE' ? 'F' : sex,
      age: age || null,
      depositLost: depositLost === 'yes'
    });
    
    processedRows++;
  }
  
  console.log(`\nProcessed ${processedRows.toLocaleString()} valid rows`);
  console.log(`Skipped ${skippedRows.toLocaleString()} rows (pre-delimitation, by-elections, etc.)`);
  console.log(`Found ${Object.keys(allStateData).length} states with post-delimitation data\n`);
  
  // Process each state
  const statesProcessed = [];
  
  for (const [stateName, stateData] of Object.entries(allStateData)) {
    const slug = STATE_SLUGS[stateName];
    const code = STATE_CODES[stateName];
    const displayName = STATE_DISPLAY_NAMES[stateName];
    
    if (!slug) continue;
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Processing: ${displayName}`);
    console.log('='.repeat(50));
    
    // Sort candidates by position within each constituency
    Object.values(stateData).forEach(election => {
      election.candidates.sort((a, b) => a.position - b.position);
    });
    
    // Identify general election years
    const generalElectionYears = identifyGeneralElectionYears(stateData);
    console.log(`General election years: ${generalElectionYears.join(', ')}`);
    
    if (generalElectionYears.length === 0) {
      console.log(`  ⚠️ No general elections found, skipping`);
      continue;
    }
    
    // Group by year
    const byYear = {};
    Object.values(stateData).forEach(election => {
      if (!generalElectionYears.includes(election.year)) return;
      
      if (!byYear[election.year]) {
        byYear[election.year] = {};
      }
      // Use normalized name as key for GeoJSON matching
      byYear[election.year][election.constituencyName] = election;
    });
    
    // Statistics
    let maxConstituencies = 0;
    for (const year of generalElectionYears) {
      const elections = byYear[year] || {};
      const count = Object.keys(elections).length;
      maxConstituencies = Math.max(maxConstituencies, count);
      
      console.log(`\n  ${year}: ${count} constituencies`);
      
      if (count > 0) {
        const partyWins = {};
        Object.values(elections).forEach(e => {
          const winner = e.candidates[0];
          if (winner) {
            partyWins[winner.party] = (partyWins[winner.party] || 0) + 1;
          }
        });
        
        const sorted = Object.entries(partyWins)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        console.log(`    Top parties: ${sorted.map(([p, c]) => `${p}(${c})`).join(', ')}`);
      }
    }
    
    // Write output files
    const outputPath = path.join(outputDir, slug);
    fs.mkdirSync(outputPath, { recursive: true });
    
    // Write individual year files
    for (const year of generalElectionYears) {
      const yearData = byYear[year] || {};
      if (Object.keys(yearData).length === 0) continue;
      
      const filePath = path.join(outputPath, `${year}.json`);
      fs.writeFileSync(filePath, JSON.stringify(yearData, null, 2));
      console.log(`  ✓ Wrote ${Object.keys(yearData).length} constituencies to ${year}.json`);
    }
    
    // Write combined index file
    const indexData = {
      state: displayName,
      stateCode: code,
      delimitation: 2008,
      availableYears: generalElectionYears,
      totalConstituencies: maxConstituencies,
      lastUpdated: new Date().toISOString(),
      source: 'TCPD (Trivedi Centre for Political Data)'
    };
    
    fs.writeFileSync(
      path.join(outputPath, 'index.json'),
      JSON.stringify(indexData, null, 2)
    );
    
    statesProcessed.push({
      name: displayName,
      slug,
      code,
      years: generalElectionYears,
      constituencies: maxConstituencies
    });
  }
  
  // Write master index of all states
  const masterIndex = {
    states: statesProcessed,
    totalStates: statesProcessed.length,
    lastUpdated: new Date().toISOString(),
    source: 'TCPD (Trivedi Centre for Political Data)'
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'index.json'),
    JSON.stringify(masterIndex, null, 2)
  );
  
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`\n✅ Processed ${statesProcessed.length} states:`);
  statesProcessed.forEach(s => {
    console.log(`   ${s.name}: ${s.years.join(', ')} (${s.constituencies} ACs)`);
  });
  console.log(`\n📁 Output directory: ${outputDir}`);
  console.log('✅ Processing complete!');
}

// Main execution
const csvPath = process.argv[2] || '/Users/p0s097d/Desktop/TCPD_AE_All_States_2025-12-20.csv';
const outputDir = path.join(__dirname, '../public/data/elections/ac');

processElectionData(csvPath, outputDir).catch(console.error);
