#!/usr/bin/env node

/**
 * Migrate election folder names from slugs to state IDs
 * 
 * Changes:
 *   elections/ac/tamil-nadu/  →  elections/ac/TN/
 *   elections/pc/tamil-nadu/  →  elections/pc/TN/
 *   geo/districts/tamil-nadu.geojson  →  geo/districts/TN.geojson
 * 
 * This makes paths match schema IDs directly, eliminating slug normalization.
 */

import { readFileSync, readdirSync, renameSync, statSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'public/data');
const DRY_RUN = process.argv.includes('--dry-run');

// Load schema for state mappings
const schema = JSON.parse(readFileSync(join(DATA_DIR, 'schema.json'), 'utf-8'));

/**
 * Build slug to state ID mapping
 */
function buildSlugToIdMap() {
  const map = {};
  
  for (const [id, state] of Object.entries(schema.states)) {
    // Generate slug from canonical name
    const slug = state.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    map[slug] = id;
    
    // Map aliases too
    for (const alias of state.aliases || []) {
      const aliasSlug = alias
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      if (aliasSlug) {
        map[aliasSlug] = id;
      }
    }
  }
  
  // Manual overrides
  map['nct-of-delhi'] = 'DL';
  map['dadra-and-nagar-haveli-and-daman-and-diu'] = 'DD';
  map['dnh-and-dd'] = 'DD';
  map['andaman-and-nicobar-islands'] = 'AN';
  map['jammu-and-kashmir'] = 'JK';
  map['jammu-kashmir'] = 'JK';
  
  return map;
}

/**
 * Rename a folder/file
 */
function rename(oldPath, newPath, type = 'folder') {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would rename ${type}: ${oldPath} → ${newPath}`);
    return true;
  }
  
  try {
    renameSync(oldPath, newPath);
    console.log(`  ✓ Renamed ${type}: ${oldPath.split('/').pop()} → ${newPath.split('/').pop()}`);
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to rename: ${err.message}`);
    return false;
  }
}

/**
 * Update index.json files with new stateCode
 */
function updateIndexFile(filePath, stateId, slug) {
  if (!existsSync(filePath)) return;
  
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    const updated = {
      ...content,
      stateCode: stateId,
      stateSlug: slug, // Keep slug for backwards compat
    };
    
    if (!DRY_RUN) {
      writeFileSync(filePath, JSON.stringify(updated, null, 2));
    }
    console.log(`  ✓ Updated index.json with stateCode: ${stateId}`);
  } catch (err) {
    console.error(`  ✗ Failed to update index: ${err.message}`);
  }
}

/**
 * Migrate election folders
 */
function migrateElections(type) {
  const baseDir = join(DATA_DIR, 'elections', type);
  if (!existsSync(baseDir)) {
    console.log(`  ⚠ Directory not found: ${baseDir}`);
    return { total: 0, renamed: 0, skipped: 0 };
  }
  
  const slugToId = buildSlugToIdMap();
  const folders = readdirSync(baseDir).filter(f => {
    const fullPath = join(baseDir, f);
    return statSync(fullPath).isDirectory();
  });
  
  let renamed = 0;
  let skipped = 0;
  
  for (const folder of folders) {
    const oldPath = join(baseDir, folder);
    
    // Check if already using state ID (2-letter uppercase)
    if (/^[A-Z]{2}$/.test(folder)) {
      console.log(`  ○ Already migrated: ${folder}`);
      skipped++;
      continue;
    }
    
    const stateId = slugToId[folder];
    if (!stateId) {
      console.log(`  ⚠ Unknown slug (no mapping): ${folder}`);
      skipped++;
      continue;
    }
    
    const newPath = join(baseDir, stateId);
    
    // Check if target already exists
    if (existsSync(newPath)) {
      console.log(`  ⚠ Target exists, skipping: ${folder} → ${stateId}`);
      skipped++;
      continue;
    }
    
    if (rename(oldPath, newPath)) {
      renamed++;
      
      // Update index.json
      const indexPath = join(newPath, 'index.json');
      updateIndexFile(indexPath, stateId, folder);
    }
  }
  
  return { total: folders.length, renamed, skipped };
}

/**
 * Migrate district GeoJSON files
 */
function migrateDistricts() {
  const baseDir = join(DATA_DIR, 'geo/districts');
  if (!existsSync(baseDir)) {
    console.log(`  ⚠ Directory not found: ${baseDir}`);
    return { total: 0, renamed: 0, skipped: 0 };
  }
  
  const slugToId = buildSlugToIdMap();
  const files = readdirSync(baseDir).filter(f => f.endsWith('.geojson'));
  
  let renamed = 0;
  let skipped = 0;
  
  for (const file of files) {
    const slug = file.replace('.geojson', '');
    const oldPath = join(baseDir, file);
    
    // Check if already using state ID
    if (/^[A-Z]{2}$/.test(slug)) {
      console.log(`  ○ Already migrated: ${file}`);
      skipped++;
      continue;
    }
    
    const stateId = slugToId[slug];
    if (!stateId) {
      console.log(`  ⚠ Unknown slug (no mapping): ${slug}`);
      skipped++;
      continue;
    }
    
    const newPath = join(baseDir, `${stateId}.geojson`);
    
    // Check if target already exists
    if (existsSync(newPath)) {
      console.log(`  ⚠ Target exists, skipping: ${file} → ${stateId}.geojson`);
      skipped++;
      continue;
    }
    
    if (rename(oldPath, newPath, 'file')) {
      renamed++;
    }
  }
  
  return { total: files.length, renamed, skipped };
}

/**
 * Main migration
 */
function main() {
  console.log('🔄 Data Migration: Slugs → State IDs\n');
  
  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  // Migrate AC elections
  console.log('📂 Migrating AC election folders...');
  const acResult = migrateElections('ac');
  console.log(`   Total: ${acResult.total}, Renamed: ${acResult.renamed}, Skipped: ${acResult.skipped}\n`);
  
  // Migrate PC elections
  console.log('📂 Migrating PC election folders...');
  const pcResult = migrateElections('pc');
  console.log(`   Total: ${pcResult.total}, Renamed: ${pcResult.renamed}, Skipped: ${pcResult.skipped}\n`);
  
  // Migrate district files
  console.log('📂 Migrating district GeoJSON files...');
  const districtResult = migrateDistricts();
  console.log(`   Total: ${districtResult.total}, Renamed: ${districtResult.renamed}, Skipped: ${districtResult.skipped}\n`);
  
  // Summary
  const totalRenamed = acResult.renamed + pcResult.renamed + districtResult.renamed;
  const totalSkipped = acResult.skipped + pcResult.skipped + districtResult.skipped;
  
  console.log('━'.repeat(50));
  console.log(`\n✅ Migration ${DRY_RUN ? 'preview' : 'complete'}!`);
  console.log(`   Renamed: ${totalRenamed}`);
  console.log(`   Skipped: ${totalSkipped}`);
  
  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n⚠️  Remember to update paths.ts and regenerate manifest!');
  }
}

main();

