#!/usr/bin/env node
/**
 * Convert ECI/Wikipedia CSV to ElectionLens JSON format
 * 
 * This script converts constituency-wise election results from CSV format
 * (downloaded from ECI website, Wikipedia, or other sources) to the JSON
 * format used by ElectionLens.
 * 
 * Usage: node scripts/convert-eci-csv.mjs <csv-file> <state-slug> <year>
 * 
 * Expected CSV format (flexible, will try to match columns):
 * - Constituency name/number
 * - Candidate name
 * - Party
 * - Votes
 * - Vote share (optional)
 * - Position/Rank (optional)
 * - District (optional)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State configuration
const STATE_CONFIG = {
  'haryana': { name: 'Haryana', code: 'HR', totalAC: 90 },
  'jharkhand': { name: 'Jharkhand', code: 'JH', totalAC: 81 },
  'maharashtra': { name: 'Maharashtra', code: 'MH', totalAC: 288 },
  'rajasthan': { name: 'Rajasthan', code: 'RJ', totalAC: 200 },
  'madhya-pradesh': { name: 'Madhya Pradesh', code: 'MP', totalAC: 230 },
  'chhattisgarh': { name: 'Chhattisgarh', code: 'CG', totalAC: 90 },
  'telangana': { name: 'Telangana', code: 'TG', totalAC: 119 },
  'jammu-and-kashmir': { name: 'Jammu & Kashmir', code: 'JK', totalAC: 90 },
};

// Column name mappings (case-insensitive)
const COLUMN_MAPPINGS = {
  constituency: ['constituency', 'constituency_name', 'ac_name', 'seat', 'seat_name', 'vidhan_sabha'],
  constituencyNo: ['constituency_no', 'ac_no', 'seat_no', 'number', 'no', 'sno', 's.no'],
  candidate: ['candidate', 'candidate_name', 'name', 'winner', 'elected'],
  party: ['party', 'party_name', 'political_party', 'affiliation'],
  votes: ['votes', 'total_votes', 'vote', 'evm_votes'],
  voteShare: ['vote_share', 'voteshare', 'percentage', 'vote_percentage', '%'],
  margin: ['margin', 'winning_margin'],
  district: ['district', 'district_name'],
  category: ['category', 'type', 'constituency_type', 'reservation'],
  electors: ['electors', 'total_electors', 'electorate'],
  turnout: ['turnout', 'poll_percentage', 'voter_turnout'],
  position: ['position', 'rank', 'pos'],
  gender: ['gender', 'sex'],
  age: ['age'],
};

/**
 * Parse CSV line handling quoted values
 */
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

/**
 * Find column index by possible names
 */
function findColumn(headers, possibleNames) {
  const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
  
  for (const name of possibleNames) {
    const idx = lowerHeaders.indexOf(name.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    if (idx !== -1) return idx;
  }
  
  // Fuzzy match
  for (const name of possibleNames) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (lowerHeaders[i].includes(name.toLowerCase())) return i;
    }
  }
  
  return -1;
}

/**
 * Normalize constituency name
 */
function normalizeConstituencyName(name) {
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '')
    .trim();
}

/**
 * Calculate ENOP
 */
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

/**
 * Process CSV file
 */
