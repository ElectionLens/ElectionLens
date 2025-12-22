#!/usr/bin/env node
/**
 * Generate manifest.json for data discovery
 * 
 * Creates a comprehensive inventory of all data files with:
 * - File paths and sizes
 * - Content hashes for cache busting
 * - Available years per state
 * - Schema version tracking
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

const DATA_DIR = join(process.cwd(), 'public/data');
const OUTPUT_PATH = join(DATA_DIR, 'manifest.json');

/**
 * Calculate SHA256 hash of file content (first 8 chars)
 */
function getFileHash(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  return statSync(filePath).size;
}

/**
 * Scan directory for JSON files
 */
function scanJsonFiles(dir, baseDir = dir) {
  const files = [];
  
  if (!existsSync(dir)) return files;
  
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...scanJsonFiles(fullPath, baseDir));
    } else if (entry.name.endsWith('.json') || entry.name.endsWith('.geojson')) {
      files.push({
        path: relative(baseDir, fullPath),
        fullPath,
        size: getFileSize(fullPath),
        hash: getFileHash(fullPath)
      });
    }
  }
  
  return files;
}

/**
 * Parse state ID from folder name using schema
 */
function getStateIdFromSlug(slug, schema) {
  // Direct lookup in state aliases
  for (const [stateId, state] of Object.entries(schema.states)) {
    const normalizedAliases = state.aliases.map(a => 
      a.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
    );
    
    if (normalizedAliases.includes(slug) || 
        state.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') === slug) {
      return stateId;
    }
  }
  
  // Fallback mappings for edge cases
  const slugToId = {
    'tamil-nadu': 'TN',
    'andhra-pradesh': 'AP',
    'arunachal-pradesh': 'AR',
    'assam': 'AS',
    'bihar': 'BR',
    'chhattisgarh': 'CG',
    'goa': 'GA',
    'gujarat': 'GJ',
    'haryana': 'HR',
    'himachal-pradesh': 'HP',
    'jharkhand': 'JH',
    'karnataka': 'KA',
    'kerala': 'KL',
    'madhya-pradesh': 'MP',
    'maharashtra': 'MH',
    'manipur': 'MN',
    'meghalaya': 'ML',
    'mizoram': 'MZ',
    'nagaland': 'NL',
    'odisha': 'OD',
    'punjab': 'PB',
    'rajasthan': 'RJ',
    'sikkim': 'SK',
    'telangana': 'TS',
    'tripura': 'TR',
    'uttar-pradesh': 'UP',
    'uttarakhand': 'UK',
    'west-bengal': 'WB',
    'delhi': 'DL',
    'jammu-and-kashmir': 'JK',
    'puducherry': 'PY',
    'andaman-and-nicobar-islands': 'AN',
    'chandigarh': 'CH',
    'dadra-and-nagar-haveli-and-daman-and-diu': 'DD',
    'dnh-and-dd': 'DD',
    'lakshadweep': 'LD',
    'ladakh': 'LA'
  };
  
  return slugToId[slug] || slug.toUpperCase();
}

/**
 * Build election data inventory
 */
function buildElectionInventory(type, schema) {
  const baseDir = join(DATA_DIR, 'elections', type);
  const inventory = {};
  
  if (!existsSync(baseDir)) return inventory;
  
  for (const stateFolder of readdirSync(baseDir, { withFileTypes: true })) {
    if (!stateFolder.isDirectory()) continue;
    
    const stateSlug = stateFolder.name;
    const stateId = getStateIdFromSlug(stateSlug, schema);
    const statePath = join(baseDir, stateSlug);
    
    // Read index.json if exists
    const indexPath = join(statePath, 'index.json');
    let years = [];
    
    if (existsSync(indexPath)) {
      try {
        const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
        years = index.availableYears || index.years || [];
      } catch (e) {
        console.warn(`Failed to parse ${indexPath}: ${e.message}`);
      }
    }
    
    // If no years from index, scan for year files
    if (years.length === 0) {
      years = readdirSync(statePath)
        .filter(f => /^\d{4}\.json$/.test(f))
        .map(f => parseInt(f.replace('.json', '')))
        .sort((a, b) => a - b);
    }
    
    // Build paths map
    const paths = {};
    for (const year of years) {
      const yearFile = join(statePath, `${year}.json`);
      if (existsSync(yearFile)) {
        paths[year] = {
          path: `elections/${type}/${stateSlug}/${year}.json`,
          size: getFileSize(yearFile),
          hash: getFileHash(yearFile)
        };
      }
    }
    
    inventory[stateId] = {
      slug: stateSlug,
      years,
      paths,
      index: existsSync(indexPath) ? {
        path: `elections/${type}/${stateSlug}/index.json`,
        size: getFileSize(indexPath),
        hash: getFileHash(indexPath)
      } : null
    };
  }
  
  return inventory;
}

