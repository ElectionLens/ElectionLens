#!/usr/bin/env node
/**
 * Validate All Parliament and Assembly URLs
 * 
 * This script validates that every PC and AC in the schema has:
 * 1. Corresponding GeoJSON feature with schemaId
 * 2. Election data available for at least one year
 * 3. Valid URL generation
 * 
 * Usage: node scripts/validate-all-urls.mjs [--verbose] [--state=STATE_ID]
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

// Stats
const stats = {
  totalPCs: 0,
  totalACs: 0,
  pcWithGeo: 0,
  pcWithData: 0,
  pcDataLookupOk: 0,  // New: data can be found via hook lookup logic
  acWithGeo: 0,
  acWithData: 0,
  acDataLookupOk: 0,  // New: data can be found via hook lookup logic
  pcErrors: [],
  acErrors: [],
  warnings: [],
  // Per-state coverage tracking
  stateGeoJSONCoverage: {}, // { stateId: { pcTotal, pcWithGeo, acTotal, acWithGeo } }
  statesMissingGeoJSON: [], // States with 0% AC GeoJSON coverage
  // AC View URL stats
  acViewUrls: [],  // Sample AC view URLs
  stateAcViewUrls: [],  // State-level AC view URLs
};

/**
 * Simulate hook lookup logic - this is what actually happens in the app
 * Returns the result if found, null otherwise
 */
function simulateHookLookup(data, name, schemaId) {
  if (!data) return null;
  
  // Strategy 1: Direct schema ID match (primary path after migration)
  if (schemaId && data[schemaId]) {
    return { strategy: 'schemaId', key: schemaId };
  }
  
  // Strategy 2: Direct name match
  const upperName = name.toUpperCase().trim();
  if (data[upperName]) {
    return { strategy: 'directName', key: upperName };
  }
  
  // Strategy 3: Search by name/constituencyName properties
  const normalizedSearch = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== 'object') continue;
    
    const namesToCheck = [
      value.name,
      value.constituencyName,
      value.constituencyNameOriginal,
    ].filter(Boolean);
    
    for (const n of namesToCheck) {
      const normalized = n.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalized === normalizedSearch) {
        return { strategy: 'nameProperty', key, matchedName: n };
      }
    }
  }
  
  // Strategy 4: Partial match on name properties
  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== 'object') continue;
    
    const namesToCheck = [
      value.name,
      value.constituencyName,
      value.constituencyNameOriginal,
    ].filter(Boolean);
    
    for (const n of namesToCheck) {
      const normalized = n.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalized.includes(normalizedSearch) || normalizedSearch.includes(normalized)) {
        return { strategy: 'partialMatch', key, matchedName: n };
      }
    }
  }
  
  return null;
}

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

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

function generateACUrl(state, pc, ac, year) {
  const stateSlug = slugify(state.name);
  const pcSlug = slugify(pc.name);
  const acSlug = slugify(ac.name);
  return `/${stateSlug}/pc/${pcSlug}/ac/${acSlug}?year=${year}`;
}

function generatePCUrl(state, pc, year) {
  const stateSlug = slugify(state.name);
  const pcSlug = slugify(pc.name);
  return `/${stateSlug}/pc/${pcSlug}?year=${year}`;
}

// AC View URL (new format: /state/ac/ac-name)
function generateACViewUrl(state, ac, year) {
  const stateSlug = slugify(state.name);
  const acSlug = slugify(ac.name);
  return `/${stateSlug}/ac/${acSlug}?year=${year}`;
}

// State AC View URL (all assemblies for a state)
function generateStateACViewUrl(state) {
  const stateSlug = slugify(state.name);
  return `/${stateSlug}/ac`;
}

// ============================================================================
// MAIN
// ============================================================================

console.log('\n🔍 VALIDATING ALL PARLIAMENT & ASSEMBLY URLs\n');
console.log('='.repeat(70));

// Load schema
const schema = loadJSON(path.join(DATA_DIR, 'schema.json'));
if (!schema) {
  console.error('❌ Failed to load schema.json');
  process.exit(1);
}

// Load GeoJSON files
const pcGeo = loadJSON(path.join(DATA_DIR, 'geo/parliament/constituencies.geojson'));
const acGeo = loadJSON(path.join(DATA_DIR, 'geo/assembly/constituencies.geojson'));

