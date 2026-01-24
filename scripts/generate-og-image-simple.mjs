#!/usr/bin/env node

/**
 * Simple script to generate og-image.png
 * Uses Node.js built-in capabilities or provides instructions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'public', 'og-image.svg');
const PNG_PATH = path.join(ROOT, 'public', 'og-image.png');

console.log('📸 Generating og-image.png from SVG...\n');

// Check if SVG exists
if (!fs.existsSync(SVG_PATH)) {
  console.error('❌ SVG file not found:', SVG_PATH);
  process.exit(1);
}

// Try to use sharp if available
try {
  const sharp = await import('sharp');
  const svgBuffer = fs.readFileSync(SVG_PATH);
  
  await sharp.default(svgBuffer)
    .resize(1200, 630, {
      fit: 'contain',
      background: { r: 30, g: 58, b: 95, alpha: 1 } // #1e3a5f
    })
    .png()
    .toFile(PNG_PATH);
  
  const stats = fs.statSync(PNG_PATH);
  console.log('✅ Generated:', PNG_PATH);
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Dimensions: 1200 × 630 pixels`);
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('⚠️  sharp module not installed.\n');
    console.log('To generate og-image.png, run:');
    console.log('  npm install sharp');
    console.log('  node scripts/generate-og-image-simple.mjs\n');
    console.log('Or use an online converter:');
    console.log('  1. Open: public/og-image.svg');
    console.log('  2. Convert to PNG at 1200×630px');
    console.log('  3. Save as: public/og-image.png\n');
    console.log('Or use browser:');
    console.log('  1. Open: public/og-preview.html in browser');
    console.log('  2. Take screenshot at 1200×630px');
    console.log('  3. Save as: public/og-image.png');
    process.exit(1);
  } else {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}
