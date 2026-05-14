# Changelog

All notable changes to OpenFret are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-05-14

The "install it on your phone" release. OpenFret is now a real Progressive Web App you can install to your home screen and use offline. Adds three curated starter packs so the library fills up fast, and a friendlier empty state when you don't have any songs yet.

### Added
- **PWA install + offline support**. New `manifest.json` and `service-worker.js`. After your first visit, OpenFret works with no network and can be installed to the home screen on iOS, Android, and desktop.
- **Three starter packs** in `songs/`: Campfire Classics (8 songs), Blues 101 (6 songs), Holiday Classics (6 songs). All verified public domain. One-tap import from Library → Starter Packs.
- **Illustrated empty state**. When you have no songs visible, the song list now shows the OpenFret "O" icon and friendly CTAs ("+ Add your first song", "Browse starter packs") instead of plain text.
- **Custom branding artwork** by the project author: acoustic and electric vintage banners, Pacific Coast Highway poster, and the "O" mark used as the favicon and PWA app icon.
- **Open Graph and Twitter Card meta tags** so links shared to Slack, iMessage, Twitter, and Facebook get a proper preview image.
- **Wordmark image** in the header (PNG and WebP) replacing plain text rendering.
- `OpenFretLibrary.importPack(filename)` and `getStarterPacks()` API for loading bundled JSON packs.
- 3 new smoke tests: PWA wiring, manifest validity, starter pack JSON validity. Test count is now 11.

### Changed
- README rewritten with a punchier intro, features above hosting, and visual hero banners.
- Asset pipeline: banners and poster converted from PNG to optimized JPEG. Total assets dropped from ~8.7 MB to ~1.6 MB.
- Service worker version bumped to `openfret-v3` so caches refresh cleanly on update.

### Removed
- Generic placeholder header SVG and favicon SVG (replaced by the new branded PNG/WebP assets).
- Oversized original PNG uploads from `assets/` (banner.png, banner-electric.png, poster.png).

## [1.0.0] - 2026-05-13

Initial open-source release. Forked from the Werbach Songbook personal project, stripped of personal content, given a generic identity and an in-browser library system so non-coders can use it without editing files.

### Added
- In-browser library: add, edit, delete songs through a UI
- JSON export and import (merge or replace)
- Welcome banner and dismissible first-run experience
- Help modal with quick-start guide and chord-bracket explanation
- 10 verified public-domain sample songs across folk, blues, jazz, and rock arrangements
- Generic OpenFret SVG header and favicon
- GitHub Pages auto-deploy workflow
- Netlify and Vercel one-click deploy configs
- MIT license
- README, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG

### Changed
- Renamed product from Werbach Songbook to OpenFret
- Renamed `window.WERBACH_SONGS` global to `window.OPENFRET_SAMPLE_SONGS`
- Song list now sources from `OpenFretLibrary.getAllSongs()` (samples + user merged)
- Removed unused Tone.js CDN dependency

### Removed
- All personal songs from the original repository
- Personal header image
- Original git remote pointing to a private repo
