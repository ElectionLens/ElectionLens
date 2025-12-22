#!/usr/bin/env node

/**
 * Generate og-image.png from og-image.svg
 * 
 * Prerequisites:
 *   npm install sharp
 * 
 * Usage:
 *   node scripts/generate-og-image.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SVG_PATH = path.join(ROOT, 'public', 'og-image.svg');
const PNG_PATH = path.join(ROOT, 'public', 'og-image.png');

async function generateOgImage() {
  try {
    // Try to use sharp if available
    const sharp = await import('sharp').catch(() => null);
    
    if (sharp) {
      console.log('Converting SVG to PNG using sharp...');
      const svgBuffer = fs.readFileSync(SVG_PATH);
      
      await sharp.default(svgBuffer)
        .resize(1200, 630)
        .png()
        .toFile(PNG_PATH);
      
      console.log(`✅ Generated: ${PNG_PATH}`);
      const stats = fs.statSync(PNG_PATH);
      console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
      return;
    }

    // Fallback: provide instructions
    console.log('⚠️  sharp module not installed.');
    console.log('');
    console.log('To generate og-image.png, either:');
    console.log('');
    console.log('1. Install sharp and run again:');
    console.log('   npm install sharp');
    console.log('   node scripts/generate-og-image.mjs');
    console.log('');
    console.log('2. Use an online converter:');
    console.log('   - https://cloudconvert.com/svg-to-png');
    console.log('   - https://svgtopng.com/');
    console.log('   Upload: public/og-image.svg');
    console.log('   Set dimensions: 1200x630');
    console.log('   Save as: public/og-image.png');
    console.log('');
    console.log('3. Use Inkscape CLI:');
    console.log('   inkscape public/og-image.svg -w 1200 -h 630 -o public/og-image.png');
    console.log('');
    console.log('4. Use ImageMagick:');
    console.log('   convert -background none -density 150 public/og-image.svg -resize 1200x630 public/og-image.png');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

generateOgImage();