function processCSV(csvPath, stateSlug, year) {
  const config = STATE_CONFIG[stateSlug];
  if (!config) {
    throw new Error(`Unknown state: ${stateSlug}`);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file appears to be empty');
  }
  
  // Parse headers
  const headers = parseCSVLine(lines[0]);
  console.log('Found columns:', headers);
  
  // Find column indices
  const cols = {
    constituency: findColumn(headers, COLUMN_MAPPINGS.constituency),
    constituencyNo: findColumn(headers, COLUMN_MAPPINGS.constituencyNo),
    candidate: findColumn(headers, COLUMN_MAPPINGS.candidate),
    party: findColumn(headers, COLUMN_MAPPINGS.party),
    votes: findColumn(headers, COLUMN_MAPPINGS.votes),
    voteShare: findColumn(headers, COLUMN_MAPPINGS.voteShare),
    margin: findColumn(headers, COLUMN_MAPPINGS.margin),
    district: findColumn(headers, COLUMN_MAPPINGS.district),
    category: findColumn(headers, COLUMN_MAPPINGS.category),
    electors: findColumn(headers, COLUMN_MAPPINGS.electors),
    turnout: findColumn(headers, COLUMN_MAPPINGS.turnout),
    position: findColumn(headers, COLUMN_MAPPINGS.position),
    gender: findColumn(headers, COLUMN_MAPPINGS.gender),
    age: findColumn(headers, COLUMN_MAPPINGS.age),
  };
  
  console.log('\nColumn mapping:');
  Object.entries(cols).forEach(([key, idx]) => {
    if (idx >= 0) console.log(`  ${key}: ${headers[idx]} (col ${idx})`);
  });
  
  // Required columns
  if (cols.constituency < 0) throw new Error('Could not find constituency column');
  if (cols.candidate < 0) throw new Error('Could not find candidate column');
  if (cols.votes < 0 && cols.party < 0) throw new Error('Could not find votes or party column');
  
  // Group data by constituency
  const constituencyData = {};
  let autoConstNo = 1;
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;
    
    const rawConstituency = values[cols.constituency] || '';
    if (!rawConstituency) continue;
    
    const constituencyName = normalizeConstituencyName(rawConstituency);
    const candidate = (values[cols.candidate] || '').toUpperCase().trim();
    
    if (!candidate || candidate === 'NOTA' || candidate === 'NONE OF THE ABOVE') continue;
    
    // Initialize constituency
    if (!constituencyData[constituencyName]) {
      constituencyData[constituencyName] = {
        year,
        constituencyNo: cols.constituencyNo >= 0 ? parseInt(values[cols.constituencyNo]) || autoConstNo++ : autoConstNo++,
        constituencyName,
        constituencyNameOriginal: rawConstituency.trim(),
        constituencyType: cols.category >= 0 ? (values[cols.category] || 'GEN').toUpperCase() : 'GEN',
        districtName: cols.district >= 0 ? (values[cols.district] || '').toUpperCase() : '',
        validVotes: 0,
        electors: cols.electors >= 0 ? parseInt(values[cols.electors]) || 0 : 0,
        turnout: cols.turnout >= 0 ? parseFloat(values[cols.turnout]) || 0 : 0,
        enop: 0,
        totalCandidates: 0,
        candidates: [],
      };
    }
    
    const votes = cols.votes >= 0 ? parseInt(values[cols.votes]) || 0 : 0;
    
    constituencyData[constituencyName].candidates.push({
      position: cols.position >= 0 ? parseInt(values[cols.position]) || 0 : 0,
      name: candidate,
      party: cols.party >= 0 ? (values[cols.party] || 'IND').toUpperCase().trim() : 'IND',
      votes,
      voteShare: cols.voteShare >= 0 ? parseFloat(values[cols.voteShare]) || 0 : 0,
      margin: null,
      marginPct: null,
      sex: cols.gender >= 0 ? (values[cols.gender] || 'M').charAt(0).toUpperCase() : 'M',
      age: cols.age >= 0 ? parseInt(values[cols.age]) || 0 : 0,
      depositLost: false,
    });
  }
  
  // Post-process: calculate totals and sort candidates
  for (const [name, data] of Object.entries(constituencyData)) {
    // Sort candidates by votes
    data.candidates.sort((a, b) => b.votes - a.votes);
    
    // Assign positions
    data.candidates.forEach((c, i) => {
      c.position = i + 1;
    });
    
    // Calculate totals
    const totalVotes = data.candidates.reduce((sum, c) => sum + c.votes, 0);
    data.validVotes = totalVotes;
    data.totalCandidates = data.candidates.length;
    
    // Calculate vote shares if not provided
    data.candidates.forEach(c => {
      if (c.voteShare === 0 && totalVotes > 0) {
        c.voteShare = parseFloat(((c.votes / totalVotes) * 100).toFixed(2));
      }
      c.depositLost = c.voteShare < 16.67;
    });
    
    // Calculate margin for winner
    if (data.candidates.length >= 2) {
      const winner = data.candidates[0];
      const runnerUp = data.candidates[1];
      winner.margin = winner.votes - runnerUp.votes;
      winner.marginPct = totalVotes > 0 
        ? parseFloat(((winner.margin / totalVotes) * 100).toFixed(2))
        : 0;
    }
    
    // Calculate ENOP
    data.enop = calculateENOP(data.candidates);
    
    // Calculate turnout if electors provided
    if (data.electors > 0 && data.turnout === 0) {
      data.turnout = parseFloat(((totalVotes / data.electors) * 100).toFixed(2));
    }
  }
  
  return constituencyData;
}

