#!/usr/bin/env node
/**
 * Convert india-votes-data JSON format to ElectionLens format
 * 
 * Usage: node scripts/convert-india-votes-data.mjs <source-dir>
 * Example: node scripts/convert-india-votes-data.mjs /Users/p0s097d/Desktop/india-votes-data-main/results
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State code to slug mapping
const STATE_CODE_TO_SLUG = {
  'HR': { slug: 'haryana', name: 'Haryana', totalAC: 90 },
  'JH': { slug: 'jharkhand', name: 'Jharkhand', totalAC: 81 },
  'JK': { slug: 'jammu-and-kashmir', name: 'Jammu & Kashmir', totalAC: 90 },
  'MH': { slug: 'maharashtra', name: 'Maharashtra', totalAC: 288 },
  'RJ': { slug: 'rajasthan', name: 'Rajasthan', totalAC: 200 },
  'MP': { slug: 'madhya-pradesh', name: 'Madhya Pradesh', totalAC: 230 },
  'CG': { slug: 'chhattisgarh', name: 'Chhattisgarh', totalAC: 90 },
  'TG': { slug: 'telangana', name: 'Telangana', totalAC: 119 },
  'BR': { slug: 'bihar', name: 'Bihar', totalAC: 243 },
  'DL': { slug: 'delhi', name: 'Delhi', totalAC: 70 },
  'GJ': { slug: 'gujarat', name: 'Gujarat', totalAC: 182 },
  'KA': { slug: 'karnataka', name: 'Karnataka', totalAC: 224 },
  'UP': { slug: 'uttar-pradesh', name: 'Uttar Pradesh', totalAC: 403 },
  'PB': { slug: 'punjab', name: 'Punjab', totalAC: 117 },
  'UK': { slug: 'uttarakhand', name: 'Uttarakhand', totalAC: 70 },
  'HP': { slug: 'himachal-pradesh', name: 'Himachal Pradesh', totalAC: 68 },
  'GA': { slug: 'goa', name: 'Goa', totalAC: 40 },
  'MN': { slug: 'manipur', name: 'Manipur', totalAC: 60 },
  'OR': { slug: 'odisha', name: 'Odisha', totalAC: 147 },
  'WB': { slug: 'west-bengal', name: 'West Bengal', totalAC: 294 },
};

// Party name normalization
const PARTY_ABBREVIATIONS = {
  'Bharatiya Janata Party': 'BJP',
  'Indian National Congress': 'INC',
  'Aam Aadmi Party': 'AAP',
  'Bahujan Samaj Party': 'BSP',
  'Samajwadi Party': 'SP',
  'Communist Party of India (Marxist)': 'CPI(M)',
  'Communist Party of India': 'CPI',
  'All India Trinamool Congress': 'AITC',
  'Nationalist Congress Party': 'NCP',
  'Shiv Sena': 'SHS',
  'Rashtriya Janata Dal': 'RJD',
  'Janata Dal (United)': 'JD(U)',
  'Jharkhand Mukti Morcha': 'JMM',
  'Indian National Lok Dal': 'INLD',
  'Jannayak Janta Party': 'JJP',
  'Shiromani Akali Dal': 'SAD',
  'Telangana Rashtra Samithi': 'TRS',
  'Bharat Rashtra Samithi': 'BRS',
  'Telugu Desam Party': 'TDP',
  'YSR Congress Party': 'YSRCP',
  'Dravida Munnetra Kazhagam': 'DMK',
  'All India Anna Dravida Munnetra Kazhagam': 'AIADMK',
  'Independent': 'IND',
  'None of the Above': 'NOTA',
};

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
 * Normalize party name
 */
function normalizeParty(partyName) {
  return PARTY_ABBREVIATIONS[partyName] || partyName.toUpperCase();
}

/**
 * Convert india-votes-data format to ElectionLens format
 */
