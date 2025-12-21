#!/usr/bin/env node
/**
 * Scrape Election Results from ECI Website
 * Fetches constituency-wise assembly election results and converts to ElectionLens format
 * 
 * Usage: node scripts/scrape-eci-results.mjs <state-slug> <year>
 * Example: node scripts/scrape-eci-results.mjs haryana 2024
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State configuration - ECI state codes and metadata
const STATE_CONFIG = {
  'haryana': { eciCode: 'S06', name: 'Haryana', code: 'HR', totalAC: 90 },
  'jharkhand': { eciCode: 'S10', name: 'Jharkhand', code: 'JH', totalAC: 81 },
  'maharashtra': { eciCode: 'S13', name: 'Maharashtra', code: 'MH', totalAC: 288 },
  'rajasthan': { eciCode: 'S20', name: 'Rajasthan', code: 'RJ', totalAC: 200 },
  'madhya-pradesh': { eciCode: 'S12', name: 'Madhya Pradesh', code: 'MP', totalAC: 230 },
  'chhattisgarh': { eciCode: 'S26', name: 'Chhattisgarh', code: 'CG', totalAC: 90 },
  'telangana': { eciCode: 'S29', name: 'Telangana', code: 'TG', totalAC: 119 },
  'jammu-and-kashmir': { eciCode: 'U01', name: 'Jammu & Kashmir', code: 'JK', totalAC: 90 },
};

// Election IDs for recent elections (you may need to update these)
const ELECTION_IDS = {
  'haryana-2024': 'AE082024',
  'jharkhand-2024': 'AE102024', 
  'maharashtra-2024': 'AE132024',
  'rajasthan-2023': 'AE202023',
  'madhya-pradesh-2023': 'AE122023',
  'chhattisgarh-2023': 'AE262023',
  'telangana-2023': 'AE292023',
  'jammu-and-kashmir-2024': 'AE012024',
};

/**
 * Fetch data from URL
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse ECI JSON response for constituency results
 */
function parseEciResults(jsonData, stateConfig) {
  const results = {};
  
  try {
    const data = JSON.parse(jsonData);
    
    // ECI returns data in various formats, try to handle common ones
    const constituencies = data.data || data.constituencies || data.results || [];
    
    for (const ac of constituencies) {
      const constituencyName = (ac.constituency_name || ac.ac_name || ac.name || '').toUpperCase().trim();
      const constituencyNo = parseInt(ac.constituency_no || ac.ac_no || ac.number || 0);
      
      if (!constituencyName) continue;
      
      const candidates = (ac.candidates || ac.results || []).map((c, idx) => ({
        position: c.position || c.rank || idx + 1,
        name: (c.candidate_name || c.name || '').toUpperCase().trim(),
        party: (c.party || c.party_name || '').toUpperCase().trim(),
        votes: parseInt(c.votes || c.total_votes || 0),
        voteShare: parseFloat(c.vote_share || c.percentage || 0),
        margin: c.position === 1 ? parseInt(c.margin || 0) : null,
        marginPct: c.position === 1 ? parseFloat(c.margin_percentage || 0) : null,
        sex: c.gender || c.sex || 'M',
        age: parseInt(c.age || 0),
        depositLost: parseFloat(c.vote_share || 0) < 16.67,
      }));
      
      // Sort by votes descending
      candidates.sort((a, b) => b.votes - a.votes);
      candidates.forEach((c, i) => c.position = i + 1);
      
      // Calculate margin for winner
      if (candidates.length >= 2) {
        candidates[0].margin = candidates[0].votes - candidates[1].votes;
        const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
        candidates[0].marginPct = totalVotes > 0 
          ? parseFloat(((candidates[0].margin / totalVotes) * 100).toFixed(2))
          : 0;
      }
      
      const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
      
      results[constituencyName] = {
        year: parseInt(ac.year || new Date().getFullYear()),
        constituencyNo,
        constituencyName,
        constituencyNameOriginal: constituencyName,
        constituencyType: ac.constituency_type || ac.category || 'GEN',
        districtName: (ac.district || ac.district_name || '').toUpperCase(),
        validVotes: totalVotes,
        electors: parseInt(ac.electors || ac.total_electors || 0),
        turnout: parseFloat(ac.turnout || ac.poll_percentage || 0),
        enop: calculateENOP(candidates),
        totalCandidates: candidates.length,
        candidates,
      };
    }
  } catch (err) {
    console.error('Error parsing ECI data:', err.message);
  }
  
  return results;
}

/**
 * Calculate Effective Number of Parties (ENOP)
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
 * Fetch results from ECI API
 */
async function fetchEciResults(stateSlug, year) {
  const config = STATE_CONFIG[stateSlug];
  if (!config) {
    throw new Error(`Unknown state: ${stateSlug}. Available: ${Object.keys(STATE_CONFIG).join(', ')}`);
  }
  
  const electionKey = `${stateSlug}-${year}`;
  const electionId = ELECTION_IDS[electionKey];
  
  console.log(`\nFetching ${config.name} ${year} assembly election results...`);
  console.log(`State Code: ${config.eciCode}, Election ID: ${electionId || 'AUTO'}`);
  
  // Try multiple ECI API endpoints
  const endpoints = [
    // Primary results API
    `https://results.eci.gov.in/ResultAc498/getConstituencyResult.htm?eid=${electionId}&st=${config.eciCode}`,
    // Alternative JSON endpoint
    `https://results.eci.gov.in/ResultAcGenJune2024/partywiseresult-${config.eciCode}.htm`,
    // Constituency-wise endpoint
    `https://results.eci.gov.in/Result2024/constituencywise-${config.eciCode}.htm`,
  ];
  
  for (const url of endpoints) {
    try {
      console.log(`Trying: ${url}`);
      const response = await fetchUrl(url);
      
      // Check if response is JSON
      if (response.trim().startsWith('{') || response.trim().startsWith('[')) {
        return parseEciResults(response, config);
      }
      
      // If HTML, try to extract JSON from script tags
      const jsonMatch = response.match(/var\s+data\s*=\s*(\{[\s\S]*?\});/);
      if (jsonMatch) {
        return parseEciResults(jsonMatch[1], config);
      }
    } catch (err) {
      console.log(`  Failed: ${err.message}`);
    }
  }
  
  console.log('\n⚠️  Could not fetch data automatically from ECI.');
  console.log('The ECI website structure changes frequently.\n');
  
  return null;
}

