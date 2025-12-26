# Embed Feature - Share Maps in Blogs & Articles

**Status:** Planning  
**Created:** December 2024  
**Priority:** Medium - High visibility feature for growth

---

## Overview

Allow users to embed interactive or static map views into external websites, blogs, news articles, and social media posts. This increases reach and establishes ElectionLens as a reference tool for electoral data.

---

## Use Cases

1. **News Articles** - Journalists embedding constituency results in election coverage
2. **Blogs** - Political bloggers showing specific regions they're analyzing
3. **Educational** - Teachers/researchers embedding maps in educational content
4. **Social Media** - Shareable cards for Twitter, WhatsApp, Facebook
5. **Wikipedia/Wiki** - Static images with proper attribution

---

## Embed Types

### 1. Interactive Iframe Embed

Full interactive map in an iframe - users can zoom, hover, click.

```html
<iframe 
  src="https://electionlens.in/embed/tamil-nadu/chennai-south/mylapore?year=2021"
  width="600" 
  height="400"
  frameborder="0"
  allowfullscreen
></iframe>
```

**Features:**
- Full interactivity (zoom, pan, hover)
- Optional: Lock to specific view (no navigation away)
- Responsive sizing
- Theme selection (light/dark)

**URL Structure:**
```
/embed/{state}                          # State view
/embed/{state}/pc/{pc-name}             # PC with ACs
/embed/{state}/ac/{ac-name}             # Single AC
/embed/{state}/district/{district}      # District view
/embed/{state}?year=2024&view=results   # With election results
```

---

### 2. JavaScript Widget

Lightweight JS snippet that renders into a div - more control, smaller footprint.

```html
<div id="electionlens-embed"></div>
<script src="https://electionlens.in/embed.js"></script>
<script>
  ElectionLens.embed({
    container: '#electionlens-embed',
    location: 'tamil-nadu/chennai-south/mylapore',
    year: 2021,
    width: '100%',
    height: 400,
    theme: 'light',
    interactive: true,
    showResults: true,
    showLegend: true
  });
</script>
```

**Advantages:**
- Smaller bundle (~50KB vs full app)
- More customization options
- Can be styled to match host site
- Multiple embeds per page

---

### 3. Static Image Export

Generate PNG/SVG image of current map view for non-interactive contexts.

**Options:**
- Download button in UI
- API endpoint: `GET /api/screenshot?location=...&width=800&height=600`
- Watermark with ElectionLens branding + URL

```
┌─────────────────────────────────────────┐
│                                         │
│         [Map Image]                     │
│                                         │
│  MYLAPORE (AC)                         │
│  Winner: DMK (52.1%)                   │
│                                         │
├─────────────────────────────────────────┤
│  📍 electionlens.in/tn/mylapore        │
└─────────────────────────────────────────┘
```

**Implementation:**
- Use Puppeteer/Playwright for server-side screenshots
- Or html2canvas for client-side export
- Pre-generate popular constituencies for instant serving

---

### 4. Social Share Cards (OG Images)

Auto-generated Open Graph images for social media previews.

```html
<!-- Already partially implemented -->
<meta property="og:image" content="https://electionlens.in/og/tamil-nadu/mylapore.png" />
```

**Dynamic OG image showing:**
- Map thumbnail
- Constituency name
- Election year
- Winner/results summary
- Branded footer

---

### 5. oEmbed Support

Enable auto-embedding in WordPress, Medium, Notion, etc.

```json
// GET https://electionlens.in/oembed?url=https://electionlens.in/tamil-nadu/mylapore
{
  "version": "1.0",
  "type": "rich",
  "provider_name": "ElectionLens",
  "provider_url": "https://electionlens.in",
  "title": "Mylapore Assembly Constituency - 2021 Results",
  "html": "<iframe src=\"...\" width=\"600\" height=\"400\"></iframe>",
  "width": 600,
  "height": 400,
  "thumbnail_url": "https://electionlens.in/og/tamil-nadu/mylapore.png"
}
```

---

## UI: Embed/Share Modal

Add "Share" button to sidebar that opens a modal:

```
┌─────────────────────────────────────────────────┐
│  📤 Share Mylapore                         [X]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  🔗 Link                                        │
│  ┌─────────────────────────────────────────┐   │
│  │ https://electionlens.in/tamil-nadu/...  │ 📋│
│  └─────────────────────────────────────────┘   │
│                                                 │
│  📱 Social                                      │
│  [Twitter] [WhatsApp] [Facebook] [LinkedIn]    │
│                                                 │
│  </> Embed                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ <iframe src="https://electionlens.in/  │   │
│  │ embed/tamil-nadu/mylapore?year=2021"   │   │
│  │ width="600" height="400"></iframe>      │ 📋│
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Customize:                                     │
│  Size:  [600] x [400]  ▼ Preset sizes          │
│  Theme: ○ Light  ● Dark  ○ Auto                │
│  □ Show election results                        │
│  □ Show navigation controls                     │
│  □ Allow user interaction                       │
│                                                 │
│  📷 Download Image                              │
│  [PNG]  [SVG]  [Copy to clipboard]             │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Embed Bundle (Separate Entry Point)

```
src/
├── main.tsx           # Full app entry
├── embed.tsx          # Lightweight embed entry
└── components/
    └── EmbedMap.tsx   # Minimal map component for embeds
```

**Vite config:**
```typescript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        embed: 'embed.html'
      }
    }
  }
}
```

**Target size:** < 100KB gzipped (vs ~400KB full app)

---

### Embed Route Structure

```typescript
// App.tsx or separate embed app
const EmbedApp = () => {
  const params = useEmbedParams(); // Parse URL params
  
  return (
    <EmbedContainer 
      width={params.width}
      height={params.height}
      theme={params.theme}
    >
      <EmbedMap
        location={params.location}
        year={params.year}
        interactive={params.interactive}
        showResults={params.showResults}
        showControls={params.showControls}
      />
      {params.showBranding && <EmbedBranding />}
    </EmbedContainer>
  );
};
```

---

### URL Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `year` | number | latest | Election year to display |
| `theme` | string | light | `light`, `dark`, `auto` |
| `interactive` | boolean | true | Allow zoom/pan |
| `results` | boolean | true | Show election results |
| `controls` | boolean | true | Show zoom controls |
| `legend` | boolean | true | Show color legend |
| `branding` | boolean | true | Show ElectionLens footer |
| `lock` | boolean | false | Prevent navigation away |

---

### Security Considerations

1. **X-Frame-Options** - Allow embedding from any origin for `/embed/*` routes
2. **CSP** - Appropriate Content-Security-Policy headers
3. **Rate limiting** - Prevent abuse of screenshot API
4. **Referrer tracking** - Know where embeds are being used (analytics)

```typescript
// Netlify headers for embed routes
// netlify.toml
[[headers]]
  for = "/embed/*"
  [headers.values]
    X-Frame-Options = "ALLOWALL"
    Content-Security-Policy = "frame-ancestors *"
```

---

## Implementation Phases

### Phase 1: Basic Link Sharing (1 day)
- [ ] Add "Share" button to sidebar
- [ ] Copy link to clipboard
- [ ] Social share buttons (Twitter, WhatsApp, Facebook)
- [ ] Ensure all URLs are shareable (already done via URL state)

### Phase 2: Static Image Export (2-3 days)
- [ ] Add "Download Image" button
- [ ] Client-side screenshot with html2canvas
- [ ] Add watermark/branding
- [ ] PNG and SVG export options

### Phase 3: Iframe Embed (3-4 days)
- [ ] Create `/embed` route
- [ ] Build lightweight embed bundle
- [ ] Embed code generator in share modal
- [ ] Customization options (size, theme, controls)

### Phase 4: JavaScript Widget (2-3 days)
- [ ] Create `embed.js` standalone script
- [ ] API for programmatic embedding
- [ ] Documentation for developers

### Phase 5: oEmbed & Advanced (2-3 days)
- [ ] oEmbed endpoint
- [ ] Dynamic OG images (server-side or edge function)
- [ ] WordPress plugin (optional)
- [ ] Analytics for embed usage

---

## Prior Art / Inspiration

| Service | Embed Style | Notes |
|---------|-------------|-------|
| Google Maps | iframe + JS API | Industry standard |
| Datawrapper | iframe + responsive | Great for charts |
| Flourish | iframe | Data visualization |
| Mapbox | JS SDK | Developer-focused |
| Carto | iframe + JS | Geo-focused |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Embed usage | 100+ embeds in first month |
| Referral traffic | 10% of traffic from embeds |
| Social shares | 500+ shares/month |
| Media coverage | 5+ news articles using embeds |

---

## Quick Win: Share Button

Minimal implementation to start:

```typescript
// components/ShareButton.tsx
const ShareButton = ({ url, title }: Props) => {
  const [copied, setCopied] = useState(false);
  
  const copyLink = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const shareTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`);
  };
  
  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`);
  };
  
  return (
    <div className="share-buttons">
      <button onClick={copyLink}>
        {copied ? <Check /> : <Link />} Copy Link
      </button>
      <button onClick={shareTwitter}><Twitter /></button>
      <button onClick={shareWhatsApp}><MessageCircle /></button>
    </div>
  );
};
```

---

*Last Updated: December 2024*