/**
 * Build geo data inventory
 */
function buildGeoInventory() {
  const inventory = {
    boundaries: {},
    parliament: {},
    assembly: {},
    districts: {}
  };
  
  // State boundaries
  const statesPath = join(DATA_DIR, 'geo/boundaries/states.geojson');
  if (existsSync(statesPath)) {
    inventory.boundaries.states = {
      path: 'geo/boundaries/states.geojson',
      size: getFileSize(statesPath),
      hash: getFileHash(statesPath)
    };
  }
  
  // Parliament constituencies
  const pcPath = join(DATA_DIR, 'geo/parliament/constituencies.geojson');
  if (existsSync(pcPath)) {
    inventory.parliament.all = {
      path: 'geo/parliament/constituencies.geojson',
      size: getFileSize(pcPath),
      hash: getFileHash(pcPath)
    };
  }
  
  // Assembly constituencies
  const acPath = join(DATA_DIR, 'geo/assembly/constituencies.geojson');
  if (existsSync(acPath)) {
    inventory.assembly.all = {
      path: 'geo/assembly/constituencies.geojson',
      size: getFileSize(acPath),
      hash: getFileHash(acPath)
    };
  }
  
  // District files (per state)
  const districtDir = join(DATA_DIR, 'geo/districts');
  if (existsSync(districtDir)) {
    for (const file of readdirSync(districtDir)) {
      if (file.endsWith('.geojson')) {
        const filePath = join(districtDir, file);
        const slug = file.replace('.geojson', '');
        inventory.districts[slug] = {
          path: `geo/districts/${file}`,
          size: getFileSize(filePath),
          hash: getFileHash(filePath)
        };
      }
    }
  }
  
  return inventory;
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Generating data manifest...\n');
  
  // Load schema
  const schemaPath = join(DATA_DIR, 'schema.json');
  if (!existsSync(schemaPath)) {
    console.error('❌ schema.json not found. Run generate-schema.mjs first.');
    process.exit(1);
  }
  
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  
  // Build manifest
  const manifest = {
    version: '2.0.0',
    generated: new Date().toISOString(),
    
    // Schema info
    schema: {
      path: 'schema.json',
      version: schema.version,
      size: getFileSize(schemaPath),
      hash: getFileHash(schemaPath),
      counts: {
        states: Object.keys(schema.states || {}).length,
        pcs: Object.keys(schema.parliamentaryConstituencies || {}).length,
        acs: Object.keys(schema.assemblyConstituencies || {}).length,
        districts: Object.keys(schema.districts || {}).length
      }
    },
    
    // Geo data
    geo: buildGeoInventory(),
    
    // Election data
    elections: {
      ac: buildElectionInventory('ac', schema),
      pc: buildElectionInventory('pc', schema)
    },
    
    // Summary stats
    stats: {
      totalFiles: 0,
      totalSize: 0,
      acStates: 0,
      pcStates: 0,
      acYears: 0,
      pcYears: 0
    }
  };
  
  // Calculate stats
  let totalFiles = 1; // schema.json
  let totalSize = manifest.schema.size;
  
  // Count geo files
  for (const category of Object.values(manifest.geo)) {
    for (const file of Object.values(category)) {
      totalFiles++;
      totalSize += file.size;
    }
  }
  
  // Count election files
  for (const [type, states] of Object.entries(manifest.elections)) {
    for (const [stateId, stateData] of Object.entries(states)) {
      if (stateData.index) {
        totalFiles++;
        totalSize += stateData.index.size;
      }
      for (const yearData of Object.values(stateData.paths)) {
        totalFiles++;
        totalSize += yearData.size;
      }
      
      if (type === 'ac') {
        manifest.stats.acStates++;
        manifest.stats.acYears += stateData.years.length;
      } else {
        manifest.stats.pcStates++;
        manifest.stats.pcYears += stateData.years.length;
      }
    }
  }
  
  manifest.stats.totalFiles = totalFiles;
  manifest.stats.totalSize = totalSize;
  manifest.stats.totalSizeFormatted = `${(totalSize / 1024 / 1024).toFixed(1)} MB`;
  
  // Write manifest
  writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  
  console.log('📊 Manifest Statistics:');
  console.log(`   Total files: ${manifest.stats.totalFiles}`);
  console.log(`   Total size: ${manifest.stats.totalSizeFormatted}`);
  console.log(`   AC states: ${manifest.stats.acStates} (${manifest.stats.acYears} year files)`);
  console.log(`   PC states: ${manifest.stats.pcStates} (${manifest.stats.pcYears} year files)`);
  console.log(`   Schema: ${manifest.schema.counts.states} states, ${manifest.schema.counts.pcs} PCs, ${manifest.schema.counts.acs} ACs`);
  console.log(`\n✅ Manifest written to ${OUTPUT_PATH}`);
}

main().catch(console.error);