if (!pcGeo || !acGeo) {
  console.error('❌ Failed to load GeoJSON files');
  process.exit(1);
}

// Build lookup maps for GeoJSON
const pcGeoBySchemaId = new Map();
pcGeo.features.forEach(f => {
  if (f.properties.schemaId) {
    pcGeoBySchemaId.set(f.properties.schemaId, f);
  }
});

const acGeoBySchemaId = new Map();
acGeo.features.forEach(f => {
  if (f.properties.schemaId) {
    acGeoBySchemaId.set(f.properties.schemaId, f);
  }
});

// Process each state
const states = Object.values(schema.states);
const filteredStates = stateFilter 
  ? states.filter(s => s.id === stateFilter)
  : states;

if (stateFilter && filteredStates.length === 0) {
  console.error(`❌ State not found: ${stateFilter}`);
  process.exit(1);
}

console.log(`\nChecking ${filteredStates.length} state(s)...\n`);

for (const state of filteredStates) {
  console.log(`\n📍 ${state.name} (${state.id})`);
  console.log('-'.repeat(50));

  // Get state's election data index (use state ID for folder path)
  const stateId = state.id;
  const acIndexPath = path.join(DATA_DIR, `elections/ac/${stateId}/index.json`);
  const pcIndexPath = path.join(DATA_DIR, `elections/pc/${stateId}/index.json`);
  
  const acIndex = loadJSON(acIndexPath);
  const pcIndex = loadJSON(pcIndexPath);
  
  const acYears = acIndex?.availableYears || [];
  const pcYears = pcIndex?.availableYears || [];
  
  // Load election data for the latest year
  const latestACYear = acYears[acYears.length - 1];
  const latestPCYear = pcYears[pcYears.length - 1];
  
  const acElectionData = latestACYear 
    ? loadJSON(path.join(DATA_DIR, `elections/ac/${stateId}/${latestACYear}.json`))
    : null;
  const pcElectionData = latestPCYear
    ? loadJSON(path.join(DATA_DIR, `elections/pc/${stateId}/${latestPCYear}.json`))
    : null;

  // Get PCs for this state
  const statePCs = Object.values(schema.parliamentaryConstituencies || {})
    .filter(pc => pc.stateId === state.id);
  
  // Get ACs for this state
  const stateACs = Object.values(schema.assemblyConstituencies || {})
    .filter(ac => ac.stateId === state.id);

  let statePCErrors = 0;
  let stateACErrors = 0;
  let statePCOk = 0;
  let stateACOk = 0;
  let statePCWithGeo = 0;
  let stateACWithGeo = 0;

  // Validate PCs
  for (const pc of statePCs) {
    stats.totalPCs++;
    const errors = [];
    
    // Check GeoJSON
    const geoFeature = pcGeoBySchemaId.get(pc.id);
    if (geoFeature) {
      stats.pcWithGeo++;
      statePCWithGeo++;
    } else {
      errors.push('missing GeoJSON');
    }
    
    // Check election data exists
    const hasData = pcElectionData && pcYears.length > 0;
    if (hasData) {
      stats.pcWithData++;
    } else {
      errors.push('no election data');
    }
    
    // NEW: Simulate hook lookup to verify data is actually findable
    if (hasData) {
      const lookupResult = simulateHookLookup(pcElectionData, pc.name, pc.id);
      if (lookupResult) {
        stats.pcDataLookupOk++;
        if (verbose && lookupResult.strategy !== 'schemaId') {
          console.log(`  ℹ️ PC ${pc.name}: found via ${lookupResult.strategy} (key: ${lookupResult.key})`);
        }
      } else {
        errors.push('data lookup would FAIL in app');
      }
    }
    
    if (errors.length > 0) {
      statePCErrors++;
      const url = generatePCUrl(state, pc, latestPCYear || 2024);
      stats.pcErrors.push({
        id: pc.id,
        name: pc.name,
        state: state.name,
        url,
        errors,
      });
      if (verbose) {
        console.log(`  ❌ PC: ${pc.name} (${pc.id}) - ${errors.join(', ')}`);
      }
    } else {
      statePCOk++;
    }
  }

  // Validate ACs
  for (const ac of stateACs) {
    stats.totalACs++;
    const errors = [];
    
    // Check GeoJSON
    const geoFeature = acGeoBySchemaId.get(ac.id);
    if (geoFeature) {
      stats.acWithGeo++;
      stateACWithGeo++;
    } else {
      errors.push('missing GeoJSON');
    }
    
    // Check election data exists
    const hasData = acElectionData && acYears.length > 0;
    if (hasData) {
      stats.acWithData++;
    } else {
      errors.push('no election data');
    }
    
    // NEW: Simulate hook lookup to verify data is actually findable
    if (hasData) {
      const lookupResult = simulateHookLookup(acElectionData, ac.name, ac.id);
      if (lookupResult) {
        stats.acDataLookupOk++;
        if (verbose && lookupResult.strategy !== 'schemaId') {
          console.log(`  ℹ️ AC ${ac.name}: found via ${lookupResult.strategy} (key: ${lookupResult.key})`);
        }
      } else {
        errors.push('data lookup would FAIL in app');
      }
    }
    
    // Get PC for this AC
    const pc = schema.parliamentaryConstituencies?.[ac.pcId];
    
    if (errors.length > 0) {
      stateACErrors++;
      const stateSlug = slugify(state.name);
      const url = pc ? generateACUrl(state, pc, ac, latestACYear || 2024) : `/${stateSlug}/ac/${slugify(ac.name)}`;
      stats.acErrors.push({
        id: ac.id,
        name: ac.name,
        state: state.name,
        url,
        errors,
      });
      if (verbose) {
        console.log(`  ❌ AC: ${ac.name} (${ac.id}) - ${errors.join(', ')}`);
      }
    } else {
      stateACOk++;
    }
  }

  // Track state-level GeoJSON coverage
  stats.stateGeoJSONCoverage[state.id] = {
    name: state.name,
    pcTotal: statePCs.length,
    pcWithGeo: statePCWithGeo,
    acTotal: stateACs.length,
    acWithGeo: stateACWithGeo,
  };
  
  // Flag states with 0% AC GeoJSON (critical issue!)
  if (stateACs.length > 0 && stateACWithGeo === 0) {
    stats.statesMissingGeoJSON.push({
      id: state.id,
      name: state.name,
      acCount: stateACs.length,
    });
  }

  // Generate AC view URLs (new format: /state/ac and /state/ac/ac-name)
  stats.stateAcViewUrls.push(generateStateACViewUrl(state));
  
  // Generate sample AC view URLs (first 3 ACs per state for verification)
  const sampleACs = stateACs.slice(0, 3);
  for (const ac of sampleACs) {
    if (latestACYear) {
      stats.acViewUrls.push(generateACViewUrl(state, ac, latestACYear));
    }
  }

  // State summary
  const pcStatus = statePCErrors === 0 ? '✅' : '⚠️';
  const acStatus = stateACErrors === 0 ? '✅' : '⚠️';
  const geoStatus = stateACs.length > 0 && stateACWithGeo === 0 ? '🚨' : '';
  console.log(`  ${pcStatus} PCs: ${statePCOk}/${statePCs.length} OK`);
  console.log(`  ${acStatus} ACs: ${stateACOk}/${stateACs.length} OK ${geoStatus}`);
  
  // Show GeoJSON coverage for this state if not 100%
  if (stateACs.length > 0 && stateACWithGeo < stateACs.length) {
    const acGeoCoverage = (stateACWithGeo / stateACs.length * 100).toFixed(0);
    console.log(`  📍 GeoJSON: ${stateACWithGeo}/${stateACs.length} ACs (${acGeoCoverage}%)`);
  }
  
  if (!acIndex && stateACs.length > 0) {
    stats.warnings.push(`${state.name}: No AC election index found at ${acIndexPath}`);
  }
  if (!pcIndex && statePCs.length > 0) {
    stats.warnings.push(`${state.name}: No PC election index found at ${pcIndexPath}`);
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('\n📊 SUMMARY\n');

console.log('Parliament Constituencies (PC):');
console.log(`  Total: ${stats.totalPCs}`);
console.log(`  With GeoJSON: ${stats.pcWithGeo} (${(stats.pcWithGeo/stats.totalPCs*100).toFixed(1)}%)`);
console.log(`  With Election Data: ${stats.pcWithData} (${(stats.pcWithData/stats.totalPCs*100).toFixed(1)}%)`);
console.log(`  Data Lookup OK: ${stats.pcDataLookupOk}/${stats.pcWithData} (${stats.pcWithData > 0 ? (stats.pcDataLookupOk/stats.pcWithData*100).toFixed(1) : 0}%)`);
console.log(`  Errors: ${stats.pcErrors.length}`);

console.log('\nAssembly Constituencies (AC):');
console.log(`  Total: ${stats.totalACs}`);
console.log(`  With GeoJSON: ${stats.acWithGeo} (${(stats.acWithGeo/stats.totalACs*100).toFixed(1)}%)`);
console.log(`  With Election Data: ${stats.acWithData} (${(stats.acWithData/stats.totalACs*100).toFixed(1)}%)`);
console.log(`  Data Lookup OK: ${stats.acDataLookupOk}/${stats.acWithData} (${stats.acWithData > 0 ? (stats.acDataLookupOk/stats.acWithData*100).toFixed(1) : 0}%)`);
console.log(`  Errors: ${stats.acErrors.length}`);

console.log('\nAC View URLs (new format /state/ac/):');
console.log(`  State AC Views: ${stats.stateAcViewUrls.length} URLs`);
console.log(`  Sample AC URLs: ${stats.acViewUrls.length} URLs`);
if (verbose && stats.acViewUrls.length > 0) {
  console.log('  Sample URLs:');
  stats.acViewUrls.slice(0, 5).forEach(url => console.log(`    ${url}`));
}

// Show states with missing GeoJSON (CRITICAL)
if (stats.statesMissingGeoJSON.length > 0) {
  console.log('\n🚨 CRITICAL: STATES WITH NO AC GeoJSON DATA:');
  console.log('   These states will show "Unknown" on hover for ALL assemblies!\n');
  stats.statesMissingGeoJSON.forEach(s => {
    console.log(`   - ${s.name} (${s.id}): ${s.acCount} ACs have NO map boundaries`);
  });
  console.log('\n   Fix: Source GeoJSON boundaries from ECI/DataMeet and add to constituencies.geojson\n');
}

// Show errors
if (stats.pcErrors.length > 0) {
  console.log('\n❌ PC ERRORS:');
  const grouped = {};
  stats.pcErrors.forEach(e => {
    const key = e.errors.join(', ');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });
  Object.entries(grouped).forEach(([error, items]) => {
    console.log(`\n  ${error} (${items.length}):`);
    items.slice(0, 5).forEach(e => {
      console.log(`    - ${e.name} (${e.state}) ${e.url}`);
    });
    if (items.length > 5) {
      console.log(`    ... and ${items.length - 5} more`);
    }
  });
}

if (stats.acErrors.length > 0) {
  console.log('\n❌ AC ERRORS:');
  const grouped = {};
  stats.acErrors.forEach(e => {
    const key = e.errors.join(', ');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });
  Object.entries(grouped).forEach(([error, items]) => {
    console.log(`\n  ${error} (${items.length}):`);
    items.slice(0, 5).forEach(e => {
      console.log(`    - ${e.name} (${e.state}) ${e.url}`);
    });
    if (items.length > 5) {
      console.log(`    ... and ${items.length - 5} more`);
    }
  });
}

if (stats.warnings.length > 0) {
  console.log('\n⚠️ WARNINGS:');
  stats.warnings.forEach(w => console.log(`  - ${w}`));
}

// Output JSON report
const reportPath = path.join(__dirname, '../url-validation-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    totalPCs: stats.totalPCs,
    pcWithGeo: stats.pcWithGeo,
    pcWithData: stats.pcWithData,
    pcDataLookupOk: stats.pcDataLookupOk,
    pcErrors: stats.pcErrors.length,
    totalACs: stats.totalACs,
    acWithGeo: stats.acWithGeo,
    acWithData: stats.acWithData,
    acDataLookupOk: stats.acDataLookupOk,
    acErrors: stats.acErrors.length,
    statesMissingGeoJSON: stats.statesMissingGeoJSON.length,
  },
  statesMissingGeoJSON: stats.statesMissingGeoJSON,
  stateGeoJSONCoverage: stats.stateGeoJSONCoverage,
  pcErrors: stats.pcErrors,
  acErrors: stats.acErrors,
  warnings: stats.warnings,
  // AC View URLs (new format)
  acViewUrls: {
    stateViews: stats.stateAcViewUrls,
    sampleUrls: stats.acViewUrls.slice(0, 20), // Sample of AC view URLs
  },
}, null, 2));
console.log(`\n📄 Full report saved to: url-validation-report.json`);

