#!/usr/bin/env node
/**
 * Validate District Views
 * 
 * This script validates that every district can load assembly constituencies.
 * It simulates the same lookup logic used in navigateToDistrict.
 * 
 * Usage: node scripts/validate-district-views.mjs [--verbose] [--state=STATE_CODE]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../public/data');

// Parse args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const stateFilter = args.find(a => a.startsWith('--state='))?.split('=')[1]?.toUpperCase();

// Load constants from source
const constantsPath = path.join(__dirname, '../src/constants/index.ts');
const constantsContent = fs.readFileSync(constantsPath, 'utf-8');

// Parse DISTRICT_NAME_MAPPINGS (only between "DISTRICT_NAME_MAPPINGS" and "} as const")
const districtMappings = {};
const distMappingsMatch = constantsContent.match(/DISTRICT_NAME_MAPPINGS[^{]*\{([^}]+)\}/s);
if (distMappingsMatch) {
  const mappingRegex = /'([^']+)\|([^']+)':\s*'([^']+)'/g;
  let match;
  while ((match = mappingRegex.exec(distMappingsMatch[1])) !== null) {
    const key = `${match[1]}|${match[2]}`;
    districtMappings[key] = match[3];
  }
}

// Parse ASM_STATE_ALIASES
const asmStateAliases = {
  'ODISHA': 'ORISSA',
  'UTTARAKHAND': 'UTTARKHAND',
};

// State code to name mapping
const stateCodeToName = {
  'AN': 'ANDAMAN AND NICOBAR ISLANDS', 'AP': 'ANDHRA PRADESH', 'AR': 'ARUNACHAL PRADESH',
  'AS': 'ASSAM', 'BR': 'BIHAR', 'CG': 'CHHATTISGARH', 'CH': 'CHANDIGARH',
  'DN': 'DADRA AND NAGAR HAVELI', 'DD': 'DAMAN AND DIU', 'DL': 'NCT OF DELHI',
  'GA': 'GOA', 'GJ': 'GUJARAT', 'HP': 'HIMACHAL PRADESH', 'HR': 'HARYANA',
  'JH': 'JHARKHAND', 'JK': 'JAMMU & KASHMIR', 'KA': 'KARNATAKA', 'KL': 'KERALA',
  'LD': 'LAKSHADWEEP', 'MH': 'MAHARASHTRA', 'ML': 'MEGHALAYA', 'MN': 'MANIPUR',
  'MP': 'MADHYA PRADESH', 'MZ': 'MIZORAM', 'NL': 'NAGALAND', 'OR': 'ODISHA',
  'PB': 'PUNJAB', 'PY': 'PUDUCHERRY', 'RJ': 'RAJASTHAN', 'SK': 'SIKKIM',
  'TN': 'TAMIL NADU', 'TS': 'TELANGANA', 'TR': 'TRIPURA', 'UK': 'UTTARAKHAND',
  'UP': 'UTTAR PRADESH', 'WB': 'WEST BENGAL', 'LA': 'LADAKH'
};

const normalize = (s) => s?.toUpperCase().replace(/[^A-Z]/g, '') || '';

function slugify(name) {
  return name.toLowerCase()
    .replace(/[āàáâãä]/g, 'a')
    .replace(/[ēèéêë]/g, 'e')
    .replace(/[īìíîï]/g, 'i')
    .replace(/[ōòóôõö]/g, 'o')
    .replace(/[ūùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-()]/g, '');
}

// Load assembly GeoJSON
console.log('\n🔍 VALIDATING DISTRICT VIEWS\n');
console.log('='.repeat(70));

const assembly = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'geo/assembly/constituencies.geojson')));

// Build lookup of assemblies by state+district
const assembliesByStateDistrict = {};
assembly.features.forEach(f => {
  const state = f.properties.ST_NAME;
  const dist = f.properties.DIST_NAME;
  if (!state || !dist) return;
  
  const key = `${state}|${dist}`;
  if (!assembliesByStateDistrict[key]) {
    assembliesByStateDistrict[key] = [];
  }
  assembliesByStateDistrict[key].push(f);
});

// Stats
const stats = {
  totalDistricts: 0,
  districtsOk: 0,
  districtsFailed: [],
  districtsNoAssemblyData: [],
};

// Check each district GeoJSON
const distDir = path.join(DATA_DIR, 'geo/districts');
const distFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.geojson'));

if (stateFilter) {
  console.log(`\nFiltering to state: ${stateFilter}\n`);
}

for (const file of distFiles) {
  const stateCode = file.replace('.geojson', '');
  if (stateFilter && stateCode !== stateFilter) continue;
  
  const stateName = stateCodeToName[stateCode];
  if (!stateName) continue;
  
  const asmStateName = asmStateAliases[stateName] || stateName;
  
  const districts = JSON.parse(fs.readFileSync(path.join(distDir, file)));
  
  console.log(`\n📍 ${stateName} (${stateCode}) - ${districts.features.length} districts`);
  console.log('-'.repeat(50));
  
  let stateOk = 0;
  let stateFailed = 0;
  
  for (const f of districts.features) {
    const distName = f.properties.district || f.properties.dtname || f.properties.shapeName;
    if (!distName) continue;
    
    stats.totalDistricts++;
    
    const upperDist = distName.toUpperCase().trim();
    let normalizedDist = upperDist;
    
    // Apply district name mappings (same as navigateToDistrict)
    const mappingKey = `${upperDist}|${stateName}`;
    const mappedDist = districtMappings[mappingKey];
    if (mappedDist) {
      normalizedDist = mappedDist;
    }
    
    // Simulate the lookup logic from navigateToDistrict
    const lookupKey = `${asmStateName}|${normalizedDist}`;
    let assemblies = assembliesByStateDistrict[lookupKey] || [];
    
    // If no direct match, try normalized comparison
    if (assemblies.length === 0) {
      const normalizedSearch = normalize(normalizedDist);
      for (const [key, acs] of Object.entries(assembliesByStateDistrict)) {
        const [keyState, keyDist] = key.split('|');
        if (keyState !== asmStateName) continue;
        
        const normalizedKey = normalize(keyDist);
        if (normalizedKey === normalizedSearch || 
            normalizedKey.includes(normalizedSearch) || 
            normalizedSearch.includes(normalizedKey)) {
          assemblies = acs;
          break;
        }
      }
    }
    
    const url = `/${slugify(stateName)}/district/${slugify(distName)}`;
    
    if (assemblies.length > 0) {
      stats.districtsOk++;
      stateOk++;
      if (verbose) {
        console.log(`  ✅ ${distName} -> ${assemblies.length} ACs`);
      }
    } else {
      stateFailed++;
      stats.districtsFailed.push({
        state: stateName,
        stateCode,
        district: distName,
        url,
        mappedTo: mappedDist || null,
        asmStateName,
      });
      if (verbose) {
        console.log(`  ❌ ${distName} -> 0 ACs (mapped to: ${mappedDist || 'none'})`);
      }
    }
  }
  
  const status = stateFailed === 0 ? '✅' : '⚠️';
  console.log(`  ${status} ${stateOk}/${stateOk + stateFailed} districts can load assemblies`);
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('\n📊 SUMMARY\n');
console.log(`Total Districts: ${stats.totalDistricts}`);
console.log(`Districts OK: ${stats.districtsOk} (${(stats.districtsOk/stats.totalDistricts*100).toFixed(1)}%)`);
console.log(`Districts Failed: ${stats.districtsFailed.length}`);

if (stats.districtsFailed.length > 0) {
  console.log('\n❌ DISTRICTS THAT CANNOT LOAD ASSEMBLIES:');
  console.log('   These districts need mappings in DISTRICT_NAME_MAPPINGS\n');
  
  // Group by state
  const byState = {};
  stats.districtsFailed.forEach(d => {
    if (!byState[d.state]) byState[d.state] = [];
    byState[d.state].push(d);
  });
  
  Object.entries(byState).forEach(([state, dists]) => {
    console.log(`\n   // ${state} (${dists.length} districts)`);
    dists.forEach(d => {
      console.log(`   ${d.url}`);
      console.log(`   // Suggestion: '${d.district}|${d.state}': 'ASSEMBLY_DIST_NAME',`);
    });
  });
  
  console.log('\n\n   To fix: Add mappings to src/constants/index.ts DISTRICT_NAME_MAPPINGS\n');
}

// Output report
const reportPath = path.join(__dirname, '../district-validation-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    totalDistricts: stats.totalDistricts,
    districtsOk: stats.districtsOk,
    districtsFailed: stats.districtsFailed.length,
  },
  failedDistricts: stats.districtsFailed,
}, null, 2));
console.log(`📄 Report saved to: district-validation-report.json`);

// Exit code
if (stats.districtsFailed.length > 0) {
  const failRate = (stats.districtsFailed.length / stats.totalDistricts * 100);
  if (failRate > 10) {
    console.log(`\n❌ VALIDATION FAILED - ${failRate.toFixed(1)}% of districts cannot load assemblies\n`);
    process.exit(1);
  } else {
    console.log(`\n⚠️ VALIDATION PASSED WITH WARNINGS - ${stats.districtsFailed.length} districts need attention\n`);
    process.exit(0);
  }
} else {
  console.log('\n✅ VALIDATION PASSED - All districts can load assemblies\n');
  process.exit(0);
}