function convertData(sourceData) {
  const year = parseInt(sourceData.election_year);
  const stateCode = sourceData.election_state;
  const stateConfig = STATE_CODE_TO_SLUG[stateCode];
  
  if (!stateConfig) {
    throw new Error(`Unknown state code: ${stateCode}`);
  }
  
  const results = {};
  
  for (const result of sourceData.constituencywise_results) {
    const votingData = result.voting_data;
    const constituencyNo = parseInt(votingData.constituency_no);
    const constituencyName = votingData.constituency.toUpperCase().trim();
    
    // Process candidates (exclude NOTA)
    const candidates = [];
    let notaVotes = 0;
    
    for (const vote of votingData.voting_tally) {
      const candidateName = vote.candidate.toUpperCase().trim();
      const partyName = vote.party;
      const evmVotes = parseInt(vote.evm_votes) || 0;
      const postalVotes = parseInt(vote.postal_votes) || 0;
      const totalVotes = evmVotes + postalVotes;
      
      if (candidateName === 'NOTA' || partyName === 'None of the Above') {
        notaVotes = totalVotes;
        continue;
      }
      
      candidates.push({
        position: 0, // Will be set after sorting
        name: candidateName,
        party: normalizeParty(partyName),
        votes: totalVotes,
        voteShare: 0, // Will be calculated
        margin: null,
        marginPct: null,
        sex: 'M', // Not available in source data
        age: 0, // Not available in source data
        depositLost: false, // Will be calculated
      });
    }
    
    // Sort by votes descending
    candidates.sort((a, b) => b.votes - a.votes);
    
    // Calculate vote shares and positions
    const totalValidVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
    
    candidates.forEach((c, i) => {
      c.position = i + 1;
      c.voteShare = totalValidVotes > 0 
        ? parseFloat(((c.votes / totalValidVotes) * 100).toFixed(2))
        : 0;
      c.depositLost = c.voteShare < 16.67;
    });
    
    // Calculate margin for winner
    if (candidates.length >= 2) {
      const winner = candidates[0];
      const runnerUp = candidates[1];
      winner.margin = winner.votes - runnerUp.votes;
      winner.marginPct = totalValidVotes > 0 
        ? parseFloat(((winner.margin / totalValidVotes) * 100).toFixed(2))
        : 0;
    }
    
    results[constituencyName] = {
      year,
      constituencyNo,
      constituencyName,
      constituencyNameOriginal: votingData.constituency,
      constituencyType: 'GEN', // Not available in source, default to GEN
      districtName: '', // Not available in source
      validVotes: totalValidVotes,
      notaVotes,
      electors: 0, // Not available in source
      turnout: 0, // Not available in source
      enop: calculateENOP(candidates),
      totalCandidates: candidates.length,
      candidates,
    };
  }
  
  return { results, year, stateConfig };
}

/**
 * Save results to ElectionLens format
 */
function saveResults(stateSlug, stateName, year, results, totalAC) {
  const outputDir = path.join(__dirname, '..', 'public', 'data', 'elections', 'ac', stateSlug);
  
  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save year data
  const yearFile = path.join(outputDir, `${year}.json`);
  fs.writeFileSync(yearFile, JSON.stringify(results, null, 2));
  console.log(`  ✓ Saved: ${yearFile}`);
  console.log(`    Constituencies: ${Object.keys(results).length}`);
  
  // Update index.json
  const indexFile = path.join(outputDir, 'index.json');
  let index = {};
  
  if (fs.existsSync(indexFile)) {
    try {
      index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    } catch (e) {
      index = {};
    }
  }
  
  if (!index.availableYears) {
    index.availableYears = [];
  }
  if (!index.availableYears.includes(year)) {
    index.availableYears.push(year);
    index.availableYears.sort((a, b) => a - b);
  }
  
  index.state = stateName;
  index.totalConstituencies = totalAC;
  index.delimitation = stateSlug === 'jammu-and-kashmir' ? 2022 : 2008;
  index.lastUpdated = new Date().toISOString();
  index.source = 'Election Commission of India (ECI) via india-votes-data';
  
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  console.log(`  ✓ Updated: ${indexFile}`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
India-Votes-Data to ElectionLens Converter
==========================================

Usage: node scripts/convert-india-votes-data.mjs <source-dir>

Example:
  node scripts/convert-india-votes-data.mjs /Users/p0s097d/Desktop/india-votes-data-main/results

This will convert all JSON files in the source directory to ElectionLens format.
`);
    process.exit(0);
  }
  
  const sourceDir = args[0];
  
  if (!fs.existsSync(sourceDir)) {
    console.error(`Directory not found: ${sourceDir}`);
    process.exit(1);
  }
  
  // Find all JSON files
  const files = fs.readdirSync(sourceDir)
    .filter(f => f.endsWith('.json') && f.includes('Assembly'));
  
  if (files.length === 0) {
    console.error('No Assembly JSON files found in directory');
    process.exit(1);
  }
  
  console.log(`\nFound ${files.length} assembly election files:\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    console.log(`Processing: ${file}`);
    
    try {
      const rawData = fs.readFileSync(filePath, 'utf8');
      const sourceData = JSON.parse(rawData);
      
      const { results, year, stateConfig } = convertData(sourceData);
      
      saveResults(
        stateConfig.slug,
        stateConfig.name,
        year,
        results,
        stateConfig.totalAC
      );
      
      successCount++;
      console.log('');
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}\n`);
      errorCount++;
    }
  }
  
  console.log('━'.repeat(60));
  console.log(`\nConversion complete!`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
}

main();