// Exit code logic
// - States with 0% GeoJSON is CRITICAL (entire state broken!)
// - Missing GeoJSON is a warning (AC won't show on map but data still loads)
// - Missing election data is critical if there's no index at all  
// - Data lookup failures are CRITICAL (panel won't show in app!)

// Count data lookup failures
const lookupFailures = stats.pcErrors.concat(stats.acErrors).filter(e => 
  e.errors.includes('data lookup would FAIL in app')
);

// Calculate coverage thresholds
const geoJSONCoverage = {
  pc: (stats.pcWithGeo / stats.totalPCs * 100),
  ac: (stats.acWithGeo / stats.totalACs * 100),
};

// Calculate data lookup success rate
const lookupSuccessRate = {
  pc: stats.pcWithData > 0 ? (stats.pcDataLookupOk / stats.pcWithData * 100) : 100,
  ac: stats.acWithData > 0 ? (stats.acDataLookupOk / stats.acWithData * 100) : 100,
};

// Thresholds
const geoJSONThreshold = 95;
const lookupThreshold = 99; // Must be able to find 99% of data

const hasStatesMissingGeoJSON = stats.statesMissingGeoJSON.length > 0;
const hasGeoJSONCoverageIssue = geoJSONCoverage.pc < geoJSONThreshold || 
                                geoJSONCoverage.ac < geoJSONThreshold;
