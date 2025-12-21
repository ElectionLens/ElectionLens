#!/usr/bin/env node

/**
 * Convert assembly election CSV files to JSON format
 * Usage: node scripts/convert-assembly-csv.mjs <csv-file> <state-slug> <year>
 * Example: node scripts/convert-assembly-csv.mjs "/Users/p0s097d/Desktop/Madhya Pradesh_2023.csv" madhya-pradesh 2023
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node scripts/convert-assembly-csv.mjs <csv-file> <state-slug> <year>');
  console.log('Example: node scripts/convert-assembly-csv.mjs "/Users/p0s097d/Desktop/Madhya Pradesh_2023.csv" madhya-pradesh 2023');
  process.exit(1);
}

const [csvFile, stateSlug, yearStr] = args;
const year = parseInt(yearStr, 10);

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

function cleanCandidateName(name) {
  // Remove leading number prefix like "1 ", "2 ", "10 "
  return name.replace(/^\d+\s+/, '').trim();
}

function normalizeConstituencyName(name) {
  // Normalize constituency name for matching
  return name.toUpperCase().trim();
}

// Read the CSV file
const csvContent = fs.readFileSync(csvFile, 'utf-8');
const lines = csvContent.split('\n').filter(line => line.trim());

// Skip header rows (first 3-4 rows until we find the actual header)
let headerIndex = -1;
for (let i = 0; i < Math.min(10, lines.length); i++) {
  const cols = parseCSVLine(lines[i]);
  if (cols[0] === 'STATE/UT NAME' || cols[0]?.includes('STATE')) {
    headerIndex = i;
    break;
  }
}

if (headerIndex === -1) {
  console.error('Could not find header row');
  process.exit(1);
}

console.log(`Found header at row ${headerIndex + 1}`);

// Parse data rows
const constituencies = {};
let currentConstituency = null;
let totalElectors = 0;

for (let i = headerIndex + 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  
  // Skip empty rows
  if (!cols[0] && !cols[1] && !cols[2]) continue;
  
  // Check for TURN OUT row (end of constituency)
  if (cols[0] === 'TURN OUT' || cols[0]?.includes('TURN OUT')) {
    if (currentConstituency) {
      // Extract total valid votes from TURN OUT row
      const totalVotesCol = cols.find((c, idx) => idx >= 9 && c && !isNaN(parseInt(c.replace(/,/g, ''), 10)));
      if (cols[11]) { // TOTAL column
        constituencies[currentConstituency].validVotes = parseInt(cols[11].replace(/,/g, ''), 10) || 0;
      }
    }
    currentConstituency = null;
    continue;
  }
  
  // Skip if not a valid data row
  if (!cols[2] || !cols[3]) continue;
  
  const acName = normalizeConstituencyName(cols[2]);
  const candidateName = cleanCandidateName(cols[3]);
  const party = cols[7]?.trim() || 'IND';
  const evmVotes = parseInt(cols[9]?.replace(/,/g, ''), 10) || 0;
  const postalVotes = parseInt(cols[10]?.replace(/,/g, ''), 10) || 0;
  const totalVotes = parseInt(cols[11]?.replace(/,/g, ''), 10) || 0;
  const voteShare = parseFloat(cols[12]) || 0;
  totalElectors = parseInt(cols[cols.length - 1]?.replace(/,/g, ''), 10) || totalElectors;
  
  // Skip NOTA for now (we can include it later if needed)
  if (party === 'NOTA') continue;
  
  // Initialize constituency if new
  if (!constituencies[acName]) {
    constituencies[acName] = {
      candidates: [],
      electors: totalElectors,
      validVotes: 0
    };
  }
  
  currentConstituency = acName;
  constituencies[acName].electors = totalElectors;
  
  constituencies[acName].candidates.push({
    name: candidateName,
    party: party,
    votes: totalVotes,
    evmVotes: evmVotes,
    postalVotes: postalVotes,
    voteShare: voteShare
  });
}

// Build the output JSON
const results = {};

for (const [acName, data] of Object.entries(constituencies)) {
  // Sort candidates by votes (descending)
  data.candidates.sort((a, b) => b.votes - a.votes);
  
  // Calculate margin
  const winner = data.candidates[0];
  const runnerUp = data.candidates[1];
  const margin = winner && runnerUp ? winner.votes - runnerUp.votes : 0;
  
  // Add position and margin to candidates
  data.candidates.forEach((c, idx) => {
    c.position = idx + 1;
    if (idx === 0) c.margin = margin;
  });
  
  // Calculate turnout
  const turnout = data.electors > 0 
    ? Math.round((data.validVotes / data.electors) * 10000) / 100 
    : 0;
  
  results[acName] = {
    constituencyName: acName,
    constituencyNameOriginal: acName,
    year: year,
    electors: data.electors,
    validVotes: data.validVotes,
    turnout: turnout,
    candidates: data.candidates
  };
}

// Output directory
const outputDir = path.join(process.cwd(), 'public', 'data', 'elections', 'ac', stateSlug);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write the JSON file
const outputFile = path.join(outputDir, `${year}.json`);
fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

console.log(`\nProcessed ${Object.keys(results).length} constituencies`);
console.log(`Output written to: ${outputFile}`);

// Update index.json
const indexFile = path.join(outputDir, 'index.json');
let index = { availableYears: [] };
if (fs.existsSync(indexFile)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
    if (parsed) {
      index = parsed;
    }
  } catch (e) {
    console.log('Creating new index.json');
  }
}

if (!index.availableYears) {
  index.availableYears = [];
}

if (!index.availableYears.includes(year)) {
  index.availableYears.push(year);
  index.availableYears.sort((a, b) => a - b);
}

index.lastUpdated = new Date().toISOString();

fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
console.log(`Updated index: ${index.availableYears.join(', ')}`);

// Show sample output
const sampleKey = Object.keys(results)[0];
console.log(`\nSample entry (${sampleKey}):`);
console.log(JSON.stringify(results[sampleKey], null, 2));