/**
 * Save results to file
 */
function saveResults(stateSlug, year, results) {
  const config = STATE_CONFIG[stateSlug];
  const outputDir = path.join(__dirname, '..', 'public', 'data', 'elections', 'ac', stateSlug);
  
  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save year data
  const yearFile = path.join(outputDir, `${year}.json`);
  fs.writeFileSync(yearFile, JSON.stringify(results, null, 2));
  console.log(`\n✓ Saved: ${yearFile}`);
  console.log(`  Constituencies: ${Object.keys(results).length}`);
  
  // Update index.json
  const indexFile = path.join(outputDir, 'index.json');
  let index = {};
  
  if (fs.existsSync(indexFile)) {
    index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  }
  
  if (!index.availableYears) {
    index.availableYears = [];
  }
  if (!index.availableYears.includes(year)) {
    index.availableYears.push(year);
    index.availableYears.sort((a, b) => a - b);
  }
  
  index.state = config.name;
  index.stateCode = config.code;
  index.delimitation = stateSlug === 'jammu-and-kashmir' ? 2022 : 2008;
  index.totalConstituencies = config.totalAC;
  index.lastUpdated = new Date().toISOString();
  index.source = 'Election Commission of India (ECI)';
  
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  console.log(`✓ Updated: ${indexFile}`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log(`
CSV to ElectionLens JSON Converter
===================================

Usage: node scripts/convert-eci-csv.mjs <csv-file> <state-slug> <year>

Example:
  node scripts/convert-eci-csv.mjs data/haryana-2024.csv haryana 2024

Available states:
${Object.entries(STATE_CONFIG).map(([slug, cfg]) => `  ${slug.padEnd(20)} - ${cfg.name}`).join('\n')}

Expected CSV columns (flexible naming):
  - Constituency name (required)
  - Candidate name (required) 
  - Party
  - Votes
  - Vote share (%)
  - District
  - Position/Rank

The script will try to auto-detect column names.
`);
    process.exit(0);
  }
  
  const csvFile = args[0];
  const stateSlug = args[1];
  const year = parseInt(args[2]);
  
  if (!fs.existsSync(csvFile)) {
    console.error(`File not found: ${csvFile}`);
    process.exit(1);
  }
  
  if (!STATE_CONFIG[stateSlug]) {
    console.error(`Unknown state: ${stateSlug}`);
    process.exit(1);
  }
  
  if (isNaN(year)) {
    console.error(`Invalid year: ${args[2]}`);
    process.exit(1);
  }
  
  console.log(`\nProcessing: ${csvFile}`);
  console.log(`State: ${STATE_CONFIG[stateSlug].name}`);
  console.log(`Year: ${year}\n`);
  
  try {
    const results = processCSV(csvFile, stateSlug, year);
    saveResults(stateSlug, year, results);
    console.log('\n✓ Conversion complete!');
  } catch (err) {
    console.error(`\n✗ Error: ${err.message}`);
    process.exit(1);
  }
}

main();


