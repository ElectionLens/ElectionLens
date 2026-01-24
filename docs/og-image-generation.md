# Generating OG Image for Social Media

The app uses `og-image.png` (1200×630px) for social media link previews (Twitter, Facebook, etc.).

## Quick Method (Recommended)

1. **Install sharp** (if not already installed):
   ```bash
   npm install sharp
   ```

2. **Generate the PNG**:
   ```bash
   node scripts/generate-og-image-simple.mjs
   ```

## Alternative Methods

### Method 1: Browser Screenshot
1. Open `public/og-preview.html` in your browser
2. Use browser DevTools → Device Mode → Set to 1200×630
3. Take a screenshot of the card
4. Save as `public/og-image.png`

### Method 2: Online Converter
1. Go to https://cloudconvert.com/svg-to-png or https://svgtopng.com/
2. Upload `public/og-image.svg`
3. Set dimensions: 1200×630
4. Download and save as `public/og-image.png`

### Method 3: Inkscape (if installed)
```bash
inkscape public/og-image.svg -w 1200 -h 630 -o public/og-image.png
```

### Method 4: ImageMagick (if installed)
```bash
convert -background none -density 150 public/og-image.svg -resize 1200x630 public/og-image.png
```

## Verification

After generating, verify the file:
- Location: `public/og-image.png`
- Size: ~50-200 KB (compressed PNG)
- Dimensions: 1200 × 630 pixels
- Format: PNG

## Testing

Test the OG image by:
1. Sharing a link on Twitter/X
2. Using Facebook's Sharing Debugger: https://developers.facebook.com/tools/debug/
3. Using Twitter's Card Validator: https://cards-dev.twitter.com/validator
