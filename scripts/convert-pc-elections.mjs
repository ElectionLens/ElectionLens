#!/usr/bin/env node
/**
 * Convert Parliamentary Election CSV to ElectionLens JSON format
 * 
 * Usage: node scripts/convert-pc-elections.mjs <csv-file>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State name normalization
const STATE_SLUG_MAP = {
  'andhra pradesh': 'andhra-pradesh',
  'arunachal pradesh': 'arunachal-pradesh',
  'assam': 'assam',
  'bihar': 'bihar',
  'chhattisgarh': 'chhattisgarh',
  'goa': 'goa',
  'gujarat': 'gujarat',
  'haryana': 'haryana',
  'himachal pradesh': 'himachal-pradesh',
  'jammu and kashmir': 'jammu-and-kashmir',
  'jammu & kashmir': 'jammu-and-kashmir',
  'jharkhand': 'jharkhand',
  'karnataka': 'karnataka',
  'kerala': 'kerala',
  'madhya pradesh': 'madhya-pradesh',
  'maharashtra': 'maharashtra',
  'manipur': 'manipur',
  'meghalaya': 'meghalaya',
  'mizoram': 'mizoram',
  'nagaland': 'nagaland',
  'nct of delhi': 'delhi',
  'delhi': 'delhi',
  'odisha': 'odisha',
  'orissa': 'odisha',
  'puducherry': 'puducherry',
  'punjab': 'punjab',
  'rajasthan': 'rajasthan',
  'sikkim': 'sikkim',
  'tamil nadu': 'tamil-nadu',
  'telangana': 'telangana',
  'tripura': 'tripura',
  'uttar pradesh': 'uttar-pradesh',
  'uttarakhand': 'uttarakhand',
  'west bengal': 'west-bengal',
  'andaman and nicobar islands': 'andaman-nicobar',
  'chandigarh': 'chandigarh',
  'dadra and nagar haveli and daman and diu': 'dadra-nagar-haveli-daman-diu',
  'lakshadweep': 'lakshadweep',
  'ladakh': 'ladakh',
};

// Party abbreviations
const PARTY_ABBREV = {
  'bharatiya janata party': 'BJP',
  'indian national congress': 'INC',
  'yuvajana sramika rythu congress party': 'YSRCP',
  'telugu desam': 'TDP',
  'janasena party': 'JSP',
  'all india trinamool congress': 'TMC',
  'aam aadmi party': 'AAP',
  'bahujan samaj party': 'BSP',
  'samajwadi party': 'SP',
  'communist party of india': 'CPI',
  'communist party of india (marxist)': 'CPI(M)',
  'rashtriya janata dal': 'RJD',
  'janata dal (united)': 'JD(U)',
  'shiv sena': 'SHS',
  'shiv sena (uddhav balasaheb thackrey)': 'SHS(UBT)',
  'nationalist congress party': 'NCP',
  'nationalist congress party - sharadchandra pawar': 'NCP(SP)',
  'dravida munnetra kazhagam': 'DMK',
  'all india anna dravida munnetra kazhagam': 'AIADMK',
  'biju janata dal': 'BJD',
  'telangana rashtra samithi': 'TRS',
  'bharat rashtra samithi': 'BRS',
  'indian union muslim league': 'IUML',
  'kerala congress (m)': 'KC(M)',
  'jammu & kashmir national conference': 'JKNC',
  'peoples democratic party': 'PDP',
  'shiromani akali dal': 'SAD',
  'lok janshakti party (ram vilas)': 'LJPRV',
  'rashtriya lok dal': 'RLD',
  'independant': 'IND',
  'independent': 'IND',
  'none of the above': 'NOTA',
};

function getPartyAbbrev(partyName) {
  const normalized = partyName.toLowerCase().trim();
  return PARTY_ABBREV[normalized] || partyName.substring(0, 15);
}

function getStateSlug(stateName) {
  const normalized = stateName.toLowerCase().trim();
  return STATE_SLUG_MAP[normalized] || normalized.replace(/\s+/g, '-');
}

function parseCSV(content, delimiter = ';') {
  const lines = content.split('\n').filter(line => line.trim());
  const header = lines[0].split(delimiter).map(h => h.replace(/"/g, '').toLowerCase().trim());
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.replace(/"/g, '').trim());
    const row = {};
    header.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { header, rows };
}

function loadACToPCMapping() {
  const geoPath = path.join(__dirname, '../public/data/geo/assembly/constituencies.geojson');
  const data = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
  
  // Create mapping: PC_NAME -> [AC_NAME, ...]
  // Use normalized names without (SC)/(ST) suffix for matching
  const pcToACs = {};
  
  data.features.forEach(f => {
    const acName = f.properties.AC_NAME;
    const pcNameFull = f.properties.PC_NAME;
    const state = f.properties.ST_NAME || f.properties.State_Name;
    
    if (acName && pcNameFull && state) {
      // Normalize PC name - remove (SC)/(ST) suffix
      const pcName = pcNameFull.replace(/\s*\([^)]*\)\s*$/, '').trim().toUpperCase();
      const stateUpper = state.toUpperCase();
      
      const key = `${stateUpper}|${pcName}`;
      if (!pcToACs[key]) {
        pcToACs[key] = [];
      }
      pcToACs[key].push(acName);
    }
  });
  
  return pcToACs;
}

async function main() {
  const csvPath = process.argv[2];
  
  if (!csvPath) {
    console.log('Usage: node scripts/convert-pc-elections.mjs <csv-file>');
    process.exit(1);
  }
  
  console.log(`\nProcessing: ${csvPath}`);
  
  // Read CSV
  const content = fs.readFileSync(csvPath, 'utf8');
  const { header, rows } = parseCSV(content, ';');
  
  console.log('Header:', header);
  console.log('Total rows:', rows.length);
  
  // Load AC-to-PC mapping
  const pcToACs = loadACToPCMapping();
  console.log('Loaded AC-PC mappings for', Object.keys(pcToACs).length, 'PCs');
  
  // Group by state and constituency
  const stateResults = {};
  
  rows.forEach(row => {
    const state = row.state;
    const pcName = row.constituency?.trim();
    const candidate = row.candidate;
    const party = row.party;
    const votes = parseInt(row.votes?.replace(/,/g, '') || '0');
    const pcNo = parseInt(row['constituency id'] || '0');
    
    if (!state || !pcName || !candidate) return;
    
    const stateSlug = getStateSlug(state);
    
    if (!stateResults[stateSlug]) {
      stateResults[stateSlug] = {
        state,
        stateSlug,
        constituencies: {}
      };
    }
    
    const pcKey = pcName.toUpperCase().trim();
    if (!stateResults[stateSlug].constituencies[pcKey]) {
      // Get AC list for this PC - normalize name for lookup
      const normalizedPC = pcName.toUpperCase()
        .replace(/\s*\([^)]*\)\s*$/, '')  // Remove (SC)/(ST) suffix
        .replace(/-/g, ' ')                // Replace hyphens with spaces
        .trim();
      
      // Normalize state name for GeoJSON lookup
      const stateForGeoLookup = state.toUpperCase()
        .replace('NCT OF DELHI', 'DELHI')
        .replace('ORISSA', 'ODISHA')
        .trim();
      
      const mappingKey = `${stateForGeoLookup}|${normalizedPC}`;
      const acList = pcToACs[mappingKey] || [];
      
      stateResults[stateSlug].constituencies[pcKey] = {
        year: 2024,
        constituencyNo: pcNo,
        constituencyName: pcKey,
        constituencyNameOriginal: pcName,
        constituencyType: 'GEN', // TODO: Get from mapping
        stateName: state,
        validVotes: 0,
        electors: 0,
        turnout: 0,
        enop: 0,
        totalCandidates: 0,
        candidates: [],
        assemblyConstituencies: acList,
      };
    }
    
    const pc = stateResults[stateSlug].constituencies[pcKey];
    
    // Add candidate
    if (candidate.toUpperCase() !== 'NOTA') {
      pc.candidates.push({
        position: 0, // Will be set later
        name: candidate,
        party: getPartyAbbrev(party),
        votes,
        voteShare: 0, // Will be calculated
        margin: null,
        marginPct: null,
        sex: '',
        age: null,
        depositLost: false,
      });
    }
    
    pc.validVotes += votes;
    pc.totalCandidates = pc.candidates.length;
  });
  
  // Post-process: calculate vote shares, positions, margins
  Object.values(stateResults).forEach(state => {
    Object.values(state.constituencies).forEach(pc => {
      // Sort by votes
      pc.candidates.sort((a, b) => b.votes - a.votes);
      
      // Set positions and vote shares
      pc.candidates.forEach((c, idx) => {
        c.position = idx + 1;
        c.voteShare = pc.validVotes > 0 ? (c.votes / pc.validVotes) * 100 : 0;
        c.voteShare = Math.round(c.voteShare * 100) / 100;
      });
      
      // Set margin for winner
      if (pc.candidates.length >= 2) {
        const winner = pc.candidates[0];
        const runnerUp = pc.candidates[1];
        winner.margin = winner.votes - runnerUp.votes;
        winner.marginPct = pc.validVotes > 0 ? (winner.margin / pc.validVotes) * 100 : 0;
        winner.marginPct = Math.round(winner.marginPct * 100) / 100;
      }
      
      // Calculate ENOP (Effective Number of Parties)
      const sumSquares = pc.candidates.reduce((sum, c) => {
        const share = c.voteShare / 100;
        return sum + (share * share);
      }, 0);
      pc.enop = sumSquares > 0 ? Math.round((1 / sumSquares) * 100) / 100 : 0;
    });
  });
  
  // Save results
  const outputDir = path.join(__dirname, '../public/data/elections/pc');
  
  Object.entries(stateResults).forEach(([stateSlug, stateData]) => {
    const stateDir = path.join(outputDir, stateSlug);
    
    // Create directory
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    
    // Save 2024 data
    const dataPath = path.join(stateDir, '2024.json');
    fs.writeFileSync(dataPath, JSON.stringify(stateData.constituencies, null, 2));
    
    // Create/update index
    const indexPath = path.join(stateDir, 'index.json');
    const index = {
      state: stateData.state,
      stateSlug,
      availableYears: [2024],
      totalConstituencies: Object.keys(stateData.constituencies).length,
      lastUpdated: new Date().toISOString(),
      source: 'Election Commission of India (ECI)',
    };
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    
    console.log(`✓ Saved: ${stateSlug} - ${Object.keys(stateData.constituencies).length} PCs`);
  });
  
  console.log('\n✓ Conversion complete!');
  console.log(`Total states: ${Object.keys(stateResults).length}`);
}

main().catch(console.error);

