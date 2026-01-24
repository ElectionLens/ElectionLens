# Refreshing Twitter Card Previews

Twitter removed the Card Validator tool, so here are alternative ways to refresh card previews:

## Method 1: Share a New Tweet (Recommended)
- Compose a new tweet with your URL
- Twitter will fetch fresh metadata for new shares
- Delete old tweets and create new ones if needed

## Method 2: Use Facebook Debugger
- Go to: https://developers.facebook.com/tools/debug/
- Enter your URL: `https://electionlens.netlify.app/`
- Click "Scrape Again" to refresh the cache
- This can help refresh Twitter's cache too

## Method 3: Add URL Parameters
- Add a unique parameter to make it a "new" URL:
  - `https://electionlens.netlify.app/?t=1234567890`
  - `https://electionlens.netlify.app/?refresh=1`
- Twitter treats URLs with different parameters as new links

## Method 4: Wait for Cache Expiration
- Twitter caches typically expire after 7 days
- New shares after expiration will use fresh metadata

## Verification Steps

1. **Check if image is accessible:**
   ```
   https://electionlens.netlify.app/og-image.png
   ```

2. **Verify meta tags in page source:**
   - View page source (Ctrl+U / Cmd+Option+U)
   - Look for:
     - `<meta property="og:image" content="...">`
     - `<meta name="twitter:image" content="...">`

3. **Test with a new URL:**
   - Try sharing: `https://electionlens.netlify.app/?test=1`
   - This should fetch fresh metadata

## Troubleshooting

If the image still doesn't show:
- Ensure the image is actually deployed to Netlify
- Check image file size (should be < 5MB for Twitter)
- Verify image dimensions (1200×630px recommended)
- Make sure the image URL returns 200 OK status
- Check browser console for any errors when loading the page
