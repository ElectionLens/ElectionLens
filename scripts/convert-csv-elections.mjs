#!/usr/bin/env node
/**
 * Convert CSV election data to ElectionLens JSON format
 * Supports formats like the Telangana, Mizoram, Chhattisgarh CSVs
 * 
 * Usage: node scripts/convert-csv-elections.mjs <csv-file> <state-slug> <year>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State configuration
const STATE_CONFIG = {
  'telangana': { name: 'Telangana', code: 'TG', totalAC: 119 },
  'mizoram': { name: 'Mizoram', code: 'MZ', totalAC: 40 },
  'chhattisgarh': { name: 'Chhattisgarh', code: 'CG', totalAC: 90 },
  'rajasthan': { name: 'Rajasthan', code: 'RJ', totalAC: 200 },
  'madhya-pradesh': { name: 'Madhya Pradesh', code: 'MP', totalAC: 230 },
  'andhra-pradesh': { name: 'Andhra Pradesh', code: 'AP', totalAC: 175 },
  'odisha': { name: 'Odisha', code: 'OD', totalAC: 147 },
  'arunachal-pradesh': { name: 'Arunachal Pradesh', code: 'AR', totalAC: 60 },
  'sikkim': { name: 'Sikkim', code: 'SK', totalAC: 32 },
  'jammu-and-kashmir': { name: 'Jammu & Kashmir', code: 'JK', totalAC: 90 },
};

// Party abbreviations
const PARTY_ABBREV = {
  'Bharatiya Janata Party': 'BJP',
  'Indian National Congress': 'INC',
  'Bharat Rashtra Samithi': 'BRS',
  'Telangana Rashtra Samithi': 'TRS',
  'Aam Aadmi Party': 'AAP',
  'Bahujan Samaj Party': 'BSP',
  'Communist Party of India': 'CPI',
  'Communist Party of India (Marxist)': 'CPI(M)',
  'Mizo National Front': 'MNF',
  'Zoram People\'s Movement': 'ZPM',
  'Janta Congress Chhattisgarh (J)': 'JCC(J)',
  'Janta Congress Chhattisgarh': 'JCC',
  'Gondvana Gantantra Party': 'GGP',
  'Samajwadi Party': 'SP',
  'Jammu & Kashmir National Conference': 'JKNC',
  'Jammu & Kashmir Peoples Democratic Party': 'JKPDP',
  'Jammu & Kashmir People Conference': 'JKPC',
  'Jammu and Kashmir Apni Party': 'JKAP',
  'Telugu Desam': 'TDP',
  'Telugu Desam Party': 'TDP',
  'Yuvajana Sramika Rythu Congress Party': 'YSRCP',
  'YSR Congress Party': 'YSRCP',
  'Biju Janata Dal': 'BJD',
  'Independent': 'IND',
  'None of the Above': 'NOTA',
};

function normalizeParty(party) {
  party = party.trim();
  if (PARTY_ABBREV[party]) return PARTY_ABBREV[party];
  
  // Check partial matches
  for (const [full, abbr] of Object.entries(PARTY_ABBREV)) {
    if (party.toLowerCase().includes(full.toLowerCase().slice(0, 10))) {
      return abbr;
    }
  }
  
  // Return abbreviation if short, otherwise truncate
  if (party.length <= 8 && party === party.toUpperCase()) return party;
  return party.toUpperCase().slice(0, 10);
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
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
  return values;
}

function parseConstituency(constStr) {
  // Parse formats like "82 - Achampet" or "13 - Aizawl East-I"
  const match = constStr.match(/^(\d+)\s*-\s*(.+)$/);
  if (match) {
    return {
      no: parseInt(match[1]),
      name: match[2].trim().toUpperCase()
    };
  }
  // Plain name format like "KARNAH"
  return { no: 0, name: constStr.trim().toUpperCase() };
}

function calculateENOP(candidates) {
  const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
  if (totalVotes === 0) return 0;
  
  let sumSquares = 0;
  for (const c of candidates) {
    const share = c.votes / totalVotes;
    sumSquares += share * share;
  }
  
  return sumSquares > 0 ? parseFloat((1 / sumSquares).toFixed(2)) : 0;
}

function processCSV(csvPath, stateSlug, year) {
  const config = STATE_CONFIG[stateSlug];
  if (!config) {
    throw new Error(`Unknown state: ${stateSlug}. Available: ${Object.keys(STATE_CONFIG).join(', ')}`);
  }
  
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file is empty');
  }
  
  // Parse header
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  console.log('Header:', header);
  
  // Find column indices (directly from header, no shifting)
  const cols = {
    sn: header.findIndex(h => h === 's.n.' || h === 'sn' || h === 'serial'),
    constNo: header.findIndex(h => h.includes('const') && h.includes('no') && !h.includes('name')),
    candidate: header.findIndex(h => h.includes('candidate') && (h.includes('name') || !h.includes('party') && !h.includes('vote'))),
    party: header.findIndex(h => h.includes('party')),
    evmVotes: header.findIndex(h => h.includes('evm')),
    postalVotes: header.findIndex(h => h.includes('postal')),
    totalVotes: header.findIndex(h => h === 'total votes' || h === 'total_votes' || h === 'candidate votes'),
    votePercent: header.findIndex(h => h.includes('%') || h.includes('percent')),
    constituency: header.findIndex(h => h.includes('constituency') && !h.includes('no')),
  };
  
  // Fallback for candidate column
  if (cols.candidate < 0) {
    cols.candidate = header.findIndex(h => h.includes('candidate'));
  }
  
  console.log('Column mapping:', cols);
  
  // Group by constituency
  const constituencyData = {};
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;  // Need at least constituency, candidate, and one more field
    
    // Get constituency - handle both formats
    let constNo = 0;
    let constName = '';
    
    if (cols.constituency >= 0) {
      // Format: "82 - Achampet" in constituency column
      const constStr = values[cols.constituency] || '';
      if (!constStr) continue;
      const parsed = parseConstituency(constStr);
      constNo = parsed.no;
      constName = parsed.name;
    } else if (cols.constNo >= 0) {
      // Format: Just constituency number in const.no column
      constNo = parseInt(values[cols.constNo]) || 0;
      constName = `AC-${constNo}`; // Use number as name for now
    }
    
    if (!constName) continue;
    
    // Get candidate data
    const candidate = (values[cols.candidate] || '').trim().toUpperCase();
    const party = normalizeParty(values[cols.party] || 'IND');
    
    // Skip NOTA for candidate list
    if (candidate === 'NOTA' || party === 'NOTA') continue;
    if (!candidate) continue;
    
    // Parse votes - try multiple column options
    let votes = 0;
    if (cols.totalVotes >= 0 && cols.totalVotes < values.length) {
      votes = parseInt((values[cols.totalVotes] || '0').replace(/,/g, '')) || 0;
    } else if (cols.evmVotes >= 0 && cols.evmVotes < values.length) {
      const evm = parseInt((values[cols.evmVotes] || '0').replace(/,/g, '')) || 0;
      const postal = cols.postalVotes >= 0 && cols.postalVotes < values.length 
        ? parseInt((values[cols.postalVotes] || '0').replace(/,/g, '')) || 0 
        : 0;
      votes = evm + postal;
    } else {
      // Try to find any column with "votes" that has a number
      for (let vi = 0; vi < values.length; vi++) {
        if (header[vi] && header[vi].includes('vote') && !isNaN(parseInt(values[vi]))) {
          votes = parseInt((values[vi] || '0').replace(/,/g, '')) || 0;
          break;
        }
      }
    }
    
    const voteShare = cols.votePercent >= 0 ? parseFloat(values[cols.votePercent] || '0') : 0;
    
    // Use constituency number as key if no name available
    const constKey = constName.startsWith('AC-') ? constNo.toString() : constName;
    
    // Initialize constituency
    if (!constituencyData[constKey]) {
      constituencyData[constKey] = {
        year,
        constituencyNo: constNo,
        constituencyName: constName,
        constituencyNameOriginal: constName.startsWith('AC-') ? `Constituency ${constNo}` : constName,
        constituencyType: constName.includes('(SC)') ? 'SC' : (constName.includes('(ST)') ? 'ST' : 'GEN'),
        districtName: '',
        validVotes: 0,
        notaVotes: 0,
        electors: 0,
        turnout: 0,
        enop: 0,
        totalCandidates: 0,
        candidates: [],
      };
    }
    
    constituencyData[constKey].candidates.push({
      position: 0,
      name: candidate,
      party,
      votes,
      voteShare,
      margin: null,
      marginPct: null,
      sex: 'M',
      age: 0,
      depositLost: voteShare < 16.67,
    });
  }
  
  // Post-process: sort candidates, calculate stats
  for (const [name, data] of Object.entries(constituencyData)) {
    // Sort by votes descending
    data.candidates.sort((a, b) => b.votes - a.votes);
    
    // Assign positions
    data.candidates.forEach((c, i) => {
      c.position = i + 1;
    });
    
    // Calculate totals
    data.validVotes = data.candidates.reduce((sum, c) => sum + c.votes, 0);
    data.totalCandidates = data.candidates.length;
    
    // Recalculate vote shares if needed
    if (data.validVotes > 0) {
      data.candidates.forEach(c => {
        if (!c.voteShare) {
          c.voteShare = parseFloat(((c.votes / data.validVotes) * 100).toFixed(2));
        }
        c.depositLost = c.voteShare < 16.67;
      });
    }
    
    // Calculate margin for winner
    if (data.candidates.length >= 2) {
      const winner = data.candidates[0];
      const runnerUp = data.candidates[1];
      winner.margin = winner.votes - runnerUp.votes;
      winner.marginPct = data.validVotes > 0 
        ? parseFloat(((winner.margin / data.validVotes) * 100).toFixed(2))
        : 0;
    }
    
    // Calculate ENOP
    data.enop = calculateENOP(data.candidates);
  }
  
  return { results: constituencyData, config };
}

function saveResults(stateSlug, year, results, config) {
  const outputDir = path.join(__dirname, '..', 'public', 'data', 'elections', 'ac', stateSlug);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save year data
  const yearFile = path.join(outputDir, `${year}.json`);
  fs.writeFileSync(yearFile, JSON.stringify(results, null, 2));
  console.log(`✓ Saved: ${yearFile}`);
  console.log(`  Constituencies: ${Object.keys(results).length}`);
  
  // Count total candidates
  const totalCandidates = Object.values(results).reduce((sum, c) => sum + c.candidates.length, 0);
  console.log(`  Total candidates: ${totalCandidates}`);
  
  // Update index
  const indexFile = path.join(outputDir, 'index.json');
  let index = {};
  
  if (fs.existsSync(indexFile)) {
    index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  }
  
  if (!index.availableYears) index.availableYears = [];
  if (!index.availableYears.includes(year)) {
    index.availableYears.push(year);
    index.availableYears.sort((a, b) => a - b);
  }
  
  index.state = config.name;
  index.stateCode = config.code;
  index.totalConstituencies = config.totalAC;
  index.delimitation = 2008;
  index.lastUpdated = new Date().toISOString();
  index.source = 'Election Commission of India (ECI)';
  
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  console.log(`✓ Updated: ${indexFile}`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log(`
CSV Election Data Converter
===========================

Usage: node scripts/convert-csv-elections.mjs <csv-file> <state-slug> <year>

Examples:
  node scripts/convert-csv-elections.mjs ~/Desktop/Telangana_2023.csv telangana 2023
  node scripts/convert-csv-elections.mjs ~/Desktop/Mizoram_2023.csv mizoram 2023

Available states: ${Object.keys(STATE_CONFIG).join(', ')}
`);
    process.exit(0);
  }
  
  const [csvFile, stateSlug, yearStr] = args;
  const year = parseInt(yearStr);
  
  if (!fs.existsSync(csvFile)) {
    console.error(`File not found: ${csvFile}`);
    process.exit(1);
  }
  
  console.log(`\nProcessing: ${csvFile}`);
  console.log(`State: ${stateSlug}, Year: ${year}\n`);
  
  try {
    const { results, config } = processCSV(csvFile, stateSlug, year);
    saveResults(stateSlug, year, results, config);
    console.log('\n✓ Conversion complete!');
  } catch (err) {
    console.error(`\n✗ Error: ${err.message}`);
    process.exit(1);
  }
}

main();

