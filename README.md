# Wealth Tracker v0.1

Static PWA for GitHub Pages. Dark UI, charts, CSV import (AI-stub), manual holdings with mocked prices, right-side chat (local demo).

## Quick start
1. Upload all files to a **public GitHub repo** (root of `main` branch).
2. Enable **Settings → Pages** and publish from `main` (root) or with Actions.
3. Visit the published URL. Install as PWA if prompted.

## Notes
- CSV import uses a **local heuristic** to simulate AI mapping. No data leaves your browser.
- Investment prices are **mocked** in this version (GH Pages cannot safely store API keys). Later, add serverless quotes.
- Service worker caches files for offline use.
- Version visible in the footer: v0.1.

## Files
- `index.html` — app shell and views
- `style.css` — dark UI
- `app.js` — logic, charts, imports, chat
- `manifest.webmanifest` — PWA manifest
- `service-worker.js` — offline cache
- `assets/icon-192.png`, `assets/icon-512.png` — app icons