/**
 * Create manual entry template
 */
function createManualTemplate(stateSlug, year) {
  const config = STATE_CONFIG[stateSlug];
  const template = {};
  
  // Create template for each constituency
  for (let i = 1; i <= config.totalAC; i++) {
    template[`CONSTITUENCY_${i}`] = {
      year,
      constituencyNo: i,
      constituencyName: `CONSTITUENCY_${i}`,
      constituencyNameOriginal: `Constituency ${i}`,
      constituencyType: 'GEN',
      districtName: 'DISTRICT',
      validVotes: 0,
      electors: 0,
      turnout: 0,
      enop: 0,
      totalCandidates: 0,
      candidates: [
        {
          position: 1,
          name: 'WINNER_NAME',
          party: 'PARTY',
          votes: 0,
          voteShare: 0,
          margin: 0,
          marginPct: 0,
          sex: 'M',
          age: 0,
          depositLost: false,
        },
        {
          position: 2,
          name: 'RUNNER_UP_NAME',
          party: 'PARTY',
          votes: 0,
          voteShare: 0,
          margin: null,
          marginPct: null,
          sex: 'M',
          age: 0,
          depositLost: false,
        },
      ],
    };
  }
  
  return template;
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
  console.log(`✓ Saved: ${yearFile}`);
  
  // Update index.json
  const indexFile = path.join(outputDir, 'index.json');
  let index = {};
  
  if (fs.existsSync(indexFile)) {
    index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  }
  
  // Add year if not present
  if (!index.availableYears) {
    index.availableYears = [];
  }
  if (!index.availableYears.includes(year)) {
    index.availableYears.push(year);
    index.availableYears.sort((a, b) => a - b);
  }
  
  index.state = config.name;
  index.stateCode = config.code;
  index.delimitation = 2008;
  index.totalConstituencies = config.totalAC;
  index.lastUpdated = new Date().toISOString();
  index.source = 'Election Commission of India (ECI)';
  
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  console.log(`✓ Updated: ${indexFile}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
ECI Election Results Scraper for ElectionLens
==============================================

Usage: node scripts/scrape-eci-results.mjs <state-slug> <year>

Available states:
${Object.entries(STATE_CONFIG).map(([slug, cfg]) => `  ${slug.padEnd(20)} - ${cfg.name} (${cfg.totalAC} ACs)`).join('\n')}

Examples:
  node scripts/scrape-eci-results.mjs haryana 2024
  node scripts/scrape-eci-results.mjs rajasthan 2023
  node scripts/scrape-eci-results.mjs jharkhand 2024

Options:
  --template    Generate a template JSON for manual data entry
  --help        Show this help message
`);
    process.exit(0);
  }
  
  const stateSlug = args[0];
  const year = parseInt(args[1]);
  const generateTemplate = args.includes('--template');
  
  if (!STATE_CONFIG[stateSlug]) {
    console.error(`Unknown state: ${stateSlug}`);
    console.error(`Available states: ${Object.keys(STATE_CONFIG).join(', ')}`);
    process.exit(1);
  }
  
  if (isNaN(year) || year < 2000 || year > 2030) {
    console.error(`Invalid year: ${args[1]}`);
    process.exit(1);
  }
  
  if (generateTemplate) {
    console.log(`Generating template for ${STATE_CONFIG[stateSlug].name} ${year}...`);
    const template = createManualTemplate(stateSlug, year);
    saveResults(stateSlug, year, template);
    console.log('\n✓ Template created! Edit the JSON file with actual data.');
    return;
  }
  
  // Try to fetch from ECI
  const results = await fetchEciResults(stateSlug, year);
  
  if (results && Object.keys(results).length > 0) {
    console.log(`\n✓ Found ${Object.keys(results).length} constituencies`);
    saveResults(stateSlug, year, results);
    console.log('\n✓ Data saved successfully!');
  } else {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  MANUAL DATA ENTRY REQUIRED

The ECI website structure has changed. Please try one of these options:

1. GENERATE A TEMPLATE:
   node scripts/scrape-eci-results.mjs ${stateSlug} ${year} --template
   
   Then manually fill in the data from:
   https://results.eci.gov.in/

2. USE THE INDIA-VOTES-DATA PROJECT:
   git clone https://github.com/thecont1/india-votes-data
   Follow their instructions to fetch ${STATE_CONFIG[stateSlug].name} ${year} data
   
3. DOWNLOAD FROM LOK DHABA:
   Visit https://lokdhaba.ashoka.edu.in/
   Select: State Elections → ${STATE_CONFIG[stateSlug].name} → ${year}
   Download CSV and convert using process-election-data.mjs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  }
}

main().catch(console.error);


