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
  
  // Suppress font warnings by setting environment variables
  process.env.FONTCONFIG_FILE = '/dev/null';
  
  await sharp.default(svgBuffer, {
    density: 72, // Lower density to avoid font issues
  })
    .resize(1200, 630, {
      fit: 'contain',
      background: { r: 30, g: 58, b: 95, alpha: 1 } // #1e3a5f
    })
    .png()
    .toFile(PNG_PATH);
  
  // Check if file was created despite warnings
  if (fs.existsSync(PNG_PATH)) {
    const stats = fs.statSync(PNG_PATH);
    console.log('✅ Generated:', PNG_PATH);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   Dimensions: 1200 × 630 pixels`);
    console.log('   (Font warnings can be ignored if file was created)');
  } else {
    throw new Error('File was not created');
  }
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
    // Try Playwright as fallback (already installed for e2e tests)
    console.log('\n⚠️  sharp failed, trying Playwright as fallback...\n');
    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1200, height: 630 });
      
      const svgContent = fs.readFileSync(SVG_PATH, 'utf-8');
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { margin: 0; padding: 0; }
              #og-card { width: 1200px; height: 630px; }
            </style>
          </head>
          <body>
            <div id="og-card">${svgContent}</div>
          </body>
        </html>
      `);
      
      await page.waitForTimeout(500);
      const cardElement = await page.locator('#og-card').first();
      await cardElement.screenshot({ path: PNG_PATH });
      await browser.close();
      
      if (fs.existsSync(PNG_PATH)) {
        const stats = fs.statSync(PNG_PATH);
        console.log('✅ Generated using Playwright:', PNG_PATH);
        console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
        console.log(`   Dimensions: 1200 × 630 pixels`);
      } else {
        throw new Error('File was not created');
      }
    } catch (playwrightError) {
      console.error('❌ Error:', error.message);
      console.log('\nAlternative methods:');
      console.log('1. Browser screenshot: Open public/og-preview.html, set viewport to 1200×630, screenshot');
      console.log('2. Online converter: https://cloudconvert.com/svg-to-png');
      process.exit(1);
    }
  }
}
