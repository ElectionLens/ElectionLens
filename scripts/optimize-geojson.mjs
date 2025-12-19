#!/usr/bin/env node
/**
 * GeoJSON Optimization Script
 * 
 * This script analyzes and provides recommendations for GeoJSON file optimization.
 * For actual simplification, use external tools like mapshaper or tippecanoe.
 * 
 * Usage:
 *   node scripts/optimize-geojson.mjs [--analyze] [--stats]
 * 
 * External tools for optimization:
 *   - mapshaper: npx mapshaper input.geojson -simplify 10% -o output.geojson
 *   - tippecanoe: tippecanoe -o output.mbtiles input.geojson (for vector tiles)
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const GEO_DIR = join(ROOT_DIR, 'public', 'data', 'geo');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Get all GeoJSON files recursively
 */
async function getGeoJSONFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await getGeoJSONFiles(fullPath, files);
    } else if (entry.name.endsWith('.geojson')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Analyze a GeoJSON file
 */
async function analyzeFile(filePath) {
  const stats = await stat(filePath);
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  const features = data.features || [];
  let totalPoints = 0;
  let geometryTypes = {};
  
  for (const feature of features) {
    if (!feature.geometry) continue;
    
    const type = feature.geometry.type;
    geometryTypes[type] = (geometryTypes[type] || 0) + 1;
    
    // Count coordinate points
    const countPoints = (coords) => {
      if (typeof coords[0] === 'number') return 1;
      return coords.reduce((sum, c) => sum + countPoints(c), 0);
    };
    
    if (feature.geometry.coordinates) {
      totalPoints += countPoints(feature.geometry.coordinates);
    }
  }
  
  return {
    path: relative(ROOT_DIR, filePath),
    size: stats.size,
    features: features.length,
    points: totalPoints,
    geometryTypes,
    avgPointsPerFeature: features.length ? Math.round(totalPoints / features.length) : 0,
  };
}

/**
 * Print analysis report
 */
function printReport(analyses) {
  console.log('\n' + colors.cyan + '═'.repeat(70) + colors.reset);
  console.log(colors.cyan + ' GeoJSON Analysis Report' + colors.reset);
  console.log(colors.cyan + '═'.repeat(70) + colors.reset + '\n');
  
  let totalSize = 0;
  let totalFeatures = 0;
  let totalPoints = 0;
  
  // Group by directory
  const byDir = {};
  for (const a of analyses) {
    const dir = a.path.split('/').slice(0, -1).join('/');
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(a);
    totalSize += a.size;
    totalFeatures += a.features;
    totalPoints += a.points;
  }
  
  for (const [dir, files] of Object.entries(byDir)) {
    console.log(colors.blue + `📁 ${dir}/` + colors.reset);
    
    for (const file of files) {
      const fileName = file.path.split('/').pop();
      const sizeStr = formatBytes(file.size).padStart(10);
      const featStr = `${file.features} features`.padStart(15);
      const pointStr = `${file.points.toLocaleString()} pts`.padStart(12);
      
      console.log(`   ${colors.dim}├─${colors.reset} ${fileName}`);
      console.log(`   ${colors.dim}│  ${colors.reset}${sizeStr} │ ${featStr} │ ${pointStr}`);
    }
    console.log();
  }
  
  // Summary
  console.log(colors.green + '─'.repeat(70) + colors.reset);
  console.log(colors.green + ' Summary' + colors.reset);
  console.log(colors.green + '─'.repeat(70) + colors.reset);
  console.log(`  Total Files:    ${analyses.length}`);
  console.log(`  Total Size:     ${formatBytes(totalSize)}`);
  console.log(`  Total Features: ${totalFeatures.toLocaleString()}`);
  console.log(`  Total Points:   ${totalPoints.toLocaleString()}`);
  console.log();
  
  // Recommendations
  console.log(colors.yellow + '─'.repeat(70) + colors.reset);
  console.log(colors.yellow + ' Optimization Recommendations' + colors.reset);
  console.log(colors.yellow + '─'.repeat(70) + colors.reset);
  
  // Find large files
  const largeFiles = analyses.filter(a => a.size > 5 * 1024 * 1024);
  if (largeFiles.length > 0) {
    console.log('\n  ⚠️  Large files (>5MB) that could benefit from simplification:');
    for (const file of largeFiles) {
      console.log(`      - ${file.path} (${formatBytes(file.size)})`);
    }
  }
  
  // High point density files
  const highDensity = analyses.filter(a => a.avgPointsPerFeature > 1000);
  if (highDensity.length > 0) {
    console.log('\n  🔍  High-density files (>1000 pts/feature) - good candidates for simplification:');
    for (const file of highDensity) {
      console.log(`      - ${file.path} (${file.avgPointsPerFeature} pts/feature)`);
    }
  }
  
  console.log('\n  📝  To simplify geometries, use mapshaper:');
  console.log('      npx mapshaper input.geojson -simplify 10% -o output.geojson');
  console.log('\n  📝  To convert to vector tiles, use tippecanoe:');
  console.log('      tippecanoe -o output.mbtiles -zg input.geojson');
  console.log();
}

/**
 * Main
 */
async function main() {
  console.log(colors.cyan + '\n🔍 Analyzing GeoJSON files...\n' + colors.reset);
  
  try {
    const files = await getGeoJSONFiles(GEO_DIR);
    
    if (files.length === 0) {
      console.log(colors.yellow + 'No GeoJSON files found in public/data/geo/' + colors.reset);
      return;
    }
    
    const analyses = [];
    for (const file of files) {
      process.stdout.write(`  Analyzing ${relative(ROOT_DIR, file)}...`);
      const analysis = await analyzeFile(file);
      analyses.push(analysis);
      console.log(colors.green + ' ✓' + colors.reset);
    }
    
    printReport(analyses);
  } catch (error) {
    console.error(colors.yellow + 'Error:', error.message + colors.reset);
    process.exit(1);
  }
}

main();