const hasLookupIssue = lookupSuccessRate.pc < lookupThreshold || 
                       lookupSuccessRate.ac < lookupThreshold;

// CRITICAL: States with no GeoJSON at all
if (hasStatesMissingGeoJSON) {
  const missingACs = stats.statesMissingGeoJSON.reduce((sum, s) => sum + s.acCount, 0);
  console.log(`\n❌ VALIDATION FAILED - ${stats.statesMissingGeoJSON.length} state(s) have NO AC GeoJSON data!`);
  console.log(`   ${missingACs} ACs will show "Unknown" on hover.\n`);
  stats.statesMissingGeoJSON.forEach(s => {
    console.log(`   - ${s.name}: ${s.acCount} ACs missing`);
  });
  console.log('\n   See ideas/missing-geojson-acs.md for details on sourcing GeoJSON data.\n');
  process.exit(1);
} else if (hasLookupIssue) {
  console.log(`\n❌ VALIDATION FAILED - Data lookup success rate below ${lookupThreshold}%`);
  console.log(`   PC: ${lookupSuccessRate.pc.toFixed(1)}%, AC: ${lookupSuccessRate.ac.toFixed(1)}%`);
  console.log(`   ${lookupFailures.length} constituencies would fail to show panels in the app!\n`);
  lookupFailures.slice(0, 10).forEach(e => {
    console.log(`   - ${e.name} (${e.state})`);
  });
  if (lookupFailures.length > 10) {
    console.log(`   ... and ${lookupFailures.length - 10} more`);
  }
  process.exit(1);
} else if (hasGeoJSONCoverageIssue) {
  console.log(`\n❌ VALIDATION FAILED - GeoJSON coverage below ${geoJSONThreshold}%`);
  console.log(`   PC: ${geoJSONCoverage.pc.toFixed(1)}%, AC: ${geoJSONCoverage.ac.toFixed(1)}%\n`);
  process.exit(1);
} else {
  const warningCount = stats.pcErrors.filter(e => !e.errors.includes('data lookup would FAIL in app')).length +
                       stats.acErrors.filter(e => !e.errors.includes('data lookup would FAIL in app')).length;
  if (warningCount > 0) {
    console.log(`\n⚠️ VALIDATION PASSED WITH WARNINGS (${warningCount} minor issues - missing GeoJSON)`);
    console.log(`   Data Lookup Success: PC ${lookupSuccessRate.pc.toFixed(1)}%, AC ${lookupSuccessRate.ac.toFixed(1)}%\n`);
  } else {
    console.log('\n✅ VALIDATION PASSED - All URLs have required data and lookups work');
    console.log(`   Data Lookup Success: PC ${lookupSuccessRate.pc.toFixed(1)}%, AC ${lookupSuccessRate.ac.toFixed(1)}%\n`);
  }
  process.exit(0);
}

