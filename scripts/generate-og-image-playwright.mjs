#!/usr/bin/env node

/**
 * Generate og-image.png using Playwright (already installed for e2e tests)
 * This avoids font issues with sharp/Pango
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'public', 'og-image.svg');
const PNG_PATH = path.join(ROOT, 'public', 'og-image.png');
const PREVIEW_HTML = path.join(ROOT, 'public', 'og-preview.html');

console.log('📸 Generating og-image.png using Playwright...\n');

// Check if SVG exists
if (!fs.existsSync(SVG_PATH)) {
  console.error('❌ SVG file not found:', SVG_PATH);
  process.exit(1);
}

try {
  // Launch browser
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set viewport to exact OG image size
  await page.setViewportSize({ width: 1200, height: 630 });
  
  // Load the preview HTML or create a simple page with the SVG
  if (fs.existsSync(PREVIEW_HTML)) {
    await page.goto(`file://${PREVIEW_HTML}`);
  } else {
    // Create a simple page with the SVG
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
  }
  
  // Wait for content to load
  await page.waitForTimeout(500);
  
  // Take screenshot of the card
  const cardElement = await page.locator('#og-card').first();
  await cardElement.screenshot({ path: PNG_PATH });
  
  await browser.close();
  
  // Verify file was created
  if (fs.existsSync(PNG_PATH)) {
    const stats = fs.statSync(PNG_PATH);
    console.log('✅ Generated:', PNG_PATH);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   Dimensions: 1200 × 630 pixels`);
  } else {
    throw new Error('File was not created');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\nAlternative methods:');
  console.log('1. Browser screenshot: Open public/og-preview.html, set viewport to 1200×630, screenshot');
  console.log('2. Online converter: https://cloudconvert.com/svg-to-png');
  process.exit(1);
}
