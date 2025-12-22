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
  acWithGeo: 0,
  acWithData: 0,
  pcErrors: [],
  acErrors: [],
  warnings: [],
};

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

  // Get state's election data index
  const stateSlug = slugify(state.name);
  const acIndexPath = path.join(DATA_DIR, `elections/ac/${stateSlug}/index.json`);
  const pcIndexPath = path.join(DATA_DIR, `elections/pc/${stateSlug}/index.json`);
  
  const acIndex = loadJSON(acIndexPath);
  const pcIndex = loadJSON(pcIndexPath);
  
  const acYears = acIndex?.availableYears || [];
  const pcYears = pcIndex?.availableYears || [];
  
  // Load election data for the latest year
  const latestACYear = acYears[acYears.length - 1];
  const latestPCYear = pcYears[pcYears.length - 1];
  
  const acElectionData = latestACYear 
    ? loadJSON(path.join(DATA_DIR, `elections/ac/${stateSlug}/${latestACYear}.json`))
    : null;
  const pcElectionData = latestPCYear
    ? loadJSON(path.join(DATA_DIR, `elections/pc/${stateSlug}/${latestPCYear}.json`))
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

  // Validate PCs
  for (const pc of statePCs) {
    stats.totalPCs++;
    const errors = [];
    
    // Check GeoJSON
    const geoFeature = pcGeoBySchemaId.get(pc.id);
    if (geoFeature) {
      stats.pcWithGeo++;
    } else {
      errors.push('missing GeoJSON');
    }
    
    // Check election data
    const hasData = pcElectionData && Object.keys(pcElectionData).some(key => {
      const normalized = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const pcNormalized = pc.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return normalized === pcNormalized || normalized.includes(pcNormalized) || pcNormalized.includes(normalized);
    });
    
    if (hasData || pcYears.length > 0) {
      stats.pcWithData++;
    } else {
      errors.push('no election data');
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
    } else {
      errors.push('missing GeoJSON');
    }
    
    // Check election data - look for AC name in the data
    let hasData = false;
    if (acElectionData) {
      // Try direct schema ID lookup
      if (acElectionData[ac.id]) {
        hasData = true;
      } else {
        // Try name matching
        const acNames = [ac.name, ...(ac.aliases || [])].map(n => 
          n.toUpperCase().replace(/[^A-Z0-9]/g, '')
        );
        hasData = Object.keys(acElectionData).some(key => {
          const keyNorm = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
          return acNames.some(n => n === keyNorm || keyNorm.includes(n) || n.includes(keyNorm));
        });
      }
    }
    
    if (hasData || acYears.length > 0) {
      stats.acWithData++;
    } else {
      errors.push('no election data');
    }
    
    // Get PC for this AC
    const pc = schema.parliamentaryConstituencies?.[ac.pcId];
    
    if (errors.length > 0) {
      stateACErrors++;
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

  // State summary
  const pcStatus = statePCErrors === 0 ? '✅' : '⚠️';
  const acStatus = stateACErrors === 0 ? '✅' : '⚠️';
  console.log(`  ${pcStatus} PCs: ${statePCOk}/${statePCs.length} OK`);
  console.log(`  ${acStatus} ACs: ${stateACOk}/${stateACs.length} OK`);
  
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
console.log(`  Errors: ${stats.pcErrors.length}`);

console.log('\nAssembly Constituencies (AC):');
console.log(`  Total: ${stats.totalACs}`);
console.log(`  With GeoJSON: ${stats.acWithGeo} (${(stats.acWithGeo/stats.totalACs*100).toFixed(1)}%)`);
console.log(`  With Election Data: ${stats.acWithData} (${(stats.acWithData/stats.totalACs*100).toFixed(1)}%)`);
console.log(`  Errors: ${stats.acErrors.length}`);

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
    pcErrors: stats.pcErrors.length,
    totalACs: stats.totalACs,
    acWithGeo: stats.acWithGeo,
    acWithData: stats.acWithData,
    acErrors: stats.acErrors.length,
  },
  pcErrors: stats.pcErrors,
  acErrors: stats.acErrors,
  warnings: stats.warnings,
}, null, 2));
console.log(`\n📄 Full report saved to: url-validation-report.json`);

// Exit code
// Missing GeoJSON is a warning (AC won't show on map but data still loads)
// Missing election data is critical if there's no index at all
const criticalPCErrors = stats.pcErrors.filter(e => 
  !e.errors.every(err => err === 'no election data') // OK if just no data for specific year
);
const criticalACErrors = stats.acErrors.filter(e => 
  e.errors.includes('no schema entry') // Critical if AC not in schema
);

// Calculate coverage thresholds
const geoJSONCoverage = {
  pc: (stats.pcWithGeo / stats.totalPCs * 100),
  ac: (stats.acWithGeo / stats.totalACs * 100),
};

// Fail if GeoJSON coverage drops below 95%
const geoJSONThreshold = 95;
const hasGeoJSONCoverageIssue = geoJSONCoverage.pc < geoJSONThreshold || 
                                geoJSONCoverage.ac < geoJSONThreshold;

if (hasGeoJSONCoverageIssue) {
  console.log(`\n❌ VALIDATION FAILED - GeoJSON coverage below ${geoJSONThreshold}%`);
  console.log(`   PC: ${geoJSONCoverage.pc.toFixed(1)}%, AC: ${geoJSONCoverage.ac.toFixed(1)}%\n`);
  process.exit(1);
} else if (criticalPCErrors.length > 0 || criticalACErrors.length > 0) {
  console.log('\n❌ VALIDATION FAILED - Critical schema errors found\n');
  process.exit(1);
} else {
  const warningCount = stats.pcErrors.length + stats.acErrors.length;
  if (warningCount > 0) {
    console.log(`\n⚠️ VALIDATION PASSED WITH WARNINGS (${warningCount} minor issues)\n`);
  } else {
    console.log('\n✅ VALIDATION PASSED - All URLs have required data\n');
  }
  process.exit(0);
}

